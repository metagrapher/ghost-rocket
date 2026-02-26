-- Migration number: 0009 	 2026-01-10T12:28:00
ALTER TABLE parties ADD COLUMN enrichment_level INTEGER DEFAULT 0;
