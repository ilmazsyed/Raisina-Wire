-- Hindi and Bengali editions of stories and site pages, written by the translator (or corrected
-- by an editor). src_ver is the version of the English original each translation was made from.
CREATE TABLE IF NOT EXISTS translations (
  kind TEXT NOT NULL,                      -- 'article' or 'page'
  ref TEXT NOT NULL,                       -- article id, or page key (about, terms, ...)
  lang TEXT NOT NULL,                      -- 'hi' or 'bn'
  src_ver TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  dek TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  hero_caption TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, working, ready, manual, error
  error TEXT NOT NULL DEFAULT '',
  job_ver TEXT NOT NULL DEFAULT '',        -- version of the original the latest attempt worked from
  attempts INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL DEFAULT '',
  started_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kind, ref, lang)
);
CREATE INDEX IF NOT EXISTS idx_translations_status ON translations(status);
-- Fingerprint of a story's translatable text, so only real text changes trigger a new translation.
ALTER TABLE articles ADD COLUMN text_hash TEXT NOT NULL DEFAULT '';
