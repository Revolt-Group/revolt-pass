/**
 * Motor TOTP estricto según RFC 6238 y RFC 4226.
 * Implementado utilizando la Web Crypto API nativa (crypto.subtle).
 */

import { decodeBase32 } from './base32.ts';
import type { TotpAlgorithm, VaultItem } from '../../types/vault.ts';

export interface TotpOptions {
  timestampSeconds?: number; // Marca de tiempo en segundos (default: Date.now() / 1000)
  timeDriftOffsetMs?: number; // Compensación de desfase de reloj con el servidor en ms
  period?: number; // Intervalo de rotación en segundos (default: 30)
  digits?: 6 | 8; // Cantidad de dígitos generados (default: 6)
  algorithm?: TotpAlgorithm; // Algoritmo hash: 'SHA1' o 'SHA256' (default: 'SHA1')
}

/**
 * Mapeo de identificadores de algoritmo a nombres compatibles con Web Crypto API.
 */
function getSubtleHashName(algorithm: TotpAlgorithm): string {
  switch (algorithm) {
    case 'SHA1':
      return 'SHA-1';
    case 'SHA256':
      return 'SHA-256';
    default:
      throw new Error(`Algoritmo hash no soportado: ${algorithm}`);
  }
}

/**
 * Convierte un contador entero a un ArrayBuffer de 8 bytes en orden Big-Endian.
 */
function counterToBuffer(counter: number): ArrayBuffer {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  
  // Manejo de enteros de 64 bits en JavaScript sin riesgo de desbordamiento
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  
  view.setUint32(0, high, false);
  view.setUint32(4, low, false);
  return buffer;
}

/**
 * Genera un código de autenticación de un solo uso por tiempo (TOTP) conforme a RFC 6238.
 * 
 * @param secret Secreto en formato Base32 (string) o bytes binarios (Uint8Array)
 * @param options Opciones de configuración del token
 * @returns Código numérico con ceros a la izquierda según los dígitos configurados
 */
export async function generateTotp(
  secret: string | Uint8Array,
  options: TotpOptions = {}
): Promise<string> {
  const {
    timestampSeconds,
    timeDriftOffsetMs = 0,
    period = 30,
    digits = 6,
    algorithm = 'SHA1',
  } = options;

  if (digits !== 6 && digits !== 8) {
    throw new Error(`Los dígitos deben ser 6 u 8. Recibido: ${digits}`);
  }

  // 1. Obtener los bytes del secreto
  const secretBytes = typeof secret === 'string' ? decodeBase32(secret) : secret;
  if (secretBytes.length === 0) {
    throw new Error('El secreto TOTP no puede estar vacío');
  }

  // 2. Determinar el tiempo efectivo en segundos compensado con el desfase
  const baseTimeMs = timestampSeconds !== undefined
    ? timestampSeconds * 1000
    : Date.now();
  
  const effectiveTimeMs = baseTimeMs + timeDriftOffsetMs;
  const effectiveSeconds = Math.floor(effectiveTimeMs / 1000);

  // 3. Calcular el paso temporal T = floor(t / period)
  const timeStep = Math.floor(effectiveSeconds / period);
  const counterBuffer = counterToBuffer(timeStep);

  // 4. Importar la clave criptográfica en Web Crypto
  const subtleHash = getSubtleHashName(algorithm);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    secretBytes as unknown as ArrayBuffer,
    { name: 'HMAC', hash: { name: subtleHash } },
    false,
    ['sign']
  );

  // 5. Calcular la firma HMAC
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
  const hashBytes = new Uint8Array(signature);

  // 6. Truncamiento dinámico según RFC 4226 Sección 5.4
  const offset = hashBytes[hashBytes.length - 1] & 0x0f;
  const binary =
    ((hashBytes[offset] & 0x7f) << 24) |
    ((hashBytes[offset + 1] & 0xff) << 16) |
    ((hashBytes[offset + 2] & 0xff) << 8) |
    (hashBytes[offset + 3] & 0xff);

  // 7. Aplicar módulo y rellenar con ceros a la izquierda
  const modulo = Math.pow(10, digits);
  const token = (binary % modulo).toString().padStart(digits, '0');

  return token;
}

/**
 * Devuelve los segundos restantes del ciclo actual de TOTP (de period a 0).
 */
export function getTotpRemainingSeconds(period = 30, timeDriftOffsetMs = 0): number {
  const nowMs = Date.now() + timeDriftOffsetMs;
  const seconds = Math.floor(nowMs / 1000);
  const remaining = period - (seconds % period);
  return remaining === 0 ? period : remaining;
}

/**
 * Devuelve el progreso del ciclo actual normalizado de 0 a 1 (para indicadores circulares SVG).
 * 1 = inicio del ciclo, 0 = ciclo expirado.
 */
export function getTotpProgress(period = 30, timeDriftOffsetMs = 0): number {
  const nowMs = Date.now() + timeDriftOffsetMs;
  const elapsedMs = nowMs % (period * 1000);
  const remainingFraction = 1 - (elapsedMs / (period * 1000));
  return Math.max(0, Math.min(1, remainingFraction));
}

/**
 * Parsea una URI estándar otpauth://totp/... a un objeto parcial de VaultItem.
 * 
 * Ejemplo:
 * otpauth://totp/GitHub:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6&period=30&algorithm=SHA1
 */
export function parseOtpAuthUri(uri: string): Partial<VaultItem> {
  if (!uri.startsWith('otpauth://totp/')) {
    throw new Error('Formato de URI inválido: debe comenzar con "otpauth://totp/"');
  }

  const parsedUrl = new URL(uri);
  const fullLabel = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/g, ''));
  
  let issuer = parsedUrl.searchParams.get('issuer') || '';
  let account = fullLabel;

  // Si el label contiene "Issuer:Account", extraer ambos componentes
  if (fullLabel.includes(':')) {
    const parts = fullLabel.split(':');
    const labelIssuer = parts[0].trim();
    account = parts.slice(1).join(':').trim();
    if (!issuer) {
      issuer = labelIssuer;
    }
  }

  const secret = parsedUrl.searchParams.get('secret');
  if (!secret) {
    throw new Error('La URI de autenticación no contiene el parámetro "secret" obligatorio');
  }

  const digitsParam = parsedUrl.searchParams.get('digits');
  const digits: 6 | 8 = digitsParam === '8' ? 8 : 6;

  const periodParam = parsedUrl.searchParams.get('period');
  const period = periodParam ? parseInt(periodParam, 10) : 30;

  const algorithmParam = parsedUrl.searchParams.get('algorithm')?.toUpperCase();
  const algorithm: TotpAlgorithm = algorithmParam === 'SHA256' ? 'SHA256' : 'SHA1';

  return {
    type: 'totp',
    issuer: issuer || 'Desconocido',
    account: account || 'Cuenta',
    secret: secret.trim(),
    digits,
    period: isNaN(period) || period <= 0 ? 30 : period,
    algorithm,
  };
}
