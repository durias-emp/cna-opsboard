-- Maintenance status must not depend on free-text notes.
-- Before: an item was hidden from OVERDUE if its notes happened to start with "N/A",
-- and ON_CONDITION running totals were parsed from "TRACK:<acRef>:<ohRef>" in notes.
-- After: explicit columns. Notes are left untouched (still shown in the UI).
-- The app reads the new columns when present and falls back to the old prefix
-- parsing until this migration has been run, so it is safe to deploy in either order.

alter table maintenance_items
  add column if not exists is_not_applicable boolean not null default false,
  add column if not exists track_ac_ref      numeric,
  add column if not exists track_oh_ref      numeric;

-- Backfill from the existing note prefixes (case-sensitive, exactly as the app matched them)
update maintenance_items
   set is_not_applicable = true
 where notes like 'N/A%';

update maintenance_items
   set track_ac_ref = nullif(split_part(notes, ':', 2), '')::numeric,
       track_oh_ref = nullif(split_part(notes, ':', 3), '')::numeric
 where notes like 'TRACK:%'
   and split_part(notes, ':', 2) ~ '^[0-9.]+$'
   and split_part(notes, ':', 3) ~ '^[0-9.]+$';

-- Check (should list the same items the app currently shows as N/A and as tracked):
-- select description, is_not_applicable, track_ac_ref, track_oh_ref, notes
--   from maintenance_items where is_not_applicable or track_ac_ref is not null;
