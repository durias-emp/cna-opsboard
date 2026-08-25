-- IVA separated from the flight rate (Diego, 2026-08-25): the factura base is
-- $1,200/h and IVA 13% is its own line (effective $1,356/h). Minimum and
-- standby stay pre-IVA. Replaces the earlier "all-in $1,350" encoding.

alter table quote_profiles
  add column if not exists tax_rate numeric not null default 0.13;

update quote_profiles set
  rate_hr = 1200,
  tax_included = false,
  tax_rate = 0.13,
  updated_at = now()
where aircraft_id in (select id from aircraft where tail_number = 'YS-CNA');
