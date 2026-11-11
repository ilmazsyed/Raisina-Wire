-- AVO pictures: version 2 is the news-only finder (photos of that story's reports, never general
-- stock photos); stories pictured before it are looked up again (src/avo.js repicture).
ALTER TABLE avo_stories ADD COLUMN img_v INTEGER NOT NULL DEFAULT 1;
