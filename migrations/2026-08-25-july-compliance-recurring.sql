-- 2026-08-25 — Record the July 2026 maintenance compliance for the recurring
-- inspections, per the engineer's answered control sheet
-- ("Control_Mantenimiento_Diego.xlsx", received 2026-08-25):
--
--   · 14 of the 15 overdue recurring inspections were performed. Compliance
--     hobbs 17,538.9 h (July 2026 control sheets). Compliance DATE recorded as
--     2026-07-31 — approximation pending the work order (O/T); correct with a
--     one-line update when the engineer returns the exact date.
--   · Item 45 (300 Hr / 6 Mth Main Driveshaft) was NOT performed — left
--     overdue, untouched.
--   · AF-39 Starter Generator: operator extended the overhaul limit 10%
--     beyond its due hours → new limit 17,509.0 + 100 = 17,609.0 h.
--
-- Next due = compliance hobbs + interval hours AND compliance date + interval
-- months, whichever comes first.
--
-- Run in the Supabase SQL Editor. Reply with the result.

begin;

-- ── 14 inspections complied at 17,538.9 h / 2026-07-31 ───────────────────────
update maintenance_items
set last_complied_hours = 17538.9,
    last_complied_date  = '2026-07-31',
    due_at_hours = v.due_h,
    due_date     = v.due_d,
    notes = coalesce(notes || ' | ', '') ||
      'Complied July 2026 per engineer sheet 2026-08-25 (date approx. 2026-07-31, O/T pending)',
    updated_at = now()
from (values
  ('B-4',  17638.9, '2027-07-31'),  -- 100 h / 12 m A/F Periodic
  ('B-10', 17638.9, '2027-07-31'),  -- 100 h / 12 m Engine
  ('34',   17638.9, '2027-07-31'),  -- 100 h / 12 m Supplemental
  ('36',   17638.9, null),          -- 100 h Scavenge Oil Flow (hours only)
  ('B-1',  17588.9, '2027-07-31'),  -- 50 h / 12 m Lube
  ('B-2',  17638.9, '2027-07-31'),  -- 100 h / 12 m Installed ICA Kits
  ('35',   17638.9, '2027-07-31'),  -- 100 h / 12 m ICA Kit
  ('B-11', 17738.9, '2027-07-31'),  -- 200 h / 12 m Engine
  ('39',   17738.9, '2027-07-31'),  -- 200 h Engine Oil / NiCad Filter
  ('B-5',  17838.9, '2027-07-31'),  -- 300 h / 12 m Inspection
  ('B-8',  17838.9, '2027-07-31'),  -- 300 h / 12 m T/R Driveshaft
  ('42',   17838.9, '2027-07-31'),  -- 300 h / 12 m A/F Periodic
  ('B-12', 17838.9, '2027-07-31'),  -- 300 h / 12 m Engine
  ('21',   null,    '2027-01-31')   -- Battery Capacity Check (6 m, calendar only)
) as v(item_number, due_h, due_d)
where maintenance_items.item_number = v.item_number
  and maintenance_items.is_active = true;

-- ── AF-39 Starter Generator: 10% extension past the 1,000 h limit ────────────
update maintenance_items
set due_at_hours = 17609.0,
    notes = coalesce(notes || ' | ', '') ||
      'Limit extended 10% past due hours per operator (engineer sheet 2026-08-25): 17,509.0 + 100 = 17,609.0 h',
    updated_at = now()
where item_number = 'AF-39' and is_active = true;

commit;

-- ── Verification (run after commit; paste the output back) ───────────────────
-- Expect the 14 items showing the new dues above; item 45 unchanged
-- (17,710.8 h / 2026-04-08); AF-39 at 17,609.0.
select item_number, description, last_complied_hours, last_complied_date,
       due_at_hours, due_date
from maintenance_items
where is_active = true
  and item_number in ('B-1','B-4','B-10','34','36','B-2','35','B-11','39',
                      'B-5','B-8','42','B-12','21','45','AF-39')
order by item_number;
