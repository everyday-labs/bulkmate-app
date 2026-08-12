-- receipts had only SELECT/INSERT policies, so the receipt-success screen's
-- warehouse picker (shown when the parser can't resolve a warehouse from the
-- receipt header) silently failed to save the user's choice.

CREATE POLICY "Users can update own receipts"
  ON receipts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
