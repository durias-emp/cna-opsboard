-- 2026-09-15 · Correo por persona en team_profiles.
-- Es la pieza que hace "inteligente" el enrutado de notificaciones: una tarea
-- asignada le escribe SOLO al asignado; un NOTAM le escribe a pilotos y
-- gerencia (team_group = 'pilot' o is_management). Los correos conocidos
-- quedan sembrados; los demás se llenan en el Table Editor.

alter table team_profiles add column if not exists email text;

update team_profiles set email = 'james@cielonorteaviacion.com'  where name = 'James McBride';
update team_profiles set email = 'javier@cielonorteaviacion.com' where name = 'Javier Ascencio';
update team_profiles set email = 'alonia@cielonorteaviacion.com' where name = 'Alonia Ascencio';
update team_profiles set email = 'diego@cielonorteaviacion.com'  where name = 'Diego Urias';
update team_profiles set email = 'kelly@empoderarsv.com'         where name = 'Kelly Moreno';
update team_profiles set email = 'dsandoval_76@yahoo.com'        where name = 'Daniel Sandoval';
update team_profiles set email = 'axlretana@hotmail.com'         where name = 'Erick Hidalgo';
update team_profiles set email = 'jc.espinozavaneg@hotmail.com'  where name = 'Cesar Espinoza';

-- verificación: quién ya tiene correo y quién falta
select name, team_group, is_management, email from team_profiles order by name;

-- ── Paso manual en el dashboard (no es SQL) ──────────────────────────────────
-- Database → Webhooks → Create: tabla `todos`, eventos INSERT y UPDATE,
-- POST a https://cna-opsboard.vercel.app/api/send-notification con el mismo
-- header x-webhook-secret que ya usan los webhooks de flights/flight_itineraries.
-- Con eso, asignar una tarea le manda correo SOLO al asignado.
