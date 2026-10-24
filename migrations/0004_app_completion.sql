-- Article images and the link to an original (for example the LinkedIn edition).
ALTER TABLE articles ADD COLUMN image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN source_url TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_articles_status_published ON articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_replies_post ON community_replies(post_id, created_at);
-- Failed sign-in attempts, used to slow down password guessing.
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);
