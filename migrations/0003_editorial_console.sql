-- Lean editorial console: media publication and live text coverage
CREATE TABLE IF NOT EXISTS media_items (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '',
  media_type TEXT NOT NULL DEFAULT 'video', media_url TEXT NOT NULL,
  thumbnail_url TEXT DEFAULT '', category TEXT DEFAULT 'Geopolitics',
  status TEXT NOT NULL DEFAULT 'draft', author_id TEXT NOT NULL,
  published_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_media_status_published ON media_items(status,published_at);
CREATE TABLE IF NOT EXISTS live_coverage (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  summary TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', author_id TEXT NOT NULL,
  started_at TEXT, ended_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_live_status_started ON live_coverage(status,started_at);
CREATE TABLE IF NOT EXISTS live_updates (
  id TEXT PRIMARY KEY, coverage_id TEXT NOT NULL, body TEXT NOT NULL,
  media_url TEXT DEFAULT '', source_url TEXT DEFAULT '', author_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(coverage_id) REFERENCES live_coverage(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_live_updates_coverage ON live_updates(coverage_id,created_at DESC);
