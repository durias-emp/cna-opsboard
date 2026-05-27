-- ================================================================
--  YS-CNA AIRCRAFT RE-REGISTRATION MIGRATION
--  From : C-GOPF  (app-relative hobbs, ~70h in the system)
--  To   : YS-CNA  (real-world hobbs 17,538.0h · 25,868 cycles)
--
--  Source: True North Helicorp Maintenance Report, 5/26/2026
--          Serial No. 3227 · Bell 206B3
--
--  HOW TO RUN
--  1. Open Supabase → SQL Editor
--  2. Paste this entire file and click Run
--  3. Read all NOTICE messages — they confirm each step
--  4. Run the VERIFICATION block at the bottom in a second query
--
--  WHAT THIS DOES (in order)
--  ① Shifts fluid_logs & grease_logs by +delta (preserves "X hours since last")
--  ② Delta-shifts ALL maintenance_items as a safe baseline
--  ③ Overrides maintenance_items with exact real-world values from the CSV
--  ④ Deletes itineraries, invoices, flights for this aircraft
--  ⑤ Updates the aircraft record: tail number, hobbs, cycles
-- ================================================================

DO $$
DECLARE
  v_aircraft_id  uuid;
  v_old_hobbs    numeric;
  v_delta        numeric;
  v_count        integer;
BEGIN

  -- ────────────────────────────────────────────────────────────
  -- STEP 0 · Locate aircraft and compute the hobbs shift delta
  -- ────────────────────────────────────────────────────────────
  SELECT id, hobbs_current
  INTO   v_aircraft_id, v_old_hobbs
  FROM   aircraft
  WHERE  tail_number = 'C-GOPF'
  LIMIT  1;

  IF v_aircraft_id IS NULL THEN
    RAISE EXCEPTION 'Aircraft C-GOPF not found in the aircraft table. Aborting — nothing has been changed.';
  END IF;

  v_delta := 17538.0 - v_old_hobbs;

  RAISE NOTICE '';
  RAISE NOTICE '=== YS-CNA MIGRATION STARTING ===';
  RAISE NOTICE 'Aircraft ID : %',      v_aircraft_id;
  RAISE NOTICE 'Current app hobbs : %h', v_old_hobbs;
  RAISE NOTICE 'Target hobbs      : 17538.0h';
  RAISE NOTICE 'Shift delta       : +%h', v_delta;
  RAISE NOTICE '';

  -- ────────────────────────────────────────────────────────────
  -- STEP 1 · Shift fluid_logs
  --          Preserves "hours since last oil/hydraulic/trans check"
  --          Formula: new = old + delta  → gap to current hobbs unchanged
  -- ────────────────────────────────────────────────────────────
  UPDATE fluid_logs
  SET    hobbs_at_service = ROUND((hobbs_at_service + v_delta)::numeric, 1)
  WHERE  aircraft_id = v_aircraft_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'STEP 1  fluid_logs       : % rows shifted', v_count;

  -- ────────────────────────────────────────────────────────────
  -- STEP 2 · Shift grease_logs
  --          Same logic — preserves "hours since last grease"
  -- ────────────────────────────────────────────────────────────
  UPDATE grease_logs
  SET    hobbs_at_service = ROUND((hobbs_at_service + v_delta)::numeric, 1)
  WHERE  aircraft_id = v_aircraft_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'STEP 2  grease_logs      : % rows shifted', v_count;

  -- ────────────────────────────────────────────────────────────
  -- STEP 3 · Maintenance items — delta pass (baseline for ALL items)
  --          This correctly handles any items not explicitly named
  --          in the CSV overrides below.
  -- ────────────────────────────────────────────────────────────
  UPDATE maintenance_items
  SET
    due_at_hours        = CASE WHEN due_at_hours IS NOT NULL
                               THEN ROUND((due_at_hours + v_delta)::numeric, 1)
                               ELSE NULL END,
    last_complied_hours = CASE WHEN last_complied_hours IS NOT NULL
                               THEN ROUND((last_complied_hours + v_delta)::numeric, 1)
                               ELSE NULL END
  WHERE aircraft_id = v_aircraft_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'STEP 3  maintenance_items: % rows delta-shifted (baseline)', v_count;

  -- ────────────────────────────────────────────────────────────
  -- STEP 4 · Maintenance items — exact real-world overrides
  --          Values taken directly from the official maintenance
  --          report (True North Helicorp, 5/26/2026).
  --          Matches items by description using ILIKE so minor
  --          naming differences don't break anything.
  -- ────────────────────────────────────────────────────────────
  RAISE NOTICE 'STEP 4  Applying exact maintenance values from CSV...';

  -- ── 50-hour ──────────────────────────────────────────────────
  UPDATE maintenance_items
  SET last_complied_hours = 17468.7, due_at_hours = 17518.7
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%50 hour%lube%' OR description ILIKE '%50 hr%lube%'
         OR description ILIKE '%50%12 mth%lube%');

  -- ── 100-hour ─────────────────────────────────────────────────
  UPDATE maintenance_items
  SET last_complied_hours = 17410.8, due_at_hours = 17510.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%100%a/f%periodic%' OR description ILIKE '%100%airframe%periodic%');

  UPDATE maintenance_items
  SET last_complied_hours = 17410.8, due_at_hours = 17510.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%100%supplemental%');

  UPDATE maintenance_items
  SET last_complied_hours = 17433.9, due_at_hours = 17533.9
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%100%ica%kit%' OR description ILIKE '%100%ica kit%');

  UPDATE maintenance_items
  SET last_complied_hours = 17410.8, due_at_hours = 17510.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%scavenge oil flow%' OR description ILIKE '%100%scavenge%oil%');

  UPDATE maintenance_items
  SET last_complied_hours = 17410.8, due_at_hours = 17510.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%100%engine%' OR description ILIKE '%100 hr%engine%')
    AND description NOT ILIKE '%scavenge%'
    AND description NOT ILIKE '%200%'
    AND description NOT ILIKE '%300%';

  -- ── 200-hour ─────────────────────────────────────────────────
  UPDATE maintenance_items
  SET last_complied_hours = 17410.8, due_at_hours = 17610.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%200%engine%')
    AND description NOT ILIKE '%oil%filter%'
    AND description NOT ILIKE '%nicad%';

  UPDATE maintenance_items
  SET last_complied_hours = 17410.8, due_at_hours = 17610.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%200%oil%' OR description ILIKE '%200%nicad%filter%');

  -- ── 300-hour ─────────────────────────────────────────────────
  UPDATE maintenance_items
  SET last_complied_hours = 17410.8, due_at_hours = 17710.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%300%engine%')
    AND description NOT ILIKE '%ica%'
    AND description NOT ILIKE '%driveshaft%'
    AND description NOT ILIKE '%a/f%';

  UPDATE maintenance_items
  SET last_complied_hours = 17410.8, due_at_hours = 17710.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%300%fuel nozzle%');

  UPDATE maintenance_items
  SET last_complied_hours = 17410.8, due_at_hours = 17710.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%300%a/f%periodic%' OR description ILIKE '%300%airframe%periodic%');

  UPDATE maintenance_items
  SET last_complied_hours = 17410.8, due_at_hours = 17710.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%300%inspection%')
    AND description NOT ILIKE '%ica%'
    AND description NOT ILIKE '%driveshaft%'
    AND description NOT ILIKE '%engine%'
    AND description NOT ILIKE '%1200%'
    AND description NOT ILIKE '%1500%'
    AND description NOT ILIKE '%3000%';

  UPDATE maintenance_items
  SET last_complied_hours = 17433.9, due_at_hours = 17733.9
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%300%ica kit%' OR description ILIKE '%300%ica%kits%');

  UPDATE maintenance_items
  SET last_complied_hours = 17433.9, due_at_hours = 17733.9
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%300%main driveshaft%' OR description ILIKE '%300%m/r driveshaft%');

  UPDATE maintenance_items
  SET last_complied_hours = 17410.8, due_at_hours = 17710.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%300%t/r driveshaft%' OR description ILIKE '%300%tail rotor driveshaft%');

  -- ── 600-hour ─────────────────────────────────────────────────
  UPDATE maintenance_items
  SET last_complied_hours = 17433.9, due_at_hours = 18033.9
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%600%main driveshaft%' OR description ILIKE '%600%m/r driveshaft%');

  UPDATE maintenance_items
  SET last_complied_hours = 17084.9, due_at_hours = 17684.9
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%600%scavenge%' OR description ILIKE '%scavenge oil filter%test%');

  -- ── 1200-hour ────────────────────────────────────────────────
  UPDATE maintenance_items
  SET last_complied_hours = 17410.8, due_at_hours = 18610.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%1200%cyclic%');

  UPDATE maintenance_items
  SET last_complied_hours = 16730.1, due_at_hours = 17930.1
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%1200%hub%inspection%' OR description ILIKE '%m/r hub%');

  UPDATE maintenance_items
  SET last_complied_hours = 17410.8, due_at_hours = 18610.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%1200%t/r control%' OR description ILIKE '%1200%tail rotor control%');

  UPDATE maintenance_items
  SET last_complied_hours = 16730.1, due_at_hours = 17930.1
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%1200%yoke%');

  -- ── 1500-hour ────────────────────────────────────────────────
  UPDATE maintenance_items
  SET last_complied_hours = 16730.1, due_at_hours = 18230.1
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%1500%freewheel%' OR description ILIKE '%free wheel%mid life%'
         OR description ILIKE '%freewheel%mid life%');

  UPDATE maintenance_items
  SET last_complied_hours = 16074.6, due_at_hours = 17574.6
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%1500%transmission%' OR description ILIKE '%m/r transmission%1500%'
         OR description ILIKE '%transmission%1500%');

  UPDATE maintenance_items
  SET last_complied_hours = 17378.4, due_at_hours = 18878.4
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%1500%mast%');

  -- ── 3000-hour ────────────────────────────────────────────────
  UPDATE maintenance_items
  SET last_complied_hours = 15522.4, due_at_hours = 18522.4
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%3000%t/r gearbox%' OR description ILIKE '%3000%tail rotor gearbox%'
         OR description ILIKE '%t/r gearbox%mid life%');

  -- ── Engine / turbine ─────────────────────────────────────────
  UPDATE maintenance_items
  SET last_complied_hours = 16730.1, due_at_hours = 18480.1
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%compressor case%halves%' OR description ILIKE '%compressor case%insp%');

  UPDATE maintenance_items
  SET last_complied_hours = 17271.0, due_at_hours = 19021.0
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%turbine mid life%');

  UPDATE maintenance_items
  SET last_complied_hours = 16202.9, due_at_hours = 17977.9
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%3rd%turbine wheel%' OR description ILIKE '%third%turbine wheel%'
         OR description ILIKE '%3rd stg turbine%');

  UPDATE maintenance_items
  SET last_complied_hours = 17370.2, due_at_hours = 17670.2
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%aerofilter%' OR description ILIKE '%fdc%filter%');

  UPDATE maintenance_items
  SET last_complied_hours = 17271.0, due_at_hours = 17958.4
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%turbine assembly%');

  -- Turbine wheels with both hour AND cycle limits
  UPDATE maintenance_items
  SET last_complied_hours = 15952.9, due_at_hours = 17977.9, due_at_cycles = 26805
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%1st stage%wheel%' OR description ILIKE '%first stage%wheel%');

  UPDATE maintenance_items
  SET last_complied_hours = 15952.9, due_at_hours = 17977.9, due_at_cycles = 26805
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%2nd stage%wheel%' OR description ILIKE '%second stage%wheel%');

  UPDATE maintenance_items
  SET last_complied_hours = 16202.9, due_at_hours = 17977.9, due_at_cycles = 29805
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%3rd stage%wheel%' OR description ILIKE '%third stage%wheel%');

  -- ── Airframe components ───────────────────────────────────────
  UPDATE maintenance_items
  SET last_complied_hours = 17085.2, due_at_hours = 17509.0
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%starter%generator%');

  UPDATE maintenance_items
  SET last_complied_hours = 16403.6, due_at_hours = 17684.5
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%lower collective%tube%' OR description ILIKE '%collective tube%lower%');

  UPDATE maintenance_items
  SET last_complied_hours = 17062.8, due_at_hours = 17662.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%ignitor%' OR description ILIKE '%igniter%plug%');

  UPDATE maintenance_items
  SET last_complied_hours = 17200.3, due_at_hours = 17800.3
  WHERE aircraft_id = v_aircraft_id
    AND description ILIKE '%drive shaft%inspection%'
    AND description NOT ILIKE '%t/r%'
    AND description NOT ILIKE '%tail rotor%';

  UPDATE maintenance_items
  SET last_complied_hours = 16397.4, due_at_hours = 17691.1
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%transmission%overhaul%')
    AND description NOT ILIKE '%freewheel%';

  UPDATE maintenance_items
  SET last_complied_hours = 16397.4, due_at_hours = 17922.4
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%t/r hub%overhaul%' OR description ILIKE '%tail rotor hub%overhaul%'
         OR description ILIKE '%t/r hub assembly%');

  RAISE NOTICE 'STEP 4  maintenance_items: exact CSV values applied';

  -- ────────────────────────────────────────────────────────────
  -- STEP 5 · Delete invoices
  -- ────────────────────────────────────────────────────────────
  DELETE FROM invoices
  WHERE aircraft_id = v_aircraft_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'STEP 5  invoices         : % rows deleted', v_count;

  -- ────────────────────────────────────────────────────────────
  -- STEP 6 · Delete flights
  -- ────────────────────────────────────────────────────────────
  DELETE FROM flights
  WHERE aircraft_id = v_aircraft_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'STEP 6  flights          : % rows deleted', v_count;

  -- ────────────────────────────────────────────────────────────
  -- STEP 8 · Update the aircraft record (done last so all
  --          aircraft_id lookups above still work)
  -- ────────────────────────────────────────────────────────────
  UPDATE aircraft
  SET
    tail_number    = 'YS-CNA',
    hobbs_current  = 17538.0,
    cycles_current = 25868
  WHERE id = v_aircraft_id;

  RAISE NOTICE 'STEP 7  aircraft         : C-GOPF → YS-CNA | hobbs=17538.0h | cycles=25868';
  RAISE NOTICE '';
  RAISE NOTICE '=== MIGRATION COMPLETE — run the verification query now ===';

END $$;


-- ================================================================
--  VERIFICATION — Run this as a SEPARATE query after the DO block
--  to confirm every table was updated correctly.
-- ================================================================

-- 1. Aircraft record
SELECT
  tail_number,
  hobbs_current,
  cycles_current,
  make_model
FROM aircraft
WHERE tail_number = 'YS-CNA';

-- 2. All active maintenance items sorted by urgency
SELECT
  description,
  ROUND(last_complied_hours::numeric, 1)  AS last_done_h,
  ROUND(due_at_hours::numeric, 1)         AS due_at_h,
  ROUND((due_at_hours - 17538.0)::numeric, 1) AS hours_remaining,
  due_at_cycles,
  due_date,
  CASE
    WHEN due_at_hours  IS NOT NULL AND due_at_hours  < 17538.0   THEN 'OVERDUE (hours)'
    WHEN due_at_cycles IS NOT NULL AND due_at_cycles < 25868     THEN 'OVERDUE (cycles)'
    WHEN due_date      IS NOT NULL AND due_date < CURRENT_DATE   THEN 'OVERDUE (date)'
    WHEN due_at_hours  IS NOT NULL AND (due_at_hours - 17538.0) <= 50 THEN 'DUE SOON'
    ELSE 'OK'
  END AS status
FROM maintenance_items
WHERE aircraft_id = (SELECT id FROM aircraft WHERE tail_number = 'YS-CNA')
  AND is_active   = true
ORDER BY
  CASE
    WHEN due_at_hours IS NOT NULL AND due_at_hours < 17538.0 THEN 0
    WHEN due_at_hours IS NOT NULL AND (due_at_hours - 17538.0) <= 50 THEN 1
    ELSE 2
  END,
  COALESCE(due_at_hours, 99999);

-- 3. Confirm flights / invoices / itineraries are gone
SELECT 'flights'      AS table_name, COUNT(*) AS remaining_rows
FROM flights      WHERE aircraft_id = (SELECT id FROM aircraft WHERE tail_number = 'YS-CNA')
UNION ALL
SELECT 'invoices',     COUNT(*)
FROM invoices     WHERE aircraft_id = (SELECT id FROM aircraft WHERE tail_number = 'YS-CNA')
UNION ALL
SELECT 'itineraries',  COUNT(*)
FROM itineraries  WHERE aircraft_id = (SELECT id FROM aircraft WHERE tail_number = 'YS-CNA');

-- 4a. Fluid log spot check
SELECT
  'fluid'    AS log_type,
  fluid_type AS detail,
  hobbs_at_service,
  ROUND((17538.0 - hobbs_at_service)::numeric, 1) AS hours_since
FROM fluid_logs
WHERE aircraft_id = (SELECT id FROM aircraft WHERE tail_number = 'YS-CNA')
ORDER BY hobbs_at_service DESC
LIMIT 6;

-- 4b. Grease log spot check
SELECT
  'grease'   AS log_type,
  'grease'   AS detail,
  hobbs_at_service,
  ROUND((17538.0 - hobbs_at_service)::numeric, 1) AS hours_since
FROM grease_logs
WHERE aircraft_id = (SELECT id FROM aircraft WHERE tail_number = 'YS-CNA')
ORDER BY hobbs_at_service DESC
LIMIT 3;
