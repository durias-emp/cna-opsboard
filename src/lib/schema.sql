-- Run this in your Supabase SQL editor before using the app

-- Aircraft table
create table if not exists aircraft (
  id uuid primary key default gen_random_uuid(),
  tail_number text unique not null,
  make_model text not null,
  hobbs_current numeric default 0,
  created_at timestamptz default now()
);

-- Flights table
create table if not exists flights (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  date date not null,
  legs jsonb not null default '[]'::jsonb,
  total_minutes integer not null default 0,
  created_at timestamptz default now()
);

-- Indexes for fast queries by aircraft
create index if not exists flights_aircraft_id_idx on flights(aircraft_id);
create index if not exists flights_date_idx on flights(date);

-- RLS (update these policies when you add auth)
alter table aircraft enable row level security;
alter table flights enable row level security;

create policy "allow_all_aircraft" on aircraft for all using (true) with check (true);
create policy "allow_all_flights"  on flights  for all using (true) with check (true);

-- Seed aircraft
insert into aircraft (tail_number, make_model, hobbs_current)
values ('C-GOPF', 'Bell 206B3 JetRanger', 17502.8)
on conflict (tail_number) do nothing;
