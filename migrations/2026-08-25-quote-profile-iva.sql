-- IVA separated from the flight rate (Diego, 2026-08-25): the factura base is
-- $1,200/h and IVA 13% is its own line (effective $1,356/h). The minimum is
-- 20 minutes at the base rate = $400 pre-IVA ($452 with IVA); standby stays
-- pre-IVA. Replaces the earlier "all-in $1,350 / $500 min" encoding.

alter table quote_profiles
  add column if not exists tax_rate numeric not null default 0.13;

update quote_profiles set
  rate_hr = 1200,
  min_charge = 400,
  tax_included = false,
  tax_rate = 0.13,
  updated_at = now()
where aircraft_id in (select id from aircraft where tail_number = 'YS-CNA');
