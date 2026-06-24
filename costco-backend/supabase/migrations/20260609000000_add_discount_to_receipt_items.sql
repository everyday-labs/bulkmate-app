ALTER TABLE receipt_items
  ADD COLUMN discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0;
