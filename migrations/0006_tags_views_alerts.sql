-- Tags on stories (comma-separated), and alerts for scheduled stories ('' | 'pending' | 'sent').
ALTER TABLE articles ADD COLUMN tags TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN alert_state TEXT NOT NULL DEFAULT '';
UPDATE articles SET tags = replace(topic, ' · ', ',') WHERE kind = 'edition' AND tags = '' AND topic <> '';
-- Story views per day: no cookies, no personal data.
CREATE TABLE IF NOT EXISTS story_views (
  slug TEXT NOT NULL,
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (slug, day)
);
CREATE INDEX IF NOT EXISTS idx_story_views_day ON story_views(day);
-- Saved stories that follow a member across devices.
CREATE TABLE IF NOT EXISTS saved_items (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  href TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, href)
);
-- Breaking-news alerts (Web Push without payload: the service worker fetches the latest alert).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_ok_at TEXT
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '/',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cursor TEXT NOT NULL DEFAULT '',
  sent INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_alerts_done ON alerts(done, created_at);
-- Small key/value store (holds the generated VAPID key pair).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
