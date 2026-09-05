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

-- =====================================================================
-- SESSIONS & DEVICE REGISTRY (v1.1)
-- =====================================================================

-- Active Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,                       -- Prefix 'ses_' + UUID v4
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,           -- SHA-256 hash of client session token
    device_name TEXT NOT NULL,                 -- e.g. "Windows 11 · Chrome", "iPhone · Safari"
    user_agent TEXT,
    ip_country TEXT,                           -- Derived from cf.country
    last_active_at INTEGER NOT NULL DEFAULT (unixepoch()),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at INTEGER NOT NULL,               -- Session expiration unixepoch timestamp
    is_revoked INTEGER DEFAULT 0,              -- 0 = active, 1 = revoked
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) 
        REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, is_revoked, expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);

-- Passkeys Registry Table
CREATE TABLE IF NOT EXISTS passkeys (
    id TEXT PRIMARY KEY,                       -- Credential ID in Base64URL
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,                        -- User-defined label, e.g. "Windows Hello (PC Personal)"
    device_name TEXT,                          -- Human-readable device string
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_used_at INTEGER,
    is_revoked INTEGER DEFAULT 0,              -- 0 = active, 1 = revoked
    CONSTRAINT fk_passkeys_user FOREIGN KEY (user_id) 
        REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkeys(user_id, is_revoked);

-- Security Event Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,                  -- 'LOGIN', 'REGISTER', 'VAULT_SYNC', 'SESSION_REVOKED', 'PASSKEY_ADDED', 'PASSKEY_REVOKED'
    device_name TEXT,
    ip_country TEXT,
    metadata TEXT,                             -- Contextual JSON payload
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) 
        REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_logs(user_id, created_at DESC);

