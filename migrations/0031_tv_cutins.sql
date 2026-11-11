-- Scheduled cut-ins: one video or a set of videos the control room puts on air at set times
-- (India time), once on a date or every day; the channel goes back to autopilot after them.
CREATE TABLE IF NOT EXISTS tv_cutins (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,                      -- 'h' or 'v'
  title TEXT NOT NULL DEFAULT '',
  videos TEXT NOT NULL DEFAULT '[]',          -- JSON [{ytId,title,line,dur}] in playing order
  times TEXT NOT NULL DEFAULT '[]',           -- JSON ["18:00","21:30"] India time
  day TEXT NOT NULL DEFAULT '',               -- 'YYYY-MM-DD' for one day; '' for every day
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS tv_cutins_channel ON tv_cutins (channel, active);
