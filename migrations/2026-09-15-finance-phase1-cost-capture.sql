-- ============================================================
-- Finance Phase 1: cost capture fields. No math, no new screens yet.
-- Per docs/finance-plan.md (approved 2026-09-15).
-- Idempotent: safe to run twice. Owner runs this in the SQL Editor
-- and replies with the result before any drawer code changes.
-- ============================================================

-- 1 · Tenant mode: commercial (revenue exists) vs private (cost only)
alter table aircraft
  add column if not exists finance_mode text not null default 'commercial'
  check (finance_mode in ('commercial','private'));

-- 2 · Reserves attach to the maintenance program (net USD; zero is valid,
--     null means "no reserve tracked for this item")
alter table maintenance_items
  add column if not exists estimated_cost numeric(14,2);

-- 3 · Actuals on unscheduled work (captured at snag resolution)
alter table snags
  add column if not exists actual_cost     numeric(14,2),
  add column if not exists invoice_ref     text,
  add column if not exists includes_iva    boolean not null default true,
  add column if not exists iva_recoverable boolean not null default true;

-- 4 · Actuals on scheduled work (the compliance log row IS the work order)
alter table maintenance_compliance_log
  add column if not exists actual_cost     numeric(14,2),
  add column if not exists invoice_ref     text,
  add column if not exists includes_iva    boolean not null default true,
  add column if not exists iva_recoverable boolean not null default true;

-- 5 · Fuel purchases already carry price_per_gallon / total_cost / supplier;
--     they only gain the IVA flags. Existing rows default true/true
--     (fuel invoices in El Salvador normally include IVA), per review answer 4.
alter table tank_fillups
  add column if not exists includes_iva    boolean not null default true,
  add column if not exists iva_recoverable boolean not null default true;

-- 6 · Flight price (NET USD, commercial tenants only, entered manually by
--     management when logging; per review, moved into Phase 1)
alter table flights
  add column if not exists price numeric(14,2);

-- 7 · log_compliance() learns the cost fields. Adding arguments creates a
--     second overload in Postgres, and two matching candidates would make
--     PostgREST refuse the call as ambiguous, so the old signature is
--     dropped first. The deployed app keeps working: its 7-argument call
--     resolves to this function through the defaults.
drop function if exists log_compliance(uuid, uuid, text, date, numeric, integer, text);

create or replace function log_compliance(
  p_item_id         uuid,
  p_aircraft_id     uuid,
  p_work_order      text,
  p_complied_date   date,
  p_complied_hours  numeric,
  p_complied_cycles integer default null,
  p_notes           text    default null,
  p_actual_cost     numeric default null,
  p_invoice_ref     text    default null,
  p_includes_iva    boolean default true,
  p_iva_recoverable boolean default true
) returns void
language plpgsql
set search_path = public
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
     complied_date, complied_hours, complied_cycles, notes,
     actual_cost, invoice_ref, includes_iva, iva_recoverable)
  values
    (p_item_id, p_aircraft_id, p_work_order,
     p_complied_date, p_complied_hours, p_complied_cycles, p_notes,
     p_actual_cost, p_invoice_ref, p_includes_iva, p_iva_recoverable);

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

-- RLS: these columns ride the tables' existing (permissive) policies. The
-- post-lockdown intent, ready to activate with the auth-lockdown migration:
--
-- Money columns become management-only at the API level by moving reads to
-- views that null them out for non-management, e.g.:
--   create policy "flights money mgmt only" on flights for select
--     using (true);  -- row access stays open to the team
--   (column-level: expose flights via a view that selects price only when
--    exists (select 1 from team_profiles tp
--            where tp.name = current_setting('request.jwt.claims', true)::json->>'name'
--              and tp.is_management));
-- Same treatment for snags.actual_cost, maintenance_compliance_log.actual_cost,
-- maintenance_items.estimated_cost.

-- ── Verification ─────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
     where table_name = 'snags' and column_name in ('actual_cost','invoice_ref','includes_iva','iva_recoverable'))                    as snag_cols_4,
  (select count(*) from information_schema.columns
     where table_name = 'maintenance_compliance_log' and column_name in ('actual_cost','invoice_ref','includes_iva','iva_recoverable')) as wo_cols_4,
  (select count(*) from information_schema.columns
     where table_name = 'tank_fillups' and column_name in ('includes_iva','iva_recoverable'))                                          as fuel_cols_2,
  (select count(*) from information_schema.columns
     where table_name = 'flights' and column_name = 'price')                                                                            as flight_price_1,
  (select count(*) from information_schema.columns
     where table_name = 'maintenance_items' and column_name = 'estimated_cost')                                                        as reserve_col_1,
  (select finance_mode from aircraft where tail_number = 'YS-CNA')                                                                     as ys_cna_mode,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'log_compliance')                                                                      as log_compliance_overloads_should_be_1;
