-- A live results counter for election coverage: JSON with the candidates, how to read the count
-- (an official feed such as Brazil's TSE, or figures the desk enters) and the latest manual figures.
ALTER TABLE live_coverage ADD COLUMN results TEXT DEFAULT '';
