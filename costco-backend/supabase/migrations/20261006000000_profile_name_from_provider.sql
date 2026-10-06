-- Seed first/last name from the OAuth provider at signup, instead of leaving
-- them null until the user finds Edit Profile.
--
-- Google sign-in (signInWithIdToken) puts `full_name` / `name` into
-- raw_user_meta_data; there is no given/family split, so the first word is
-- taken as the first name and the rest as the last name. `given_name` /
-- `family_name` are honored if a provider ever sends them.
--
-- Apple is NOT handled here: Apple only hands the user's name to the app on the
-- very first sign-in (on the credential, never in the ID token), so the mobile
-- client writes it to `profiles` itself. Email sign-ups carry no name and keep
-- the old behavior (display_name = email).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta      jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  full_name text  := NULLIF(regexp_replace(btrim(COALESCE(meta->>'full_name', meta->>'name', '')), '\s+', ' ', 'g'), '');
  given     text  := NULLIF(btrim(COALESCE(meta->>'given_name', '')), '');
  family    text  := NULLIF(btrim(COALESCE(meta->>'family_name', '')), '');
BEGIN
  IF given IS NULL AND full_name IS NOT NULL THEN
    given  := split_part(full_name, ' ', 1);
    family := NULLIF(substr(full_name, length(given) + 2), '');
  END IF;

  INSERT INTO profiles (id, display_name, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(full_name, NULLIF(concat_ws(' ', given, family), ''), NEW.email),
    given,
    family
  );
  RETURN NEW;
END;
$$;

-- CREATE OR REPLACE keeps existing grants, but restate the lockdown from
-- 20260626000000_security_hardening.sql so this file stands on its own.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- Backfill users who signed up with Google before this trigger existed. Only
-- fills profiles that still have no first name, so a name the user already
-- set in Edit Profile is never overwritten.
WITH src AS (
  SELECT
    u.id,
    NULLIF(regexp_replace(btrim(COALESCE(
      u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''
    )), '\s+', ' ', 'g'), '') AS full_name
  FROM auth.users u
)
UPDATE profiles p
SET
  first_name   = split_part(src.full_name, ' ', 1),
  last_name    = NULLIF(substr(src.full_name, length(split_part(src.full_name, ' ', 1)) + 2), ''),
  display_name = src.full_name
FROM src
WHERE p.id = src.id
  AND p.first_name IS NULL
  AND src.full_name IS NOT NULL;
