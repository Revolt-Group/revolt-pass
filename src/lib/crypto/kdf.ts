/**
 * Master Key Derivation Module (KDF).
 * Implements PBKDF2-HMAC-SHA256 with 600,000 iterations and 16-byte salt.
 * Orchestrates Web Worker execution in the browser, with direct execution fallback.
 */

import type { KdfWorkerRequest, KdfWorkerResponse } from './kdf.worker.ts';

export const DEFAULT_KDF_ITERATIONS = 600000;
export const DEFAULT_SALT_LENGTH_BYTES = 16;

/**
 * Generates a cryptographically secure 16-byte (128-bit) salt.
 */
export function generateSalt(length = DEFAULT_SALT_LENGTH_BYTES): Uint8Array {
  const salt = new Uint8Array(length);
  crypto.getRandomValues(salt);
  return salt;
}

/**
 * Derives a symmetric AES-GCM (256-bit) CryptoKey directly in the current thread.
 * Used as base engine and fallback for automated test environments (Vitest/Node).
 */
export async function deriveMasterKeyDirect(
  password: string,
  salt: Uint8Array,
  iterations = DEFAULT_KDF_ITERATIONS,
  extractable = true
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  // 1. Import password as raw PBKDF2 base key
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // 2. Directly derive CryptoKey for AES-GCM (256-bit)
  const masterKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as ArrayBuffer,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );

  return masterKey;
}

/**
 * Derives a symmetric AES-GCM (256-bit) CryptoKey using a background Web Worker
 * to prevent UI freezes during the 600,000 iterations.
 * 
 * If the environment lacks Web Worker support (e.g. Vitest / Node.js), safely falls back to deriveMasterKeyDirect.
 */
export async function deriveMasterKey(
  password: string,
  salt: Uint8Array,
  iterations = DEFAULT_KDF_ITERATIONS,
  extractable = true
): Promise<CryptoKey> {
  // Check if environment has full module Web Worker support
  const hasWorkerSupport = typeof window !== 'undefined' && typeof Worker !== 'undefined';

  if (!hasWorkerSupport) {
    return deriveMasterKeyDirect(password, salt, iterations, extractable);
  }

  return new Promise((resolve, reject) => {
    let worker: Worker | null = null;
    const requestId = `kdf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    try {
      worker = new Worker(new URL('./kdf.worker.ts', import.meta.url), {
        type: 'module',
      });

      worker.onmessage = async (event: MessageEvent<KdfWorkerResponse>) => {
        const data = event.data;
        if (data.id !== requestId) return;

        if (data.success) {
          try {
            // Import derived bits into an AES-GCM CryptoKey
            const masterKey = await crypto.subtle.importKey(
              'raw',
              data.derivedBits,
              { name: 'AES-GCM', length: 256 },
              extractable,
              ['encrypt', 'decrypt']
            );

            // Memory hygiene: zeroize received buffer in-place
            new Uint8Array(data.derivedBits).fill(0);

            resolve(masterKey);
          } catch (importErr) {
            reject(importErr);
          } finally {
            worker?.terminate();
          }
        } else {
          worker?.terminate();
          reject(new Error(data.error));
        }
      };

      worker.onerror = () => {
        worker?.terminate();
        // If worker fails to instantiate in emulated environments, fallback to direct execution
        deriveMasterKeyDirect(password, salt, iterations).then(resolve).catch(reject);
      };

      const request: KdfWorkerRequest = {
        id: requestId,
        password,
        salt,
        iterations,
      };

      worker.postMessage(request);
    } catch {
      // Immediate fallback if new Worker fails
      worker?.terminate();
      deriveMasterKeyDirect(password, salt, iterations).then(resolve).catch(reject);
    }
  });
}
