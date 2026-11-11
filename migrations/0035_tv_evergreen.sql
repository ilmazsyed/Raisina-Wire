-- Evergreen videos (explainers, features): marked in the control room, they fill the channel when
-- every fresh video has played within the hour, before anything repeats (src/engine.js).
ALTER TABLE tv_items ADD COLUMN evergreen INTEGER NOT NULL DEFAULT 0;
-- A story's desk and weight set by hand in the AVO Story Desk (JSON {dk, weight}), when the rules
-- (src/labels.js) get it wrong.
ALTER TABLE avo_stories ADD COLUMN labels TEXT;
