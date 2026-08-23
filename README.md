# CNA OpsBoard

Internal operations app for **Cielo Norte Aviación** (El Salvador) — one helicopter, Bell 206B3 JetRanger **YS-CNA**. Staff use it on their phones as an installed PWA.

What it does: log flights (which advances the aircraft's hours and engine cycles), file passenger itineraries with signatures, track maintenance due-times, fuel stock, defect reports ("snags"), and a team task list with push notifications.

## Stack

| Layer | Tech |
|---|---|
| UI | React 18, react-router 6, Tailwind 3, Vite 6, vite-plugin-pwa |
| Data | Supabase (Postgres + REST) — see tables below |
| Serverless | Vercel functions in `api/` (email, accounting bridge, keep-alive cron) |
| Email | Resend, via `api/send-notification.js` (triggered by a Supabase DB webhook on insert into `flights` / `flight_itineraries`) |
| Push | Web Push — Supabase Edge Function `supabase/functions/send-push/` |
| Calendar | Google Apps Script endpoint read by `src/hooks/useGoogleCalendar.js` |
| Accounting | "CNA Monies" — a separate Supabase project written to by `api/create-monies-transaction.js` |

## Run it

```bash
npm ci
cp .env.example .env   # fill in values
npm run dev            # http://localhost:5173 (or --port 5176 for the Claude launch config)
npm run build          # production bundle in dist/
```

Deploy: every push to `main` on GitHub auto-deploys to Vercel (`cna-opsboard.vercel.app`). Vercel env vars are listed in `.env.example`.

## Repo layout

```
src/pages/        Dashboard, Flights, Maintenance, Fuel, Employees (Team)  — one per route
src/components/   drawers and modals (FlightDrawer, ItineraryDrawer, ComplianceDrawer, …)
src/hooks/        one data hook per table (useFlights, useTodos, useMaintenanceItems, …)
src/context/      AircraftContext — selected aircraft + live hobbs/cycles
src/lib/          supabase client, utils, notifyAssignment (push)
api/              Vercel serverless functions
supabase/         Edge function source
migrations/       hand-run SQL (run in the Supabase SQL Editor, in date order); NOT auto-applied
scripts/backup.sh exports every table to backups/<date>/ (gitignored — contains passenger PII)
```

## Database tables

`aircraft`, `flights`, `flight_itineraries`, `todos`, `task_updates`, `snags`, `fluid_logs`, `grease_logs`, `maintenance_items`, `maintenance_compliance_log`, `tank_fillups`, `jerry_cans`, `team_profiles`, `device_tokens`. Function: `log_compliance` (atomic maintenance compliance).

The one rule that ties everything together: **logging a flight updates `aircraft.hobbs_current` / `cycles_current`, and every maintenance countdown is computed from those two numbers** (`src/hooks/useMaintenanceItems.js`). Nothing else writes to maintenance tables except explicit compliance logging.

## Identity

There is currently no login. On first open the app asks "who are you?" and stores the name in `localStorage.cna_identity`; that name is used for task assignment, push targeting, and the management-only task filter. See `FIXLIST.md` (local) for the plan to replace this with real authentication.
