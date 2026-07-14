-- Seed Bay Area Costco warehouse locations with GPS coordinates
-- Tier: Common | Rare | Legendary

INSERT INTO warehouses (warehouse_code, name, address, city, state, latitude, longitude, tier)
VALUES
  ('0013', 'Costco San Jose',           '1600 Coleman Ave',           'San Jose',         'CA',  37.3709, -121.9191, 'Common'),
  ('0152', 'Costco Mountain View',      '1000 N Rengstorff Ave',      'Mountain View',    'CA',  37.4084, -122.0907, 'Common'),
  ('0217', 'Costco Sunnyvale',          '777 W El Camino Real',       'Sunnyvale',        'CA',  37.3696, -122.0248, 'Common'),
  ('0053', 'Costco San Francisco',      '450 10th St',                'San Francisco',    'CA',  37.7695, -122.4126, 'Rare'),
  ('0143', 'Costco South San Francisco','900 Dubuque Ave',            'South San Francisco','CA',37.6596, -122.4005, 'Common'),
  ('0061', 'Costco Redwood City',       '2200 Whipple Rd',            'Redwood City',     'CA',  37.4855, -122.2156, 'Common'),
  ('0222', 'Costco Fremont',            '43621 Pacific Commons Blvd', 'Fremont',          'CA',  37.5391, -121.9882, 'Common'),
  ('0075', 'Costco Oakland',            '3150 Fostoria Way',          'Oakland',          'CA',  37.8109, -122.2029, 'Rare'),
  ('0108', 'Costco Richmond',           '4801 Central Ave',           'Richmond',         'CA',  37.9377, -122.3483, 'Common'),
  ('0132', 'Costco Livermore',          '4300 Las Positas Rd',        'Livermore',        'CA',  37.7036, -121.8028, 'Common'),
  ('0196', 'Costco San Ramon',          '2400 Bishop Dr',             'San Ramon',        'CA',  37.7479, -121.9766, 'Common'),
  ('0114', 'Costco Concord',            '1150 Concord Ave',           'Concord',          'CA',  37.9765, -122.0316, 'Common'),
  ('0277', 'Costco Santa Clara',        '2201 Laurelwood Rd',         'Santa Clara',      'CA',  37.3843, -121.9746, 'Common'),
  ('0006', 'Costco Novato',             '220 Vintage Way',            'Novato',           'CA',  38.0808, -122.5537, 'Common'),
  ('0115', 'Costco Brisbane',           '5 Costco Way',               'Brisbane',         'CA',  37.6768, -122.3928, 'Legendary')
ON CONFLICT (warehouse_code) DO UPDATE
  SET
    name      = EXCLUDED.name,
    address   = EXCLUDED.address,
    city      = EXCLUDED.city,
    state     = EXCLUDED.state,
    latitude  = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    tier      = EXCLUDED.tier;
