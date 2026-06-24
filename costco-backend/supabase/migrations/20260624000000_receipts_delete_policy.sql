CREATE POLICY "receipts_delete_own"
  ON receipts FOR DELETE
  USING (auth.uid() = user_id);
