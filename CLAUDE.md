# CLAUDE.md — working notes for agents in this repo

Read `README.md` first for what the app is. This file is about how to work here.

## Ground rules
- **Never push or merge without the owner saying so explicitly** ("push", "ready to push"). Commit locally as you go.
- **Never run `migrations/*.sql` yourself.** They are hand-run by the owner in the Supabase SQL Editor. Write the SQL to a new dated file in `migrations/` and hand it over; the owner replies with the result ("Success. No rows returned").
- Do not print `.env` values into the chat. Names only.
- The database is production with real flight, maintenance, and passenger data. Do not write test rows. Do not delete rows.
- The GitHub repo `durias-emp/cna-opsboard` is **public** as of 2026-08-22. Do not commit audit reports or anything describing security weaknesses until it is private.

## Owner
Diego (non-technical, directs development). Keep explanations plain-language, every claim backed by `file:line`. Roster and roles are in `src/hooks/useEmployeeFlights.js`; management group in `src/hooks/useTodos.js`.

## Verifying changes
- Dev server: `.claude/launch.json` pins port **5176**. Phone preview: `cloudflared tunnel --url http://localhost:5176` (the `vite.config.js` `allowedHosts` entry exists for this).
- In the browser preview, bypass the identity screen with `localStorage.setItem('cna_identity','__skipped__')` or set a management name (`'James McBride'`) to see management-only UI.
- `npm run build` must pass before any commit. There are no tests yet.

## Patterns
- Data: hook (fetch) → drawer (write) → page (wire). One hook per table in `src/hooks/`.
- Drawers use `useDrawerSwipe` and the `.drawer-panel` / `.drawer-overlay` / `.card` / `.label` / `.input-field` classes from `src/index.css`.
- Dates are `YYYY-MM-DD` strings; always construct with `new Date(str + 'T12:00:00')` to avoid timezone shifts.
- Hobbs is decimal hours to 0.1; `toHobbs(minutes)` in `src/lib/utils.js`.
- Email HTML is built in `api/send-notification.js`; anything user-entered that goes into it must pass through `esc()`.

## Things that live only in the Supabase dashboard (not in this repo)
DB webhook `flights`/`flight_itineraries` INSERT → `/api/send-notification` (header `x-webhook-secret`); RLS policies on most tables; Edge Function deployment for `send-push`. If you change those, write down what you did in `migrations/` or here.
