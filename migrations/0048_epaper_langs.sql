-- The e-paper (src/epaper.js): the English and Hindi editions edited by hand on the Newsprint desk
-- ({en: pages, hi: pages}); an edition with none has its pages made from the Bengali at print.
ALTER TABLE epaper_editions ADD COLUMN lang_edits TEXT NOT NULL DEFAULT '{}';
