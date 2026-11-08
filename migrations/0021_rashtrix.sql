-- Rashtrix: Bengali-first stories, the Wix import, the wire desk (approved sources, rewrites and
-- briefs written from several sources), corrections, and the AI quota.

-- Each story is written in one language (Bengali by default); the others are translations.
ALTER TABLE articles ADD COLUMN lang TEXT NOT NULL DEFAULT 'bn';
-- Where a story came from: 'desk' (written in the control room), 'wix' (imported from
-- rashtrix.live) or 'wire' (a rewrite or brief by the wire desk). origin_ref is the Wix post
-- address or the wire job id.
ALTER TABLE articles ADD COLUMN origin TEXT NOT NULL DEFAULT 'desk';
ALTER TABLE articles ADD COLUMN origin_ref TEXT NOT NULL DEFAULT '';
-- Corrections: the latest public correction note, and when a story was pulled.
ALTER TABLE articles ADD COLUMN corrected_at TEXT;
ALTER TABLE articles ADD COLUMN correction_note TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN pulled_at TEXT;
CREATE INDEX IF NOT EXISTS idx_articles_origin ON articles(origin, origin_ref);
CREATE INDEX IF NOT EXISTS idx_articles_kind ON articles(kind, status, published_at DESC);

-- The outlets the wire desk may read (supplied by the owner), and what it must never use.
CREATE TABLE IF NOT EXISTS wire_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  feed_url TEXT NOT NULL UNIQUE,
  lang TEXT NOT NULL DEFAULT 'bn',          -- language the outlet writes in: bn, en or hi
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  last_fetch_at TEXT, last_ok INTEGER, last_error TEXT NOT NULL DEFAULT '', last_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS wire_blocklist (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL UNIQUE,             -- a domain (example.com) or a word or phrase
  kind TEXT NOT NULL DEFAULT 'word',        -- 'domain' or 'word'
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Every item read from a source. Kept internally (never shown to readers) as the record of
-- what each rewrite was written from.
CREATE TABLE IF NOT EXISTS wire_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  lang TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  job_id TEXT,
  status TEXT NOT NULL DEFAULT 'new'        -- new, grouped, blocked, old
);
CREATE INDEX IF NOT EXISTS idx_wire_items_status ON wire_items(status, fetched_at);
CREATE INDEX IF NOT EXISTS idx_wire_items_job ON wire_items(job_id);
-- One job per story: the items about it, and the rewrite (Bengali sources) or 100-word brief
-- (sources in other languages) written from them.
CREATE TABLE IF NOT EXISTS wire_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                       -- 'rewrite' or 'brief'
  status TEXT NOT NULL DEFAULT 'waiting',   -- waiting (for a 2nd source), queued, working, done, failed, skipped
  title TEXT NOT NULL,
  keys TEXT NOT NULL DEFAULT '',            -- words of the first headline, for grouping
  sources INTEGER NOT NULL DEFAULT 1,       -- distinct outlets
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  article_id TEXT,
  not_before TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_wire_jobs_status ON wire_jobs(status, created_at);
-- Corrections log: every pull, restore and correction, with the text before it.
CREATE TABLE IF NOT EXISTS corrections (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  action TEXT NOT NULL,                     -- pull, restore, correct
  note TEXT NOT NULL DEFAULT '',
  public INTEGER NOT NULL DEFAULT 1,
  before_title TEXT NOT NULL DEFAULT '',
  before_body TEXT NOT NULL DEFAULT '',
  actor_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_corrections_article ON corrections(article_id, created_at DESC);
-- Gemini use per Pacific day (the free tier resets at midnight Pacific time).
CREATE TABLE IF NOT EXISTS ai_usage (day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0, blocked_until TEXT);
