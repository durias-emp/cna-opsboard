-- 2026-08-25 — Correct the July 2026 compliance date with the real work order.
-- Source: PARTEX F19 maintenance release "2026-08-20_014245.pdf" from the shop:
--   W.O. 2026-004-001 · complied 2026-07-23 at 17,538.9 h
--   Julio Espinoza TMA 1087 / Anthony Villalta TMA 1045 · stamp CO-OMA-017
-- Replaces the 2026-07-31 approximation from
-- 2026-08-25-july-compliance-recurring.sql; hour-based dues unchanged.
-- ALREADY RUN 2026-08-25 — verified: 14 rows at 2026-07-23, calendar dues
-- moved to 2027-07-23 (battery 2027-01-23).
--
-- Open question for the engineer: the F19 work list line 8 ("Inspección de
-- 300 horas o 6 meses") may be item 45 (Main Driveshaft), which his sheet
-- marked NOT done and remains overdue in the system. Confirm before clearing.

begin;

update maintenance_items
set last_complied_date = '2026-07-23',
    due_date = case when due_date = '2027-07-31' then date '2027-07-23'
                    when due_date = '2027-01-31' then date '2027-01-23'
                    else due_date end,
    notes = replace(notes,
      'Complied July 2026 per engineer sheet 2026-08-25 (date approx. 2026-07-31, O/T pending)',
      'Complied 2026-07-23 at 17,538.9h — W.O. 2026-004-001 (PARTEX F19, J. Espinoza TMA 1087 / A. Villalta TMA 1045)'),
    updated_at = now()
where is_active = true
  and last_complied_date = '2026-07-31'
  and last_complied_hours = 17538.9;

commit;
