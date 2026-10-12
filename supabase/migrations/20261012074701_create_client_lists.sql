/*
# Campaign client lists

1. New tables
- `client_lists`: a named group of clients, e.g. "Meta Ads - September 2026".
  - `id` uuid PK, `name` text (required), `note` text, `campaign_cost` numeric (optional ad cost, EUR),
  - `source` text: 'upload' | 'manual' | 'segment', `created_at`, `updated_at`.
- `client_list_members`: one row per unique person in a list.
  - `id` uuid PK, `list_id` -> client_lists (deleted with the list),
  - `client_id` text: matched client (null when not found or skipped),
  - `lead_at` timestamptz: lead date/time from the file (earliest one when duplicates were merged),
  - `input_name`, `input_phone`, `input_email`, `input_mindbody_id`: what the file said,
  - `match_method` text: 'mindbody_id' | 'email' | 'phone' | 'name' | 'manual' | 'none',
  - `match_status` text: 'matched' | 'ambiguous' | 'not_found' | 'skipped',
  - `candidate_ids` text[]: possible clients for ambiguous rows,
  - `rows_merged` int: how many file rows were merged into this person (1 = no duplicates),
  - `position` int: order in the file, `created_at`.

2. Security
- RLS on both tables. The dashboard has no sign-in, so like the other settings tables
  (sleeping_client_settings), anon + authenticated may read and write.

3. Rollback (not applied)
  DROP TABLE IF EXISTS public.client_list_members;
  DROP TABLE IF EXISTS public.client_lists;
*/

CREATE TABLE IF NOT EXISTS public.client_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  note text NOT NULL DEFAULT '',
  campaign_cost numeric(12,2) CHECK (campaign_cost IS NULL OR campaign_cost >= 0),
  source text NOT NULL DEFAULT 'upload' CHECK (source IN ('upload','manual','segment')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_list_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.client_lists(id) ON DELETE CASCADE,
  client_id text,
  lead_at timestamptz,
  input_name text NOT NULL DEFAULT '',
  input_phone text NOT NULL DEFAULT '',
  input_email text NOT NULL DEFAULT '',
  input_mindbody_id text NOT NULL DEFAULT '',
  match_method text NOT NULL DEFAULT 'none' CHECK (match_method IN ('mindbody_id','email','phone','name','manual','none')),
  match_status text NOT NULL DEFAULT 'not_found' CHECK (match_status IN ('matched','ambiguous','not_found','skipped')),
  candidate_ids text[] NOT NULL DEFAULT '{}',
  rows_merged int NOT NULL DEFAULT 1 CHECK (rows_merged >= 1),
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_list_members_list ON public.client_list_members (list_id, position);

ALTER TABLE public.client_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_list_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_client_lists" ON public.client_lists;
CREATE POLICY "anon_select_client_lists" ON public.client_lists FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_client_lists" ON public.client_lists;
CREATE POLICY "anon_insert_client_lists" ON public.client_lists FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_client_lists" ON public.client_lists;
CREATE POLICY "anon_update_client_lists" ON public.client_lists FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_client_lists" ON public.client_lists;
CREATE POLICY "anon_delete_client_lists" ON public.client_lists FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_client_list_members" ON public.client_list_members;
CREATE POLICY "anon_select_client_list_members" ON public.client_list_members FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_client_list_members" ON public.client_list_members;
CREATE POLICY "anon_insert_client_list_members" ON public.client_list_members FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_client_list_members" ON public.client_list_members;
CREATE POLICY "anon_update_client_list_members" ON public.client_list_members FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_client_list_members" ON public.client_list_members;
CREATE POLICY "anon_delete_client_list_members" ON public.client_list_members FOR DELETE TO anon, authenticated USING (true);
