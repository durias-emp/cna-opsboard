-- Atomic maintenance compliance. ALREADY APPLIED to production on 2026-08-06
-- (via the Supabase SQL Editor). Kept here so the database can be rebuilt from the repo.
-- Inserts the audit-log row AND rolls the item's due values forward in ONE transaction,
-- with a row lock against concurrent submissions. If either write fails, both roll back.

create or replace function log_compliance(
  p_item_id         uuid,
  p_aircraft_id     uuid,
  p_work_order      text,
  p_complied_date   date,
  p_complied_hours  numeric,
  p_complied_cycles integer default null,
  p_notes           text    default null
) returns void
language plpgsql
as $$
declare
  v_item maintenance_items%rowtype;
begin
  select * into v_item from maintenance_items where id = p_item_id for update;
  if not found then
    raise exception 'Maintenance item % not found', p_item_id;
  end if;

  insert into maintenance_compliance_log
    (maintenance_item_id, aircraft_id, work_order_number,
     complied_date, complied_hours, complied_cycles, notes)
  values
    (p_item_id, p_aircraft_id, p_work_order,
     p_complied_date, p_complied_hours, p_complied_cycles, p_notes);

  update maintenance_items set
    last_complied_date   = p_complied_date,
    last_complied_hours  = p_complied_hours,
    last_complied_cycles = p_complied_cycles,
    due_date = case
      when calendar_interval_months is not null
      then (p_complied_date + (calendar_interval_months * interval '1 month'))::date
      else due_date end,
    due_at_hours = case
      when hours_interval is not null
      then round(p_complied_hours + hours_interval, 1)
      else due_at_hours end,
    due_at_cycles = case
      when cycles_interval is not null and p_complied_cycles is not null
      then p_complied_cycles + cycles_interval
      else due_at_cycles end,
    updated_at = now()
  where id = p_item_id;
end;
$$;
