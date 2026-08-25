-- ══════════════════════════════════════════════════════════════════════════════
-- LOGIN + DATABASE LOCKDOWN.  Read before running.
--
-- Before: every table had "for all using (true)" policies (or none), so the public
-- anon key shipped in the app bundle could read/write/delete everything.
-- After:  only logged-in Supabase Auth users (role "authenticated") can touch data.
--         The anon key can only call ping() (keep-alive) and write to the
--         monies_submissions dedupe ledger.
--
-- PREREQUISITE: run 2026-08-06-log-compliance.sql and 2026-08-22-flight-hours-atomic-soft-delete.sql first
-- (this file revokes/grants on the functions they create).
--
-- ORDER OF OPERATIONS (do all of these, then set VITE_AUTH_ENABLED=true in Vercel):
--   1. Run this file.
--   2. Fill team_profiles.email for every staff member (the login email each will use):
--        update team_profiles set email = 'james@…' where name = 'James McBride';  (etc.)
--   3. Supabase dashboard → Authentication → Users → "Add user" for each staff member
--      (email + password, tick "auto confirm"). The email must match team_profiles.email.
--   4. Vercel → Environment Variables → VITE_AUTH_ENABLED = true → redeploy.
-- Until step 4 the app still shows the old name-picker, but the database is already locked,
-- so do steps 1–4 in one sitting. To roll back the lockdown: re-run the old allow-all policies.
-- ══════════════════════════════════════════════════════════════════════════════

-- Link login emails to roster rows
alter table team_profiles add column if not exists email text unique;

-- Is the logged-in user a management member? (used by the todos policy)
create or replace function current_is_management()
returns boolean language sql stable security definer as $$
  select coalesce(
    (select is_management from team_profiles where lower(email) = lower(auth.jwt() ->> 'email') limit 1),
    false)
$$;

-- Dedupe ledger for "Send to CNA Monies" (one row per attempt key; a repeat is a no-op)
create table if not exists monies_submissions (
  idempotency_key text primary key,
  created_at      timestamptz default now()
);

-- Keep-alive for the free-tier pause: the only thing the anon key may call
create or replace function ping() returns text language sql stable as $$ select 'ok' $$;

-- ── Lock every table to authenticated users ───────────────────────────────────
do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'aircraft','flights','flight_itineraries','todos','task_updates','snags',
    'fluid_logs','grease_logs','maintenance_items','maintenance_compliance_log',
    'tank_fillups','jerry_cans','team_profiles','device_tokens','monies_submissions',
    'waypoints','quotes'
  ] loop
    if to_regclass(t) is null then continue; end if;   -- table not created yet — skip
    execute format('alter table %I enable row level security', t);
    -- drop whatever policies exist today (the allow-all ones included)
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on %I', p.policyname, t);
    end loop;
    if t = 'todos' then
      -- Management-only tasks are hidden by the DATABASE, not just the phone
      execute 'create policy todos_select on todos for select to authenticated
               using (visible_to is null or visible_to = ''all'' or current_is_management())';
      execute 'create policy todos_write  on todos for insert to authenticated with check (true)';
      execute 'create policy todos_update on todos for update to authenticated using (true) with check (true)';
      execute 'create policy todos_delete on todos for delete to authenticated using (true)';
    elsif t = 'monies_submissions' then
      execute 'create policy monies_insert on monies_submissions for insert to anon, authenticated with check (true)';
    else
      execute format('create policy %I on %I for all to authenticated using (true) with check (true)', t || '_authenticated', t);
    end if;
  end loop;
end $$;

-- Functions: authenticated only (except ping)
revoke execute on function log_compliance(uuid,uuid,text,date,numeric,integer,text) from public, anon;
grant  execute on function log_compliance(uuid,uuid,text,date,numeric,integer,text) to authenticated;
revoke execute on function save_flight(jsonb)   from public, anon;  grant execute on function save_flight(jsonb)   to authenticated;
revoke execute on function delete_flight(uuid)  from public, anon;  grant execute on function delete_flight(uuid)  to authenticated;
revoke execute on function restore_flight(uuid) from public, anon;  grant execute on function restore_flight(uuid) to authenticated;
grant  execute on function ping() to anon, authenticated;

-- Check: this must return zero rows when run as anon (use the API, not the SQL editor):
--   curl "$URL/rest/v1/flights?select=id&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"   → []
