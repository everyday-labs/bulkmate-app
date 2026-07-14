-- Check-ins table: one record per user per warehouse per day (enforced by unique index)

CREATE TABLE IF NOT EXISTS check_ins (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  warehouse_id    UUID        NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  latitude        NUMERIC(10, 7),
  longitude       NUMERIC(10, 7),
  distance_meters NUMERIC(8, 2),
  stars_earned    INT         NOT NULL DEFAULT 1
);

-- One check-in per user per warehouse per calendar day (UTC)
CREATE UNIQUE INDEX IF NOT EXISTS check_ins_user_warehouse_day
  ON check_ins (user_id, warehouse_id, (DATE(checked_in_at AT TIME ZONE 'UTC')));

-- RLS
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own check-ins" ON check_ins;
CREATE POLICY "Users can view own check-ins"
  ON check_ins FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own check-ins" ON check_ins;
CREATE POLICY "Users can insert own check-ins"
  ON check_ins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Add total_stars and fan_tier to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_stars INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fan_tier TEXT NOT NULL DEFAULT 'KirklandCadet';
