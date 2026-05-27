-- Add type column to tank_fillups to support both fill-ups and withdrawals
-- Withdrawals are stored with negative gallons_added so gallons_after (generated) still works

alter table tank_fillups
  add column if not exists type text not null default 'fillup'
    check (type in ('fillup', 'withdrawal'));
