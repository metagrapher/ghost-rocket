-- Migration number: 0007 	 2026-01-10T15:43:00.000Z
CREATE TABLE usage_metrics (
    id INTEGER PRIMARY KEY,
    type TEXT,       -- 'page_view', 'api_call', 'error'
    path TEXT,       -- '/admin', '/api/quiz', etc
    status INTEGER,  -- 200, 404, 500
    ip TEXT,         -- Anonymized IP or hash
    user_agent TEXT,
    timestamp INTEGER
);

CREATE INDEX idx_metrics_timestamp ON usage_metrics(timestamp);
CREATE INDEX idx_metrics_type ON usage_metrics(type);
