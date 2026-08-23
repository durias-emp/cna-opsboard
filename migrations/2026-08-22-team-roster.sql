-- Make team_profiles the single source of truth for the roster.
-- Before: the team was hardcoded in six different source files (and already drifting).
-- After: the app reads these columns; src/lib/roster.js is only a fallback.
-- Safe to run at any time — the app falls back to the hardcoded roster until team_group is populated.

alter table team_profiles
  add column if not exists team_group    text,                       -- 'pilot' | 'mechanic' | 'operations'
  add column if not exists is_management boolean not null default false,
  add column if not exists is_active     boolean not null default true,
  add column if not exists sort_order    integer;

-- People missing from the table today
insert into team_profiles (name) values
  ('Daniel Sandoval'), ('Antony Villalta'), ('Kelly Moreno')
on conflict (name) do nothing;

update team_profiles set team_group='pilot',      role=coalesce(role,'Pilot'),             is_management=true,  sort_order=1  where name='James McBride';
update team_profiles set team_group='pilot',      role=coalesce(role,'Pilot'),             is_management=false, sort_order=2  where name='Jay McMackin';
update team_profiles set team_group='pilot',      role=coalesce(role,'Pilot'),             is_management=false, sort_order=3  where name='Daniel Sandoval';
update team_profiles set team_group='mechanic',   role=coalesce(role,'Aircraft Mechanic'), is_management=false, sort_order=4  where name='Cesar Espinoza';
update team_profiles set team_group='mechanic',   role=coalesce(role,'Aircraft Mechanic'), is_management=false, sort_order=5  where name='Antony Villalta';
update team_profiles set team_group='mechanic',   role=coalesce(role,'Aircraft Mechanic'), is_management=false, sort_order=6  where name='Luis Soriano';
update team_profiles set team_group='operations', role=coalesce(role,'Head Regulator'),    is_management=true,  sort_order=7  where name='Javier Ascencio';
update team_profiles set team_group='operations', role=coalesce(role,'Assistant Regulator'),is_management=true, sort_order=8  where name='Alonia Ascencio';
update team_profiles set team_group='operations', role=coalesce(role,'Operations'),        is_management=true,  sort_order=9  where name='Diego Urias';
update team_profiles set team_group='operations', role=coalesce(role,'Operations'),        is_management=true,  sort_order=10 where name='Kelly Moreno';

-- Check: select name, team_group, role, is_management, is_active, sort_order from team_profiles order by sort_order;
