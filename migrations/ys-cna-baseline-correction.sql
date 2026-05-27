-- ================================================================
--  YS-CNA BASELINE CORRECTION
--  Corrects the starting hobbs from 17,538.0 → 17,502.8 (−35.2h)
--  and cycles from 25,868 → 25,816 (−52)
--
--  Strategy:
--  ① Update aircraft record
--  ② Shift fluid_logs & grease_logs by −35.2 (preserves "hours since last")
--  ③ Shift ALL maintenance_items by −35.2 (corrects delta-shifted items)
--  ④ Re-stamp exact real-world values from maintenance report
--     (same as Step 4 of the original migration — idempotent)
-- ================================================================

DO $$
DECLARE
  v_aircraft_id uuid;
  v_correction  numeric := -35.2;  -- 17502.8 − 17538.0
  v_count       integer;
BEGIN

  SELECT id INTO v_aircraft_id
  FROM aircraft WHERE tail_number = 'YS-CNA' LIMIT 1;

  IF v_aircraft_id IS NULL THEN
    RAISE EXCEPTION 'YS-CNA not found in aircraft table. Aborting — nothing changed.';
  END IF;

  RAISE NOTICE '=== YS-CNA BASELINE CORRECTION STARTING ===';
  RAISE NOTICE 'Correction: −35.2h  |  hobbs 17538.0 → 17502.8  |  cycles 25868 → 25816';

  -- ── Step 1 · Aircraft record ──────────────────────────────────
  UPDATE aircraft
  SET hobbs_current  = 17502.8,
      cycles_current = 25816
  WHERE id = v_aircraft_id;
  RAISE NOTICE 'STEP 1  aircraft: hobbs=17502.8 cycles=25816';

  -- ── Step 2 · fluid_logs ───────────────────────────────────────
  UPDATE fluid_logs
  SET hobbs_at_service = ROUND((hobbs_at_service + v_correction)::numeric, 1)
  WHERE aircraft_id = v_aircraft_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'STEP 2  fluid_logs  : % rows shifted by −35.2', v_count;

  -- ── Step 3 · grease_logs ─────────────────────────────────────
  UPDATE grease_logs
  SET hobbs_at_service = ROUND((hobbs_at_service + v_correction)::numeric, 1)
  WHERE aircraft_id = v_aircraft_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'STEP 3  grease_logs : % rows shifted by −35.2', v_count;

  -- ── Step 4 · Maintenance items — bulk correction ──────────────
  UPDATE maintenance_items
  SET
    due_at_hours        = CASE WHEN due_at_hours IS NOT NULL
                               THEN ROUND((due_at_hours + v_correction)::numeric, 1)
                               ELSE NULL END,
    last_complied_hours = CASE WHEN last_complied_hours IS NOT NULL
                               THEN ROUND((last_complied_hours + v_correction)::numeric, 1)
                               ELSE NULL END
  WHERE aircraft_id = v_aircraft_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'STEP 4  maintenance_items: % rows corrected by −35.2', v_count;

  -- ── Step 5 · Re-stamp exact real-world values ─────────────────
  --    Restores items that have absolute hobbs values from the
  --    official maintenance report (True North Helicorp, 5/26/2026)
  RAISE NOTICE 'STEP 5  Re-applying exact maintenance report values...';

  -- 50hr lube
  UPDATE maintenance_items SET last_complied_hours = 17468.7, due_at_hours = 17518.7
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%50 hour%lube%' OR description ILIKE '%50 hr%lube%'
         OR description ILIKE '%50%12 mth%lube%');

  -- 100hr A/F periodic
  UPDATE maintenance_items SET last_complied_hours = 17410.8, due_at_hours = 17510.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%100%a/f%periodic%' OR description ILIKE '%100%airframe%periodic%');

  -- 100hr supplemental
  UPDATE maintenance_items SET last_complied_hours = 17410.8, due_at_hours = 17510.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%100%supplemental%');

  -- 100hr ICA kit
  UPDATE maintenance_items SET last_complied_hours = 17433.9, due_at_hours = 17533.9
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%100%ica%kit%' OR description ILIKE '%100%ica kit%');

  -- 100hr scavenge oil flow
  UPDATE maintenance_items SET last_complied_hours = 17410.8, due_at_hours = 17510.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%scavenge oil flow%' OR description ILIKE '%100%scavenge%oil%');

  -- 100hr engine
  UPDATE maintenance_items SET last_complied_hours = 17410.8, due_at_hours = 17510.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%100%engine%' OR description ILIKE '%100 hr%engine%')
    AND description NOT ILIKE '%scavenge%'
    AND description NOT ILIKE '%200%'
    AND description NOT ILIKE '%300%';

  -- 200hr engine
  UPDATE maintenance_items SET last_complied_hours = 17410.8, due_at_hours = 17610.8
  WHERE aircraft_id = v_aircraft_id
    AND description ILIKE '%200%engine%'
    AND description NOT ILIKE '%oil%filter%'
    AND description NOT ILIKE '%nicad%';

  -- 200hr oil/nicad filter
  UPDATE maintenance_items SET last_complied_hours = 17410.8, due_at_hours = 17610.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%200%oil%' OR description ILIKE '%200%nicad%filter%');

  -- 300hr engine
  UPDATE maintenance_items SET last_complied_hours = 17410.8, due_at_hours = 17710.8
  WHERE aircraft_id = v_aircraft_id
    AND description ILIKE '%300%engine%'
    AND description NOT ILIKE '%ica%'
    AND description NOT ILIKE '%driveshaft%'
    AND description NOT ILIKE '%a/f%';

  -- 300hr fuel nozzle inspection
  UPDATE maintenance_items SET last_complied_hours = 17410.8, due_at_hours = 17710.8
  WHERE aircraft_id = v_aircraft_id
    AND description ILIKE '%300%fuel nozzle%';

  -- 300hr A/F periodic
  UPDATE maintenance_items SET last_complied_hours = 17410.8, due_at_hours = 17710.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%300%a/f%periodic%' OR description ILIKE '%300%airframe%periodic%');

  -- 300hr inspection (general)
  UPDATE maintenance_items SET last_complied_hours = 17410.8, due_at_hours = 17710.8
  WHERE aircraft_id = v_aircraft_id
    AND description ILIKE '%300%inspection%'
    AND description NOT ILIKE '%ica%'
    AND description NOT ILIKE '%driveshaft%'
    AND description NOT ILIKE '%engine%'
    AND description NOT ILIKE '%1200%'
    AND description NOT ILIKE '%1500%'
    AND description NOT ILIKE '%3000%';

  -- 300hr ICA kits
  UPDATE maintenance_items SET last_complied_hours = 17433.9, due_at_hours = 17733.9
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%300%ica kit%' OR description ILIKE '%300%ica%kits%');

  -- 300hr main driveshaft
  UPDATE maintenance_items SET last_complied_hours = 17433.9, due_at_hours = 17733.9
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%300%main driveshaft%' OR description ILIKE '%300%m/r driveshaft%');

  -- 300hr T/R driveshaft
  UPDATE maintenance_items SET last_complied_hours = 17410.8, due_at_hours = 17710.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%300%t/r driveshaft%' OR description ILIKE '%300%tail rotor driveshaft%');

  -- 600hr main driveshaft
  UPDATE maintenance_items SET last_complied_hours = 17433.9, due_at_hours = 18033.9
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%600%main driveshaft%' OR description ILIKE '%600%m/r driveshaft%');

  -- 600hr scavenge oil filter
  UPDATE maintenance_items SET last_complied_hours = 17084.9, due_at_hours = 17684.9
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%600%scavenge%' OR description ILIKE '%scavenge oil filter%test%');

  -- 1200hr cyclic
  UPDATE maintenance_items SET last_complied_hours = 17410.8, due_at_hours = 18610.8
  WHERE aircraft_id = v_aircraft_id
    AND description ILIKE '%1200%cyclic%';

  -- 1200hr M/R hub
  UPDATE maintenance_items SET last_complied_hours = 16730.1, due_at_hours = 17930.1
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%1200%hub%inspection%' OR description ILIKE '%m/r hub%');

  -- 1200hr T/R control tube
  UPDATE maintenance_items SET last_complied_hours = 17410.8, due_at_hours = 18610.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%1200%t/r control%' OR description ILIKE '%1200%tail rotor control%');

  -- 1200hr yoke
  UPDATE maintenance_items SET last_complied_hours = 16730.1, due_at_hours = 17930.1
  WHERE aircraft_id = v_aircraft_id
    AND description ILIKE '%1200%yoke%';

  -- 1500hr freewheel
  UPDATE maintenance_items SET last_complied_hours = 16730.1, due_at_hours = 18230.1
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%1500%freewheel%' OR description ILIKE '%free wheel%mid life%'
         OR description ILIKE '%freewheel%mid life%');

  -- 1500hr M/R transmission
  UPDATE maintenance_items SET last_complied_hours = 16074.6, due_at_hours = 17574.6
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%1500%transmission%' OR description ILIKE '%m/r transmission%1500%'
         OR description ILIKE '%transmission%1500%');

  -- 1500hr mast
  UPDATE maintenance_items SET last_complied_hours = 17378.4, due_at_hours = 18878.4
  WHERE aircraft_id = v_aircraft_id
    AND description ILIKE '%1500%mast%';

  -- 3000hr T/R gearbox
  UPDATE maintenance_items SET last_complied_hours = 15522.4, due_at_hours = 18522.4
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%3000%t/r gearbox%' OR description ILIKE '%3000%tail rotor gearbox%'
         OR description ILIKE '%t/r gearbox%mid life%');

  -- Compressor case halves
  UPDATE maintenance_items SET last_complied_hours = 16730.1, due_at_hours = 18480.1
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%compressor case%halves%' OR description ILIKE '%compressor case%insp%');

  -- Turbine mid life
  UPDATE maintenance_items SET last_complied_hours = 17271.0, due_at_hours = 19021.0
  WHERE aircraft_id = v_aircraft_id
    AND description ILIKE '%turbine mid life%';

  -- 3rd stage turbine wheel inspection
  UPDATE maintenance_items SET last_complied_hours = 16202.9, due_at_hours = 17977.9
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%3rd%turbine wheel%' OR description ILIKE '%third%turbine wheel%'
         OR description ILIKE '%3rd stg turbine%');

  -- FDC Aerofilters
  UPDATE maintenance_items SET last_complied_hours = 17370.2, due_at_hours = 17670.2
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%aerofilter%' OR description ILIKE '%fdc%filter%');

  -- Turbine assembly
  UPDATE maintenance_items SET last_complied_hours = 17271.0, due_at_hours = 17958.4
  WHERE aircraft_id = v_aircraft_id
    AND description ILIKE '%turbine assembly%';

  -- Turbine wheels (hours + cycles)
  UPDATE maintenance_items SET last_complied_hours = 15952.9, due_at_hours = 17977.9, due_at_cycles = 26805
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%1st stage%wheel%' OR description ILIKE '%first stage%wheel%');

  UPDATE maintenance_items SET last_complied_hours = 15952.9, due_at_hours = 17977.9, due_at_cycles = 26805
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%2nd stage%wheel%' OR description ILIKE '%second stage%wheel%');

  UPDATE maintenance_items SET last_complied_hours = 16202.9, due_at_hours = 17977.9, due_at_cycles = 29805
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%3rd stage%wheel%' OR description ILIKE '%third stage%wheel%');

  -- Starter generator
  UPDATE maintenance_items SET last_complied_hours = 17085.2, due_at_hours = 17509.0
  WHERE aircraft_id = v_aircraft_id
    AND description ILIKE '%starter%generator%';

  -- Lower collective tube
  UPDATE maintenance_items SET last_complied_hours = 16403.6, due_at_hours = 17684.5
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%lower collective%tube%' OR description ILIKE '%collective tube%lower%');

  -- Ignitor plug
  UPDATE maintenance_items SET last_complied_hours = 17062.8, due_at_hours = 17662.8
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%ignitor%' OR description ILIKE '%igniter%plug%');

  -- M/R drive shaft inspection
  UPDATE maintenance_items SET last_complied_hours = 17200.3, due_at_hours = 17800.3
  WHERE aircraft_id = v_aircraft_id
    AND description ILIKE '%drive shaft%inspection%'
    AND description NOT ILIKE '%t/r%'
    AND description NOT ILIKE '%tail rotor%';

  -- M/R transmission overhaul
  UPDATE maintenance_items SET last_complied_hours = 16397.4, due_at_hours = 17691.1
  WHERE aircraft_id = v_aircraft_id
    AND description ILIKE '%transmission%overhaul%'
    AND description NOT ILIKE '%freewheel%';

  -- T/R hub assembly
  UPDATE maintenance_items SET last_complied_hours = 16397.4, due_at_hours = 17922.4
  WHERE aircraft_id = v_aircraft_id
    AND (description ILIKE '%t/r hub%overhaul%' OR description ILIKE '%tail rotor hub%overhaul%'
         OR description ILIKE '%t/r hub assembly%');

  RAISE NOTICE 'STEP 5  Exact values re-stamped';
  RAISE NOTICE '';
  RAISE NOTICE '=== BASELINE CORRECTION COMPLETE ===';
  RAISE NOTICE 'hobbs_current = 17502.8  |  cycles_current = 25816';

END $$;


-- ── Verify ────────────────────────────────────────────────────────────────────
-- Run this separately after the DO block to confirm results:

SELECT tail_number, hobbs_current, cycles_current FROM aircraft WHERE tail_number = 'YS-CNA';

SELECT description,
  ROUND(last_complied_hours::numeric, 1) AS last_done_h,
  ROUND(due_at_hours::numeric, 1)        AS due_at_h,
  ROUND((due_at_hours - 17502.8)::numeric, 1) AS hrs_remaining,
  CASE
    WHEN due_at_hours IS NOT NULL AND due_at_hours < 17502.8 THEN '🔴 OVERDUE (hours)'
    WHEN due_at_cycles IS NOT NULL AND due_at_cycles < 25816 THEN '🔴 OVERDUE (cycles)'
    WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE   THEN '🔴 OVERDUE (date)'
    WHEN due_at_hours IS NOT NULL AND (due_at_hours - 17502.8) <= 50 THEN '🟡 DUE SOON'
    ELSE '🟢 OK'
  END AS status
FROM maintenance_items
WHERE aircraft_id = (SELECT id FROM aircraft WHERE tail_number = 'YS-CNA')
  AND is_active = true
ORDER BY
  CASE WHEN due_at_hours IS NOT NULL AND due_at_hours < 17502.8 THEN 0
       WHEN due_at_cycles IS NOT NULL AND due_at_cycles < 25816  THEN 0
       WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE      THEN 0
       WHEN due_at_hours IS NOT NULL AND (due_at_hours - 17502.8) <= 50 THEN 1
       ELSE 2 END,
  COALESCE(due_at_hours, 99999);
