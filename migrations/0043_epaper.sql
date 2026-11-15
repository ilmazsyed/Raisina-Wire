-- The e-paper (src/epaper.js): two editions a day (morning 7:00, evening 17:00, India time) in
-- Bengali, English and Hindi, and the pool of stories the desks send to it.
CREATE TABLE IF NOT EXISTS epaper_editions (
  id TEXT PRIMARY KEY,                     -- YYYY-MM-DD:morning | YYYY-MM-DD:evening
  day TEXT NOT NULL,
  slot TEXT NOT NULL,                      -- morning | evening
  status TEXT NOT NULL DEFAULT 'draft',    -- draft | approved | published
  touched INTEGER NOT NULL DEFAULT 0,      -- the editor has changed it (no more automatic rebuilds)
  lead TEXT NOT NULL DEFAULT '',           -- the front page's lead item (its ref)
  pages TEXT NOT NULL DEFAULT '[]',        -- [{key,title,items:[{ref,title,dek,desk,slug,media,at}]}] (Bengali)
  langs TEXT NOT NULL DEFAULT '{}',        -- {en: pages, hi: pages} (made at print)
  horoscope TEXT NOT NULL DEFAULT '{}',    -- {bn:[12], en:[12], hi:[12]}
  built_at TEXT, approved_by TEXT, approved_at TEXT, published_at TEXT,
  reminded_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS epaper_editions_day ON epaper_editions (day, slot);
CREATE TABLE IF NOT EXISTS epaper_pool (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                      -- article | avo | breaking
  ref TEXT NOT NULL DEFAULT '',            -- the article or AVO story id
  content TEXT NOT NULL DEFAULT '{}',      -- {title, dek, body, desk, images[], video} for items with no article
  sent_by TEXT, sent_from TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS epaper_pool_at ON epaper_pool (created_at);
