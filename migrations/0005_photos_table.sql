-- Migration to store individual photo metadata including captions
CREATE TABLE IF NOT EXISTS photos (
    image_key TEXT PRIMARY KEY,
    party_id TEXT,
    caption TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(party_id) REFERENCES parties(id)
);

CREATE INDEX IF NOT EXISTS idx_photos_party ON photos(party_id);
