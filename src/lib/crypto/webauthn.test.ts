import { describe, it, expect } from 'vitest';
import { wrapMasterKey, unwrapMasterKey, checkWebAuthnSupport } from './webauthn.ts';
import { deriveMasterKeyDirect, generateSalt } from './kdf.ts';

describe('WebAuthn & Envoltura Local de Llave (Key Wrapping)', () => {
  it('debe comprobar el soporte de WebAuthn sin lanzar excepciones en el entorno actual', async () => {
    const status = await checkWebAuthnSupport();
    expect(status).toHaveProperty('isSupported');
    expect(status).toHaveProperty('hasPlatformAuthenticator');
  });

  it('debe envolver y desenvolver la MasterKey preservando su capacidad criptográfica (Roundtrip Test)', async () => {
    const salt = generateSalt(16);
    const masterKey = await deriveMasterKeyDirect('PasswordOriginal123!', salt, 1000);
    const deviceToken = 'cred_windows_hello_token_xyz_987';

    // 1. Envolver la llave
    const wrappedPackage = await wrapMasterKey(masterKey, deviceToken);

    expect(wrappedPackage.wrappedKey).toBeDefined();
    expect(wrappedPackage.iv).toBeDefined();
    expect(wrappedPackage.deviceSalt).toBeDefined();

    // 2. Desenvolver la llave con el mismo token
    const unwrappedKey = await unwrapMasterKey(wrappedPackage, deviceToken);

    expect(unwrappedKey.algorithm.name).toBe('AES-GCM');
    expect(unwrappedKey.type).toBe('secret');

    // 3. Probar que la llave desenvuelta puede descifrar datos cifrados con la original
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode('Dato Protegido por Windows Hello');

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

    expect(new TextDecoder().decode(decrypted)).toBe('Dato Protegido por Windows Hello');
  });

  it('debe rechazar el desenvolvimiento si el token de dispositivo no coincide', async () => {
    const salt = generateSalt(16);
    const masterKey = await deriveMasterKeyDirect('Password123!', salt, 1000);
    const validToken = 'cred_token_valido';
    const invalidToken = 'cred_token_invalido';

    const wrappedPackage = await wrapMasterKey(masterKey, validToken);

    // Intentar desenvolver con un token incorrecto DEBE arrojar error criptográfico
    await expect(
      unwrapMasterKey(wrappedPackage, invalidToken)
    ).rejects.toThrow();
  });
});
