-- 2026-08-26 — Add Erick Hidalgo to the roster as a pilot.
-- He becomes selectable wherever a pilot is chosen (flight logging PIC/SIC,
-- employee stats, itineraries). sort_order 11 places him after the existing
-- pilots within the pilot group without renumbering anyone.
--
-- Run in the Supabase SQL Editor. Reply with the result.

insert into team_profiles (name, team_group, role, is_management, is_active, sort_order)
values ('Erick Hidalgo', 'pilot', 'Pilot', false, true, 11)
on conflict (name) do update
  set team_group = 'pilot', role = 'Pilot', is_active = true, sort_order = 11;

-- Verification:
select name, team_group, role, is_active, sort_order
from team_profiles where team_group = 'pilot' order by sort_order;
