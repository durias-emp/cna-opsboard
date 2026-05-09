-- Run this in Supabase SQL Editor before going to production.
-- Deletes all test flights and resets Hobbs back to your real baseline.

-- 1. Delete all flights
delete from flights;

-- 2. Reset Hobbs to your real current value (update the number below)
update aircraft
set hobbs_current = 17000
where tail_number = 'C-GOPF';
