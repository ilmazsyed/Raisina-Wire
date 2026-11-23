-- The Explainer desk (src/explainer.js): an explainer put in rotation airs on its own (about one
-- every 45 minutes on each screen, in place of an AVO block) until this time; NULL: not in rotation.
ALTER TABLE explainers ADD COLUMN rotation_until TEXT;
