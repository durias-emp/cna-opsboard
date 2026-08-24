-- 2026-08-24 — Align life-limited component due-times with the July 2026
-- maintenance control sheets (PARTEX F20):
--   "Lista de componente de vida limite aeronave.xlsx"
--   "Control de componente con vida limite motor.xlsx"
--
-- What this fixes (found in the 2026-08-24 audit of maintenance_items):
--   1. Nearly every active component row is exactly 105.5 h more conservative
--      than the sheets. The sheet values below are the authority.
--   2. Every item exists twice: an active row the app shows, and a stale
--      duplicate with is_active = NULL that the app ignores. The NULL rows are
--      deactivated explicitly (NOT deleted — production data) so they can
--      never be accidentally activated. Two of them (M/R Transmission, Lower
--      Collective Tube) overstate remaining life by ~3,200-3,500 h because
--      they ignore component time carried at installation.
--   3. Starter Generator is past its limit; the operator extended its life
--      per the maintenance program (sheet note) — recorded in notes.
--   4. 3rd Stage Turbine Wheel carries AD 2022-10-06: must be REPLACED at
--      life limit — recorded in notes.
--
-- Run in the Supabase SQL Editor. Reply with the result.

begin;

-- ── 1. Retire the invisible duplicate generation ─────────────────────────────
update maintenance_items
set is_active = false,
    notes = coalesce(notes || ' | ', '') || 'Deactivated 2026-08-24: stale duplicate row superseded by July 2026 control sheets'
where is_active is null;

-- ── 2. Airframe components — due_at_hours from "Horas de Remocion" ───────────
-- (Rows already matching the sheets are not touched: AF-23, AF-32, AF-38,
--  AF-44, AF-45, and the on-condition items AF-3, AF-5, AF-25b.)
update maintenance_items set due_at_hours = v.due, updated_at = now()
from (values
  ('AF-1',  20628.6),  -- M/R Blade #1
  ('AF-2',  20628.6),  -- M/R Blade #2
  ('AF-4',  20874.6),  -- Swash Plate Assy
  ('AF-6',  25830.5),  -- Swash Plate Sleeve
  ('AF-7',  18315.2),  -- Main Rotor Head/Hub
  ('AF-8',  18886.8),  -- M/R Trunnion
  ('AF-10', 18074.3),  -- Retention Strap LPFS10511
  ('AF-11', 18074.3),  -- Retention Strap LPFS10507
  ('AF-12', 19374.3),  -- Latch Bolt #1
  ('AF-13', 19374.3),  -- Latch Bolt #2
  ('AF-14', 18315.2),  -- Retention Fitting #1
  ('AF-15', 18315.2),  -- Retention Fitting #2
  ('AF-16', 19281.1),  -- Retention Pin #1
  ('AF-17', 19281.1),  -- Retention Pin #2
  ('AF-18', 20526.2),  -- M/R Grip Assembly #1
  ('AF-19', 20526.2),  -- M/R Grip Assembly #2
  ('AF-20', 20874.6),  -- Swash Plate Lever
  ('AF-21', 20874.6),  -- Collective Idler Link
  ('AF-22', 20378.4),  -- M/R Mast Assembly
  ('AF-24', 17800.3),  -- M/R Drive Shaft (600 h inspection)
  ('AF-25', 17691.1),  -- M/R Transmission (~152 h remaining — sheet math incl. 3,206.3 h carried at install)
  ('AF-26', 18522.4),  -- Free Wheel Assembly
  ('AF-27', 19730.1),  -- Free Wheel Clutch
  ('AF-28', 20522.4),  -- T/R Blade #1
  ('AF-29', 20522.4),  -- T/R Blade #2
  ('AF-30', 21522.4),  -- T/R Gear Box
  ('AF-31', 20522.4),  -- T/R Yoke
  ('AF-33', 18754.6),  -- Hydraulic Servo #1
  ('AF-34', 18159.0),  -- Hydraulic Servo #2
  ('AF-35', 18967.3),  -- Hydraulic Servo #3
  ('AF-36', 20160.4),  -- Hyd. Pump & Reservoir
  ('AF-37', 19995.4),  -- Servo Support
  ('AF-40', 18060.7)   -- Cargo Hook
) as v(item_number, due)
where maintenance_items.item_number = v.item_number
  and maintenance_items.is_active = true;

-- ── 3. Engine components — hours from the sheets (cycle limits already match) ─
update maintenance_items set due_at_hours = v.due, updated_at = now()
from (values
  ('ENG-1',  20230.1),  -- Compressor
  ('ENG-17', 19021.7),  -- Governor Assembly
  ('ENG-18', 19231.3),  -- Fuel Control
  ('ENG-19', 18230.1),  -- Bleed Valve
  ('ENG-20', 20322.0),  -- Fuel Pump
  ('ENG-21', 19910.8),  -- Fuel Nozzle
  ('EC-3',   18710.1),  -- Impeller
  ('EC-4',   30711.1),  -- Compr. 1st Stg Wheel
  ('EC-5',   30711.1),  -- Compr. 2/3 Stg Wheel
  ('EC-6',   27225.1),  -- Compr. 4th Stg Wheel
  ('EC-7',   30711.1),  -- Compr. 5th Stg Wheel
  ('EC-8',   30711.1),  -- Compr. 6th Stg Wheel
  ('EC-15',  20752.9),  -- Turbine 4th Stage Wheel
  ('EC-16',  17977.9)   -- Fuel Nozzle Diaphragm
) as v(item_number, due)
where maintenance_items.item_number = v.item_number
  and maintenance_items.is_active = true;

-- ── 4. Onboard Systems calendar date (sheet: 2028-08-06) ─────────────────────
update maintenance_items set due_date = '2028-08-06', updated_at = now()
where item_number = '41' and is_active = true;

-- ── 5. Notes: operator extension + airworthiness directive ───────────────────
update maintenance_items
set notes = coalesce(notes || ' | ', '') ||
  'Past life limit; life extended by operator per approved maintenance program (July 2026 control sheet note)',
    updated_at = now()
where item_number = 'AF-39' and is_active = true;

update maintenance_items
set notes = coalesce(notes || ' | ', '') ||
  'AD 2022-10-06 applies: component must be REPLACED (not retired on condition) at life limit',
    updated_at = now()
where item_number = 'EC-14' and is_active = true;

commit;

-- ── Verification (run after commit; paste the output back) ───────────────────
-- Expect: 0 null-active rows, and the spot-checks matching the sheet values.
select count(*) as still_null_active from maintenance_items where is_active is null;
select item_number, description, due_at_hours, due_at_cycles, due_date
from maintenance_items
where is_active = true
  and item_number in ('AF-25','AF-23','AF-39','AF-40','EC-14','EC-16','ENG-11','41')
order by item_number;
