/**
 * Revolt Pass - Tipos canónicos del Dominio y Criptografía
 * Conforme a docs/02-ARCHITECTURE.md
 */

export interface RecoveryCode {
  code: string;
  used: boolean;
  created_at?: number;
}

export type TotpAlgorithm = 'SHA1' | 'SHA256';

export type VaultItemType = 'totp' | 'login' | 'note';

export interface VaultItem {
  id: string; // UUID v4
  type: VaultItemType;
  issuer: string;
  account: string;
  secret: string; // Base32 canónico
  digits: 6 | 8;
  period: number; // Intervalo de rotación en segundos (default 30)
  algorithm: TotpAlgorithm;
  recovery_codes?: RecoveryCode[];
  notes?: string;
  pinned?: boolean;
  tags?: string[];
  icon_url?: string; // URL externa o data URL (base64) del logo personalizado
  created_at: number;
  updated_at: number;
}

export interface DecryptedVault {
  version: number;
  items: VaultItem[];
  exported_at?: number;
}

export interface EncryptedVaultPayload {
  user_id: string;
  encrypted_blob: string; // Base64 de ciphertext + auth tag
  iv: string; // Base64 de 12 bytes
  version: number;
  updated_at: number;
}

export type SyncStatus = 'synced' | 'dirty' | 'syncing' | 'conflict' | 'error';

export interface LocalVaultRecord extends EncryptedVaultPayload {
  sync_status: SyncStatus;
  last_sync_attempt?: number;
  sync_error_message?: string;
}

export interface LocalUserConfig {
  user_id: string;
  username: string;
  kdf_salt: string;
  webauthn_credential_id?: string;
  wrapped_master_key?: string;
  auto_lock_minutes: number;
  clipboard_clear_seconds: number;
}

export interface ActiveSessionState {
  isUnlocked: boolean;
  masterKey: CryptoKey | null;
  timeDriftOffsetMs: number;
  lastActivityTimestamp: number;
}
