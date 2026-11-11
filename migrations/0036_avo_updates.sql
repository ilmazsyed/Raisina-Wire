-- When an AVO story's voice and pictures were last made: a story whose report is updated after that
-- is made again, and shows "নতুন তথ্য" (src/avo.js).
ALTER TABLE avo_stories ADD COLUMN prepared_at TEXT;
