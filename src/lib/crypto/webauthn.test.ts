import { describe, it, expect } from 'vitest';
import { wrapMasterKey, unwrapMasterKey, checkWebAuthnSupport } from './webauthn.ts';
import { deriveMasterKeyDirect, generateSalt } from './kdf.ts';

describe('WebAuthn & Local Key Wrapping', () => {
  it('checks WebAuthn support without throwing exceptions in current environment', async () => {
    const status = await checkWebAuthnSupport();
    expect(status).toHaveProperty('isSupported');
    expect(status).toHaveProperty('hasPlatformAuthenticator');
  });

  it('wraps and unwraps MasterKey preserving cryptographic capability (Roundtrip Test)', async () => {
    const salt = generateSalt(16);
    const masterKey = await deriveMasterKeyDirect('OriginalPassword123!', salt, 1000);
    const deviceToken = 'cred_windows_hello_token_xyz_987';

    // 1. Wrap key
    const wrappedPackage = await wrapMasterKey(masterKey, deviceToken);

    expect(wrappedPackage.wrappedKey).toBeDefined();
    expect(wrappedPackage.iv).toBeDefined();
    expect(wrappedPackage.deviceSalt).toBeDefined();

    // 2. Unwrap key with same token
    const unwrappedKey = await unwrapMasterKey(wrappedPackage, deviceToken);

    expect(unwrappedKey.algorithm.name).toBe('AES-GCM');
    expect(unwrappedKey.type).toBe('secret');

    // 3. Prove unwrapped key can decrypt data encrypted with original
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode('Windows Hello Protected Data');

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      masterKey,
      plaintext
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      unwrappedKey,
      encrypted
    );

    expect(new TextDecoder().decode(decrypted)).toBe('Windows Hello Protected Data');
  });

  it('rejects unwrapping if device token does not match', async () => {
    const salt = generateSalt(16);
    const masterKey = await deriveMasterKeyDirect('Password123!', salt, 1000);
    const validToken = 'cred_token_valido';
    const invalidToken = 'cred_token_invalido';

    const wrappedPackage = await wrapMasterKey(masterKey, validToken);

    // Attempting to unwrap with wrong token MUST throw cryptographic error
    await expect(
      unwrapMasterKey(wrappedPackage, invalidToken)
    ).rejects.toThrow();
  });
});
