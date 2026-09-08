/**
 * Dedicated Web Worker for Master Key Derivation (Argon2id WASM & PBKDF2).
 * Executes heavy memory-hard computation off the main UI thread.
 */

import { argon2id } from 'hash-wasm';

export type KdfAlgorithm = 'pbkdf2' | 'argon2id';

export interface KdfWorkerRequest {
  id: string;
  password: string;
  salt: Uint8Array;
  algorithm?: KdfAlgorithm;
  iterations?: number;
  memorySize?: number;
}

export interface KdfWorkerSuccessResponse {
  id: string;
  success: true;
  derivedBits: ArrayBuffer;
}

export interface KdfWorkerErrorResponse {
  id: string;
  success: false;
  error: string;
}

export type KdfWorkerResponse = KdfWorkerSuccessResponse | KdfWorkerErrorResponse;

// In Web Worker context, self is DedicatedWorkerGlobalScope
self.onmessage = async (event: MessageEvent<KdfWorkerRequest>) => {
  const { id, password, salt, algorithm = 'argon2id', iterations, memorySize } = event.data;

  try {
    let derivedBuffer: ArrayBuffer;

    if (algorithm === 'argon2id') {
      const derivedBytes = await argon2id({
        password,
        salt,
        iterations: iterations ?? 3,
        memorySize: memorySize ?? 65536,
        parallelism: 1,
        hashLength: 32,
        outputType: 'binary',
      });

      // Transferable copy
      const copy = new Uint8Array(derivedBytes.byteLength);
      copy.set(derivedBytes);
      derivedBuffer = copy.buffer as ArrayBuffer;

      // Wipe local byte array
      derivedBytes.fill(0);
    } else {
      const encoder = new TextEncoder();
      const passwordBuffer = encoder.encode(password);

      // 1. Import raw password as PBKDF2 base key
      const baseKey = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        'PBKDF2',
        false,
        ['deriveBits']
      );

      // 2. Derive 256 bits (32 bytes) using HMAC-SHA256 with specified rounds
      derivedBuffer = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt as unknown as ArrayBuffer,
          iterations: iterations ?? 600000,
          hash: 'SHA-256',
        },
        baseKey,
        256
      );
    }

    // Respond by transferring buffer (transferable object) to clear worker memory
    const response: KdfWorkerSuccessResponse = {
      id,
      success: true,
      derivedBits: derivedBuffer,
    };

    (self as unknown as Worker).postMessage(response, [derivedBuffer]);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'KDF derivation error';
    const response: KdfWorkerErrorResponse = {
      id,
      success: false,
      error: errorMessage,
    };
    (self as unknown as Worker).postMessage(response);
  }
};

