-- Raisina TV, part 2: livestreams or video links the desk can cut to at once, and music tracks
-- (Google Drive links) that join the built-in themes for stingers and News Updates.
CREATE TABLE IF NOT EXISTS tv_inputs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  on_air INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tv_music (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  on_air INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
