-- Machine translations of English news text (wire, briefings, live coverage, events) into
-- Hindi and Bengali, one row per sentence or headline, and the characters sent each day.
CREATE TABLE IF NOT EXISTS mt_cache (k TEXT PRIMARY KEY, lang TEXT NOT NULL, out TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS mt_cache_created ON mt_cache(created_at);
CREATE TABLE IF NOT EXISTS mt_usage (day TEXT PRIMARY KEY, chars INTEGER NOT NULL DEFAULT 0);
