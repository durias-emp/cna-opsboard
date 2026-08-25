-- Major CA-4 international airports were missing from the AIP seed (found
-- 2026-08-25 when Guatemala City showed no airports). Adds the six missing
-- internationals and gives ICAO codes to the two that existed by name only.
-- Sources: SkyVector / state AIPs; Mundo Maya's ICAO is MGMM since 2012.

update waypoints set code = 'MSSS'
  where source = 'aip' and code is null and name = 'A.I.ILOPANGO';
update waypoints set code = 'MSLP'
  where source = 'aip' and code is null and name like 'A.I.E.S.%';

insert into waypoints (code, name, lat, lng, elevation_ft, kind, country, source) values
  ('MGGT', 'La Aurora Intl · Guatemala City', 14.583272, -90.527497, 4952, 'aerodrome', 'Guatemala', 'aip'),
  ('MGMM', 'Mundo Maya Intl · Flores', 16.913889, -89.866389, 387, 'aerodrome', 'Guatemala', 'aip'),
  ('MHTG', 'Toncontín Intl · Tegucigalpa', 14.060883, -87.217197, 3294, 'aerodrome', 'Honduras', 'aip'),
  ('MHPR', 'Palmerola Intl · Comayagua', 14.3825, -87.621111, 2060, 'aerodrome', 'Honduras', 'aip'),
  ('MHLM', 'Ramón Villeda Morales Intl · San Pedro Sula', 15.452639, -87.923556, 91, 'aerodrome', 'Honduras', 'aip'),
  ('MHRO', 'Juan Manuel Gálvez Intl · Roatán', 16.316814, -86.522961, 18, 'aerodrome', 'Honduras', 'aip')
on conflict (code) where code is not null do nothing;
