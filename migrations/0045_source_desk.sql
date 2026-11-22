-- A wire source can be tied to one desk (for now: Probashi Bangali). Its items are then read only
-- when they concern Bengalis abroad or rules that affect Indians living abroad, and are filed there.
ALTER TABLE wire_sources ADD COLUMN desk TEXT NOT NULL DEFAULT '';
