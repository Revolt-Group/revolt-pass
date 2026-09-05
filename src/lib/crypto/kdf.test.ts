import { describe, it, expect } from 'vitest';
import { generateSalt, deriveMasterKeyDirect, deriveMasterKey } from './kdf.ts';

describe('Master Key Derivation (PBKDF2-HMAC-SHA256)', () => {
  it('generates non-repeating 16-byte cryptographic salts', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();

    expect(salt1).toHaveLength(16);
    expect(salt2).toHaveLength(16);
    expect(salt1).not.toEqual(salt2);
  });

  it('derives consistent 256-bit AES-GCM CryptoKey', async () => {
    const salt = generateSalt(16);
    const password = 'TestSecurePassword!2026';

    // Use 1,000 iterations for fast unit tests
    const key1 = await deriveMasterKeyDirect(password, salt, 1000);
    const key2 = await deriveMasterKeyDirect(password, salt, 1000);

    expect(key1.algorithm.name).toBe('AES-GCM');
    expect((key1.algorithm as AesKeyGenParams).length).toBe(256);
    expect(key1.type).toBe('secret');

    // Verify both keys derived from same salt and password are functionally identical
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode('Confidential Data');

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key1,
      plaintext
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key2,
      encrypted
    );

    expect(new TextDecoder().decode(decrypted)).toBe('Confidential Data');
  });

  it('generates completely distinct keys if salt differs', async () => {
    const saltA = generateSalt(16);
    const saltB = generateSalt(16);
    const password = 'SamePassword123!';

    const keyA = await deriveMasterKeyDirect(password, saltA, 1000);
    const keyB = await deriveMasterKeyDirect(password, saltB, 1000);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode('Isolation Test');

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      keyA,
      plaintext
    );

    // keyB must fail when attempting to decrypt data encrypted with keyA
    await expect(
      crypto.subtle.decrypt({ name: 'AES-GCM', iv }, keyB, encrypted)
    ).rejects.toThrow();
  });

  it('works through the main deriveMasterKey wrapper', async () => {
    const salt = generateSalt(16);
    const key = await deriveMasterKey('PasswordWrapperTest!99', salt, 1000);

    expect(key.algorithm.name).toBe('AES-GCM');
    expect(key.type).toBe('secret');
  });
});
