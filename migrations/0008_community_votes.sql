-- "Useful" votes on discussions, one per member per discussion.
CREATE TABLE IF NOT EXISTS community_votes (
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_community_posts_status_created ON community_posts(status, created_at DESC);
