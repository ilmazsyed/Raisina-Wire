-- Guest writers added in the control room (name, photo, one-line bio). The founder and the desk
-- stay in src/writers.js.
CREATE TABLE IF NOT EXISTS writers (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Guest writer',
  bio TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Live updates can be corrected after posting; the reader sees when.
ALTER TABLE live_updates ADD COLUMN edited_at TEXT;
