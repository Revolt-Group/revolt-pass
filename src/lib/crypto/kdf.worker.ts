/**
 * Web Worker dedicado a la derivación de llaves maestras con PBKDF2-HMAC-SHA256.
 * Ejecuta el cálculo computacional pesado (600,000 rondas) fuera del hilo principal de UI.
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

// En Web Worker, self es DedicatedWorkerGlobalScope
self.onmessage = async (event: MessageEvent<KdfWorkerRequest>) => {
  const { id, password, salt, iterations = 600000 } = event.data;

  try {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // 1. Importar la contraseña en bruto como clave base PBKDF2
    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    // 2. Derivar 256 bits (32 bytes) usando HMAC-SHA256 con las rondas especificadas
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

    // 3. Responder transfiriendo el buffer (transferable object) para vaciar la memoria del worker
    const response: KdfWorkerSuccessResponse = {
      id,
      success: true,
      derivedBits,
    };

    (self as unknown as Worker).postMessage(response, [derivedBits]);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Error en la derivación KDF';
    const response: KdfWorkerErrorResponse = {
      id,
      success: false,
      error: errorMessage,
    };
    (self as unknown as Worker).postMessage(response);
  }
};
