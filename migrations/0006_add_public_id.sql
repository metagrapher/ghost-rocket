-- Migration to add public_id for obfuscated deep linking
ALTER TABLE photos ADD COLUMN public_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_photos_public_id ON photos(public_id);
