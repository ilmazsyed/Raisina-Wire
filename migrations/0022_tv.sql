-- Rashtrix TV, Phase 2: two channels (h = horizontal 1920×1080, v = vertical 1080×1920),
-- sourced from YouTube playlists and lives the owner picks, with vertical promo cards.

-- Where each channel's videos come from: a playlist, a single video, or a live stream.
CREATE TABLE IF NOT EXISTS tv_sources (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,                    -- 'h' or 'v'
  kind TEXT NOT NULL,                       -- 'playlist', 'video' or 'live'
  yt_id TEXT NOT NULL,                      -- playlist id or video id
  title TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  on_air INTEGER NOT NULL DEFAULT 0,        -- lives: cut to it now
  live_now INTEGER NOT NULL DEFAULT 0,      -- lives: YouTube says it is broadcasting
  last_refresh TEXT, last_error TEXT NOT NULL DEFAULT '', item_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel, kind, yt_id)
);
-- The videos found in the sources. An editor can leave any one out.
CREATE TABLE IF NOT EXISTS tv_items (
  channel TEXT NOT NULL,
  yt_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL DEFAULT 0,      -- seconds
  thumb TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  position INTEGER NOT NULL DEFAULT 0,      -- order within its playlist
  excluded INTEGER NOT NULL DEFAULT 0,
  playable INTEGER NOT NULL DEFAULT 1,      -- embeddable, public, not a live
  seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (channel, yt_id)
);
CREATE INDEX IF NOT EXISTS idx_tv_items_channel ON tv_items(channel, excluded, published_at DESC);
-- Full-screen 9:16 promo cards for the vertical channel.
CREATE TABLE IF NOT EXISTS tv_promos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 8,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- YouTube Data API units used per Pacific day (the quota resets at midnight Pacific time).
CREATE TABLE IF NOT EXISTS yt_usage (day TEXT PRIMARY KEY, units INTEGER NOT NULL DEFAULT 0);
