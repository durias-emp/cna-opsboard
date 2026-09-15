-- Finance Phase 1b: save_flight() learns flights.price.
-- The function whitelists columns on both its INSERT and UPDATE paths, so the
-- new price column (added in phase 1) would be silently dropped without this.
-- Same body as 2026-08-22-flight-hours-atomic-soft-delete.sql plus price.
-- Idempotent (create or replace, same signature).
--
-- DISCOVERED 2026-09-15: production has save_flight but NOT flights.deleted_at
-- (the 2026-08-22 file was applied partially, or an earlier variant of the
-- function was pasted). This body references deleted_at, so the column is
-- created here first. Nullable add: existing rows and the running app are
-- untouched.

alter table flights add column if not exists deleted_at timestamptz;

create or replace function save_flight(p_flight jsonb)
returns flights
language plpgsql
set search_path = public
as $$
declare
  v_id   uuid := nullif(p_flight->>'id', '')::uuid;
  v_old  flights%rowtype;
  v_new  flights%rowtype;
  v_ac   aircraft%rowtype;
  v_hobbs_delta  numeric;
  v_cycles_delta integer;
begin
  if v_id is null then
    -- ── INSERT ──
    v_new := jsonb_populate_record(null::flights, p_flight);
    if v_new.aircraft_id is null then raise exception 'aircraft_id is required'; end if;
    select * into v_ac from aircraft where id = v_new.aircraft_id for update;
    if not found then raise exception 'Aircraft % not found', v_new.aircraft_id; end if;

    insert into flights (aircraft_id, date, pilot, copilot, legs, total_minutes, flight_time_minutes,
                         cycles, fuel_start_gal, fuel_end_gal, fuel_consumed_gal, passengers, notes,
                         tach_reading, flight_hobbs_after, price)
    values (v_new.aircraft_id, v_new.date, v_new.pilot, v_new.copilot, v_new.legs, v_new.total_minutes,
            v_new.flight_time_minutes, v_new.cycles, v_new.fuel_start_gal, v_new.fuel_end_gal,
            v_new.fuel_consumed_gal, v_new.passengers, v_new.notes, v_new.tach_reading,
            v_new.flight_hobbs_after, v_new.price)
    returning * into v_new;

    if v_new.tach_reading is not null then
      -- exact reading from the tach is ground truth
      update aircraft set hobbs_current = round(v_new.tach_reading, 1) where id = v_ac.id;
    elsif coalesce(v_new.total_minutes, 0) > 0 then
      update aircraft set hobbs_current = round(coalesce(hobbs_current, 0) + to_hobbs(v_new.total_minutes), 2) where id = v_ac.id;
    end if;
    if coalesce(v_new.cycles, 0) > 0 then
      update aircraft set cycles_current = coalesce(cycles_current, 0) + v_new.cycles where id = v_ac.id;
    end if;
    if v_new.flight_hobbs_after is not null then
      update aircraft set flight_hobbs_current = round(v_new.flight_hobbs_after, 1) where id = v_ac.id;
    end if;
  else
    -- ── UPDATE ──
    select * into v_old from flights where id = v_id for update;
    if not found then raise exception 'Flight % not found', v_id; end if;
    select * into v_ac from aircraft where id = v_old.aircraft_id for update;

    v_new := jsonb_populate_record(v_old, p_flight);   -- overlay provided keys on the existing row
    update flights set
      date = v_new.date, pilot = v_new.pilot, copilot = v_new.copilot, legs = v_new.legs,
      total_minutes = v_new.total_minutes, flight_time_minutes = v_new.flight_time_minutes,
      cycles = v_new.cycles, fuel_start_gal = v_new.fuel_start_gal, fuel_end_gal = v_new.fuel_end_gal,
      fuel_consumed_gal = v_new.fuel_consumed_gal, passengers = v_new.passengers, notes = v_new.notes,
      price = v_new.price
    where id = v_id
    returning * into v_new;

    if v_old.deleted_at is null then   -- a deleted flight contributes nothing; don't adjust
      v_hobbs_delta  := to_hobbs(v_new.total_minutes) - to_hobbs(v_old.total_minutes);
      v_cycles_delta := coalesce(v_new.cycles, 0) - coalesce(v_old.cycles, 0);
      if abs(v_hobbs_delta) > 0.001 then
        update aircraft set hobbs_current = round(coalesce(hobbs_current, 0) + v_hobbs_delta, 2) where id = v_ac.id;
      end if;
      if v_cycles_delta <> 0 then
        update aircraft set cycles_current = coalesce(cycles_current, 0) + v_cycles_delta where id = v_ac.id;
      end if;
    end if;
  end if;
  return v_new;
end;
$$;

-- verificación: la función existe y flights.price sigue presente
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'save_flight') as save_flight_fns_1,
  (select count(*) from information_schema.columns
     where table_name = 'flights' and column_name = 'price')   as flight_price_1;
