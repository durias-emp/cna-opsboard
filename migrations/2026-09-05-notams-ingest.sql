-- 2026-09-05 — NOTAM ingest, fase de captura (sin interpretación).
--
-- Los correos de AIS a cielonorteaviacion@gmail.com entran crudos a notam_raw
-- vía Apps Script (scripts/notam-ingest.gs) con la llave service_role. El
-- parser se escribe DESPUÉS, contra correos reales, y puede re-correrse sobre
-- todo el histórico: por eso parse_status vive en la fila y nada se borra.
--
-- Diseño acordado 2026-09-05 (plan "Ingesta de NOTAMs · CNA OpsBoard"):
--   notam_raw   → el correo tal como llegó; la única fuente de verdad
--   notams      → una fila por NOTAM ya parseado (fase 2 la llena)
--   notam_rules → reglas de relevancia; las 8 semilla son piso conservador,
--                 las reales las define el capitán Hidalgo
--   v_notams_active → lo que el tablero mostrará: sin puntuar ARRIBA,
--                 porque si ninguna regla aplicó lo tiene que mirar una persona
--
-- RLS: activado en las tres tablas. Lectura abierta (la app usa la llave
-- anónima, como el resto del esquema); escritura SIN política — solo la llave
-- service_role del Apps Script puede insertar, y esa salta RLS por diseño.
--
-- Correr en el SQL Editor de Supabase. Responder con el resultado.

begin;

-- ── 1. El correo crudo ────────────────────────────────────────────────────────
create table if not exists notam_raw (
  id                uuid primary key default gen_random_uuid(),
  gmail_message_id  text not null unique,        -- idempotencia del ingest
  gmail_thread_id   text,
  from_address      text not null,
  subject           text,
  received_at       timestamptz not null,
  body_text         text not null,               -- texto plano del correo
  body_html         text,                        -- por si el parser lo necesita
  parse_status      text not null default 'pending'
                    check (parse_status in ('pending', 'parsed', 'failed', 'not_notam')),
  parse_error       text,
  parsed_at         timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists notam_raw_status_idx   on notam_raw (parse_status);
create index if not exists notam_raw_received_idx on notam_raw (received_at desc);

-- ── 2. El NOTAM parseado (fase 2 llena esto; el campo E manda) ───────────────
create table if not exists notams (
  id              uuid primary key default gen_random_uuid(),
  notam_raw_id    uuid references notam_raw(id) on delete set null,
  notam_id        text not null,                 -- p.ej. 'A0123/26'
  type            text check (type in ('NOTAMN', 'NOTAMR', 'NOTAMC')),
  replaces_id     text,                          -- NOTAMR/C: a cuál afecta
  fir             text,                          -- Q) primera parte
  q_code          text,                          -- Q) código de 5 letras
  location        text,                          -- A)
  effective_from  timestamptz,                   -- B)
  effective_to    timestamptz,                   -- C) null = PERM
  is_permanent    boolean not null default false,
  schedule        text,                          -- D)
  body            text not null,                 -- E) tal como lo emitió AIS
  lower_limit     text,                          -- F)
  upper_limit     text,                          -- G)
  status          text not null default 'active'
                  check (status in ('active', 'replaced', 'cancelled', 'expired')),
  relevance_score integer,                       -- null = sin puntuar → arriba
  relevance_rule  text,                          -- qué regla puntuó
  summary_es      text,                          -- generado; A LA PAR, nunca en lugar de body
  summary_en      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (notam_id, location)
);
create index if not exists notams_status_idx   on notams (status);
create index if not exists notams_location_idx on notams (location);

-- ── 3. Reglas de relevancia ──────────────────────────────────────────────────
-- field: contra qué se compara · pattern: subcadena o regex (is_regex)
create table if not exists notam_rules (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  field       text not null check (field in ('location', 'fir', 'q_code', 'body')),
  pattern     text not null,
  is_regex    boolean not null default false,
  score       integer not null,                  -- mayor = más relevante
  authored_by text not null default 'semilla',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Las 8 semilla: piso conservador. El capitán Hidalgo define las reales.
insert into notam_rules (label, field, pattern, is_regex, score, authored_by) values
  ('Ilopango (base de operaciones)',        'location', 'MSSS',  false, 100, 'semilla'),
  ('El Salvador Intl / Comalapa',           'location', 'MSLP',  false,  90, 'semilla'),
  ('FIR Centroamérica (MHCC)',              'fir',      'MHCC',  false,  40, 'semilla'),
  ('Cierre de pista o aeródromo (QMRLC/QFALC)', 'q_code', '^Q(MR|FA)LC', true, 60, 'semilla'),
  ('Restricción de espacio aéreo (QR...)',  'q_code',   '^QR',   true,   80, 'semilla'),
  ('Zona peligrosa/prohibida/restringida en texto', 'body', 'PROHIBITED|RESTRICTED|DANGER AREA|ZONA RESTRINGIDA|ZONA PROHIBIDA', true, 70, 'semilla'),
  ('Guatemala La Aurora',                   'location', 'MGGT',  false,  50, 'semilla'),
  ('Combustible no disponible',             'body',     'FUEL NOT AVBL|FUEL NOT AVAILABLE|COMBUSTIBLE NO DISPONIBLE', true, 55, 'semilla')
on conflict do nothing;

-- ── 4. Lo que el tablero lee ─────────────────────────────────────────────────
-- Sin puntuar primero (nulls first), luego por puntaje, luego por vigencia.
create or replace view v_notams_active as
  select *
  from notams
  where status = 'active'
    and (is_permanent or effective_to is null or effective_to > now())
  order by relevance_score desc nulls first, effective_from desc;

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
alter table notam_raw   enable row level security;
alter table notams      enable row level security;
alter table notam_rules enable row level security;
-- Lectura abierta (la app lee con la llave anónima); NINGUNA política de
-- escritura: inserta solo el Apps Script con service_role, que salta RLS.
drop policy if exists notam_raw_read   on notam_raw;
drop policy if exists notams_read      on notams;
drop policy if exists notam_rules_read on notam_rules;
create policy notam_raw_read   on notam_raw   for select using (true);
create policy notams_read      on notams      for select using (true);
create policy notam_rules_read on notam_rules for select using (true);

commit;

-- ── Verificación (correr tras el commit; pegar el resultado) ─────────────────
select count(*) as reglas_semilla from notam_rules;   -- esperado: 8
select * from v_notams_active;                        -- esperado: vacío, sin error
