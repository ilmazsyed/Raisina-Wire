-- Each video's YouTube description, and the one-line Bengali title the TV's "up next" card
-- shows for it (written from the title and description; see src/bnline.js and src/wiredesk.js).
ALTER TABLE tv_items ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE tv_items ADD COLUMN headline TEXT NOT NULL DEFAULT '';
