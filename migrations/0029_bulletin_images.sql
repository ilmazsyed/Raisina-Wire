-- A free-licence photo (Wikimedia Commons) for each story in the TV bulletin, with its credit.
CREATE TABLE IF NOT EXISTS bulletin_images (
  article_id TEXT PRIMARY KEY,
  url TEXT NOT NULL DEFAULT '',
  credit TEXT NOT NULL DEFAULT '',
  page TEXT NOT NULL DEFAULT '',
  query TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL
);
