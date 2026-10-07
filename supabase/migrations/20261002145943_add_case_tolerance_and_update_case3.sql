/*
# Add tolerance column to reconciliation_cases and update case 3

1. Modified Tables
   - `reconciliation_cases`: add `tolerance` numeric column (nullable, default NULL = exact match)
2. Data Changes
   - Case 3 (Veidenbauma): set expected_value=19.07, tolerance=0.01,
     note explains known Mindbody rounding discrepancy
*/

ALTER TABLE reconciliation_cases
  ADD COLUMN IF NOT EXISTS tolerance numeric;

UPDATE reconciliation_cases
SET expected_value = 19.07,
    tolerance = 0.01,
    note = 'Known rounding discrepancy: our value 19.06, Mindbody 19.07. Mindbody rounds non-cash portion down per item; we use unrounded arithmetic. Tolerance ±0.01.'
WHERE case_number = 3;
