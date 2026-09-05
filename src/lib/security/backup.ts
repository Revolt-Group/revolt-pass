/**
 * Cryptographic Backup and Migration Module (Backup & Restore)
 *
 * Provides vault export in two variants:
 * 1. Encrypted Backup (Recommended): Symmetric AES-256-GCM encryption with current Master Key.
 *    Fully safe for storage in cloud, USB, or local disk.
 * 2. Plaintext Backup: Human-readable JSON export with risk confirmation for migration
 *    to other managers or cold storage in air-gapped environments.
 *
 * Provides import with comprehensive schema validation and reconciliation (merge or replace).
 */

import type { VaultItem } from '../../types/vault';
import { encryptVault, decryptVault } from '../crypto/vault';

export interface EncryptedBackupPayload {
  format: 'revolt-pass-backup-encrypted';
  version: number;
  salt: string;
  iv: string;
  encryptedBlob: string;
  exported_at: string;
  item_count: number;
}

export interface PlaintextBackupPayload {
  format: 'revolt-pass-backup-plaintext';
  version: number;
  exported_at: string;
  items: VaultItem[];
}

/**
 * Exports vault in an AES-GCM-256 encrypted package.
 */
export async function exportEncryptedBackup(
  items: VaultItem[],
  masterKey: CryptoKey,
  salt: string,
  version = 1
): Promise<string> {
  const encResult = await encryptVault(items, masterKey, version);

  const payload: EncryptedBackupPayload = {
    format: 'revolt-pass-backup-encrypted',
    version,
    salt,
    iv: encResult.iv,
    encryptedBlob: encResult.encryptedBlob,
    exported_at: new Date().toISOString(),
    item_count: items.length,
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Exports vault in plaintext JSON format.
 */
export function exportPlaintextBackup(items: VaultItem[], version = 1): string {
  const payload: PlaintextBackupPayload = {
    format: 'revolt-pass-backup-plaintext',
    version,
    exported_at: new Date().toISOString(),
    items,
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Detects the format of a backup file.
 */
export function detectBackupFormat(jsonString: string): 'encrypted' | 'plaintext' | 'invalid' {
  try {
    const parsed = JSON.parse(jsonString);
    if (parsed && typeof parsed === 'object') {
      if (
        parsed.format === 'revolt-pass-backup-encrypted' &&
        parsed.encryptedBlob &&
        parsed.iv
      ) {
        return 'encrypted';
      }
      if (
        (parsed.format === 'revolt-pass-backup-plaintext' && Array.isArray(parsed.items)) ||
        Array.isArray(parsed.items) ||
        Array.isArray(parsed)
      ) {
        return 'plaintext';
      }
    }
  } catch {
    return 'invalid';
  }
  return 'invalid';
}

/**
 * Decrypts and imports an encrypted backup file.
 */
export async function importEncryptedBackup(
  jsonString: string,
  masterKey: CryptoKey
): Promise<VaultItem[]> {
  const parsed = JSON.parse(jsonString) as EncryptedBackupPayload;
  if (!parsed.encryptedBlob || !parsed.iv) {
    throw new Error('Invalid encrypted backup format: missing iv or encryptedBlob fields');
  }

  const decryptedItems = await decryptVault(parsed.encryptedBlob, parsed.iv, masterKey);
  validateItemsSchema(decryptedItems);
  return decryptedItems;
}

/**
 * Imports and validates a plaintext backup file.
 */
export function importPlaintextBackup(jsonString: string): VaultItem[] {
  const parsed = JSON.parse(jsonString);
  let itemsToValidate: VaultItem[];

  if (parsed.format === 'revolt-pass-backup-plaintext' && Array.isArray(parsed.items)) {
    itemsToValidate = parsed.items;
  } else if (Array.isArray(parsed.items)) {
    itemsToValidate = parsed.items;
  } else if (Array.isArray(parsed)) {
    itemsToValidate = parsed;
  } else {
    throw new Error('Unrecognized plaintext backup format');
  }

  validateItemsSchema(itemsToValidate);
  return itemsToValidate;
}

/**
 * Validates that data structure contains required VaultItem fields.
 */
export function validateItemsSchema(items: unknown): asserts items is VaultItem[] {
  if (!Array.isArray(items)) {
    throw new Error('Invalid vault structure: items must be an array');
  }

  for (let i = 0; i < items.length; i++) {
    const acc = items[i];
    if (!acc || typeof acc !== 'object') {
      throw new Error(`Invalid account #${i + 1}`);
    }
    if (!acc.id || !acc.issuer || !acc.secret) {
      throw new Error(`Incomplete account #${i + 1} (requires id, issuer, secret)`);
    }
  }
}

/**
 * Merges imported accounts with existing ones, updating duplicates if modification date is newer.
 */
export function mergeVaultItems(
  existingItems: VaultItem[],
  importedItems: VaultItem[]
): VaultItem[] {
  const itemMap = new Map<string, VaultItem>();

  // Load existing items
  for (const item of existingItems) {
    itemMap.set(item.id, item);
  }

  // Merge or insert imported items
  for (const item of importedItems) {
    if (itemMap.has(item.id)) {
      const existing = itemMap.get(item.id)!;
      const existingTime = existing.updated_at || 0;
      const importedTime = item.updated_at || 0;
      if (importedTime >= existingTime) {
        itemMap.set(item.id, item);
      }
    } else {
      itemMap.set(item.id, item);
    }
  }

  return Array.from(itemMap.values());
}

/**
 * Helper to trigger file download in browser.
 */
export function triggerFileDownload(content: string, filename: string, mimeType: string): void {
  if (typeof document === 'undefined') return;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
