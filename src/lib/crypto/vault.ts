/**
 * Zero-Knowledge Vault Encryption and Decryption Module.
 * Uses 256-bit AES-GCM with fresh 12-byte IV and 128-bit authentication tag.
 */

import type { VaultItem, DecryptedVault } from '../../types/vault.ts';

export const AES_GCM_IV_LENGTH_BYTES = 12; // 96 bits
export const AES_GCM_TAG_LENGTH_BITS = 128; // 128 bits
export const DEFAULT_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const MAX_PASSWORD_HISTORY_LENGTH = 5;

/**
 * Safely converts a Uint8Array into a standard Base64 string in memory.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a standard Base64 string into a Uint8Array of bytes.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates a fresh, cryptographically random 12-byte initialization vector (IV).
 * IMMUTABLE RULE: Never reuse an IV with the same key in AES-GCM.
 */
export function generateIv(): Uint8Array {
  const iv = new Uint8Array(AES_GCM_IV_LENGTH_BYTES);
  crypto.getRandomValues(iv);
  return iv;
}

/**
 * Generates a fresh, cryptographically random 256-bit AES-GCM key for an individual item.
 */
export async function generateItemKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encapsulates an individual item's symmetric key under the user's master key
 * using AES-GCM-256 with a unique IV and 128-bit authentication tag.
 * 
 * Returns serialized format: `${ivBase64}:${wrappedCiphertextBase64}`
 */
export async function wrapItemKey(
  itemKey: CryptoKey,
  masterKey: CryptoKey
): Promise<string> {
  const iv = generateIv();
  const rawKey = await crypto.subtle.exportKey('raw', itemKey);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as ArrayBuffer,
      tagLength: AES_GCM_TAG_LENGTH_BITS,
    },
    masterKey,
    rawKey
  );

  const ivBase64 = bytesToBase64(iv);
  const wrappedBase64 = bytesToBase64(new Uint8Array(ciphertextBuffer));
  return `${ivBase64}:${wrappedBase64}`;
}

/**
 * Unwraps an item's encrypted key using the user's master key.
 * Validates integrity via 128-bit authentication tag.
 */
export async function unwrapItemKey(
  encryptedKey: string,
  masterKey: CryptoKey
): Promise<CryptoKey> {
  const delimiterIdx = encryptedKey.indexOf(':');
  if (delimiterIdx === -1) {
    throw new Error('Invalid wrapped item key format: expected "iv:ciphertext"');
  }

  const ivBase64 = encryptedKey.slice(0, delimiterIdx);
  const ciphertextBase64 = encryptedKey.slice(delimiterIdx + 1);

  const ivBytes = base64ToBytes(ivBase64);
  const ciphertextBytes = base64ToBytes(ciphertextBase64);

  if (ivBytes.length !== AES_GCM_IV_LENGTH_BYTES) {
    throw new Error(`Invalid item key IV length: ${ivBytes.length} bytes (12 bytes required)`);
  }

  const rawKeyBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes as unknown as ArrayBuffer,
      tagLength: AES_GCM_TAG_LENGTH_BITS,
    },
    masterKey,
    ciphertextBytes as unknown as ArrayBuffer
  );

  return crypto.subtle.importKey(
    'raw',
    rawKeyBuffer,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Ensures that a VaultItem has a valid per-item encrypted_key wrapped with the master key.
 * If the item already has an encrypted_key, it is preserved without re-wrapping.
 */
export async function ensureItemKey(
  item: VaultItem,
  masterKey: CryptoKey
): Promise<VaultItem> {
  if (item.encrypted_key) {
    return item;
  }
  const itemKey = await generateItemKey();
  const encryptedKey = await wrapItemKey(itemKey, masterKey);
  return {
    ...item,
    encrypted_key: encryptedKey,
  };
}

/**
 * Ensures all items in a vault collection have per-item encrypted keys.
 */
export async function ensureVaultItemKeys(
  items: VaultItem[],
  masterKey: CryptoKey
): Promise<VaultItem[]> {
  return Promise.all(items.map((item) => ensureItemKey(item, masterKey)));
}

/**
 * Evaluates whether a deleted item has exceeded the trash retention window (default: 30 days).
 */
export function isTrashExpired(
  item: VaultItem,
  maxAgeMs = DEFAULT_TRASH_RETENTION_MS,
  now = Date.now()
): boolean {
  if (typeof item.deleted_at !== 'number') {
    return false;
  }
  return now - item.deleted_at > maxAgeMs;
}

/**
 * Filters out items whose deletion timestamp exceeds the trash retention period (default: 30 days).
 */
export function purgeExpiredTrash(
  items: VaultItem[],
  maxAgeMs = DEFAULT_TRASH_RETENTION_MS,
  now = Date.now()
): VaultItem[] {
  return items.filter((item) => !isTrashExpired(item, maxAgeMs, now));
}

/**
 * Soft-deletes a vault item by assigning the current timestamp to deleted_at.
 */
export function moveToTrash(item: VaultItem, now = Date.now()): VaultItem {
  return {
    ...item,
    deleted_at: now,
    updated_at: now,
  };
}

/**
 * Restores a soft-deleted vault item back into the active vault.
 */
export function restoreFromTrash(item: VaultItem, now = Date.now()): VaultItem {
  return {
    ...item,
    deleted_at: null,
    updated_at: now,
  };
}

/**
 * Appends a previous password to the item's password history (max 5 entries).
 * Prevents redundant consecutive duplicates.
 */
export function recordPasswordHistory(
  loginData: NonNullable<VaultItem['login_data']>,
  oldPassword?: string,
  maxHistory = MAX_PASSWORD_HISTORY_LENGTH,
  now = Date.now()
): NonNullable<VaultItem['login_data']> {
  if (!oldPassword || !oldPassword.trim()) {
    return loginData;
  }

  const currentHistory = loginData.password_history ? [...loginData.password_history] : [];
  if (currentHistory.length > 0 && currentHistory[0].password === oldPassword) {
    return loginData;
  }

  const updatedHistory = [
    { password: oldPassword, changed_at: now },
    ...currentHistory,
  ].slice(0, maxHistory);

  return {
    ...loginData,
    password_history: updatedHistory,
  };
}

/**
 * Normalizes an arbitrary item (from v1.0-v1.5 or partial data) to the canonical v2.0 VaultItem structure.
 */
export function normalizeVaultItem(rawItem: Partial<VaultItem>): VaultItem {
  const now = Date.now();
  return {
    id: rawItem.id || (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `item_${now}_${Math.random().toString(36).slice(2, 9)}`),
    type: rawItem.type || 'totp',
    name: rawItem.name,
    issuer: rawItem.issuer || '',
    account: rawItem.account || '',
    secret: rawItem.secret || '',
    digits: rawItem.digits === 8 ? 8 : 6,
    period: typeof rawItem.period === 'number' && rawItem.period > 0 ? rawItem.period : 30,
    algorithm: rawItem.algorithm === 'SHA256' ? 'SHA256' : 'SHA1',
    recovery_codes: rawItem.recovery_codes,
    login_data: rawItem.login_data,
    card_data: rawItem.card_data,
    note_data: rawItem.note_data,
    server_key_data: rawItem.server_key_data,
    identity_data: rawItem.identity_data,
    folder_id: rawItem.folder_id,
    deleted_at: typeof rawItem.deleted_at === 'number' ? rawItem.deleted_at : null,
    encrypted_key: rawItem.encrypted_key,
    notes: rawItem.notes,
    pinned: Boolean(rawItem.pinned),
    tags: Array.isArray(rawItem.tags) ? rawItem.tags : [],
    icon_url: rawItem.icon_url,
    created_at: typeof rawItem.created_at === 'number' ? rawItem.created_at : now,
    updated_at: typeof rawItem.updated_at === 'number' ? rawItem.updated_at : now,
  };
}

export interface EncryptedVaultResult {
  encryptedBlob: string; // Base64 ciphertext + authentication tag
  iv: string; // Base64 12-byte IV
  version: number;
  updatedAt: number; // Unix timestamp in seconds
}

/**
 * Encrypts the entire collection of vault items using AES-GCM-256.
 * Guarantees per-item key encapsulation, data normalization, and auto-purge of expired trash.
 * 
 * @param items List of accounts and secrets to encrypt
 * @param masterKey Symmetric AES-GCM CryptoKey derived previously
 * @param version Vault version number for optimistic concurrency control
 * @returns Object containing encrypted blob and Base64-encoded IV
 */
export async function encryptVault(
  items: VaultItem[],
  masterKey: CryptoKey,
  version = 1
): Promise<EncryptedVaultResult> {
  const normalized = items.map(normalizeVaultItem);
  const activeAndFreshItems = purgeExpiredTrash(normalized);
  const itemsWithKeys = await ensureVaultItemKeys(activeAndFreshItems, masterKey);

  const payload: DecryptedVault = {
    version,
    items: itemsWithKeys,
    exported_at: Date.now(),
  };

  const jsonString = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(jsonString);

  // Generate fresh unique IV for this operation
  const iv = generateIv();

  // Encrypt with AES-GCM and 128-bit tag
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as ArrayBuffer,
      tagLength: AES_GCM_TAG_LENGTH_BITS,
    },
    masterKey,
    plaintextBytes as unknown as ArrayBuffer
  );

  const ciphertextBytes = new Uint8Array(ciphertextBuffer);

  return {
    encryptedBlob: bytesToBase64(ciphertextBytes),
    iv: bytesToBase64(iv),
    version,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Decrypts vault blob and validates its integrity and JSON structure.
 * Normalizes all items (guaranteeing backwards compatibility with v1.x)
 * and purges trash items older than 30 days.
 * 
 * @param encryptedBlobBase64 Base64 ciphertext + auth tag
 * @param ivBase64 Base64 12-byte initialization vector
 * @param masterKey Symmetric AES-GCM CryptoKey
 * @returns List of normalized decrypted items
 * @throws OperationError if ciphertext or IV were tampered with, or key is invalid
 */
export async function decryptVault(
  encryptedBlobBase64: string,
  ivBase64: string,
  masterKey: CryptoKey
): Promise<VaultItem[]> {
  const ciphertextBytes = base64ToBytes(encryptedBlobBase64);
  const ivBytes = base64ToBytes(ivBase64);

  if (ivBytes.length !== AES_GCM_IV_LENGTH_BYTES) {
    throw new Error(`Invalid IV length: ${ivBytes.length} bytes (12 bytes required)`);
  }

  // Decrypt with Web Crypto API. If even 1 bit was tampered with, subtle.decrypt throws OperationError
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes as unknown as ArrayBuffer,
      tagLength: AES_GCM_TAG_LENGTH_BITS,
    },
    masterKey,
    ciphertextBytes as unknown as ArrayBuffer
  );

  const decoder = new TextDecoder();
  const jsonString = decoder.decode(decryptedBuffer);

  const parsed = JSON.parse(jsonString) as DecryptedVault | Partial<VaultItem>[];

  let rawList: Partial<VaultItem>[];
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (parsed && Array.isArray(parsed.items)) {
    rawList = parsed.items;
  } else {
    throw new Error('Unrecognized vault structure following decryption');
  }

  const normalized = rawList.map(normalizeVaultItem);
  return purgeExpiredTrash(normalized);
}
