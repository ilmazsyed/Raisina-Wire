-- The Ad library desk (src/ads.js): the channel's ads and brand films, uploaded or YouTube, and
-- when each plays (so many times every 30 minutes, at set times, between dates, or forced now).
CREATE TABLE IF NOT EXISTS tv_ads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- clip (the clip store) | yt
  url TEXT NOT NULL DEFAULT '',       -- /clips/... for a clip
  yt_id TEXT NOT NULL DEFAULT '',
  secs INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL DEFAULT 'channel',   -- app (made by the app: never deleted) | channel
  category TEXT NOT NULL DEFAULT 'ad',      -- ad | brand (brand film) | promo
  channels TEXT NOT NULL DEFAULT 'h',       -- h | v | hv
  per30 INTEGER NOT NULL DEFAULT 0,         -- plays in every 30 minutes (0: none on rotation)
  times TEXT NOT NULL DEFAULT '[]',         -- ["HH:MM", ...] India time, every day
  from_time TEXT NOT NULL DEFAULT '',       -- rotation only between these times (India time)
  to_time TEXT NOT NULL DEFAULT '',
  start_day TEXT NOT NULL DEFAULT '',       -- YYYY-MM-DD, India time
  end_day TEXT NOT NULL DEFAULT '',
  force_at TEXT,                            -- forced: plays at the next break after this
  active INTEGER NOT NULL DEFAULT 1,
  plays INTEGER NOT NULL DEFAULT 0,
  last_played TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS tv_ads_active ON tv_ads (active);
