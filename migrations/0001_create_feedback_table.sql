-- Create feedback table
CREATE TABLE feedback (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at TEXT NOT NULL,
    metadata TEXT, -- JSON string
    processed_at TEXT NOT NULL,
    created_at_timestamp INTEGER GENERATED ALWAYS AS (unixepoch(created_at)) VIRTUAL
);

-- Create indexes for efficient queries
CREATE INDEX idx_feedback_source_type ON feedback(source_type);
CREATE INDEX idx_feedback_created_at ON feedback(created_at_timestamp);
CREATE INDEX idx_feedback_author ON feedback(author);
CREATE INDEX idx_feedback_processed_at ON feedback(processed_at);

-- Create table for caching insights
CREATE TABLE insights_cache (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL, -- JSON string
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

-- Create table for network layer analysis
CREATE TABLE network_layers (
    layer_name TEXT PRIMARY KEY,
    issue_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'healthy',
    last_updated TEXT NOT NULL
);