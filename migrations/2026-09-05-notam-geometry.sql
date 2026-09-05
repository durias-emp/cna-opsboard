-- 2026-09-05 — Geometría para dibujar NOTAMs en el chart: centro y radio,
-- extraídos por el parser del campo E (preciso, DMS) o de la línea Q.
-- Correr en el SQL Editor de Supabase. Responder con el resultado.

alter table notams
  add column if not exists center_lat double precision,
  add column if not exists center_lng double precision,
  add column if not exists radius_nm  numeric;
