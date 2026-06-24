-- Enums
CREATE TYPE fan_tier AS ENUM (
  'KirklandCadet',
  'WholesaleWanderer',
  'BulkBuyer',
  'GoldStarGuru',
  'ExecutiveExplorer'
);

CREATE TYPE warehouse_tier AS ENUM ('Common', 'Rare', 'Legendary');

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  home_warehouse_id UUID,
  total_stars INTEGER NOT NULL DEFAULT 0,
  fan_tier fan_tier NOT NULL DEFAULT 'KirklandCadet',
  push_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Warehouses
CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  tier warehouse_tier NOT NULL DEFAULT 'Common',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles
  ADD CONSTRAINT profiles_home_warehouse_fk
  FOREIGN KEY (home_warehouse_id) REFERENCES warehouses(id);

-- Products (also serves as price cache)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT,
  description TEXT,
  current_price NUMERIC(10, 2),
  price_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX products_sku_idx ON products(sku);

-- Receipts
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES warehouses(id),
  transaction_date DATE NOT NULL,
  total_amount NUMERIC(10, 2),
  image_path TEXT,
  ocr_raw TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX receipts_user_id_idx ON receipts(user_id);
CREATE INDEX receipts_transaction_date_idx ON receipts(transaction_date);

-- Receipt items
CREATE TABLE receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  sku TEXT NOT NULL,
  description TEXT,
  unit_price NUMERIC(10, 2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX receipt_items_receipt_id_idx ON receipt_items(receipt_id);
CREATE INDEX receipt_items_sku_idx ON receipt_items(sku);

-- Badges
CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  warehouse_id UUID REFERENCES warehouses(id),
  icon_url TEXT
);

-- User badges
CREATE TABLE user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id),
  warehouse_id UUID REFERENCES warehouses(id),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, badge_id, warehouse_id)
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only read/update their own
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Receipts: users can only access their own
CREATE POLICY "receipts_select_own" ON receipts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "receipts_insert_own" ON receipts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Receipt items: accessible if the parent receipt belongs to the user
CREATE POLICY "receipt_items_select_own" ON receipt_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM receipts WHERE receipts.id = receipt_items.receipt_id AND receipts.user_id = auth.uid()));
CREATE POLICY "receipt_items_insert_own" ON receipt_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM receipts WHERE receipts.id = receipt_items.receipt_id AND receipts.user_id = auth.uid()));

-- Warehouses + products + badges: public read
CREATE POLICY "warehouses_public_read" ON warehouses FOR SELECT USING (true);
CREATE POLICY "products_public_read" ON products FOR SELECT USING (true);
CREATE POLICY "badges_public_read" ON badges FOR SELECT USING (true);

-- User badges: own only
CREATE POLICY "user_badges_select_own" ON user_badges FOR SELECT USING (auth.uid() = user_id);
