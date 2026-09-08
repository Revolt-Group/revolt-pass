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

describe('Master Key Derivation (Argon2id WASM)', () => {
  it('derives consistent 256-bit AES-GCM CryptoKey using Argon2id', async () => {
    const salt = generateSalt(16);
    const password = 'Argon2idSecurePassword!2026';

    // Use smaller memorySize for quick unit test execution
    const options = { algorithm: 'argon2id' as const, iterations: 2, memorySize: 4096 };
    const key1 = await deriveMasterKeyDirect(password, salt, options);
    const key2 = await deriveMasterKeyDirect(password, salt, options);

    expect(key1.algorithm.name).toBe('AES-GCM');
    expect((key1.algorithm as AesKeyGenParams).length).toBe(256);
    expect(key1.type).toBe('secret');

    // Test encryption and decryption roundtrip
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode('Argon2id Protected Secret');

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

    expect(new TextDecoder().decode(decrypted)).toBe('Argon2id Protected Secret');
  });

  it('generates distinct keys with different salts in Argon2id', async () => {
    const saltA = generateSalt(16);
    const saltB = generateSalt(16);
    const password = 'ArgonPassword123!';
    const options = { algorithm: 'argon2id' as const, iterations: 2, memorySize: 4096 };

    const keyA = await deriveMasterKeyDirect(password, saltA, options);
    const keyB = await deriveMasterKeyDirect(password, saltB, options);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode('Salt Isolation Test');

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      keyA,
      plaintext
    );

    await expect(
      crypto.subtle.decrypt({ name: 'AES-GCM', iv }, keyB, encrypted)
    ).rejects.toThrow();
  });

  it('produces completely distinct keys between PBKDF2 and Argon2id for the same password and salt', async () => {
    const salt = generateSalt(16);
    const password = 'IdenticalPassword!2026';

    const pbkdf2Key = await deriveMasterKeyDirect(password, salt, 1000);
    const argonKey = await deriveMasterKeyDirect(password, salt, {
      algorithm: 'argon2id',
      iterations: 2,
      memorySize: 4096,
    });

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode('Cross Algorithm Test');

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      pbkdf2Key,
      plaintext
    );

    // Argon2id key must NOT decrypt PBKDF2 ciphertext
    await expect(
      crypto.subtle.decrypt({ name: 'AES-GCM', iv }, argonKey, encrypted)
    ).rejects.toThrow();
  });

  it('works through main deriveMasterKey wrapper with Argon2id options', async () => {
    const salt = generateSalt(16);
    const key = await deriveMasterKey('ArgonWrapperTest!99', salt, {
      algorithm: 'argon2id',
      iterations: 1,
      memorySize: 2048,
    });

    expect(key.algorithm.name).toBe('AES-GCM');
    expect(key.type).toBe('secret');
  });
});

