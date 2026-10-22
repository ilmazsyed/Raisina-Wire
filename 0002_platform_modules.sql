CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT 'General',
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden','removed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS community_replies (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'Briefing',
  starts_at TEXT NOT NULL,
  access TEXT NOT NULL DEFAULT 'public' CHECK(access IN ('public','member','premium')),
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published','cancelled')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  organisation TEXT NOT NULL DEFAULT '',
  interest TEXT NOT NULL DEFAULT 'General',
  source TEXT NOT NULL DEFAULT 'Website',
  stage TEXT NOT NULL DEFAULT 'New' CHECK(stage IN ('New','Contacted','Qualified','Demo','Proposal','Won','Lost')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS social_metrics (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  period TEXT NOT NULL DEFAULT 'latest',
  source_note TEXT NOT NULL DEFAULT 'Manual entry',
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS member_flags (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flag TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, flag)
);
