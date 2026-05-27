-- Run this in Supabase SQL Editor to add maintenance tables

-- Fluid logs (engine oil, transmission oil, hydraulic fluid)
create table if not exists fluid_logs (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  fluid_type text not null check (fluid_type in ('engine_oil', 'transmission_oil', 'hydraulic_fluid')),
  date date not null,
  hobbs_at_service numeric not null,
  quantity_quarts numeric not null,
  notes text,
  created_at timestamptz default now()
);

-- Grease sessions (covers all grease points in one session)
create table if not exists grease_logs (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  date date not null,
  hobbs_at_service numeric not null,
  notes text,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists fluid_logs_aircraft_idx  on fluid_logs(aircraft_id, fluid_type, hobbs_at_service desc);
create index if not exists grease_logs_aircraft_idx on grease_logs(aircraft_id, hobbs_at_service desc);

-- RLS
alter table fluid_logs  enable row level security;
alter table grease_logs enable row level security;

create policy "allow_all_fluid_logs"  on fluid_logs  for all using (true) with check (true);
create policy "allow_all_grease_logs" on grease_logs for all using (true) with check (true);
