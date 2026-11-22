-- The Content Library desk (src/library.js): everything the channels can air from the last 36 hours.
-- When a video first came into the library (the 36 hours count from then, not from its upload).
ALTER TABLE tv_items ADD COLUMN added_at TEXT NOT NULL DEFAULT '';
UPDATE tv_items SET added_at=COALESCE(published_at, seen_at) WHERE added_at='';
-- A playlist whose videos never clear (evergreen programmes, documentaries).
ALTER TABLE tv_sources ADD COLUMN keep_all INTEGER NOT NULL DEFAULT 0;
-- An AVO story kept past the 36 hours.
ALTER TABLE avo_stories ADD COLUMN keep INTEGER NOT NULL DEFAULT 0;
