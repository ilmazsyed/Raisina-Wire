-- The Segment & bulletin desk: every news bulletin and segment the broadcast output airs, with
-- its stories, for two days (longer when archived). See src/progs.js.
CREATE TABLE IF NOT EXISTS programmes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,              -- bulletin | segment
  name TEXT NOT NULL DEFAULT '',   -- the segment's name (world, sports, ...)
  title TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL,
  slot_at TEXT NOT NULL,           -- the quarter hour it belongs to (ISO)
  short INTEGER NOT NULL DEFAULT 0,
  items TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',   -- active | archived
  edited INTEGER NOT NULL DEFAULT 0,
  plays INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS programmes_slot ON programmes (kind, name, channel, slot_at);
CREATE INDEX IF NOT EXISTS programmes_when ON programmes (slot_at);
