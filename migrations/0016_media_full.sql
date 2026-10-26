-- A short can point to its full-length video: when the short ends, the player offers it.
ALTER TABLE media_items ADD COLUMN full_id TEXT DEFAULT '';
