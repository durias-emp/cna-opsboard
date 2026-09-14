-- 2026-09-14 · device_tokens: permitir UPDATE bajo RLS.
-- Reclamar un nombre ya registrado (cambiar de teléfono) hace un upsert que
-- ACTUALIZA la fila existente; solo había política de INSERT, así que el
-- update se rechazaba y la app (por diseño) se tragaba el error: el registro
-- fallaba en silencio. Mismo nivel de apertura que el insert: cualquier
-- dispositivo puede re-reclamar un nombre — es el diseño del claim.

create policy "device_tokens update (reclaim device)"
  on device_tokens for update
  using (true) with check (true);

-- verificación: deben aparecer políticas para insert y update
select policyname, cmd from pg_policies where tablename = 'device_tokens';
