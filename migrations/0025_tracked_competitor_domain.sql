-- Persist the selected website independently of aliases and later public-index changes.
ALTER TABLE tracked_competitors ADD COLUMN domain TEXT;
