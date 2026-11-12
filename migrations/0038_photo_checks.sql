-- Every picture the AVO engine and the bulletin considered, and the verdict (src/bulletinimg.js):
-- kept so a picture is judged once, and so the control room can see why a story has the pictures
-- it has. `ai` marks a verdict from the image model (counted against its daily allowance).
CREATE TABLE IF NOT EXISTS photo_checks (
  url TEXT PRIMARY KEY,
  ok INTEGER NOT NULL DEFAULT 0,
  why TEXT NOT NULL DEFAULT '',
  ai INTEGER NOT NULL DEFAULT 0,
  at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_photo_checks_at ON photo_checks(ai, at);
-- The pictures an AVO story was given and those turned away, with the reason (for the AVO desk).
ALTER TABLE avo_stories ADD COLUMN img_log TEXT NOT NULL DEFAULT '[]';
