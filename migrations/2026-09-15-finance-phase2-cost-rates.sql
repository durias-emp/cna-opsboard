-- Finance Phase 2: cost_rates, one row per aircraft, edited from the Costs
-- tab. Idempotent. Rates are NET unless includes_iva says otherwise.
-- Seeded for YS-CNA with the decided pilot rate (100.00 net per flight hour);
-- everything else starts null and gets filled in the app.

create table if not exists cost_rates (
  aircraft_id        uuid primary key references aircraft(id),
  fuel_price_gal     numeric(14,2),   -- fallback when no purchases logged yet
  pilot_rate_hr      numeric(14,2),   -- CNA: 100.00 net per flight hour
  pilot_monthly      numeric(14,2),   -- stays null for CNA (other tenants)
  insurance_year     numeric(14,2),
  hangar_year        numeric(14,2),
  other_fixed_year   numeric(14,2),
  target_rate_hr     numeric(14,2),   -- null -> read quote_profiles.rate_hr
  includes_iva       boolean not null default false,
  updated_at         timestamptz not null default now()
);

alter table cost_rates enable row level security;
drop policy if exists "cost_rates open" on cost_rates;
create policy "cost_rates open" on cost_rates for all using (true) with check (true);
-- Post-lockdown: management-only read/write, same commented pattern as
-- 2026-09-15-finance-phase4a-ledger-tables.sql.

insert into cost_rates (aircraft_id, pilot_rate_hr)
select id, 100.00 from aircraft where tail_number = 'YS-CNA'
on conflict (aircraft_id) do nothing;

-- verificación
select (select count(*) from cost_rates) as rows_1,
       (select pilot_rate_hr from cost_rates limit 1) as pilot_100;
