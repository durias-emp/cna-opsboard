-- Run this in the Supabase SQL Editor to add fuel columns to flights

alter table flights
  add column if not exists fuel_start_gal numeric,
  add column if not exists fuel_end_gal   numeric,
  add column if not exists fuel_consumed_gal numeric;
