import { describe, it, expect } from 'vitest';
import { generateSalt, deriveMasterKeyDirect, deriveMasterKey } from './kdf.ts';

describe('Derivación de Clave Maestra (PBKDF2-HMAC-SHA256)', () => {
  it('debe generar salts criptográficos de 16 bytes no repetitivos', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();

    expect(salt1).toHaveLength(16);
    expect(salt2).toHaveLength(16);
    expect(salt1).not.toEqual(salt2);
  });

  it('debe derivar una CryptoKey AES-GCM de 256 bits consistente', async () => {
    const salt = generateSalt(16);
    const password = 'PasswordDePruebaSegura!2026';

    // Para pruebas unitarias rápidas usamos 1,000 iteraciones
    const key1 = await deriveMasterKeyDirect(password, salt, 1000);
    const key2 = await deriveMasterKeyDirect(password, salt, 1000);

    expect(key1.algorithm.name).toBe('AES-GCM');
    expect((key1.algorithm as AesKeyGenParams).length).toBe(256);
    expect(key1.type).toBe('secret');

    // Comprobar que ambas claves derivadas del mismo salt y password son funcionalmente idénticas
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode('Dato Confidencial');

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

    expect(new TextDecoder().decode(decrypted)).toBe('Dato Confidencial');
  });

  it('debe generar claves completamente distintas si el salt difiere', async () => {
    const saltA = generateSalt(16);
    const saltB = generateSalt(16);
    const password = 'MismaPassword123!';

    const keyA = await deriveMasterKeyDirect(password, saltA, 1000);
    const keyB = await deriveMasterKeyDirect(password, saltB, 1000);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode('Prueba de Aislamiento');

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      keyA,
      plaintext
    );

    // keyB debe fallar al intentar descifrar datos de keyA
    await expect(
      crypto.subtle.decrypt({ name: 'AES-GCM', iv }, keyB, encrypted)
    ).rejects.toThrow();
  });

  it('debe funcionar a través del wrapper principal deriveMasterKey', async () => {
    const salt = generateSalt(16);
    const key = await deriveMasterKey('PasswordWrapperTest!99', salt, 1000);

    expect(key.algorithm.name).toBe('AES-GCM');
    expect(key.type).toBe('secret');
  });
});
