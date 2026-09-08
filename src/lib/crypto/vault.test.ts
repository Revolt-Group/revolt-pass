import { describe, it, expect, beforeEach } from 'vitest';
import {
  encryptVault,
  decryptVault,
  bytesToBase64,
  base64ToBytes,
  generateIv,
  generateItemKey,
  wrapItemKey,
  unwrapItemKey,
  ensureVaultItemKeys,
  moveToTrash,
  restoreFromTrash,
  isTrashExpired,
  purgeExpiredTrash,
  recordPasswordHistory,
} from './vault.ts';
import { deriveMasterKeyDirect, generateSalt } from './kdf.ts';
import type { VaultItem } from '../../types/vault.ts';

describe('Vault Encryption and Decryption (AES-GCM-256 Zero-Knowledge)', () => {
  let masterKey: CryptoKey;
  let sampleItems: VaultItem[];

  beforeEach(async () => {
    const salt = generateSalt(16);
    masterKey = await deriveMasterKeyDirect('MySuperSecureMasterPassword123!#', salt, 5000);

    sampleItems = [
      {
        id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        type: 'totp',
        issuer: 'Revolt Cloud',
        account: 'admin@revoltgroup.com.ar',
        secret: 'JBSWY3DPEHPK3PXP',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        recovery_codes: [
          { code: 'REC-1234-5678', used: false },
          { code: 'REC-8765-4321', used: true },
        ],
        notes: 'Critical infrastructure key',
        pinned: true,
        tags: ['infra', 'cloud'],
        created_at: 1772719200000,
        updated_at: 1772719200000,
      },
      {
        id: '12345678-aaaa-bbbb-cccc-111122223333',
        type: 'totp',
        issuer: 'GitHub',
        account: 'revolt-dev',
        secret: 'KRSXG5CTMVRXEZLUKN2XAZLSK5SXEZKB',
        digits: 6,
        period: 30,
        algorithm: 'SHA256',
        created_at: 1772719300000,
        updated_at: 1772719300000,
      },
    ];
  });

  it('encrypts and decrypts vault identically (Roundtrip Test)', async () => {
    const result = await encryptVault(sampleItems, masterKey, 1);

    expect(result.encryptedBlob).toBeDefined();
    expect(result.iv).toBeDefined();
    expect(result.version).toBe(1);

    const decrypted = await decryptVault(result.encryptedBlob, result.iv, masterKey);

    expect(decrypted).toHaveLength(2);
    expect(decrypted[0].issuer).toBe('Revolt Cloud');
    expect(decrypted[0].account).toBe('admin@revoltgroup.com.ar');
    expect(decrypted[0].recovery_codes).toHaveLength(2);
    expect(decrypted[0].recovery_codes?.[0].code).toBe('REC-1234-5678');
    expect(decrypted[0].recovery_codes?.[1].used).toBe(true);
    expect(decrypted[1].issuer).toBe('GitHub');
    expect(decrypted[1].algorithm).toBe('SHA256');
  });

  it('generates distinct random IVs on each consecutive encryption (IV reuse immunity)', async () => {
    const itemsWithKeys = await ensureVaultItemKeys(sampleItems, masterKey);
    const enc1 = await encryptVault(itemsWithKeys, masterKey, 1);
    const enc2 = await encryptVault(itemsWithKeys, masterKey, 1);

    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.encryptedBlob).not.toBe(enc2.encryptedBlob);

    // Both must decrypt correctly
    const dec1 = await decryptVault(enc1.encryptedBlob, enc1.iv, masterKey);
    const dec2 = await decryptVault(enc2.encryptedBlob, enc2.iv, masterKey);

    expect(dec1).toEqual(dec2);
  });

  it('deterministically fails with cryptographic error if even 1 bit is altered in ciphertext (Tampering Test)', async () => {
    const enc = await encryptVault(sampleItems, masterKey, 1);

    // Alter exactly 1 bit in encrypted blob (Auth Tag or Ciphertext)
    const rawBytes = base64ToBytes(enc.encryptedBlob);
    rawBytes[5] ^= 0x01; // Flip a single bit
    const tamperedBlob = bytesToBase64(rawBytes);

    // AES-GCM MUST fail to verify 128-bit authentication tag
    await expect(decryptVault(tamperedBlob, enc.iv, masterKey)).rejects.toThrow();
  });

  it('fails if initialization vector (IV) is altered', async () => {
    const enc = await encryptVault(sampleItems, masterKey, 1);

    const ivBytes = base64ToBytes(enc.iv);
    ivBytes[0] ^= 0x01; // Flip a bit of IV
    const tamperedIv = bytesToBase64(ivBytes);

    await expect(decryptVault(enc.encryptedBlob, tamperedIv, masterKey)).rejects.toThrow();
  });

  it('fails if attempting to decrypt with incorrect key', async () => {
    const enc = await encryptVault(sampleItems, masterKey, 1);

    const wrongKey = await deriveMasterKeyDirect('CompletelyWrongPasswordHere', generateSalt(16), 5000);

    await expect(decryptVault(enc.encryptedBlob, enc.iv, wrongKey)).rejects.toThrow();
  });
});

describe('Polymorphic Secrets Taxonomy (Milestone v2.0)', () => {
  let masterKey: CryptoKey;

  beforeEach(async () => {
    const salt = generateSalt(16);
    masterKey = await deriveMasterKeyDirect('MasterSecret_v2.0!#$99', salt, 5000);
  });

  it('roundtrips all 6 polymorphic secret types without data loss', async () => {
    const polymorphicItems: VaultItem[] = [
      {
        id: '11111111-1111-4111-a111-111111111111',
        type: 'totp',
        issuer: 'Google',
        account: 'user@gmail.com',
        secret: 'JBSWY3DPEHPK3PXP',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        created_at: 1700000000000,
        updated_at: 1700000000000,
      },
      {
        id: '22222222-2222-4222-a222-222222222222',
        type: 'login',
        issuer: 'GitHub',
        account: 'octocat',
        secret: 'HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        login_data: {
          username: 'octocat',
          password: 'SuperComplexPassword2026!',
          urls: ['https://github.com', 'https://gist.github.com'],
          totp_seed: 'HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ',
          custom_fields: [{ id: 'cf-1', name: 'Organization PIN', value: '9876', is_secret: true }],
          password_history: [
            { password: 'OldPassword2025!', changed_at: 1690000000000 },
          ],
        },
        created_at: 1700000000000,
        updated_at: 1700000000000,
      },
      {
        id: '33333333-3333-4333-a333-333333333333',
        type: 'card',
        issuer: 'Santander Platinum',
        account: '•••• 4242',
        secret: '',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        card_data: {
          cardholder_name: 'IGNACIO ROJAS',
          card_number: '4242424242424242',
          brand: 'visa',
          exp_month: '12',
          exp_year: '2028',
          cvv: '123',
          pin: '9876',
          zip_code: '5500',
        },
        created_at: 1700000000000,
        updated_at: 1700000000000,
      },
      {
        id: '44444444-4444-4444-a444-444444444444',
        type: 'note',
        issuer: 'API Keys & Recovery Tokens',
        account: 'Nota segura',
        secret: '',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        note_data: {
          title: 'API Keys & Recovery Tokens',
          content_markdown: '## Production Credentials\n- AWS Root Token\n- Cloudflare Global API Key',
        },
        created_at: 1700000000000,
        updated_at: 1700000000000,
      },
      {
        id: '55555555-5555-4555-a555-555555555555',
        type: 'server_key',
        issuer: 'Bastion Host',
        account: 'root@10.0.0.1',
        secret: '',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        server_key_data: {
          host: '10.0.0.1',
          port: 2222,
          username: 'root',
          private_key: '-----BEGIN OPENSSH PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...',
          public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA...',
          passphrase: 'serverPassphrase123',
        },
        created_at: 1700000000000,
        updated_at: 1700000000000,
      },
      {
        id: '66666666-6666-4666-a666-666666666666',
        type: 'identity',
        issuer: 'Ignacio Rojas',
        account: 'DNI 40.123.456',
        secret: '',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        identity_data: {
          first_name: 'Ignacio',
          last_name: 'Rojas',
          id_number: '40123456',
          passport_number: 'PAS-ARG-987654',
          email: 'rojasignacio@example.com',
          phone: '+5492610000000',
        },
        created_at: 1700000000000,
        updated_at: 1700000000000,
      },
    ];

    const enc = await encryptVault(polymorphicItems, masterKey, 1);
    const dec = await decryptVault(enc.encryptedBlob, enc.iv, masterKey);

    expect(dec).toHaveLength(6);
    expect(dec[0].type).toBe('totp');
    expect(dec[1].type).toBe('login');
    expect(dec[1].login_data?.password).toBe('SuperComplexPassword2026!');
    expect(dec[1].login_data?.urls).toContain('https://github.com');
    expect(dec[2].type).toBe('card');
    expect(dec[2].card_data?.card_number).toBe('4242424242424242');
    expect(dec[3].type).toBe('note');
    expect(dec[3].note_data?.content_markdown).toContain('Production Credentials');
    expect(dec[4].type).toBe('server_key');
    expect(dec[4].server_key_data?.port).toBe(2222);
    expect(dec[5].type).toBe('identity');
    expect(dec[5].identity_data?.passport_number).toBe('PAS-ARG-987654');

    // Verify each item was assigned an encrypted_key
    for (const item of dec) {
      expect(item.encrypted_key).toBeDefined();
      expect(item.encrypted_key).toContain(':');
    }
  });

  it('seamlessly decrypts and normalizes legacy v1.x vaults (Backwards Compatibility)', async () => {
    // Simulate legacy raw payload without type, name, folder_id, or encrypted_key
    const legacyRawPayload = {
      version: 1,
      items: [
        {
          id: 'legacy-item-1',
          issuer: 'Legacy AWS',
          account: 'admin',
          secret: 'JBSWY3DPEHPK3PXP',
          digits: 6,
          period: 30,
          algorithm: 'SHA1',
        },
      ],
      exported_at: 1680000000000,
    };

    const encoder = new TextEncoder();
    const plaintext = encoder.encode(JSON.stringify(legacyRawPayload));
    const iv = generateIv();

    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer, tagLength: 128 },
      masterKey,
      plaintext as unknown as ArrayBuffer
    );

    const encBlob = bytesToBase64(new Uint8Array(ciphertextBuffer));
    const ivStr = bytesToBase64(iv);

    const decrypted = await decryptVault(encBlob, ivStr, masterKey);
    expect(decrypted).toHaveLength(1);
    expect(decrypted[0].id).toBe('legacy-item-1');
    expect(decrypted[0].type).toBe('totp'); // Default assigned
    expect(decrypted[0].issuer).toBe('Legacy AWS');
    expect(decrypted[0].deleted_at).toBeNull();
    expect(decrypted[0].tags).toEqual([]);
  });
});

describe('Per-Item Symmetric Key Wrapping (item_key & encrypted_key)', () => {
  let masterKey: CryptoKey;

  beforeEach(async () => {
    const salt = generateSalt(16);
    masterKey = await deriveMasterKeyDirect('ItemKeyTestPassword123!', salt, 5000);
  });

  it('generates, wraps, and unwraps itemKey correctly', async () => {
    const itemKey = await generateItemKey();
    expect(itemKey).toBeDefined();

    const wrappedKeyStr = await wrapItemKey(itemKey, masterKey);
    expect(wrappedKeyStr).toBeDefined();
    expect(wrappedKeyStr.split(':')).toHaveLength(2);

    const unwrappedKey = await unwrapItemKey(wrappedKeyStr, masterKey);
    expect(unwrappedKey).toBeDefined();

    // Verify unwrapped key can encrypt and decrypt data identically
    const testData = new TextEncoder().encode('ItemPayloadConfidential');
    const itemIv = generateIv();
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: itemIv as unknown as ArrayBuffer, tagLength: 128 },
      unwrappedKey,
      testData as unknown as ArrayBuffer
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: itemIv as unknown as ArrayBuffer, tagLength: 128 },
      itemKey,
      encrypted
    );
    expect(new TextDecoder().decode(decrypted)).toBe('ItemPayloadConfidential');
  });

  it('fails to unwrap item key when using wrong master key', async () => {
    const itemKey = await generateItemKey();
    const wrappedKeyStr = await wrapItemKey(itemKey, masterKey);

    const wrongKey = await deriveMasterKeyDirect('WrongMasterPassword999!', generateSalt(16), 5000);
    await expect(unwrapItemKey(wrappedKeyStr, wrongKey)).rejects.toThrow();
  });
});

describe('Trash Bin Lifecycle & Auto-Purge (Milestone v2.0)', () => {
  it('marks item as deleted with timestamp when moved to trash', () => {
    const item: VaultItem = {
      id: 'trash-item-1',
      type: 'login',
      issuer: 'Discarded Site',
      account: 'test@example.com',
      secret: '',
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
      created_at: 1000,
      updated_at: 1000,
    };

    const trashed = moveToTrash(item, 5000);
    expect(trashed.deleted_at).toBe(5000);
    expect(trashed.updated_at).toBe(5000);

    const restored = restoreFromTrash(trashed, 6000);
    expect(restored.deleted_at).toBeNull();
    expect(restored.updated_at).toBe(6000);
  });

  it('identifies expired trash and automatically purges items older than 30 days', () => {
    const now = 100_000_000_000;
    const thirtyOneDaysMs = 31 * 24 * 60 * 60 * 1000;
    const tenDaysMs = 10 * 24 * 60 * 60 * 1000;

    const activeItem: VaultItem = {
      id: 'active-1',
      type: 'totp',
      issuer: 'Active Service',
      account: 'user',
      secret: 'SECRET',
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
      created_at: now - 10000,
      updated_at: now - 10000,
      deleted_at: null,
    };

    const freshTrashItem: VaultItem = {
      id: 'trash-recent',
      type: 'login',
      issuer: 'Recent Trash',
      account: 'user',
      secret: '',
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
      created_at: now - twentyDaysMs(now),
      updated_at: now - tenDaysMs,
      deleted_at: now - tenDaysMs, // Deleted 10 days ago (retained)
    };

    const expiredTrashItem: VaultItem = {
      id: 'trash-expired',
      type: 'note',
      issuer: 'Expired Note',
      account: '',
      secret: '',
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
      created_at: now - fortyDaysMs(now),
      updated_at: now - thirtyOneDaysMs,
      deleted_at: now - thirtyOneDaysMs, // Deleted 31 days ago (purged!)
    };

    function twentyDaysMs(_: number) { return 20 * 24 * 60 * 60 * 1000; }
    function fortyDaysMs(_: number) { return 40 * 24 * 60 * 60 * 1000; }

    expect(isTrashExpired(activeItem, undefined, now)).toBe(false);
    expect(isTrashExpired(freshTrashItem, undefined, now)).toBe(false);
    expect(isTrashExpired(expiredTrashItem, undefined, now)).toBe(true);

    const purged = purgeExpiredTrash([activeItem, freshTrashItem, expiredTrashItem], undefined, now);
    expect(purged).toHaveLength(2);
    expect(purged.map((i) => i.id)).toEqual(['active-1', 'trash-recent']);
  });
});

describe('Password History Management (Milestone v2.0)', () => {
  it('records previous passwords up to maximum 5 entries and avoids duplicate immediate repeats', () => {
    let loginData = {
      username: 'developer',
      password: 'CurrentPassword2026!',
    };

    // Change 1
    loginData = recordPasswordHistory(loginData, 'Password_1', 5, 1000);
    expect(loginData.password_history).toHaveLength(1);
    expect(loginData.password_history?.[0].password).toBe('Password_1');

    // Duplicate change attempt of same password should be ignored
    loginData = recordPasswordHistory(loginData, 'Password_1', 5, 2000);
    expect(loginData.password_history).toHaveLength(1);

    // Changes 2 to 6
    loginData = recordPasswordHistory(loginData, 'Password_2', 5, 3000);
    loginData = recordPasswordHistory(loginData, 'Password_3', 5, 4000);
    loginData = recordPasswordHistory(loginData, 'Password_4', 5, 5000);
    loginData = recordPasswordHistory(loginData, 'Password_5', 5, 6000);
    loginData = recordPasswordHistory(loginData, 'Password_6', 5, 7000);

    // Strictly capped at 5 entries, latest first
    expect(loginData.password_history).toHaveLength(5);
    expect(loginData.password_history?.map((e) => e.password)).toEqual([
      'Password_6',
      'Password_5',
      'Password_4',
      'Password_3',
      'Password_2',
    ]);
  });
});
