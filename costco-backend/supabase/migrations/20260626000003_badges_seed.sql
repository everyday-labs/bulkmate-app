-- Add programmatic trigger key and emoji icon to badges table
ALTER TABLE badges ADD COLUMN IF NOT EXISTS trigger_key TEXT UNIQUE;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS icon TEXT;

-- Seed badge definitions
-- trigger_key is used by the check-in Edge Function to decide when to award each badge
INSERT INTO badges (name, description, trigger_key, icon) VALUES
  ('First Steps',        'Completed your first Costco warehouse check-in.',                  'first_checkin',        '👟'),
  ('Regular',            'Checked in 5 times across any Costco locations.',                  'five_checkins',        '🏪'),
  ('Devoted Member',     'Racked up 10 total check-ins.',                                   'ten_checkins',         '💪'),
  ('Explorer',           'Checked in at 3 different Costco warehouses.',                    'three_warehouses',     '🗺'),
  ('Warehouse Hopper',   'Visited 5 unique Costco locations.',                              'five_warehouses',      '✈️'),
  ('Rare Discovery',     'Checked in at a Rare-tier Costco warehouse.',                     'rare_warehouse',       '💎'),
  ('Legendary Visit',    'Set foot in a Legendary-tier Costco warehouse.',                  'legendary_warehouse',  '🏆'),
  ('Star Collector',     'Earned 10 stars through warehouse check-ins.',                    'ten_stars',            '⭐'),
  ('Gold Standard',      'Reached Gold Star Guru fan tier.',                                'gold_star_guru',       '🌟'),
  ('Executive',          'Achieved Executive Explorer — the highest fan tier.',             'executive_explorer',   '👑')
ON CONFLICT (trigger_key) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      icon        = EXCLUDED.icon;
