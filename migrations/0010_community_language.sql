-- Discussions can be held in English, Hindi or Bengali; the starter picks the language.
ALTER TABLE community_posts ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';
