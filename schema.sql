PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(created_at);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  checkout_attempt_id TEXT,
  product_id TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  region_id TEXT NOT NULL,
  region_name_snapshot TEXT NOT NULL,
  region_currency TEXT NOT NULL,
  denomination_value TEXT NOT NULL,
  denomination_currency TEXT NOT NULL,
  selling_price_lyd REAL NOT NULL,
  delivery_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  order_status TEXT NOT NULL,
  provider_name TEXT,
  provider_reference TEXT,
  gift_card_code TEXT,
  gift_card_serial TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_at TEXT,
  processing_at TEXT,
  delivered_at TEXT,
  failed_at TEXT,
  refunded_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_user_attempt
  ON orders(user_id, checkout_attempt_id)
  WHERE checkout_attempt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  order_status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_created_at ON order_events(created_at);

CREATE TABLE IF NOT EXISTS fulfillment_attempts (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  provider_reference TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  UNIQUE(order_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_attempts_order_id ON fulfillment_attempts(order_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_attempts_created_at ON fulfillment_attempts(created_at);
