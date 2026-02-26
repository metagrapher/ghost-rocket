CREATE TABLE IF NOT EXISTS scrape_status (
    party_id TEXT PRIMARY KEY,
    last_scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    images_found INTEGER DEFAULT 0,
    images_saved INTEGER DEFAULT 0,
    status TEXT
);
