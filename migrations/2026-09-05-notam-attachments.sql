-- 2026-09-05 — Los correos de AIS son carátulas: el NOTAM viene adjunto
-- ("se anexa NOTAMN publicado"). La captura ahora guarda los adjuntos crudos
-- (base64) junto al correo; el parser de fase 2 los decodifica.
-- Correr en el SQL Editor de Supabase. Responder con el resultado.

alter table notam_raw
  add column if not exists attachments jsonb not null default '[]';
-- cada elemento: { filename, mime, size_bytes, data_b64 }
