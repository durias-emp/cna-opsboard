-- 2026-08-25 — Retire the C-GOPF ghost maintenance items.
--
-- Found while cross-checking the July 2026 control sheets against the live
-- database: five maintenance items (AF-25b Gearbox, B-11b, B-13, B-14, B-15)
-- appear twice in "active" queries. They are not true duplicates of a single
-- aircraft — each extra copy belongs to a second aircraft row, tail C-GOPF
-- (id 50aedd34-6874-45b2-8d4c-6f0964eaca07, created 2026-05-29), which is
-- YS-CNA's former registration left over from the May import. YS-CNA
-- (id 8082b82b-9b3a-467a-a9b9-7973c861f6d4) holds the authoritative 118
-- active items; the C-GOPF copies carry no data the YS-CNA rows lack.
--
-- Per production rules nothing is deleted — the ghost items are deactivated
-- with a note, same treatment as the 2026-08-24 stale-duplicate cleanup.
-- The C-GOPF aircraft row itself is left in place (it still appears in the
-- aircraft switcher; removing it is a separate decision).
--
-- Run in the Supabase SQL Editor. Reply with the result.

begin;

update maintenance_items
set is_active = false,
    notes = coalesce(notes || ' | ', '') ||
      'Deactivated 2026-08-25: ghost copy under retired registration C-GOPF; YS-CNA row is authoritative',
    updated_at = now()
where aircraft_id = '50aedd34-6874-45b2-8d4c-6f0964eaca07'
  and is_active = true;

commit;

-- ── Verification (run after commit; paste the output back) ───────────────────
-- Expect: 0 active C-GOPF items, and each item_number listed exactly once.
select count(*) as cgopf_still_active
from maintenance_items
where aircraft_id = '50aedd34-6874-45b2-8d4c-6f0964eaca07' and is_active = true;

select item_number, count(*) as active_copies
from maintenance_items
where is_active = true
group by item_number
having count(*) > 1;
