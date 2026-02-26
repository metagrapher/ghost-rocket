-- Migration to add copyright and source_url to photos table
ALTER TABLE photos ADD COLUMN copyright TEXT;
ALTER TABLE photos ADD COLUMN source_url TEXT;
