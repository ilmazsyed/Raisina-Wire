-- A rundown sent to the PCR goes on air by itself at its start time (src/rundown.js rundownCues);
-- the channel goes back to autopilot when it ends.
ALTER TABLE rundowns ADD COLUMN pcr_sent_at TEXT;
ALTER TABLE rundowns ADD COLUMN pcr_aired_at TEXT;
