-- Rashtrix Phases 3–5: the bulletin producer and PCR, clips in R2, the live studio, and the
-- extras (macros, guest directory, polls, comments, results boards, sponsors, as-run log).

-- Clips kept in Cloudflare R2 (uploaded, or copied once from a Google Drive link).
CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  r2_key TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL DEFAULT 'video/mp4',
  bytes INTEGER NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT '',          -- 'upload' or the Drive link it came from
  keep INTEGER NOT NULL DEFAULT 0,          -- never auto-deleted
  status TEXT NOT NULL DEFAULT 'ready',     -- uploading, ready, failed
  upload_id TEXT,                           -- R2 multipart upload in progress
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);
-- Rundowns: one working rundown per show slot and day, archived at midnight India time.
CREATE TABLE IF NOT EXISTS rundowns (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,                    -- 'h' or 'v'
  day TEXT NOT NULL,                        -- India date, YYYY-MM-DD
  title TEXT NOT NULL,
  slot_start TEXT NOT NULL DEFAULT '',      -- HH:MM India time ('' = any time)
  slot_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'working',   -- working, archived
  template_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_rundowns_day ON rundowns(status, channel, day);
CREATE TABLE IF NOT EXISTS rundown_items (
  id TEXT PRIMARY KEY,
  rundown_id TEXT NOT NULL,
  pos INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL,                       -- video, live, clip, breaking, headlines, lband, promo, adbreak, slate
  title TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL DEFAULT 30,     -- seconds
  data TEXT NOT NULL DEFAULT '{}',          -- the item's settings and on-screen text
  script TEXT NOT NULL DEFAULT '',          -- read by the anchor (teleprompter)
  status TEXT NOT NULL DEFAULT 'ready',     -- ready, played, skipped
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rundown_items ON rundown_items(rundown_id, pos);
-- Templates: rundowns made automatically every day.
CREATE TABLE IF NOT EXISTS rundown_templates (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  slot_start TEXT NOT NULL DEFAULT '',
  slot_minutes INTEGER NOT NULL DEFAULT 30,
  weekdays TEXT NOT NULL DEFAULT '0123456', -- 0 = Sunday
  items TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- As-run log: what actually went on air, when and for how long (proof of play).
CREATE TABLE IF NOT EXISTS asrun (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  day TEXT NOT NULL,
  at TEXT NOT NULL,
  ended_at TEXT,
  rundown_id TEXT, item_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  planned INTEGER NOT NULL DEFAULT 0,
  actual INTEGER NOT NULL DEFAULT 0,
  sponsor_id TEXT,
  how TEXT NOT NULL DEFAULT 'auto'          -- auto, take, breaking, macro, standby, dump
);
CREATE INDEX IF NOT EXISTS idx_asrun_day ON asrun(channel, day, at);
CREATE INDEX IF NOT EXISTS idx_asrun_sponsor ON asrun(sponsor_id, day);
-- Macros: one button (or key) does several things.
CREATE TABLE IF NOT EXISTS macros (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  hotkey TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'h',
  actions TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0
);
-- Guest directory.
CREATE TABLE IF NOT EXISTS guest_directory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  last_appeared TEXT,
  appearances INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Live studio rooms and the guests invited to them.
CREATE TABLE IF NOT EXISTS studio_rooms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'h',
  mode TEXT NOT NULL DEFAULT 'auto',        -- auto (Cloudflare Realtime if set up), realtime, vdo
  vdo_room TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',      -- open, closed
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS studio_guests (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  directory_id TEXT,
  name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'guest',       -- guest, reporter, host
  consent INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT,
  consent_text TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'invited',    -- invited, green, ready, onair, left
  checks TEXT NOT NULL DEFAULT '{}',
  session_id TEXT NOT NULL DEFAULT '',      -- Cloudflare Realtime session
  tracks TEXT NOT NULL DEFAULT '{}',
  vdo_id TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_studio_guests_room ON studio_guests(room_id);
-- In-app polls ("not a scientific survey" on screen).
CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',      -- draft, open, closed
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closes_at TEXT
);
CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id TEXT NOT NULL,
  voter TEXT NOT NULL,                      -- a one-way hash, never the person
  choice INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (poll_id, voter)
);
-- Viewer comments to curate for the screen (app, YouTube, Facebook).
CREATE TABLE IF NOT EXISTS viewer_comments (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,                   -- app, youtube, facebook
  ext_id TEXT UNIQUE,
  author TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'new'        -- new, approved, rejected
);
CREATE INDEX IF NOT EXISTS idx_viewer_comments ON viewer_comments(status, at DESC);
-- Civic results boards: official figures only, with an exit-poll blackout lock.
CREATE TABLE IF NOT EXISTS results_boards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'seats',       -- seats (won/leading) or votes
  total INTEGER NOT NULL DEFAULT 0,         -- seats in the house
  rows TEXT NOT NULL DEFAULT '[]',          -- [{party, colour, won, leading, votes}]
  source TEXT NOT NULL DEFAULT '',          -- the official source, shown on screen
  blackout_until TEXT,                      -- nothing goes on air before this time
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Sponsors for the ad box, rotated by weight; proof of play comes from the as-run log.
CREATE TABLE IF NOT EXISTS sponsors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  image TEXT NOT NULL DEFAULT '',
  line1 TEXT NOT NULL DEFAULT '', line2 TEXT NOT NULL DEFAULT '', line3 TEXT NOT NULL DEFAULT '',
  weight INTEGER NOT NULL DEFAULT 1,
  seconds INTEGER NOT NULL DEFAULT 20,
  active INTEGER NOT NULL DEFAULT 1,
  starts TEXT, ends TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Control-room and guest screens remember each person's language.
ALTER TABLE users ADD COLUMN ui_lang TEXT NOT NULL DEFAULT '';
