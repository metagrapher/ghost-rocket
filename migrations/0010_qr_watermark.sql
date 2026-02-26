-- Migration to store QR code contrast preference
ALTER TABLE photos ADD COLUMN qr_inverted BOOLEAN DEFAULT NULL;
