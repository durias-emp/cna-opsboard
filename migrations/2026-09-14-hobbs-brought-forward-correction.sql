-- 2026-09-14 · Align YS-CNA hobbs with the paper journey log.
-- The app's count started from the shop's W.O. reading (17,538.9) while the
-- journey log carries forward 17,539.0. Add the missing 0.1 so the app matches
-- the logbook, which is the legal record.
-- RUN ONLY AFTER editing the two 2026-08-19 flights from 0.5 to 0.4 air time.

update aircraft
set hobbs_current = round((hobbs_current + 0.1)::numeric, 1)
where tail_number = 'YS-CNA';

select tail_number, hobbs_current from aircraft where tail_number = 'YS-CNA';
