-- 2026-09-14 · NOTAM fixes after the Sept 12-13 Supabase outage
-- 1. A1905/26 (restricción militar del 15-sep sobre Plaza Divino Salvador del
--    Mundo) llegó y se parseó, pero el parser no leyó "7NM RADIUS CENTERED AT"
--    (solo conocía "WI 7NM RADIUS") → sin radio no se dibuja el círculo.
--    El regex del Apps Script ya quedó corregido; esto arregla la fila existente.
-- 2. pushed_at: la columna del dedup de notificaciones push nunca se creó
--    (el paste anterior no se corrió). Idempotente: seguro si ya existiera.
-- 3. v_notams_active se re-crea para que exponga pushed_at (select * congela
--    columnas al momento de crearse — lección aprendida con la geometría).

-- 1 · radio del NOTAM del 15-sep
update notams set radius_nm = 7, updated_at = now()
where notam_id = 'A1905/26' and radius_nm is null;

-- 2 · columna de dedup para push
alter table notams add column if not exists pushed_at timestamptz;

-- 3 · re-crear la vista con el set de columnas actual
create or replace view v_notams_active as
  select *
  from notams
  where status = 'active'
    and (is_permanent or effective_to is null or effective_to > now())
  order by relevance_score desc nulls first, effective_from desc;

-- 4 · security_invoker: la vista respeta el RLS del que consulta, no el del
--    dueño (cierra el aviso "Security Definer View" del advisor de Supabase)
alter view v_notams_active set (security_invoker = true);

-- verificación
select notam_id, radius_nm, relevance_score, pushed_at, effective_from, effective_to
from v_notams_active;
