-- Needed for inline-editable receipt line items (correcting OCR misreads on
-- receipt-success): receipt_items previously only had SELECT/INSERT policies,
-- so any UPDATE from the client was silently rejected by RLS.
DROP POLICY IF EXISTS "receipt_items_update_own" ON receipt_items;
CREATE POLICY "receipt_items_update_own"
  ON receipt_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM receipts WHERE receipts.id = receipt_items.receipt_id AND receipts.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM receipts WHERE receipts.id = receipt_items.receipt_id AND receipts.user_id = auth.uid()));
