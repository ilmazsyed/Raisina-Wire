-- AVO stories: the phone-in (a reporter's call: audio, name, place, picture, transcript), the order
-- of the story, bytes and phone-in, and later settings (JSON; src/avo.js cleanExtra).
ALTER TABLE avo_stories ADD COLUMN extra TEXT NOT NULL DEFAULT '{}';
