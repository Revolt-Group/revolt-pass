-- =====================================================================
-- ESQUEMA D1: REVOLT PASS DATABASE (schema.sql)
-- Versión: 1.0.0
-- Motor: Cloudflare D1 (SQLite Serverless)
-- =====================================================================

PRAGMA foreign_keys = ON;

-- Tabla de Usuarios
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,                       -- Prefijo 'usr_' + UUID v4
    username TEXT NOT NULL COLLATE NOCASE,     -- Case-insensitive para login
    kdf_salt TEXT NOT NULL,                    -- 16 bytes en formato Base64
    passkey_credential_id TEXT,                -- ID de credencial FIDO2 opcional
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    CONSTRAINT uq_users_username UNIQUE (username)
);

-- Índice para búsquedas ultrarrápidas de login
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Tabla de Bóvedas Cifradas (Zero-Knowledge)
CREATE TABLE IF NOT EXISTS vaults (
    user_id TEXT PRIMARY KEY,                  -- Relación 1:1 estricta por usuario
    encrypted_blob TEXT NOT NULL,              -- Ciphertext en Base64
    iv TEXT NOT NULL,                          -- Vector de Inicialización (12 bytes Base64)
    version INTEGER NOT NULL DEFAULT 1,        -- Control de concurrencia optimista
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    CONSTRAINT fk_vaults_user FOREIGN KEY (user_id) 
        REFERENCES users(id) ON DELETE CASCADE
);

-- Índice para control de versiones y auditoría de sincronización
CREATE INDEX IF NOT EXISTS idx_vaults_user_version ON vaults(user_id, version);

-- Tabla de Auditoría de Sincronización (Opcional / Rotación ligera)
CREATE TABLE IF NOT EXISTS sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,                      -- 'REGISTER', 'SYNC_PULL', 'SYNC_PUSH'
    client_version INTEGER,
    server_version INTEGER,
    ip_country TEXT,                           -- Obtenido de cf.country (sin almacenar IP personal)
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    CONSTRAINT fk_synclogs_user FOREIGN KEY (user_id) 
        REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_synclogs_user_created ON sync_logs(user_id, created_at DESC);
