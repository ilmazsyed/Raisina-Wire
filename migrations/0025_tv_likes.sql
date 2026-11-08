-- Likes for the videos on Rashtrix TV, from the like button on the app's player.
CREATE TABLE IF NOT EXISTS tv_likes (
  yt_id TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
