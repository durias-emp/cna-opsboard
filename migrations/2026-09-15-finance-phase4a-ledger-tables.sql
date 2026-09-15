-- ============================================================
-- Finance Phase 4a: the Ledger tables (accelerated ahead of the
-- receipt scanner so the Monies history can move in).
-- Per docs/finance-plan.md decision 1: transactions store amount_net
-- AND iva_amount computed at entry; IVA is never recomputed from net.
-- Idempotent. Owner runs this, then phase 4b (the history seed).
-- ============================================================

create table if not exists finance_accounts (
  id           uuid primary key default gen_random_uuid(),
  aircraft_id  uuid references aircraft(id),
  name         text not null,
  type         text not null check (type in ('bank','cash','float')),
  is_archived  boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists finance_transactions (
  id                uuid primary key default gen_random_uuid(),
  aircraft_id       uuid references aircraft(id),
  account_id        uuid references finance_accounts(id) not null,
  date              date not null,
  party             text not null,
  amount_net        numeric(14,2) not null,            -- NET, signed: +income / -expense
  iva_amount        numeric(14,2) not null default 0,  -- computed at entry, never recomputed
  category          text not null,
  description       text,
  includes_iva      boolean not null default true,
  iva_recoverable   boolean not null default true,
  is_iva_payment    boolean not null default false,    -- payment to Hacienda
  is_pending        boolean not null default false,
  receipt_url       text,
  source_ref        text unique,                       -- import/dedup key (e.g. Monies ids)
  compliance_log_id uuid references maintenance_compliance_log(id),
  snag_id           uuid references snags(id),
  flight_id         uuid references flights(id),
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz                        -- soft delete with undo
);

create index if not exists finance_transactions_date_idx
  on finance_transactions (aircraft_id, date desc);

-- RLS: permissive to match the app today (no auth). The post-lockdown
-- policies are ready below as comments.
alter table finance_accounts     enable row level security;
alter table finance_transactions enable row level security;

drop policy if exists "finance_accounts open"     on finance_accounts;
create policy "finance_accounts open"     on finance_accounts     for all using (true) with check (true);
drop policy if exists "finance_transactions open" on finance_transactions;
create policy "finance_transactions open" on finance_transactions for all using (true) with check (true);

-- Post-lockdown (activate with the auth-lockdown migration):
-- drop policy "finance_accounts open" on finance_accounts;
-- drop policy "finance_transactions open" on finance_transactions;
-- create policy "finance mgmt read"  on finance_transactions for select
--   using (exists (select 1 from team_profiles tp
--          where tp.email = auth.jwt()->>'email' and tp.is_management));
-- create policy "finance mgmt write" on finance_transactions for all
--   using (exists (select 1 from team_profiles tp
--          where tp.email = auth.jwt()->>'email' and tp.is_management))
--   with check (same);
-- (mirror both on finance_accounts)

-- verificación
select
  (select count(*) from information_schema.tables  where table_name in ('finance_accounts','finance_transactions')) as tables_2,
  (select count(*) from information_schema.columns where table_name = 'finance_transactions' and column_name in ('amount_net','iva_amount','source_ref')) as key_cols_3;
