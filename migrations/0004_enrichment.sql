-- Migration to add enrichment columns to parties table
ALTER TABLE parties ADD COLUMN latitude REAL;
ALTER TABLE parties ADD COLUMN longitude REAL;
ALTER TABLE parties ADD COLUMN location_name TEXT;
ALTER TABLE parties ADD COLUMN party_date TEXT;
ALTER TABLE parties ADD COLUMN lineup TEXT;
ALTER TABLE parties ADD COLUMN enriched_at DATETIME;
