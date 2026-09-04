import { describe, it, expect } from 'vitest';
import {
  exportEncryptedBackup,
  exportPlaintextBackup,
  detectBackupFormat,
  importEncryptedBackup,
  importPlaintextBackup,
  mergeVaultItems,
} from './backup';
import { deriveMasterKey, generateSalt } from '../crypto/kdf';
import type { VaultItem } from '../../types/vault';

const mockItems: VaultItem[] = [
  {
    id: 'acc-1',
    type: 'totp',
    issuer: 'GitHub',
    account: 'octocat@github.com',
    secret: 'JBSWY3DPEHPK3PXP',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    tags: ['dev'],
    pinned: true,
    recovery_codes: [{ code: 'REC-1111-2222', used: false }, { code: 'REC-3333-4444', used: false }],
    created_at: 1700000000,
    updated_at: 1700000000,
  },
  {
    id: 'acc-2',
    type: 'totp',
    issuer: 'Google',
    account: 'user@gmail.com',
    secret: 'KRUGS4ZANFZSAYJA',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    tags: ['personal'],
    pinned: false,
    recovery_codes: [],
    created_at: 1700001000,
    updated_at: 1700001000,
  },
];

describe('backup module', () => {
  it('exports and imports encrypted backup with AES-GCM-256 successfully', async () => {
    const salt = generateSalt();
    const saltBase64 = btoa(String.fromCharCode(...salt));
    const masterKey = await deriveMasterKey('TestMasterPassword123!', salt, 1000);

    const encryptedJson = await exportEncryptedBackup(mockItems, masterKey, saltBase64);
    expect(detectBackupFormat(encryptedJson)).toBe('encrypted');

    const restoredItems = await importEncryptedBackup(encryptedJson, masterKey);
    expect(restoredItems.length).toBe(2);
    expect(restoredItems[0].issuer).toBe('GitHub');
    expect(restoredItems[0].recovery_codes).toEqual([
      { code: 'REC-1111-2222', used: false },
      { code: 'REC-3333-4444', used: false },
    ]);
    expect(restoredItems[1].issuer).toBe('Google');
  });

  it('fails to decrypt encrypted backup with wrong master key', async () => {
    const salt = generateSalt();
    const saltBase64 = btoa(String.fromCharCode(...salt));
    const keyA = await deriveMasterKey('PasswordA', salt, 1000);
    const keyB = await deriveMasterKey('PasswordB', salt, 1000);

    const encryptedJson = await exportEncryptedBackup(mockItems, keyA, saltBase64);
    await expect(importEncryptedBackup(encryptedJson, keyB)).rejects.toThrow();
  });

  it('exports and imports plaintext backup', () => {
    const plaintextJson = exportPlaintextBackup(mockItems);
    expect(detectBackupFormat(plaintextJson)).toBe('plaintext');

    const restoredItems = importPlaintextBackup(plaintextJson);
    expect(restoredItems.length).toBe(2);
    expect(restoredItems[0].secret).toBe('JBSWY3DPEHPK3PXP');
  });

  it('correctly merges existing items with imported items', () => {
    const importedItems: VaultItem[] = [
      {
        id: 'acc-2', // Same ID as Google, but updated
        type: 'totp',
        issuer: 'Google Workspace',
        account: 'user@revoltgroup.com.ar',
        secret: 'KRUGS4ZANFZSAYJA',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        tags: ['work'],
        pinned: true,
        recovery_codes: [{ code: 'REC-GOOGLE-999', used: false }],
        created_at: 1700001000,
        updated_at: 1700005000, // Newer timestamp
      },
      {
        id: 'acc-3', // New account
        type: 'totp',
        issuer: 'Cloudflare',
        account: 'admin@revoltgroup.com.ar',
        secret: 'JBSWY3DPEHPK3PXQ',
        algorithm: 'SHA256',
        digits: 6,
        period: 30,
        tags: ['infra'],
        pinned: false,
        recovery_codes: [],
        created_at: 1700003000,
        updated_at: 1700003000,
      },
    ];

    const merged = mergeVaultItems(mockItems, importedItems);
    expect(merged.length).toBe(3); // GitHub, Google (updated), Cloudflare
    const google = merged.find((a) => a.id === 'acc-2')!;
    expect(google.issuer).toBe('Google Workspace');
    expect(google.recovery_codes).toEqual([{ code: 'REC-GOOGLE-999', used: false }]);
  });
});
