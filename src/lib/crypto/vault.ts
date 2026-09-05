/**
 * Zero-Knowledge Vault Encryption and Decryption Module.
 * Uses 256-bit AES-GCM with fresh 12-byte IV and 128-bit authentication tag.
 */

import type { VaultItem, DecryptedVault } from '../../types/vault.ts';

export const AES_GCM_IV_LENGTH_BYTES = 12; // 96 bits
export const AES_GCM_TAG_LENGTH_BITS = 128; // 128 bits

/**
 * Safely converts a Uint8Array into a standard Base64 string in memory.
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
 * Converts a standard Base64 string into a Uint8Array of bytes.
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
 * Generates a fresh, cryptographically random 12-byte initialization vector (IV).
 * IMMUTABLE RULE: Never reuse an IV with the same key in AES-GCM.
 */
export function generateIv(): Uint8Array {
  const iv = new Uint8Array(AES_GCM_IV_LENGTH_BYTES);
  crypto.getRandomValues(iv);
  return iv;
}

export interface EncryptedVaultResult {
  encryptedBlob: string; // Base64 ciphertext + authentication tag
  iv: string; // Base64 12-byte IV
  version: number;
  updatedAt: number; // Unix timestamp in seconds
}

/**
 * Encrypts the entire collection of vault items using AES-GCM-256.
 * 
 * @param items List of accounts and secrets to encrypt
 * @param masterKey Symmetric AES-GCM CryptoKey derived previously
 * @param version Vault version number for optimistic concurrency control
 * @returns Object containing encrypted blob and Base64-encoded IV
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

  // Generate fresh unique IV for this operation
  const iv = generateIv();

  // Encrypt with AES-GCM and 128-bit tag
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
 * Decrypts vault blob and validates its integrity and JSON structure.
 * 
 * @param encryptedBlobBase64 Base64 ciphertext + auth tag
 * @param ivBase64 Base64 12-byte initialization vector
 * @param masterKey Symmetric AES-GCM CryptoKey
 * @returns List of decrypted items
 * @throws OperationError if ciphertext or IV were tampered with, or key is invalid
 */
export async function decryptVault(
  encryptedBlobBase64: string,
  ivBase64: string,
  masterKey: CryptoKey
): Promise<VaultItem[]> {
  const ciphertextBytes = base64ToBytes(encryptedBlobBase64);
  const ivBytes = base64ToBytes(ivBase64);

  if (ivBytes.length !== AES_GCM_IV_LENGTH_BYTES) {
    throw new Error(`Invalid IV length: ${ivBytes.length} bytes (12 bytes required)`);
  }

  // Decrypt with Web Crypto API. If even 1 bit was tampered with, subtle.decrypt throws OperationError
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

  // Backward compatibility: if payload is a DecryptedVault object, extract items
  if (Array.isArray(parsed)) {
    return parsed;
  } else if (parsed && Array.isArray(parsed.items)) {
    return parsed.items;
  } else {
    throw new Error('Unrecognized vault structure following decryption');
  }
}
