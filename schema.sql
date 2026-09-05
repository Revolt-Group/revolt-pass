-- =====================================================================
-- D1 SCHEMA: REVOLT PASS DATABASE (schema.sql)
-- Version: 1.0.0
-- Engine: Cloudflare D1 (SQLite Serverless)
-- =====================================================================

PRAGMA foreign_keys = ON;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,                       -- Prefix 'usr_' + UUID v4
    username TEXT NOT NULL COLLATE NOCASE,     -- Case-insensitive for login lookup
    kdf_salt TEXT NOT NULL,                    -- 16 bytes in Base64 format
    passkey_credential_id TEXT,                -- Optional FIDO2 credential ID
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    CONSTRAINT uq_users_username UNIQUE (username)
);

-- Fast lookup index for login queries
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Encrypted Vaults Table (Zero-Knowledge)
CREATE TABLE IF NOT EXISTS vaults (
    user_id TEXT PRIMARY KEY,                  -- Strict 1:1 relationship per user
    encrypted_blob TEXT NOT NULL,              -- Ciphertext in Base64
    iv TEXT NOT NULL,                          -- Initialization Vector (12 bytes Base64)
    version INTEGER NOT NULL DEFAULT 1,        -- Optimistic concurrency control version
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    CONSTRAINT fk_vaults_user FOREIGN KEY (user_id) 
        REFERENCES users(id) ON DELETE CASCADE
);

-- Versioning index for sync audit and concurrency verification
CREATE INDEX IF NOT EXISTS idx_vaults_user_version ON vaults(user_id, version);

-- Synchronization Audit Log Table (Lightweight log rotation)
CREATE TABLE IF NOT EXISTS sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,                      -- 'REGISTER', 'SYNC_PULL', 'SYNC_PUSH'
    client_version INTEGER,
    server_version INTEGER,
    ip_country TEXT,                           -- Derived from cf.country (no personal IP stored)
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    CONSTRAINT fk_synclogs_user FOREIGN KEY (user_id) 
        REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_synclogs_user_created ON sync_logs(user_id, created_at DESC);
