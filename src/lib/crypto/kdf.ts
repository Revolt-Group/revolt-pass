/**
 * Módulo de derivación de claves maestras (KDF).
 * Implementa PBKDF2-HMAC-SHA256 con 600,000 iteraciones y salt de 16 bytes.
 * Orquesta la ejecución en un Web Worker en el navegador, con fallback directo.
 */

import type { KdfWorkerRequest, KdfWorkerResponse } from './kdf.worker.ts';

export const DEFAULT_KDF_ITERATIONS = 600000;
export const DEFAULT_SALT_LENGTH_BYTES = 16;

/**
 * Genera un salt criptográficamente seguro de 16 bytes (128 bits).
 */
export function generateSalt(length = DEFAULT_SALT_LENGTH_BYTES): Uint8Array {
  const salt = new Uint8Array(length);
  crypto.getRandomValues(salt);
  return salt;
}

/**
 * Deriva una CryptoKey simétrica AES-GCM (256 bits) de forma directa en el hilo actual.
 * Utilizado como motor base y fallback para entornos de pruebas automatizadas (Vitest/Node).
 */
export async function deriveMasterKeyDirect(
  password: string,
  salt: Uint8Array,
  iterations = DEFAULT_KDF_ITERATIONS,
  extractable = true
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  // 1. Importar la contraseña como clave base PBKDF2
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // 2. Derivar directamente la CryptoKey para AES-GCM (256 bits)
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
 * Deriva una CryptoKey simétrica AES-GCM (256 bits) utilizando un Web Worker en segundo plano
 * para no degradar la respuesta visual de la interfaz de React durante las 600,000 iteraciones.
 * 
 * Si el entorno no soporta Web Workers (ej. Vitest / Node.js), recurre de forma segura a deriveMasterKeyDirect.
 */
export async function deriveMasterKey(
  password: string,
  salt: Uint8Array,
  iterations = DEFAULT_KDF_ITERATIONS,
  extractable = true
): Promise<CryptoKey> {
  // Verificar si estamos en un entorno con soporte completo de Web Worker en módulo
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
            // Importar los bits derivados a una CryptoKey AES-GCM
            const masterKey = await crypto.subtle.importKey(
              'raw',
              data.derivedBits,
              { name: 'AES-GCM', length: 256 },
              extractable,
              ['encrypt', 'decrypt']
            );

            // Higiene de memoria: sobreescribir el buffer recibido con ceros
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
        // Si el worker falla al instanciarse en entornos emulados, fallback a directo
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
      // Fallback inmediato si new Worker falla
      worker?.terminate();
      deriveMasterKeyDirect(password, salt, iterations).then(resolve).catch(reject);
    }
  });
}
