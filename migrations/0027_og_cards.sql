-- The picture each story shows when it is shared (WhatsApp, Facebook, X): a 1200×630 card with
-- its photo or its desk's colours, its headline and the Rashtrix logo, made once by a headless
-- browser (src/ogcard.js) and kept here.
CREATE TABLE IF NOT EXISTS og_cards (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  img BLOB,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
