/*
# Fix 2b Step 2: Link client_services to pricing_options via mindbody_id

## Context
547 client_services had pricing_option_id = NULL despite having a valid product_id.
Root cause: the linking code matched client_services.product_id against
pricing_options.product_id, but 43 pricing_options had product_id = NULL (fixed in
Step 1). Additionally, the product_id in client_services actually corresponds to
pricing_options.mindbody_id (they are the same value).

After Step 1 filled the NULL product_ids, this UPDATE links via mindbody_id which
is the correct join key.

## Changes
- Sets pricing_option_id on client_services where product_id matches
  pricing_options.mindbody_id and pricing_option_id is currently NULL.

## Expected result
- ~504 rows updated (479 linkable via mindbody_id + some newly linkable after Step 1)
- ~43 rows remain unlinked (product_ids 99, 13107, 13151, 13157 -- discontinued services)

## Rollback
-- See snapshot in DB_DIAGNOSTIC_REPORT.md; set pricing_option_id = NULL
-- for all rows in the Step 2 snapshot list.
*/

UPDATE client_services cs
SET pricing_option_id = po.id
FROM pricing_options po
WHERE cs.pricing_option_id IS NULL
  AND cs.product_id IS NOT NULL
  AND cs.product_id = po.mindbody_id;
