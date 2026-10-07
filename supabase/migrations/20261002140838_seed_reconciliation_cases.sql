/*
# Seed 9 reconciliation test cases

These are known-tricky scenarios where FIFO/payment calculations
broke in the past. Each row stores the expected output from the
"By sale date, All locations" report.
*/

INSERT INTO reconciliation_cases
  (case_number, description, period, report, location, client_id, tariff_name, expected_value, expected_qty, note)
VALUES
  (1,
   'Gift-card-only sale not revenue — Ozoliņa Līga, 6 sessijas 30min',
   '2026-08', 'sales_by_tariff', 'all',
   '100011522', '6 sessijas 30min (2 mēn.) -144 eiro',
   0, 0,
   'Paid 100 % Prepaid Gift Card → hasCash=false → excluded from RULE 1'),

  (2,
   'Comp/Guest not revenue — Mundeciema Zanda, EMS Sculptor',
   '2026-08', 'sales_by_tariff', 'all',
   '100011355', 'EMS Sculptor 30 min - 50 euro',
   0, 0,
   'Paid 100 % Comp/Guest → hasCash=false → excluded'),

  (3,
   'Mixed payment splits proportionally — Veidenbauma Baiba, 2 nodarbības',
   '2026-08', 'sales_by_tariff', 'all',
   '100002198', '2 nodarbības 38 EUR',
   19.07, 1,
   'AMEX=38.25, Gift Card=38.00, total=76.25; revenue = 38 * 38.25/76.25 ≈ 19.07'),

  (4,
   'Cash return creates +65 and −65 — Karbanova Marina, Ietīšana 45 min',
   '2026-08', 'sales_by_tariff', 'all',
   '100005854', 'Ietīšana un nostiprinoša masāžā 45 min',
   58.50, NULL,
   'Original 65 + return −65 + rebuy 58.50; net for this tariff in Aug = 58.50'),

  (5,
   'Account debt covered by PoA — Lūse Ērika, Endotherapy 10 reizes',
   '2026-08', 'sales_by_tariff', 'all',
   '100010136', 'Endotherapy 50 min  (10 reizes) - 470 €',
   470, 2,
   'Sale 218138: 235 Check + 235 Account = 470; PoA 235 (Aug 25) covers debt; total 470 over 2 entries'),

  (6,
   'PoA + refund on balance — Serebro, Klasiskā 90',
   '2026-09', 'sales_by_tariff', 'all',
   '100004068', 'Klasiskā /Relax masāža 90 min- 70€',
   52.50, 1,
   'PoA 300 on Sep 21 covers 59.50 debit → FIFO revenue 52.50; Klasiskā 60 = 0'),

  (7,
   'Product on balance + Account on PoA sale — Kazakova, Klasiskā 60',
   '2026-09', 'sales_by_tariff', 'all',
   '100004200', 'Klasiskā /Relax masāža 60 min - 55€',
   145.75, 1,
   'Sep PoA 300 cash credit; FIFO matches 3 subsequent debits; Amrita product consumes balance'),

  (8,
   'Gift card PoA not revenue — Bačarova, Klasiskā 60',
   '2026-09', 'sales_by_tariff', 'all',
   '100007795', 'Klasiskā /Relax masāža 60 min - 55€',
   15.00, 1,
   'PoA 150 by Gift Card = noncash → only the 15 cash portion of sale 16.09 counts'),

  (9,
   'Gift card PoA not revenue — Sniedze + Bautre',
   '2026-08', 'sales_by_tariff', 'all',
   NULL, NULL,
   0, 0,
   'Sniedze (100011504) PoA 20 by GC; Bautre (100011450) PoA 20 by GC — zero cash revenue from these PoAs')
ON CONFLICT (case_number) DO UPDATE
  SET description = EXCLUDED.description,
      period = EXCLUDED.period,
      client_id = EXCLUDED.client_id,
      tariff_name = EXCLUDED.tariff_name,
      expected_value = EXCLUDED.expected_value,
      expected_qty = EXCLUDED.expected_qty,
      note = EXCLUDED.note;
