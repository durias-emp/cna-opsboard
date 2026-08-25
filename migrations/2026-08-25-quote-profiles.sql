-- Quote profiles: every number the quoting engine uses, per aircraft, in the
-- database — so CNA's rules are just the first profile and a future operator
-- (or a rate change) is a row edit, never an app release.
-- Decided with Diego 2026-08-25:
--   round trip billed · minimum charge $500 (≈22 min at $1,350) ·
--   waiting: first hour free then $100/h (market ref: US turbine standby
--   $260–600/h; $150–250 suggested for CA — edit standby_rate_hr when ready) ·
--   $1,350/h all-in, IVA included.

create table if not exists quote_profiles (
  id                 uuid primary key default gen_random_uuid(),
  aircraft_id        uuid unique references aircraft(id) on delete cascade,
  cruise_kts         numeric not null,
  burn_gph           numeric not null,
  rate_hr            numeric not null,
  currency           text    not null default 'USD',
  min_charge         numeric not null default 0,      -- price floor per trip
  standby_free_hr    numeric not null default 0,      -- waiting hours not billed
  standby_rate_hr    numeric not null default 0,      -- per hour after the free window
  tax_included       boolean not null default true,   -- rate is all-in (IVA inside)
  round_trip_default boolean not null default true,   -- quotes start with return leg on
  updated_at         timestamptz default now()
);

-- Pre-lockdown parity (open policies, same as the rest of the DB today).
-- 2026-08-22-auth-lockdown.sql includes this table — if the lockdown has
-- already been run, re-run it after this.
alter table quote_profiles enable row level security;
drop policy if exists quote_profiles_open on quote_profiles;
create policy quote_profiles_open on quote_profiles for all using (true) with check (true);

-- Seed YS-CNA's profile (idempotent)
insert into quote_profiles
  (aircraft_id, cruise_kts, burn_gph, rate_hr, currency, min_charge,
   standby_free_hr, standby_rate_hr, tax_included, round_trip_default)
select id, 100, 27, 1350, 'USD', 500, 1, 100, true, true
from aircraft where tail_number = 'YS-CNA'
on conflict (aircraft_id) do update set
  cruise_kts = excluded.cruise_kts,
  burn_gph = excluded.burn_gph,
  rate_hr = excluded.rate_hr,
  min_charge = excluded.min_charge,
  standby_free_hr = excluded.standby_free_hr,
  standby_rate_hr = excluded.standby_rate_hr,
  tax_included = excluded.tax_included,
  round_trip_default = excluded.round_trip_default,
  updated_at = now();
