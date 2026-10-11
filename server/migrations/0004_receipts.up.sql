CREATE TABLE IF NOT EXISTS receipts (
    id              INTEGER PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name       TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
    mime_type       TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    content         BLOB NOT NULL CHECK (length(content) BETWEEN 1 AND 10485760),
    sha256          TEXT NOT NULL CHECK (length(sha256) = 64),
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, sha256)
);
CREATE INDEX IF NOT EXISTS idx_receipts_user_status ON receipts (user_id, status, created_at DESC);
