/*
# Excluded client cards for Client Segments

1. Modified Tables
- `client_segment_settings`
  - `excluded_client_ids` (text[], not null, default '{}'): client IDs of shared / service cards
    (e.g. "Privāts klients :)") that are left out of segments and the new-client funnel.
2. Data
- The global settings row gets '100001729' (Privāts klients :)), which was previously excluded in code.
3. Security
- No policy changes; the existing table policies apply to the new column.
*/

ALTER TABLE client_segment_settings
  ADD COLUMN IF NOT EXISTS excluded_client_ids text[] NOT NULL DEFAULT '{}';

UPDATE client_segment_settings
SET excluded_client_ids = array_append(excluded_client_ids, '100001729')
WHERE id = 'global' AND NOT ('100001729' = ANY (excluded_client_ids));
