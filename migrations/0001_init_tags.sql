DROP TABLE IF EXISTS tags;
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_key TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    w REAL NOT NULL,
    h REAL NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
CREATE INDEX idx_tags_key ON tags(image_key);
