import { describe, it, expect, beforeEach } from 'vitest';
import {
  encryptVault,
  decryptVault,
  bytesToBase64,
  base64ToBytes,
} from './vault.ts';
import { deriveMasterKeyDirect, generateSalt } from './kdf.ts';
import type { VaultItem } from '../../types/vault.ts';

describe('Cifrado y Descifrado de Bóveda (AES-GCM-256 Zero-Knowledge)', () => {
  let masterKey: CryptoKey;
  let sampleItems: VaultItem[];

  beforeEach(async () => {
    const salt = generateSalt(16);
    masterKey = await deriveMasterKeyDirect('MiContraseñaMaestraSuperSegura123!#', salt, 5000);

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
        notes: 'Clave de infraestructura crítica',
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

  it('debe cifrar y descifrar la bóveda de forma idéntica (Roundtrip Test)', async () => {
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

  it('debe generar IVs aleatorios distintos en cada cifrado consecutivo (Inmunidad a reutilización de IV)', async () => {
    const enc1 = await encryptVault(sampleItems, masterKey, 1);
    const enc2 = await encryptVault(sampleItems, masterKey, 1);

    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.encryptedBlob).not.toBe(enc2.encryptedBlob);

    // Ambos deben poder descifrarse correctamente
    const dec1 = await decryptVault(enc1.encryptedBlob, enc1.iv, masterKey);
    const dec2 = await decryptVault(enc2.encryptedBlob, enc2.iv, masterKey);

    expect(dec1).toEqual(dec2);
  });

  it('debe fallar deterministamente con error criptográfico si se altera 1 solo bit en el ciphertext (Tampering Test)', async () => {
    const enc = await encryptVault(sampleItems, masterKey, 1);

    // Alterar exactamente 1 bit en el blob cifrado (Auth Tag o Ciphertext)
    const rawBytes = base64ToBytes(enc.encryptedBlob);
    rawBytes[5] ^= 0x01; // Invertir un bit
    const tamperedBlob = bytesToBase64(rawBytes);

    // AES-GCM DEBE fallar al verificar la etiqueta de autenticación de 128 bits
    await expect(decryptVault(tamperedBlob, enc.iv, masterKey)).rejects.toThrow();
  });

  it('debe fallar si se altera el vector de inicialización (IV)', async () => {
    const enc = await encryptVault(sampleItems, masterKey, 1);

    const ivBytes = base64ToBytes(enc.iv);
    ivBytes[0] ^= 0x01; // Invertir un bit del IV
    const tamperedIv = bytesToBase64(ivBytes);

    await expect(decryptVault(enc.encryptedBlob, tamperedIv, masterKey)).rejects.toThrow();
  });

  it('debe fallar si se intenta descifrar con una clave incorrecta', async () => {
    const enc = await encryptVault(sampleItems, masterKey, 1);

    const wrongKey = await deriveMasterKeyDirect('ContraseñaCompletamenteIncorrecta', generateSalt(16), 5000);

    await expect(decryptVault(enc.encryptedBlob, enc.iv, wrongKey)).rejects.toThrow();
  });
});
