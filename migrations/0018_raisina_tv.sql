-- Raisina TV: the explainers play one after another, newest first, around the clock.
-- Manual order for the channel (only used when "Use my order" is on in the control room).
CREATE TABLE IF NOT EXISTS tv_order (
  media_id TEXT PRIMARY KEY,
  pin INTEGER,                         -- 1-based position, or NULL to follow recency
  play_next INTEGER NOT NULL DEFAULT 0,
  excluded INTEGER NOT NULL DEFAULT 0
);
-- Ads: Google Drive "anyone with the link" videos, played in breaks.
CREATE TABLE IF NOT EXISTS tv_ads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  on_air INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Breaking ticker lines; any that are on lead the ticker in a red band.
CREATE TABLE IF NOT EXISTS tv_breaking (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  on_air INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
