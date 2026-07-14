-- Stores every product barcode scan per user for history + home screen widget
CREATE TABLE IF NOT EXISTS product_lookups (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sku           text        NOT NULL,
  name          text,
  brand         text,
  image_url     text,
  sale_price    numeric(10, 2),
  looked_up_at  timestamptz NOT NULL DEFAULT now()
);

-- Fast query: "give me this user's recent lookups, newest first"
CREATE INDEX IF NOT EXISTS product_lookups_user_time ON product_lookups (user_id, looked_up_at DESC);

-- RLS — users see and manage only their own rows
ALTER TABLE product_lookups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can manage own product lookups" ON product_lookups;
CREATE POLICY "users can manage own product lookups"
  ON product_lookups
  FOR ALL
  USING (auth.uid() = user_id);
