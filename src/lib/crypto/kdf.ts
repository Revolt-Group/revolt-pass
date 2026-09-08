/**
 * Master Key Derivation Module (KDF).
 * Implements Argon2id (OWASP 2024 recommended, 64MB RAM, 3 iterations) via WebAssembly (hash-wasm)
 * with backward-compatible PBKDF2-HMAC-SHA256 fallback.
 * Orchestrates Web Worker execution in the browser, with direct execution fallback.
 */

import { argon2id } from 'hash-wasm';
import type { KdfWorkerRequest, KdfWorkerResponse, KdfAlgorithm } from './kdf.worker.ts';

export type { KdfAlgorithm };
export const DEFAULT_KDF_ALGORITHM: KdfAlgorithm = 'argon2id';
export const DEFAULT_ARGON2ID_ITERATIONS = 3;
export const DEFAULT_ARGON2ID_MEMORY_KIB = 65536; // 64 MB
export const DEFAULT_PBKDF2_ITERATIONS = 600000;
export const DEFAULT_SALT_LENGTH_BYTES = 16;

/**
 * Generates a cryptographically secure 16-byte (128-bit) salt.
 */
export function generateSalt(length = DEFAULT_SALT_LENGTH_BYTES): Uint8Array {
  const salt = new Uint8Array(length);
  crypto.getRandomValues(salt);
  return salt;
}

export interface DeriveKeyOptions {
  algorithm?: KdfAlgorithm;
  iterations?: number;
  memorySize?: number;
  extractable?: boolean;
}

function resolveKdfParams(
  optionsOrIterations?: number | DeriveKeyOptions,
  extractable = true
): {
  algorithm: KdfAlgorithm;
  iterations?: number;
  memorySize?: number;
  isExtractable: boolean;
} {
  if (typeof optionsOrIterations === 'number') {
    return {
      algorithm: 'pbkdf2',
      iterations: optionsOrIterations,
      isExtractable: extractable,
    };
  }

  if (typeof optionsOrIterations === 'object') {
    return {
      algorithm: optionsOrIterations.algorithm ?? DEFAULT_KDF_ALGORITHM,
      iterations: optionsOrIterations.iterations,
      memorySize: optionsOrIterations.memorySize,
      isExtractable: optionsOrIterations.extractable ?? extractable,
    };
  }

  return {
    algorithm: DEFAULT_KDF_ALGORITHM,
    iterations: DEFAULT_ARGON2ID_ITERATIONS,
    memorySize: DEFAULT_ARGON2ID_MEMORY_KIB,
    isExtractable: extractable,
  };
}

/**
 * Derives a symmetric AES-GCM (256-bit) CryptoKey directly in the current thread.
 * Used as base engine and fallback for automated test environments (Vitest/Node).
 */
export async function deriveMasterKeyDirect(
  password: string,
  salt: Uint8Array,
  optionsOrIterations?: number | DeriveKeyOptions,
  extractable = true
): Promise<CryptoKey> {
  const params = resolveKdfParams(optionsOrIterations, extractable);

  if (params.algorithm === 'argon2id') {
    const derivedBytes = await argon2id({
      password,
      salt,
      iterations: params.iterations ?? DEFAULT_ARGON2ID_ITERATIONS,
      memorySize: params.memorySize ?? DEFAULT_ARGON2ID_MEMORY_KIB,
      parallelism: 1,
      hashLength: 32,
      outputType: 'binary',
    });

    const masterKey = await crypto.subtle.importKey(
      'raw',
      derivedBytes as unknown as BufferSource,
      { name: 'AES-GCM', length: 256 },
      params.isExtractable,
      ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );

    // Wipe memory buffer
    derivedBytes.fill(0);
    return masterKey;
  }

  // PBKDF2 path
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const masterKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as ArrayBuffer,
      iterations: params.iterations ?? DEFAULT_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    params.isExtractable,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );

  return masterKey;
}

/**
 * Derives a symmetric AES-GCM (256-bit) CryptoKey using a background Web Worker
 * to prevent UI freezes during heavy computation.
 * 
 * If the environment lacks Web Worker support (e.g. Vitest / Node.js), safely falls back to deriveMasterKeyDirect.
 */
export async function deriveMasterKey(
  password: string,
  salt: Uint8Array,
  optionsOrIterations?: number | DeriveKeyOptions,
  extractable = true
): Promise<CryptoKey> {
  const hasWorkerSupport = typeof window !== 'undefined' && typeof Worker !== 'undefined';

  if (!hasWorkerSupport) {
    return deriveMasterKeyDirect(password, salt, optionsOrIterations, extractable);
  }

  const params = resolveKdfParams(optionsOrIterations, extractable);

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
            const masterKey = await crypto.subtle.importKey(
              'raw',
              data.derivedBits,
              { name: 'AES-GCM', length: 256 },
              params.isExtractable,
              ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
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
        deriveMasterKeyDirect(password, salt, optionsOrIterations, extractable).then(resolve).catch(reject);
      };

      const request: KdfWorkerRequest = {
        id: requestId,
        password,
        salt,
        algorithm: params.algorithm,
        iterations: params.iterations,
        memorySize: params.memorySize,
      };

      worker.postMessage(request);
    } catch {
      worker?.terminate();
      deriveMasterKeyDirect(password, salt, optionsOrIterations, extractable).then(resolve).catch(reject);
    }
  });
}

