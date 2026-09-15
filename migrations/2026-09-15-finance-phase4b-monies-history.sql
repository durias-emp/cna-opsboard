-- ============================================================
-- Finance Phase 4b: the Monies history, moved in.
-- 66 USD transactions (2026-03-04 to 2026-05-06) generated straight
-- from cna-monies src/lib/demo.ts. Excluded: the BTC/crypto account.
-- Category mapping per the approved plan: flight_hours / air_tours /
-- custom_flights -> flight_revenue; deposits / reversal -> other_income;
-- expense categories keep their names.
-- IVA, faithful to how Monies computed it: income amounts were GROSS,
-- so iva_amount = gross * 13/113 and amount_net = gross - iva (the IVA
-- owed figure comes out identical to Monies). Expenses import as net
-- with iva_amount 0 and iva_recoverable false; edit per row later if a
-- factura's IVA should be credited.
-- Idempotent: accounts keyed by fixed uuids, rows by source_ref.
-- RUN AFTER phase 4a.
-- ============================================================

insert into finance_accounts (id, aircraft_id, name, type)
select v.id::uuid, a.id, v.name, v.type
from (values
  ('f1a00000-0000-4000-8000-000000000001', 'Bank',     'bank'),
  ('f1a00000-0000-4000-8000-000000000002', 'CNA Cash', 'cash')
) as v(id, name, type)
cross join (select id from aircraft where tail_number = 'YS-CNA') a
on conflict (id) do nothing;

insert into finance_transactions
  (source_ref, account_id, aircraft_id, date, party, amount_net, iva_amount,
   category, includes_iva, iva_recoverable, description)
select
  s.ref,
  case s.acc when 'BANK' then 'f1a00000-0000-4000-8000-000000000001'::uuid
             else            'f1a00000-0000-4000-8000-000000000002'::uuid end,
  (select id from aircraft where tail_number = 'YS-CNA'),
  s.date::date, s.party, s.amount_net, s.iva_amount, s.category,
  s.gross_income,          -- income rows carried IVA; expenses imported net
  false,                   -- historical expenses: IVA not credited by default
  s.description
from (values
  ('b01', 'BANK', '2026-03-04', 'Fidel Rivas', 7840.00, 1019.20, 'flight_revenue', true, '8 hours purchased at $980 + VAT. Amount initially sent to Jaime, then transferred into ours.'),
  ('b02', 'BANK', '2026-03-04', 'Carlos Gutierrez', -472.00, 0.00, 'hangar', false, 'C550 hangar'),
  ('b03', 'BANK', '2026-03-12', 'FlyInSivar', 2035.40, 264.60, 'flight_revenue', true, '2.0 flight time'),
  ('b04', 'BANK', '2026-03-13', 'FlyInSivar', 508.85, 66.15, 'flight_revenue', true, 'Air tour'),
  ('b05', 'BANK', '2026-03-13', 'AVIASA', -1000.00, 0.00, 'fuel', false, 'Pre-purchase fuel'),
  ('b06', 'BANK', '2026-03-18', 'Edwin Deras', -120.00, 0.00, 'maintenance', false, 'Fabric work'),
  ('b08', 'BANK', '2026-03-19', 'James McBride', -3026.65, 0.00, 'labor', false, 'Expense #1'),
  ('b09', 'BANK', '2026-03-20', 'Edwin Deras', -25.00, 0.00, 'labor', false, '$50 was sent, $25 tip covered by James'),
  ('b10', 'BANK', '2026-03-20', 'AVIASA', -1000.00, 0.00, 'fuel', false, 'Pre-purchase fuel'),
  ('b11', 'BANK', '2026-03-21', 'Edwin Deras', -50.00, 0.00, 'equipment', false, 'Helicopter sunshade'),
  ('b12', 'BANK', '2026-03-23', 'Diego Closa', 442.48, 57.52, 'flight_revenue', true, 'Influencer air tour'),
  ('b13', 'BANK', '2026-03-25', 'Kelly Romero', -150.00, 0.00, 'admin', false, 'CNA logo trademark'),
  ('b14', 'BANK', '2026-03-25', 'Victor Torres', 300.88, 39.12, 'other_income', true, '50% deposit for trip (Ruben Remberto) for April 23rd'),
  ('b15', 'BANK', '2026-03-26', 'Kelly Moreno', -55.00, 0.00, 'admin', false, 'Trademark registration fee for CNA name'),
  ('b16', 'BANK', '2026-03-26', 'Antonio Montano', -60.00, 0.00, 'misc_business', false, 'Iain''s gardener'),
  ('b17', 'BANK', '2026-03-27', 'Jorge Guzman', -3850.00, 0.00, 'equipment', false, 'Portable fuel tank'),
  ('b18', 'BANK', '2026-03-29', 'AVIASA', -1000.00, 0.00, 'fuel', false, 'Fuel payment'),
  ('b19', 'BANK', '2026-03-29', 'FlyInSivar', 530.97, 69.03, 'flight_revenue', true, 'Air tour'),
  ('b20', 'BANK', '2026-03-30', 'Edgar Blanco', -130.00, 0.00, 'equipment', false, 'Trailer hitch wheel arm'),
  ('b21', 'BANK', '2026-03-31', 'Edgar Blanco', 115.04, 14.96, 'other_income', true, 'Cancelled trailer hitch wheel arm'),
  ('b22', 'BANK', '2026-03-31', 'UNO', -744.81, 0.00, 'fuel', false, 'Fuel tank fill up'),
  ('b23', 'BANK', '2026-04-01', 'Cesar Espinoza', -50.00, 0.00, 'labor', false, 'Day rate'),
  ('b24', 'BANK', '2026-04-03', 'Anthony Villalta', -50.00, 0.00, 'labor', false, 'Day rate'),
  ('b25', 'BANK', '2026-04-03', 'Cesar Espinoza', -50.00, 0.00, 'labor', false, 'Day rate'),
  ('b26', 'BANK', '2026-04-03', 'Juan Rivera', -135.00, 0.00, 'transport', false, 'Transportation of the Julupe workers from Paco\'),
  ('b27', 'BANK', '2026-04-04', 'Luis Soriano', -40.00, 0.00, 'labor', false, 'Day rate'),
  ('b28', 'BANK', '2026-04-05', 'Cesar Espinoza', -62.58, 0.00, 'equipment', false, 'Step ladder for helicopter'),
  ('b29', 'BANK', '2026-04-06', 'Luis Soriano', -40.00, 0.00, 'labor', false, 'Helicopter work — the first payment on April 4th did not go through'),
  ('b30', 'BANK', '2026-04-06', 'Cesar Espinoza', -50.00, 0.00, 'labor', false, 'Day rate'),
  ('b31', 'BANK', '2026-04-06', 'Fidel Rivas', 2944.07, 382.73, 'flight_revenue', true, '4.1 hours purchased at $1,060 no tax, minus the tax returned on initial payment ($1,019.20)'),
  ('b32', 'BANK', '2026-04-07', 'UNO', -942.65, 0.00, 'fuel', false, 'Portable fuel tank refuelled'),
  ('b33', 'BANK', '2026-04-07', 'Cesar Espinoza', -50.00, 0.00, 'labor', false, 'Day rate'),
  ('b34', 'BANK', '2026-04-07', 'Cesar Espinoza', -21.95, 0.00, 'equipment', false, 'Air pump for tires'),
  ('b35', 'BANK', '2026-04-09', 'James McBride', -97.83, 0.00, 'labor', false, 'Expense #2'),
  ('b36', 'BANK', '2026-04-09', 'Cesar Espinoza', -50.00, 0.00, 'labor', false, 'Day rate'),
  ('b37', 'BANK', '2026-04-10', 'Luis Soriano', -40.00, 0.00, 'labor', false, 'Day rate'),
  ('b38', 'BANK', '2026-04-14', 'SALCAN', 3915.98, 509.08, 'flight_revenue', true, 'SALCAN gave us the POS to charge a customer, and transferred to us the money back.'),
  ('b39', 'BANK', '2026-04-23', 'Anthony Villalta', -50.00, 0.00, 'labor', false, 'Day rate'),
  ('b40', 'BANK', '2026-04-24', 'Cesar Espinoza', -50.00, 0.00, 'labor', false, 'Day rate'),
  ('b41', 'BANK', '2026-04-25', 'Luis Soriano', -50.00, 0.00, 'labor', false, 'Day rate'),
  ('b42', 'BANK', '2026-04-28', 'Luis Soriano', -50.00, 0.00, 'labor', false, 'Day rate'),
  ('b43', 'BANK', '2026-04-28', 'UNO', -628.81, 0.00, 'fuel', false, 'Fuel tank'),
  ('b44', 'BANK', '2026-04-28', 'Fidel Rivas', 3752.21, 487.79, 'flight_revenue', true, '4.0 hrs at $1,060 per hr, no tax'),
  ('b45', 'BANK', '2026-04-29', 'James McBride', -413.25, 0.00, 'labor', false, 'Expense #3'),
  ('b46', 'BANK', '2026-04-30', 'Cesar Espinoza', -50.00, 0.00, 'labor', false, null),
  ('b47', 'BANK', '2026-05-01', 'Vidri', -139.70, 0.00, 'equipment', false, '5 Yellow Jerry cans'),
  ('b48', 'BANK', '2026-05-02', 'James McBride', -280.00, 0.00, 'misc_business', false, 'Expense #4'),
  ('b49', 'BANK', '2026-05-02', 'Cesar Espinoza', -50.00, 0.00, 'labor', false, 'Day Rate'),
  ('b50', 'BANK', '2026-05-02', 'FlyinSivar', 1061.95, 138.05, 'flight_revenue', true, '1.0 Flight'),
  ('b51', 'BANK', '2026-05-05', 'Cesar Espinoza', -50.00, 0.00, 'labor', false, 'Day rate'),
  ('b52', 'BANK', '2026-05-05', 'UNO', -1035.96, 0.00, 'fuel', false, '170 gallons'),
  ('b53', 'BANK', '2026-05-06', 'Diego Urias', -51.15, 0.00, 'misc_business', false, 'Expense for trailer repair'),
  ('b54', 'BANK', '2026-05-06', 'Cesar Espinoza', -50.00, 0.00, 'labor', false, 'Day rate'),
  ('b55', 'BANK', '2026-05-06', 'Anthony Villalta', -50.00, 0.00, 'labor', false, 'Day rate'),
  ('b56', 'BANK', '2026-03-19', 'Carlos Gomenz', -100.00, 0.00, 'maintenance', false, 'Fuel Tank delivery (Inspected, never purchased)'),
  ('b57', 'BANK', '2026-04-16', 'Aeroclub', -146.90, 0.00, 'misc_business', false, 'Ilopango Airshow'),
  ('b58', 'BANK', '2026-04-18', 'Jessica Vynil', -115.00, 0.00, 'misc_business', false, 'CNA Uniforms'),
  ('c01', 'CASH', '2026-03-27', 'Miguel Villanueva', 900.00, 117.00, 'flight_revenue', true, 'Costa del Sol'),
  ('c02', 'CASH', '2026-03-13', 'Luis Cruz', 508.85, 66.15, 'flight_revenue', true, 'Air tour'),
  ('c03', 'CASH', '2026-03-19', 'Saul Beltran', 508.85, 66.15, 'flight_revenue', true, 'Air tour'),
  ('c04', 'CASH', '2026-03-29', 'Peter Canales', 601.77, 78.23, 'flight_revenue', true, 'City Tour'),
  ('c05', 'CASH', '2026-04-04', 'Lukas Plath', 796.46, 103.54, 'flight_revenue', true, 'Custom tour 0.9 ($900 cash, $320.40 BTC)'),
  ('c06', 'CASH', '2026-04-24', 'Victor Torres', 300.88, 39.12, 'flight_revenue', true, 'Remaining 50% for the air tour'),
  ('c07', 'CASH', '2026-04-24', 'Glenda', 353.98, 46.02, 'flight_revenue', true, '20 min air tour'),
  ('c08', 'CASH', '2026-04-07', 'Jorge Zavaleta', 1017.70, 132.30, 'flight_revenue', true, 'SALA-SANTA ANA-COAST-SALA'),
  ('c09', 'CASH', '2026-05-05', 'Cesar Espinoza', -60.00, 0.00, 'labor', false, 'Assistance from his family with the trailer stopped')
) as s(ref, acc, date, party, amount_net, iva_amount, category, gross_income, description)
on conflict (source_ref) do nothing;

-- verificación: 66 movimientos, sumas de control
select
  (select count(*) from finance_transactions where source_ref is not null)                            as imported_66,
  (select round(sum(amount_net + iva_amount), 2) from finance_transactions where amount_net > 0)      as income_gross_32133_06,
  (select round(sum(amount_net), 2) from finance_transactions where amount_net < 0)                   as expenses_net_minus_16784_24,
  (select round(sum(iva_amount), 2) from finance_transactions)                                        as iva_collected;
