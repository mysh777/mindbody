/*
# Fix 2b Step 1: Fill NULL product_id in pricing_options

## Context
43 pricing_options rows have product_id = NULL because the Mindbody /sale/services
API did not return ProductId at the time of original sync. For all 174 rows where
product_id IS set, product_id = mindbody_id (they are identical). The current API
now returns ProductId for all services.

## Changes
- Sets product_id = mindbody_id for all pricing_options where product_id IS NULL.
- This ensures future client_services linking works correctly via product_id match.

## Rollback
UPDATE pricing_options SET product_id = NULL
WHERE id IN (
  '3889dfc9-70fc-4665-b2ad-b923fb4c1927','6e92f593-aa12-48ae-91ff-3591f48bddbd',
  'b5cadcc2-5912-4d2e-82e6-22caffa3fc9b','96d2b6ad-4faa-425e-a110-d06afdcd16f3',
  '86c8ccb4-cde0-4f8d-b85e-bc910ea64689','fa3e6bcd-4e74-4d8f-918d-16778d95b05a',
  '732b0043-e3e8-46f6-af0a-af3675b64d6f','539c09dc-d717-4d4a-af9b-4bb99f78d035',
  '7c62d2d2-0834-4869-a37d-bcd8a087839e','f6ee5941-09ba-4cd8-a1ba-9ff80a62e8e7',
  '4f4eafb3-aacf-4191-b9a6-151088f45c12','c323f4ab-c3f4-4eec-a730-01d7a6abeee1',
  'e118cb3a-3785-44e7-a6f2-103caa2e6d9a','7d1e239d-4e6c-4bfc-ab4a-105773f7010a',
  '42cb6ef5-208b-46b9-8dab-b5e63e96a120','4eb94ef7-a7f0-4d30-934c-9f7582510532',
  '90871849-742c-470b-b6eb-bcb673ea0d3f','bfe650a6-13a0-4aad-8372-7adf42f2c552',
  '729b7a12-efba-4122-9e76-650fdacab83c','5f0d33d4-7956-4f3e-bd97-aaaa26d3b553',
  '73a5bbc1-4183-4710-a11b-0df1107e8e24','9268d9b5-9088-4105-b598-6454ca67dd4b',
  '906c092a-3419-45b7-a9e6-08758192736b','304e4016-55f9-4e9e-aed4-0b94984e1cea',
  'bae05d15-f9e9-49c6-b57c-55da4f53ee14','17866033-1763-4d8d-98e2-bb2b0ca63844',
  '663d9b1d-b454-4f6c-9f54-781608a970b4','cd33f97d-c2d0-4936-be98-ee5a8fc46fc3',
  'e555435e-6d3c-4edf-aa8f-410f6e51c990','792be992-f9d4-41f0-917a-57893c295bb6',
  'e9a4e518-ef4b-4ba8-b9ef-ef29512a5831','7555ec20-0610-4282-bcf5-19f6af44cf92',
  '6623eba4-c446-495e-8e6a-da57403eecd7','bd2f0a23-86e6-4e64-89fe-6bd03fde0bdb',
  '86cb353e-eb8a-4283-8a83-61e757f79993','87b49833-7ceb-4831-9243-7a5ea4cf81ca',
  '597cf430-20e4-4f0c-be67-b853b8050b71','8611120f-3016-4ff7-b5ae-cccb3ac4d9c1',
  '3278d6c6-9d7f-459f-a7ff-6ecd416cc231','cb9fc920-ed76-4d74-8d90-549dd35bd220',
  'b3887996-0585-4c06-bd87-7b69090da2ae','25a75014-d9b4-4b7b-9e9b-98e133acbd0b',
  'd4dc0364-b0ce-4634-8b07-3272b864f024'
);
*/

UPDATE pricing_options
SET product_id = mindbody_id
WHERE product_id IS NULL;
