-- 2026-09-15 · Limpieza de avisos del Advisor de Supabase.
-- 1. device_tokens tenía DOS políticas de UPDATE (la vieja "update" más la
--    nueva "reclaim device" de ayer). La vieja es la que estaba presente
--    cuando el re-reclamo fallaba; se elimina y queda solo la nueva.
-- 2. log_compliance sin search_path fijo (aviso "Function Search Path
--    Mutable"): se fija a public en todas sus sobrecargas.
-- Los avisos "RLS Policy Always True" NO se tocan aquí: son el diseño actual
-- sin login y se resuelven activando el auth lockdown, no por tabla.

drop policy if exists "update" on device_tokens;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'log_compliance'
  loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;
end $$;

-- verificación: debe quedar UNA política de update en device_tokens
select policyname, cmd from pg_policies where tablename = 'device_tokens' order by cmd;
