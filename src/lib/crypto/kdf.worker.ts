/**
 * Dedicated Web Worker for PBKDF2-HMAC-SHA256 master key derivation.
 * Executes heavy computation (600,000 rounds) off the main UI thread.
 */

export interface KdfWorkerRequest {
  id: string;
  password: string;
  salt: Uint8Array;
  iterations?: number;
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
  const { id, password, salt, iterations = 600000 } = event.data;

  try {
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
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt as unknown as ArrayBuffer,
        iterations,
        hash: 'SHA-256',
      },
      baseKey,
      256
    );

    // 3. Respond by transferring buffer (transferable object) to clear worker memory
    const response: KdfWorkerSuccessResponse = {
      id,
      success: true,
      derivedBits,
    };

    (self as unknown as Worker).postMessage(response, [derivedBits]);
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
