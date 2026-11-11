-- A video the control room keeps on the channel beyond the 30-hour freshness limit.
ALTER TABLE tv_items ADD COLUMN keep INTEGER NOT NULL DEFAULT 0;
