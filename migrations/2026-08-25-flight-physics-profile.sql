-- Pilot-provided YS-CNA performance (2026-08-25): the quote engine now models
-- climb (60 kt / 300 fpm), cruise (80 kt), descent (70 kt / 500 fpm) at
-- 30 gph in all phases; billable flight time = air time + 0.2 h start/stop.
-- Replaces the flat 100 kt / 27 gph cruise model.

alter table quote_profiles
  add column if not exists climb_kts             numeric not null default 60,
  add column if not exists climb_fpm             numeric not null default 300,
  add column if not exists descent_kts           numeric not null default 70,
  add column if not exists descent_fpm           numeric not null default 500,
  add column if not exists default_cruise_alt_ft numeric not null default 5500,
  add column if not exists airtime_allowance_hr  numeric not null default 0.2;

update quote_profiles set
  cruise_kts = 80,
  burn_gph = 30,
  climb_kts = 60, climb_fpm = 300,
  descent_kts = 70, descent_fpm = 500,
  default_cruise_alt_ft = 5500,
  airtime_allowance_hr = 0.2,
  updated_at = now()
where aircraft_id in (select id from aircraft where tail_number = 'YS-CNA');
