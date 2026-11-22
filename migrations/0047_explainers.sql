-- The Explainer desk (src/explainer.js): long-form Vox-style explainers, 1.5 to 2.5 minutes.
CREATE TABLE IF NOT EXISTS explainers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  kicker TEXT NOT NULL DEFAULT '',
  style TEXT NOT NULL DEFAULT 'politics',     -- politics, crime, govt, soft
  status TEXT NOT NULL DEFAULT 'draft',       -- draft (being written or edited), voiced (every line has its voice)
  voice_mode TEXT NOT NULL DEFAULT 'tts',     -- tts (the channel's newsreader) or rec (recorded on the desk)
  sex TEXT NOT NULL DEFAULT 'f',
  minutes REAL NOT NULL DEFAULT 2,
  source TEXT NOT NULL DEFAULT '{}',          -- JSON: what it was made from (text, links, story)
  media TEXT NOT NULL DEFAULT '[]',           -- JSON: pictures, videos and bytes given on the desk
  shots TEXT NOT NULL DEFAULT '[]',           -- JSON: the film, shot by shot (src/xpl.js)
  secs REAL NOT NULL DEFAULT 0,
  keep INTEGER NOT NULL DEFAULT 0,
  aired INTEGER NOT NULL DEFAULT 0,
  last_aired TEXT,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_explainers_created ON explainers(created_at DESC);
