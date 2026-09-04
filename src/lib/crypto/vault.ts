/**
 * Módulo de Cifrado y Descifrado de Bóveda (Vault) Zero-Knowledge.
 * Utiliza AES-GCM de 256 bits con IV fresco de 12 bytes y etiqueta de autenticación de 128 bits.
 */

import type { VaultItem, DecryptedVault } from '../../types/vault.ts';

export const AES_GCM_IV_LENGTH_BYTES = 12; // 96 bits
export const AES_GCM_TAG_LENGTH_BITS = 128; // 128 bits

/**
 * Convierte un Uint8Array a una cadena Base64 estándar de forma segura en memoria.
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
 * Convierte una cadena Base64 estándar a un Uint8Array de bytes.
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
 * Genera un vector de inicialización (IV) criptográfico aleatorio y fresco de 12 bytes.
 * REGLA INMUTABLE: Nunca debe reutilizarse un IV con la misma clave en AES-GCM.
 */
export function generateIv(): Uint8Array {
  const iv = new Uint8Array(AES_GCM_IV_LENGTH_BYTES);
  crypto.getRandomValues(iv);
  return iv;
}

export interface EncryptedVaultResult {
  encryptedBlob: string; // Base64 del ciphertext + tag de autenticación
  iv: string; // Base64 del IV de 12 bytes
  version: number;
  updatedAt: number; // Unix timestamp en segundos
}

/**
 * Cifra la colección completa de ítems de la bóveda usando AES-GCM-256.
 * 
 * @param items Lista de cuentas y secretos a cifrar
 * @param masterKey CryptoKey simétrica AES-GCM derivada previamente
 * @param version Número de versión de la bóveda para control de concurrencia optimista
 * @returns Objeto con el blob cifrado y el IV en Base64
 */
export async function encryptVault(
  items: VaultItem[],
  masterKey: CryptoKey,
  version = 1
): Promise<EncryptedVaultResult> {
  const payload: DecryptedVault = {
    version,
    items,
    exported_at: Date.now(),
  };

  const jsonString = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(jsonString);

  // Generar un IV único para esta operación
  const iv = generateIv();

  // Cifrar con AES-GCM y tag de 128 bits
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
 * Descifra el blob de la bóveda y valida su integridad y estructura JSON.
 * 
 * @param encryptedBlobBase64 Ciphertext + auth tag en Base64
 * @param ivBase64 Vector de inicialización de 12 bytes en Base64
 * @param masterKey CryptoKey simétrica AES-GCM
 * @returns Lista de ítems descifrados
 * @throws OperationError si el texto cifrado o el IV fueron alterados (tampering) o la clave es incorrecta
 */
export async function decryptVault(
  encryptedBlobBase64: string,
  ivBase64: string,
  masterKey: CryptoKey
): Promise<VaultItem[]> {
  const ciphertextBytes = base64ToBytes(encryptedBlobBase64);
  const ivBytes = base64ToBytes(ivBase64);

  if (ivBytes.length !== AES_GCM_IV_LENGTH_BYTES) {
    throw new Error(`Longitud de IV inválida: ${ivBytes.length} bytes (se requieren 12 bytes)`);
  }

  // Descifrar con Web Crypto API. Si 1 solo bit fue modificado, subtle.decrypt arrojará OperationError
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

  const parsed = JSON.parse(jsonString) as DecryptedVault | VaultItem[];

  // Compatibilidad: si el payload es un objeto DecryptedVault, extraer items
  if (Array.isArray(parsed)) {
    return parsed;
  } else if (parsed && Array.isArray(parsed.items)) {
    return parsed.items;
  } else {
    throw new Error('Formato de bóveda no reconocido tras el descifrado');
  }
}
