-- Editions live in the articles table (kind='edition') so they can be edited in the CMS.
-- Writers are named by key (src/writers.js); hero images sit at the top of a story.
ALTER TABLE articles ADD COLUMN kind TEXT NOT NULL DEFAULT 'article';
ALTER TABLE articles ADD COLUMN writer TEXT NOT NULL DEFAULT 'ilmaz-syed';
ALTER TABLE articles ADD COLUMN hero_url TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN hero_caption TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN topic TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_articles_writer ON articles(writer, status, published_at DESC);
-- Images uploaded by writers, served from /media/<id>.<ext>.
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  alt TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_images_created ON images(created_at DESC);
