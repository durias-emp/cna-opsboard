-- 2026-09-15 · Correo por persona en team_profiles.
-- Es la pieza que hace "inteligente" el enrutado de notificaciones: una tarea
-- asignada le escribe SOLO al asignado; un NOTAM le escribe a pilotos y
-- gerencia. Los correos que el sistema ya conocía quedan sembrados; los demás
-- se llenan en el Table Editor (team_profiles → columna email).

alter table team_profiles add column if not exists email text;

update team_profiles set email = 'james@cielonorteaviacion.com'  where name = 'James McBride'   and email is null;
update team_profiles set email = 'javier@cielonorteaviacion.com' where name = 'Javier Ascencio'  and email is null;
update team_profiles set email = 'alonia@cielonorteaviacion.com' where name = 'Alonia Ascencio'  and email is null;
update team_profiles set email = 'cielonorteaviacion@gmail.com'  where name = 'Diego Urias'      and email is null;

-- verificación: quién ya tiene correo y quién falta
select name, "group", management, email from team_profiles order by name;

-- ── Paso manual en el dashboard (no es SQL) ──────────────────────────────────
-- Database → Webhooks → Create: tabla `todos`, eventos INSERT y UPDATE,
-- POST a https://cna-opsboard.vercel.app/api/send-notification con el mismo
-- header x-webhook-secret que ya usan los webhooks de flights/flight_itineraries.
-- Con eso, asignar una tarea le manda correo SOLO al asignado.
