-- price_alerts: one row per item where current price < price paid
-- Populated by price-match-check Edge Function after receipt ingestion
-- and by the nightly pg_cron sweep.
CREATE TABLE IF NOT EXISTS price_alerts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receipt_item_id   UUID        NOT NULL REFERENCES receipt_items(id) ON DELETE CASCADE,
  sku               TEXT        NOT NULL,
  paid_price        NUMERIC(10, 2) NOT NULL,   -- unit_price - discount_amount (net paid)
  current_price     NUMERIC(10, 2) NOT NULL,   -- price at time alert was created
  delta             NUMERIC(10, 2) NOT NULL,   -- paid_price - current_price (always > 0)
  source            TEXT        NOT NULL DEFAULT 'rapidapi', -- 'rapidapi' | 'ocr_ledger'
  notified_at       TIMESTAMPTZ,               -- null until push sent
  dismissed_at      TIMESTAMPTZ,               -- null until user dismisses in-app
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS price_alerts_user_id_idx     ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS price_alerts_notified_at_idx ON price_alerts(notified_at) WHERE notified_at IS NULL;

-- Prevent duplicate alerts for the same item (upsert key)
CREATE UNIQUE INDEX IF NOT EXISTS price_alerts_item_unique ON price_alerts(receipt_item_id);

-- RLS: users only see their own alerts
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_alerts_select_own" ON price_alerts;
CREATE POLICY "price_alerts_select_own" ON price_alerts
  FOR SELECT USING (auth.uid() = user_id);

-- Service role inserts from Edge Functions; users can dismiss (update) their own
DROP POLICY IF EXISTS "price_alerts_update_own" ON price_alerts;
CREATE POLICY "price_alerts_update_own" ON price_alerts
  FOR UPDATE USING (auth.uid() = user_id);

-- Denormalize transaction_date onto receipt_items so the pg_cron 30-day sweep
-- can filter without joining receipts. Populated on insert via trigger.
ALTER TABLE receipt_items ADD COLUMN IF NOT EXISTS transaction_date DATE;

CREATE INDEX IF NOT EXISTS receipt_items_transaction_date_idx ON receipt_items(transaction_date);

-- Backfill trigger: keep transaction_date in sync automatically
CREATE OR REPLACE FUNCTION sync_receipt_item_date()
RETURNS TRIGGER AS $$
BEGIN
  NEW.transaction_date := (
    SELECT transaction_date FROM receipts WHERE id = NEW.receipt_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS receipt_items_sync_date ON receipt_items;
CREATE TRIGGER receipt_items_sync_date
  BEFORE INSERT OR UPDATE ON receipt_items
  FOR EACH ROW EXECUTE FUNCTION sync_receipt_item_date();
