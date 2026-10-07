-- Email + SMS delivery for price-drop alerts (Brevo), alongside the existing push.
--
--   Email: sent immediately by price-match-check when a new drop is found. On by
--          default (transactional, about the user's own purchases), with a
--          one-click unsubscribe link in every email.
--   SMS:   weekly digest, Friday 3 PM US Pacific, sent by weekly-price-texts.
--          Off by default; requires an explicit opt-in AND a phone number
--          verified by code (phone-verification function).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_alerts_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_alerts_enabled   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified_at    timestamptz;

-- Per-channel delivery stamps, so each alert goes out at most once per channel.
ALTER TABLE price_alerts
  ADD COLUMN IF NOT EXISTS emailed_at timestamptz,
  ADD COLUMN IF NOT EXISTS texted_at  timestamptz;

-- profiles has an RLS "update own" policy, so a client could otherwise mark its
-- own phone verified, or switch texts on for an unverified number. Only the
-- service role (the phone-verification function) may set phone_verified_at, and
-- changing the number always drops verification and the SMS opt-in.
-- auth.role() is NULL for direct SQL (migrations, dashboard) — treated as trusted.
CREATE OR REPLACE FUNCTION public.guard_phone_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- The verification function (service role) writes the verified number and
  -- the timestamp together, so only client-originated updates are constrained.
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    IF NEW.phone_number IS DISTINCT FROM OLD.phone_number THEN
      NEW.phone_verified_at := NULL;
      NEW.sms_alerts_enabled := false;
    ELSE
      NEW.phone_verified_at := OLD.phone_verified_at;
    END IF;
  END IF;

  IF NEW.sms_alerts_enabled AND NEW.phone_verified_at IS NULL THEN
    NEW.sms_alerts_enabled := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_phone_verification ON profiles;
CREATE TRIGGER profiles_guard_phone_verification
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_phone_verification();

REVOKE EXECUTE ON FUNCTION public.guard_phone_verification() FROM anon, authenticated;

-- Pending phone-verification codes. Service-role only: RLS on, no policies.
-- Only a SHA-256 hash of the code is stored.
CREATE TABLE IF NOT EXISTS phone_verifications (
  user_id           uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  phone_number      text NOT NULL,
  code_hash         text NOT NULL,
  expires_at        timestamptz NOT NULL,
  attempts          integer NOT NULL DEFAULT 0,
  sends_in_window   integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;

-- Weekly texts: Friday 3 PM America/Los_Angeles. pg_cron runs in UTC, and 3 PM
-- Pacific is 22:00 UTC in summer (PDT) and 23:00 UTC in winter (PST), so the job
-- fires at both and the function only sends when it is actually 3 PM in LA.
--
-- The command reuses the URL host + Authorization header of the existing
-- daily-price-match-sweep job (created in the dashboard), so no key is ever
-- written into a migration file.
DO $$
DECLARE
  sweep_cmd text;
BEGIN
  SELECT command INTO sweep_cmd FROM cron.job WHERE jobname = 'daily-price-match-sweep';
  IF sweep_cmd IS NULL THEN
    RAISE NOTICE 'daily-price-match-sweep not found; schedule weekly-price-texts manually';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'weekly-price-texts';
  PERFORM cron.schedule(
    'weekly-price-texts',
    '0 22,23 * * 5',
    replace(
      replace(sweep_cmd, '/functions/v1/price-match-check', '/functions/v1/weekly-price-texts'),
      '{"sweep": true}', '{}'
    )
  );
END;
$$;
