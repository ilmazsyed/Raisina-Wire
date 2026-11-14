-- AVO stories: video links shown like pictures (muted), and bytes (a person's video, played in full
-- with their name) after the reading: AVO only, or AVO + byte (one to three bytes).
ALTER TABLE avo_stories ADD COLUMN videos TEXT NOT NULL DEFAULT '[]';
ALTER TABLE avo_stories ADD COLUMN bytes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE avo_stories ADD COLUMN byte_mode INTEGER NOT NULL DEFAULT 0;
ALTER TABLE avo_stories ADD COLUMN byte_count INTEGER NOT NULL DEFAULT 1;
