CREATE TABLE IF NOT EXISTS carl_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    batch_size INTEGER DEFAULT 50,
    frequency_hours INTEGER DEFAULT 24,
    enabled BOOLEAN DEFAULT TRUE,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO carl_settings (id, batch_size, frequency_hours, enabled) VALUES (1, 50, 24, 1);
