-- The AVO Breaking Engine: major stories read over full-screen pictures (src/avo.js).
CREATE TABLE IF NOT EXISTS avo_stories (
  article_id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  desk TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',            -- bengal, india, neighbours, world
  score INTEGER NOT NULL DEFAULT 0,
  script TEXT NOT NULL DEFAULT '[]',          -- JSON: the sentences read, in order
  sex TEXT NOT NULL DEFAULT 'f',              -- the newsreader: f (Despina) or m (Sadachbia)
  voice TEXT NOT NULL DEFAULT '[]',           -- JSON: tts_audio keys, played in turn
  secs REAL NOT NULL DEFAULT 0,
  images TEXT NOT NULL DEFAULT '[]',          -- JSON [{url,credit,page}]
  status TEXT NOT NULL DEFAULT 'new',         -- new, ready, failed
  day TEXT NOT NULL DEFAULT '',               -- India day it was chosen (for the daily quota)
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  aired INTEGER NOT NULL DEFAULT 0,           -- times on the broadcast output (OBS)
  views INTEGER NOT NULL DEFAULT 0,           -- times played in the app or on the site
  last_aired TEXT
);
CREATE INDEX IF NOT EXISTS avo_stories_status ON avo_stories (status, published_at);
CREATE INDEX IF NOT EXISTS avo_stories_day ON avo_stories (day, region);
CREATE TABLE IF NOT EXISTS avo_plays (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  at TEXT NOT NULL,
  where_played TEXT NOT NULL DEFAULT 'output'  -- output (broadcast) or rundown
);
CREATE INDEX IF NOT EXISTS avo_plays_story ON avo_plays (article_id, at);
