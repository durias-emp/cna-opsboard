-- ============================================================
-- Finance: block hour accounts (prepaid hour banks).
-- A client has ONE block that gets recharged like a card; each recharge
-- carries the hours bought and the net rate paid for them. Flights drawn
-- against a block deduct FLIGHT time (not air time). Blocks never expire.
--
-- Single source of truth for draws: the flights table itself
-- (flights.block_id + flights.billed_hours). The block's balance is
--   sum(recharge hours) - opening_hours_used - sum(billed_hours)
-- so nothing can drift between two ledgers.
--
-- Also fixes two imported transactions whose descriptions say "no tax":
-- the import split IVA out of them anyway.
-- Idempotent. Owner runs this in the SQL Editor.
-- ============================================================

-- 1 · One block per client
create table if not exists hour_blocks (
  id                  uuid primary key default gen_random_uuid(),
  aircraft_id         uuid references aircraft(id),
  client              text not null,
  opening_hours_used  numeric(6,2) not null default 0,  -- flown before the app tracked it
  notes               text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);
create unique index if not exists hour_blocks_client_idx
  on hour_blocks (aircraft_id, lower(client));

-- 2 · Recharges: every purchase of hours, at the rate paid that day
create table if not exists block_recharges (
  id             uuid primary key default gen_random_uuid(),
  block_id       uuid references hour_blocks(id) on delete cascade not null,
  date           date not null,
  hours          numeric(6,2) not null check (hours > 0),
  rate_hr        numeric(14,2) not null,          -- NET per flight hour
  amount_net     numeric(14,2) not null,          -- what the hours cost, net
  iva_amount     numeric(14,2) not null default 0,
  transaction_id uuid references finance_transactions(id),
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists block_recharges_block_idx on block_recharges (block_id, date);

-- 3 · Flights draw from a block (flight time, per the owner's rule)
alter table flights
  add column if not exists block_id     uuid references hour_blocks(id),
  add column if not exists billed_hours numeric(5,2);
create index if not exists flights_block_idx on flights (block_id);

-- 4 · RLS: permissive to match the app today; post-lockdown policies are
--    the same management-only pattern as the other finance tables.
alter table hour_blocks     enable row level security;
alter table block_recharges enable row level security;
drop policy if exists "hour_blocks open"     on hour_blocks;
create policy "hour_blocks open"     on hour_blocks     for all using (true) with check (true);
drop policy if exists "block_recharges open" on block_recharges;
create policy "block_recharges open" on block_recharges for all using (true) with check (true);

-- 5 · Seed the block that already exists in the history: Fidel Rivas,
--    three recharges totalling 16.1 h. Linked to their payment rows so the
--    money and the hours point at each other.
insert into hour_blocks (id, aircraft_id, client, notes)
select 'b10c0000-0000-4000-8000-000000000001', a.id, 'Fidel Rivas',
       'Imported from the Monies history: three purchases, Mar-Apr 2026.'
from aircraft a where a.tail_number = 'YS-CNA'
on conflict (id) do nothing;

insert into block_recharges (id, block_id, date, hours, rate_hr, amount_net, iva_amount, transaction_id, notes)
select v.id::uuid, 'b10c0000-0000-4000-8000-000000000001'::uuid,
       v.d::date, v.h::numeric, v.r::numeric, v.net::numeric, v.iva::numeric,
       (select id from finance_transactions where source_ref = v.ref),
       v.note
from (values
  ('b10c0001-0000-4000-8000-000000000001', '2026-03-04', 8.0, 980.00,  7840.00, 1019.20, 'b01', '8 hours at 980 plus IVA'),
  ('b10c0002-0000-4000-8000-000000000001', '2026-04-06', 4.1, 1060.00, 4346.00, 0.00,    'b31', '4.1 hours at 1,060 no tax; payment netted the IVA credit from the first purchase'),
  ('b10c0003-0000-4000-8000-000000000001', '2026-04-28', 4.0, 1060.00, 4240.00, 0.00,    'b44', '4.0 hours at 1,060 no tax')
) as v(id, d, h, r, net, iva, ref, note)
on conflict (id) do nothing;

-- 6 · IVA correction: these two purchases were sold WITHOUT tax (their own
--    descriptions say "no tax"), but the import split 13/113 out of them.
update finance_transactions
set amount_net = amount_net + iva_amount, iva_amount = 0
where source_ref in ('b31', 'b44') and iva_amount <> 0;

-- ── Verificación ─────────────────────────────────────────────
select
  (select count(*) from hour_blocks)                                             as blocks_1,
  (select count(*) from block_recharges)                                         as recharges_3,
  (select sum(hours) from block_recharges)                                       as hours_16_1,
  (select round(sum(amount_net + iva_amount), 2) from block_recharges)           as value_16426_00,
  (select count(*) from information_schema.columns
     where table_name = 'flights' and column_name in ('block_id','billed_hours')) as flight_cols_2,
  (select round(sum(iva_amount), 2) from finance_transactions)                   as iva_now_2826_22;
