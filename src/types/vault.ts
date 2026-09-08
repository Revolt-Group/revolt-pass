/**
 * Revolt Pass - Canonical Domain & Cryptography Types
 * In accordance with docs/es/02-ARCHITECTURE.md / docs/en/02-ARCHITECTURE.md
 */

export interface RecoveryCode {
  code: string;
  used: boolean;
  created_at?: number;
}

export type TotpAlgorithm = 'SHA1' | 'SHA256';

export type VaultItemType = 'totp' | 'login' | 'card' | 'note' | 'server_key' | 'identity';

export interface PasswordHistoryEntry {
  password: string;
  changed_at: number; // Unix timestamp in ms
}

export interface CustomField {
  id: string;
  name: string;
  value: string;
  is_secret?: boolean;
}

export interface LoginItemData {
  username?: string;
  password?: string;
  urls?: string[];
  totp_seed?: string; // Inline 2FA seed (Base32)
  custom_fields?: CustomField[];
  password_history?: PasswordHistoryEntry[]; // Max 5 previous passwords
}

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'other';

export interface CardItemData {
  cardholder_name?: string;
  card_number?: string;
  brand?: CardBrand;
  exp_month?: string; // '01'-'12'
  exp_year?: string; // '26'-'99' or '2026'
  cvv?: string;
  pin?: string;
  zip_code?: string;
}

export interface NoteItemData {
  title?: string;
  content_markdown?: string;
}

export interface ServerKeyItemData {
  host?: string;
  port?: number;
  username?: string;
  private_key?: string;
  public_key?: string;
  passphrase?: string;
  api_token?: string;
}

export interface IdentityItemData {
  first_name?: string;
  last_name?: string;
  id_number?: string;
  passport_number?: string;
  license_number?: string;
  birthdate?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface VaultItem {
  id: string; // UUID v4
  type: VaultItemType;
  name?: string;
  issuer: string;
  account: string;
  secret: string; // Canonical Base32 (empty string '' for non-TOTP items without 2FA)
  digits: 6 | 8;
  period: number; // Rotation interval in seconds (default: 30)
  algorithm: TotpAlgorithm;
  recovery_codes?: RecoveryCode[];

  // Polymorphic item payload data (Milestone v2.0)
  login_data?: LoginItemData;
  card_data?: CardItemData;
  note_data?: NoteItemData;
  server_key_data?: ServerKeyItemData;
  identity_data?: IdentityItemData;

  // Organization & Trash Bin (Milestone v2.0)
  folder_id?: string;
  deleted_at?: number | null; // Soft-delete timestamp in ms, or null/undefined if active

  // Per-item symmetric key wrapping (Milestone v2.0 & foundation for v2.5 ECDH sharing)
  encrypted_key?: string; // Base64 wrapped 256-bit AES-GCM item key with IV: "${ivBase64}:${ciphertextBase64}"

  notes?: string;
  pinned?: boolean;
  tags?: string[];
  icon_url?: string; // External URL or data URL (base64) for custom logo
  created_at: number;
  updated_at: number;
}

export interface VaultSnapshotInfo {
  id: number;
  user_id: string;
  vault_version: number;
  created_at: number;
}

export interface Folder {
  id: string;
  user_id: string;
  name: string;
  created_at: number;
}

export interface DecryptedVault {
  version: number;
  items: VaultItem[];
  exported_at?: number;
}

export interface EncryptedVaultPayload {
  user_id: string;
  encrypted_blob: string; // Base64 of ciphertext + auth tag
  iv: string; // Base64 of 12 bytes
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
  kdf_algorithm?: 'pbkdf2' | 'argon2id';
  session_token?: string;
  device_name?: string;
  passkey_name?: string;
  webauthn_credential_id?: string;
  wrapped_master_key?: string;
  auto_lock_minutes: number;
  clipboard_clear_seconds: number;
}

export interface SessionInfo {
  id: string;
  user_id: string;
  device_name: string;
  user_agent?: string;
  ip_country?: string;
  last_active_at: number;
  created_at: number;
  expires_at: number;
  is_revoked: number;
  is_current?: boolean;
}

export interface PasskeyInfo {
  id: string;
  user_id: string;
  name: string;
  device_name?: string;
  created_at: number;
  last_used_at?: number;
  is_revoked: number;
}

export interface AuditLogItem {
  id: number;
  user_id: string;
  event_type: string;
  device_name?: string;
  ip_country?: string;
  metadata?: string;
  created_at: number;
}

export interface ActiveSessionState {
  isUnlocked: boolean;
  masterKey: CryptoKey | null;
  timeDriftOffsetMs: number;
  lastActivityTimestamp: number;
}

