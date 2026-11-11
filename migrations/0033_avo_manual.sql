-- AVO stories written by hand on the AVO Story Desk (and breaking news typed in the control room).
ALTER TABLE avo_stories ADD COLUMN origin TEXT NOT NULL DEFAULT 'auto';   -- auto, manual, breaking
ALTER TABLE avo_stories ADD COLUMN find_more INTEGER NOT NULL DEFAULT 1;  -- search for more pictures when fewer than four
ALTER TABLE avo_stories ADD COLUMN created_by TEXT NOT NULL DEFAULT '';
UPDATE avo_stories SET origin='breaking' WHERE article_id LIKE 'brk:%';
