# Finance module: plan

Scoping document per the Finance brief (2026-09-15), APPROVED 2026-09-15 with four
changes (folded in below). Monies source read from
`CC projects/Finance Tracker CNA/cna-monies`. Everything money is USD, stored net,
`numeric(14,2)`; IVA is El Salvador 13%, applied as 13/113 on gross figures AT ENTRY:
transactions store `amount_net` and `iva_amount` computed once when captured, and IVA
is never recomputed from net afterwards.

Decisions locked in review:
1. Transactions carry `amount_net` + `iva_amount` (computed at entry). `ivaOwed` sums
   `iva_amount` on income after the last Hacienda payment; new `ivaRecoverable` sums
   `iva_amount` on expenses flagged `iva_recoverable`.
2. Pilot cost is hourly only: 100.00 USD net per flight hour. `pilot_monthly` stays
   null and the UI shows the hourly field only. `flights.price` moves to Phase 1.
3. WhatsApp share target is dropped from Phase 4 (backlog only). The photo picker is
   the path on every platform.
4. Income categories collapse to `flight_revenue` and `other_income`.

## 1. What Finance touches in the existing app

### Tables (existing)

| Table | Role in Finance | Change needed |
|---|---|---|
| `flights` | Hours drive every rate; air time = `total_minutes` | Add `price` (net, commercial only), `price_includes_iva` capture at entry converts to net |
| `maintenance_items` (~108) | Reserves attach here | Add `estimated_cost` (net) |
| `maintenance_compliance_log` | The moment a scheduled cost is real. Written ONLY through the `log_compliance()` Postgres function (atomic, row lock) | Add `actual_cost`, `invoice_ref`, `includes_iva`, `iva_recoverable`; extend the function with matching optional args (defaults null, so existing calls keep working) |
| `snags` | Unscheduled cost is real at resolution | Add `actual_cost`, `invoice_ref`, `includes_iva`, `iva_recoverable` |
| `tank_fillups` | ALREADY has `price_per_gallon`, `total_cost`, `supplier` and a `type` column (drum vs jerry). More complete than the brief assumed | Add `includes_iva`, `iva_recoverable` only |
| `quote_profiles` | `rate_hr` + `tax_rate` + `burn_gph` already exist | Proposed single source for the commercial target rate (open question 5) |
| `team_profiles` | `is_management` gates every money surface | None |
| `aircraft` | Tenant anchor | Add `finance_mode` text default `'commercial'` (`'commercial'` or `'private'`): the tenant flag the brief asks for, per aircraft rather than global, which is where multi-tenant AVIARA Ops will need it anyway |
| `fluid_logs`, `jerry_cans`, `grease_logs` | Consumables; jerry fills already flow through `tank_fillups.type` | None in v1 (noted as future cost source) |

### Hooks, drawers, pages (existing) that get edits

- Hooks: `useFlights` (price in payload), `useMaintenanceItems` (estimated_cost),
  `useSnags` (actual cost fields), `useTank` (IVA flags).
- Drawers: `ComplianceDrawer` (+actual cost / invoice / IVA), `SnagListDrawer` resolve
  form (+same), `TankFillupDrawer` (+IVA toggle pair), `MaintenanceDrawer` item editor
  (+estimated_cost), `FlightDrawer` (+price field, rendered only when
  `finance_mode === 'commercial'` AND `is_management`).
- Pages: `Dashboard` (Finance card), new `Finance.jsx` page + route. `BottomNav`
  untouched (five icons stay; Finance is reached from the dashboard card).

### New files

- `src/pages/Finance.jsx` (three tabs: Ledger, Costs, P&L)
- `src/hooks/useFinanceAccounts.js`, `useFinanceTransactions.js`, `useCostRates.js`
- `src/lib/financeCalc.js` (pure, no UI, unit-tested) + `tests/financeCalc.test.js`
  (introduces vitest; the repo has no tests yet, this module is where they start)
- `src/components/TransactionDrawer.jsx`, `RatesDrawer.jsx`, `ReceiptScanSheet.jsx`
- `supabase/functions/extract-receipt/` (ported)
- Migrations under `migrations/` (dated, idempotent, owner-run)

## 2. Data model (new objects)

```sql
-- finance_accounts: where money sits. No crypto type (dropped from Monies).
create table finance_accounts (
  id           uuid primary key default gen_random_uuid(),
  aircraft_id  uuid references aircraft(id),
  name         text not null,
  type         text not null check (type in ('bank','cash','float')),
  is_archived  boolean not null default false,
  created_at   timestamptz not null default now()
);

-- finance_transactions: signed net amounts. +income / -expense.
create table finance_transactions (
  id               uuid primary key default gen_random_uuid(),
  aircraft_id      uuid references aircraft(id),
  account_id       uuid references finance_accounts(id) not null,
  date             date not null,
  party            text not null,
  amount_net       numeric(14,2) not null,          -- NET, signed (+income / -expense)
  iva_amount       numeric(14,2) not null default 0, -- computed at entry, never recomputed
  category         text not null,                   -- business list below
  description      text,
  includes_iva     boolean not null default true,   -- source figure was gross
  iva_recoverable  boolean not null default true,
  is_iva_payment   boolean not null default false,  -- payment to Hacienda (replaces Monies party-string matching)
  is_pending       boolean not null default false,
  receipt_url      text,                            -- storage path
  compliance_log_id uuid references maintenance_compliance_log(id),
  snag_id          uuid references snags(id),
  tank_fillup_id   bigint references tank_fillups(id),  -- match actual PK type at migration time
  flight_id        uuid references flights(id),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz                      -- soft delete with undo
);

-- cost_rates: one row per aircraft, set once and edited rarely.
create table cost_rates (
  aircraft_id        uuid primary key references aircraft(id),
  fuel_price_gal     numeric(14,2),   -- fallback when no purchases yet
  pilot_rate_hr      numeric(14,2),   -- CNA: 100.00 net per flight hour
  pilot_monthly      numeric(14,2),   -- stays null (kept for other tenants; UI hides it)
  insurance_year     numeric(14,2),
  hangar_year        numeric(14,2),
  other_fixed_year   numeric(14,2),
  target_rate_hr     numeric(14,2),   -- commercial only; may mirror quote_profiles.rate_hr
  includes_iva       boolean not null default false,  -- rates entered net by default
  updated_at         timestamptz not null default now()
);
```

Business categories: income is just `flight_revenue` and `other_income`; expense is
`fuel`, `maintenance`, `labor`, `pilot_labor`, `equipment`, `admin`, `hangar`,
`insurance`, `transport`, `misc_business`, `branding`, `taxes`; plus `transfer` as a
neutral account-to-account movement. Dropped from Monies: crypto, personal_expenses,
personal_misc, gifts, education, membership, fitness, and the granular income split.

P&L view `v_finance_pnl_month`: month, revenue net, expenses by group (fuel,
maintenance, fixed, other), IVA collected and recoverable, hours flown (join on
flights by month). Written AFTER all column adds in the same migration file
(column freeze rule), `security_invoker = true` from day one.

RLS: permissive now to match the app; each migration carries the post-lockdown
policies as commented blocks (`is_management` read, management-only write).

## 3. Calculation module (pure, tested)

`src/lib/financeCalc.js`. Every function takes plain data in, returns numbers out.
No Supabase, no React, no Date.now() (period boundaries are passed in).

```js
splitEntry(amountGross_or_net, includesIva) // AT ENTRY only: returns { amount_net, iva_amount }; stored once, never recomputed
fuelRatePerHour({ purchases, flights, fallbackPriceGal })
                                           // weighted avg $/gal from purchases (or fallback) * fleet burn (gal/hr from logged fuel & hours)
pilotRatePerHour({ rate_hr })              // hourly only (100.00 net for CNA); no monthly component
reservePerHour(items)                      // sum(estimated_cost / interval): hours items use hours_interval, calendar items use expected hours in the interval (interval months * trailing utilization)
variablePerHour({ fuelRate, pilotRate, reserveRate })
fixedPerHour({ annualFixed, trailingHours })
                                           // trailingHours = trailing 12 months when >= 12 months of data, else annualized from available full months (min 3), flagged { annualized: true }
fullyLoadedPerHour(...)
costOfFlight({ airTimeHours, variableRate, fixedRate })
marginOfFlight({ priceNet, cost })         // commercial only
breakevenHoursMonth({ fixedMonthly, targetRateNet, variableRate })
ivaOwed({ transactions })                  // sum of iva_amount on income after the last is_iva_payment
ivaRecoverable({ transactions })           // sum of iva_amount on expenses with iva_recoverable true
reserveVsActual({ item, complianceLogs })  // accrued reserve since last compliance vs actual_cost at the work order
monthPnl({ flights, transactions, rates, month })
```

Tests: vitest, table-driven, covering the 13/113 boundary cases, the annualization
fallback, zero-hour months, and private mode (no revenue functions called).

## 4. Screens

### Dashboard Finance card (management only)
Full width, same visual weight as the Hobbs card, below the three tiles, above the
map. Commercial hero: margin this month. Private hero: cost per hour at current pace.
Sub-line: hours this month vs breakeven (commercial) and IVA owed when > 0. Tap opens
`/finance`. Pilots and mechanics see the dashboard exactly as today.

### Finance page, tab 1: Ledger
Account list with balances; transaction list (signed, net labelled); add transaction
drawer with receipt scan (camera/photo -> Edge Function -> pre-filled form); link
picker to attach the transaction to a work order, snag, or fuel record so a cost is
entered once; IVA card (owed since last Hacienda payment, "mark paid" creates the
payment transaction); soft delete with undo toast.

### Finance page, tab 2: Costs
Rates screen (the `cost_rates` row, one drawer); reserves editor (list of
maintenance items that carry `estimated_cost`, inline edit); cost per hour breakdown
(fuel + pilot + reserves + fixed at utilization = fully loaded); reserve vs actual
per component.

### Finance page, tab 3: P&L
Month picker; fixed / variable / reserves / revenue (commercial) / hours; margin
line; PDF export (client-side, print stylesheet or jsPDF, same branding as the
existing email templates).

### Flight detail
Cost stamp on `FlightDetailSheet` (management only): cost of this flight, and margin
when commercial and a price exists.

## 5. Monies port map

| Monies file | Destination | Changes |
|---|---|---|
| `supabase/functions/extract-receipt/index.ts` | same path in OpsBoard | Keep Claude Haiku vision + JSON extraction. Auth: adopt the `REQUIRE_USER` env-flag pattern already used by `send-push` (off until the auth lockdown runs, JWT verified after). Add El Salvador prompt tweaks; add IVA hint extraction (gross detected -> `includes_iva: true`) |
| `src/types/index.ts` categories | `src/lib/financeCategories.js` | Business list only; plain JS |
| `IvaScreen.tsx` 13/113 + unpaid calc | `financeCalc.js` + Ledger IVA card | Party-string matching replaced by `is_iva_payment`; USD only (the Monies doc's Costa Rica/colones mention is wrong, CNA is El Salvador) |
| `useTransactions.ts`, `useAccounts.ts` | `useFinanceTransactions.js`, `useFinanceAccounts.js` | TS -> JS, uuid PKs, soft-delete undo kept, no user_id scoping until lockdown |
| `sw.ts` share-target handler | appended to `public/push-sw.js` + `share_target` in the VitePWA manifest | The plugin owns `/sw.js`; our handlers ride in via importScripts (same as push). Android/Chrome only: iPhones cannot share into a PWA, the fallback is the in-app photo picker |
| `CostPerHourScreen.tsx` | concept only | Its single-yearly-figure math is replaced by the rate engine; the projected-pace idea survives in the private-mode hero |
| NOT ported | | BTC account + CoinGecko, personal categories, LoginScreen, demo mode |

## 6. Phases

### Phase 1: cost capture (no math)
Migration 1 (columns on `maintenance_items`, `snags`, `tank_fillups`,
`maintenance_compliance_log`, `flights.price` + extended `log_compliance()` +
`aircraft.finance_mode`). Sequenced: migration first, owner runs it and replies with
the result, drawers only after. Drawer edits: ComplianceDrawer, Snag resolve,
TankFillupDrawer (IVA toggles), item editor (estimated_cost), FlightDrawer (price,
management + commercial only). Size: M (1 migration, 5 drawer edits). Depends on:
nothing. Risk: `log_compliance()` gains arguments, which in Postgres means a new
overload; the migration drops the old signature first so PostgREST never sees an
ambiguous pair (the deployed app keeps working because the new defaults cover the
old call shape).

### Phase 2: Costs tab + calc engine
Migration 2 (`cost_rates`). `financeCalc.js` + vitest + tests. `Finance.jsx` shell
with Costs tab, RatesDrawer, reserves editor, flight cost stamp on FlightDetailSheet.
Size: M-L. Depends on: Phase 1 fields. Risk: vitest is new to the repo (dev-dep only,
no build impact); sparse history makes fixed-per-hour noisy (annualization flag
handles it).

### Phase 3: Dashboard Finance card
Card component + `is_management` gate + `finance_mode` branch. Size: S. Depends on:
Phase 2 engine. Risk: none notable; renders nothing for non-management, so the
dashboard is unchanged for pilots and mechanics.

### Phase 4: Ledger (the Monies port)
Migration 3 (`finance_accounts`, `finance_transactions`, storage bucket for
receipts). Hooks, TransactionDrawer, receipt scan Edge Function (deploy via CLI),
IVA card (owed + recoverable), link-to-source picker. Photo picker is the only
capture path; the WhatsApp share target is BACKLOG, not in this phase. Size: L (the
biggest phase). Depends on: Phases 1-2. Risks: Edge Function secret setup
(`ANTHROPIC_API_KEY` in function secrets, owner sets it in the dashboard); receipt
storage bucket policies.

### Phase 5: P&L + PDF
Migration 4 (`v_finance_pnl_month`, after all columns exist). P&L tab, month PDF
export. Size: M. Depends on: Phase 4 transactions. Risk: PDF fidelity on mobile
(print stylesheet first, jsPDF only if needed).

## 7. Open questions: ANSWERED (review of 2026-09-15)

1. `flights.price`: manual entry when logging, management only. Quote prefill is a
   later nicety. (In Phase 1 per review.)
2. Pilot cost: hourly, 100.00 USD net per flight hour. No salaried component;
   `pilot_monthly` stays null and the UI shows the hourly field only.
3. `target_rate_hr` reads `quote_profiles.rate_hr`, with an override in `cost_rates`.
4. Historical `tank_fillups` rows default `includes_iva = true, iva_recoverable = true`.
5. Mechanic labor arrives as actuals only (work order cost or a `labor` transaction).
6. Reserves are filled in-app, item by item. No seed migration.
7. Receipts live in a new private bucket `receipts`, management-only signed URLs
   post-lockdown.

Backlog (out of all phases): WhatsApp Web Share Target (Android/Chrome only).
