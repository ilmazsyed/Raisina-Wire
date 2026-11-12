-- Languages a story is hidden in (comma-separated, e.g. "en,hi"): the owner can take a story out of
-- one language's edition and keep it in the others (src/worker.js /api/owner/…, src/store.js shownIn).
ALTER TABLE articles ADD COLUMN hidden_langs TEXT NOT NULL DEFAULT '';
