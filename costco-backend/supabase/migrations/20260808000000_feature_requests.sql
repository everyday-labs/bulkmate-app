-- Public feature-request inbox — submitted from a standalone, unauthenticated
-- web form (not part of the mobile app), so this is the one table in the
-- schema that intentionally accepts anonymous writes. Anon can INSERT only —
-- no SELECT/UPDATE/DELETE — so a submitter can never read back other
-- people's requests or edit/delete anything via the public anon key. Reading
-- and triaging submissions happens via the Supabase dashboard's table editor
-- (service-role access), not through the app.

CREATE TABLE feature_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category     TEXT NOT NULL CHECK (category IN ('feature', 'bug', 'warehouse_data', 'other')),
  message      TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  contact      TEXT CHECK (contact IS NULL OR char_length(contact) <= 200),
  source       TEXT DEFAULT 'web_form',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE feature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_requests_insert_anon" ON feature_requests
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Deliberately no SELECT/UPDATE/DELETE policy for anon or authenticated —
-- submissions are only readable via the Supabase dashboard (service role
-- bypasses RLS), keeping this a write-only public inbox.
