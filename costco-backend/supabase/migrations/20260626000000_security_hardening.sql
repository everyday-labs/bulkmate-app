-- Fix 1 & 2: Pin search_path on both functions.
-- Without this, a malicious user could create a schema that shadows pg_catalog
-- and trick the function into calling their version of system functions.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_receipt_item_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.transaction_date := (
    SELECT transaction_date FROM receipts WHERE id = NEW.receipt_id
  );
  RETURN NEW;
END;
$$;

-- Fix 3 & 4: Revoke public EXECUTE on handle_new_user.
-- This function is a trigger — it should only be called by Postgres internally,
-- never directly via the REST API by anon or authenticated users.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- sync_receipt_item_date is also a trigger-only function — same treatment.
REVOKE EXECUTE ON FUNCTION public.sync_receipt_item_date() FROM anon, authenticated;
