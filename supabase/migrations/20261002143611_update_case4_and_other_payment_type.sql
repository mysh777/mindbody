/*
# Update case 4 expected value and note

Case 4 (Karbanova, client 100005854) in August has:
- Sale 218117: +65.00 (returned, Check)
- Sale 218124: -65.00 (returned, Check)
- Sale 218125: +58.50 (Check)
- Sale 218294: +58.50 (Check)
Net = 65 - 65 + 58.50 + 58.50 = 117.00

Previously expected_value was 58.50 (missed the second 58.50 sale on Aug 26).
Updated to 117.00 with expected_qty=2 (two non-return items contributing revenue).
*/

UPDATE reconciliation_cases
SET expected_value = 117.00,
    expected_qty = 2,
    note = 'Sales: +65 returned, -65 returned (cancel), +58.50 (Aug 12), +58.50 (Aug 26). Net 117.00.'
WHERE case_number = 4;
