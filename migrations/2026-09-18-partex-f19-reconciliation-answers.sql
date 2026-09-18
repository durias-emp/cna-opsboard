-- 2026-09-18 — PARTEX answers to the July F19 reconciliation
--
-- Source: "F19_Reconciliation_YS-CNA REVISADO.pdf", the reconciliation sheet we
-- sent on 2026-09-14, returned by the technical team with the boxes marked and
-- remarks written in. What they answered:
--
--   Section A (covered by the July F19, W.O. 2026-004-001, 23-Jul-2026)
--     7    12 Mth. Component Operation ................. YES
--     44   300 Hr / 12 Mth. ICA Kits .................... YES
--     B-3  12 Mth. / 300 HR Installed ICA Kits .......... YES
--     6    12 Month Airframe ........................... YES
--     41b  300 Hr. Fuel Nozzle ......................... YES
--          "Se realizo en inspeccion de 300 hrs o 12 meses"
--     B-9  12 Mth. / 600 HR Main Driveshaft ............. NO
--          "Pendiente de revisar segun el MM"
--
--   Section B (not on the F19)
--     22   406 ELT annual inspection ................... YES, done
--     23   Fire Extinguisher annual .................... NO
--     24   First Aid Kit annual ........................ NO
--     25   Compass Swing ............................... YES, done
--
--   Section C
--     45   300 Hr / 6 Mth Main Driveshaft (overdue)
--          "Confirmado con PARTEX que fue realizado, cap. 5 seccion 36 MM"
--     AF-39 Starter Generator
--          "El starter se encuentra dentro de su extension del 10%"
--     55   1500 hr M/R Transmission mid-life
--          "Quedan 33 horas pero si se usa la extension se dispondria de
--           150 horas mas"
--
-- This migration records ONLY the five Section A items that were confirmed
-- covered by the July work order, plus the remarks as notes. Items 22, 25 and
-- 45 were answered "done" but WITHOUT a date or Hobbs, so they are deliberately
-- left alone: a compliance is a legal record and is not written from a guess.
-- They come in a follow-up migration once PARTEX gives the date.
--
-- Run in the Supabase SQL Editor. Reply with the verification output.

begin;

-- ── 1. Credit the July work order to the five confirmed items ────────────────
-- log_compliance() writes the audit-log row and rolls the item's due date and
-- due hours forward in one transaction (migrations/2026-08-06-log-compliance.sql).
do $do$
declare
  v_item  maintenance_items%rowtype;
  v_num   text;
  v_nums  text[] := array['7', '44', 'B-3', '6', '41b'];
  v_count int;
  v_done  int := 0;
  v_skip  int := 0;
begin
  foreach v_num in array v_nums loop
    select count(*) into v_count
      from maintenance_items where item_number = v_num and is_active = true;
    if v_count <> 1 then
      raise exception 'Item % matched % active rows, expected exactly 1', v_num, v_count;
    end if;

    select * into v_item
      from maintenance_items where item_number = v_num and is_active = true;

    -- Idempotent: if this work order was already credited, leave it alone
    if exists (
      select 1 from maintenance_compliance_log
      where maintenance_item_id = v_item.id
        and work_order_number   = '2026-004-001'
        and complied_date       = date '2026-07-23'
    ) then
      v_skip := v_skip + 1;
      continue;
    end if;

    perform log_compliance(
      v_item.id,
      v_item.aircraft_id,
      '2026-004-001',
      date '2026-07-23',
      17538.9,
      null,
      'Credited from the PARTEX F19 reconciliation returned 2026-09-18'
    );
    v_done := v_done + 1;
  end loop;

  raise notice 'compliances recorded: %, already present: %', v_done, v_skip;
end $do$;

-- ── 2. The fuel nozzle remark, on the item itself ────────────────────────────
update maintenance_items
set notes = coalesce(notes || ' | ', '') ||
  '2026-09-18 PARTEX: done with the 300 h / 12 month inspection (F19 W.O. 2026-004-001)',
    updated_at = now()
where item_number = '41b' and is_active = true;

-- ── 3. Items the F19 did NOT cover — due dates unchanged, reason recorded ────
update maintenance_items
set notes = coalesce(notes || ' | ', '') ||
  '2026-09-18 PARTEX: not covered by the July F19; pending review per the Maintenance Manual',
    updated_at = now()
where item_number = 'B-9' and is_active = true;

update maintenance_items
set notes = coalesce(notes || ' | ', '') ||
  '2026-09-18 PARTEX: not done; still due 2026-10-08',
    updated_at = now()
where item_number in ('23', '24') and is_active = true;

-- ── 4. Section C status, recorded as notes (no due values changed) ───────────
-- The starter generator is running inside the approved 10% extension. The
-- existing 2026-08-24 note says the same thing; this confirms it with PARTEX.
update maintenance_items
set notes = coalesce(notes || ' | ', '') ||
  '2026-09-18 PARTEX: no overhaul or replacement performed; operating within the approved 10% extension, hard limit 17,609.0 h',
    updated_at = now()
where item_number = 'AF-39' and is_active = true;

-- Transmission mid-life: NOT done. An extension of a further 150 h is available
-- if invoked, which would move the limit to 17,724.6 h. Not applied here -- the
-- extension has to be actually taken, not assumed.
update maintenance_items
set notes = coalesce(notes || ' | ', '') ||
  '2026-09-18 PARTEX: not yet performed. Due 17,574.6 h. A further 150 h is available if the extension is used (17,724.6 h)',
    updated_at = now()
where item_number = '55' and is_active = true;

commit;

-- ── Verification (run after commit; paste the output back) ───────────────────
-- Expect 5 rows, each last complied 2026-07-23 at 17,538.9 h, with the new
-- due date 12 months out (2027-07-23) where the item is calendar driven.
select item_number, description, last_complied_date, last_complied_hours,
       due_date, due_at_hours
from maintenance_items
where item_number in ('7', '44', 'B-3', '6', '41b') and is_active = true
order by item_number;

-- Expect 5 log rows against work order 2026-004-001.
select count(*) as compliance_rows
from maintenance_compliance_log
where work_order_number = '2026-004-001' and complied_date = date '2026-07-23';

-- Expect: 45 still overdue (awaiting its date), 23/24/B-9 still due 2026-10-08,
-- AF-39 due 17,609.0 h, 55 due 17,574.6 h.
select item_number, description, due_date, due_at_hours
from maintenance_items
where item_number in ('45', '23', '24', 'B-9', 'AF-39', '55') and is_active = true
order by item_number;
