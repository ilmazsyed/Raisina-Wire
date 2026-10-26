-- Audience and retention: daily totals only. No identifiers, no IP addresses, no cookies.
-- metric/dim pairs, e.g. visitors/returning, arrival/whatsapp, install/android, push/on.
-- For retention cohorts, day is the Monday of the week a browser first visited and dim the
-- number of weeks since (one count per browser per week).
CREATE TABLE IF NOT EXISTS metrics_daily (day TEXT NOT NULL, metric TEXT NOT NULL, dim TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, metric, dim));
-- Active reading time per story (or live coverage, or the wire reader) per day.
CREATE TABLE IF NOT EXISTS reading_daily (day TEXT NOT NULL, slug TEXT NOT NULL, kind TEXT NOT NULL, reads INTEGER NOT NULL DEFAULT 0, seconds INTEGER NOT NULL DEFAULT 0, finished INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, slug));
