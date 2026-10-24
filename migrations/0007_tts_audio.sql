-- Audio for "Listen", generated once per paragraph and voice, then reused.
CREATE TABLE IF NOT EXISTS tts_audio (
  key TEXT PRIMARY KEY,
  voice TEXT NOT NULL,
  chars INTEGER NOT NULL DEFAULT 0,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
