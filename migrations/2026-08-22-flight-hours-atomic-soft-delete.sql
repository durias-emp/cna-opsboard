-- 1. Flight hours become atomic and server-computed.
--    Before: the phone inserted the flight, THEN separately wrote aircraft.hobbs_current
--    using the value it last saw (two writes, unchecked, lost-update race between two phones).
--    After: save_flight() / delete_flight() do both in one transaction, locking the aircraft
--    row and computing hobbs = hobbs + delta from the database value.
-- 2. Soft delete: flights, flight_itineraries and todos get deleted_at instead of being erased.
--    Restore a flight with restore_flight(id); restore others by setting deleted_at = null.
-- The app detects whether these exist and falls back to the old behaviour until this has run.

alter table flights
  add column if not exists deleted_at          timestamptz,
  add column if not exists tach_reading        numeric,   -- exact tach after landing (tach mode) — ground truth for hobbs
  add column if not exists flight_hobbs_after  numeric;   -- pilot flight-hobbs reading ("Hobbs" flight-time method)
alter table flight_itineraries add column if not exists deleted_at timestamptz;
alter table todos              add column if not exists deleted_at timestamptz;

-- Same rounding as src/lib/utils.js toHobbs(): Math.round(mins / 6) / 10
create or replace function to_hobbs(p_minutes numeric)
returns numeric language sql immutable as $$
  select round(coalesce(p_minutes, 0) / 6.0) / 10.0
$$;

-- Insert (no "id" key) or update (with "id") a flight and adjust the aircraft in one transaction.
create or replace function save_flight(p_flight jsonb)
returns flights
language plpgsql as $$
declare
  v_id   uuid := nullif(p_flight->>'id', '')::uuid;
  v_old  flights%rowtype;
  v_new  flights%rowtype;
  v_ac   aircraft%rowtype;
  v_hobbs_delta  numeric := 0;
  v_cycles_delta integer := 0;
begin
  if v_id is null then
    -- ── INSERT ──
    v_new := jsonb_populate_record(null::flights, p_flight);
    if v_new.aircraft_id is null then raise exception 'aircraft_id is required'; end if;
    select * into v_ac from aircraft where id = v_new.aircraft_id for update;
    if not found then raise exception 'Aircraft % not found', v_new.aircraft_id; end if;

    insert into flights (aircraft_id, date, pilot, copilot, legs, total_minutes, flight_time_minutes,
                         cycles, fuel_start_gal, fuel_end_gal, fuel_consumed_gal, passengers, notes,
                         tach_reading, flight_hobbs_after)
    values (v_new.aircraft_id, v_new.date, v_new.pilot, v_new.copilot, v_new.legs, v_new.total_minutes,
            v_new.flight_time_minutes, v_new.cycles, v_new.fuel_start_gal, v_new.fuel_end_gal,
            v_new.fuel_consumed_gal, v_new.passengers, v_new.notes, v_new.tach_reading, v_new.flight_hobbs_after)
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
      fuel_consumed_gal = v_new.fuel_consumed_gal, passengers = v_new.passengers, notes = v_new.notes
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

-- Soft-delete a flight and take its hours/cycles back off the aircraft, atomically.
create or replace function delete_flight(p_id uuid)
returns void
language plpgsql as $$
declare v_f flights%rowtype;
begin
  select * into v_f from flights where id = p_id for update;
  if not found then raise exception 'Flight % not found', p_id; end if;
  if v_f.deleted_at is not null then return; end if;   -- already deleted: idempotent
  perform 1 from aircraft where id = v_f.aircraft_id for update;
  update flights set deleted_at = now() where id = p_id;
  if coalesce(v_f.total_minutes, 0) > 0 then
    update aircraft set hobbs_current = round(coalesce(hobbs_current, 0) - to_hobbs(v_f.total_minutes), 2) where id = v_f.aircraft_id;
  end if;
  if coalesce(v_f.cycles, 0) > 0 then
    update aircraft set cycles_current = coalesce(cycles_current, 0) - v_f.cycles where id = v_f.aircraft_id;
  end if;
end;
$$;

-- Undo a soft delete and put the hours/cycles back.
create or replace function restore_flight(p_id uuid)
returns void
language plpgsql as $$
declare v_f flights%rowtype;
begin
  select * into v_f from flights where id = p_id for update;
  if not found then raise exception 'Flight % not found', p_id; end if;
  if v_f.deleted_at is null then return; end if;
  perform 1 from aircraft where id = v_f.aircraft_id for update;
  update flights set deleted_at = null where id = p_id;
  if coalesce(v_f.total_minutes, 0) > 0 then
    update aircraft set hobbs_current = round(coalesce(hobbs_current, 0) + to_hobbs(v_f.total_minutes), 2) where id = v_f.aircraft_id;
  end if;
  if coalesce(v_f.cycles, 0) > 0 then
    update aircraft set cycles_current = coalesce(cycles_current, 0) + v_f.cycles where id = v_f.aircraft_id;
  end if;
end;
$$;

-- Smoke test (safe, writes nothing — expects "Flight ... not found"):
-- select delete_flight('00000000-0000-0000-0000-000000000000'::uuid);
