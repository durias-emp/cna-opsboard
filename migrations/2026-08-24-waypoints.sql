-- Waypoints: the 275 official CA4 aerodromes/heliports (from AVIARA's AIP data)
-- plus custom landing sites the team drops on the map.
-- Run this, then 2026-08-24-waypoints-seed.sql.

create table if not exists waypoints (
  id           uuid primary key default gen_random_uuid(),
  code         text,                        -- ICAO where one exists (MSLP…), else null
  name         text not null,
  lat          numeric not null,
  lng          numeric not null,
  elevation_ft integer,
  kind         text not null default 'custom',   -- 'aerodrome' | 'heliport' | 'custom'
  country      text,
  source       text not null default 'custom',   -- 'aip' | 'custom'
  notes        text,
  is_active    boolean not null default true,
  created_by   text,
  created_at   timestamptz default now()
);
create unique index if not exists waypoints_code_key on waypoints (code) where code is not null;

-- Pre-lockdown parity (open policies, same as the rest of the DB today).
-- 2026-08-22-auth-lockdown.sql has been updated to include this table — if the
-- lockdown has ALREADY been run, re-run it after this so waypoints get locked too.
alter table waypoints enable row level security;
drop policy if exists waypoints_open on waypoints;
create policy waypoints_open on waypoints for all using (true) with check (true);
