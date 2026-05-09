-- Facility fuel tank fill-up log
-- Not tied to any specific aircraft — facility-level table

create table if not exists tank_fillups (
  id               uuid primary key default gen_random_uuid(),
  date             date    not null,
  gallons_before   numeric not null,
  gallons_added    numeric not null,
  gallons_after    numeric generated always as (gallons_before + gallons_added) stored,
  price_per_gallon numeric not null,
  total_cost       numeric generated always as (gallons_added * price_per_gallon) stored,
  supplier         text    not null check (supplier in ('comalapa', 'ilopango')),
  notes            text,
  created_at       timestamptz default now()
);

-- Index for chronological queries
create index if not exists tank_fillups_date_idx on tank_fillups (date desc);

-- RLS
alter table tank_fillups enable row level security;
create policy "allow_all_tank_fillups" on tank_fillups for all using (true) with check (true);
