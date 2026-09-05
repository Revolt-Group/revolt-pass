/**
 * Strict TOTP Engine adhering to RFC 6238 and RFC 4226.
 * Implemented using native Web Crypto API (crypto.subtle).
 */

import { decodeBase32 } from './base32.ts';
import type { TotpAlgorithm, VaultItem } from '../../types/vault.ts';

export interface TotpOptions {
  timestampSeconds?: number; // Timestamp in seconds (default: Date.now() / 1000)
  timeDriftOffsetMs?: number; // Server clock drift compensation in ms
  period?: number; // Rotation interval in seconds (default: 30)
  digits?: 6 | 8; // Number of generated digits (default: 6)
  algorithm?: TotpAlgorithm; // Hash algorithm: 'SHA1' or 'SHA256' (default: 'SHA1')
}

/**
 * Maps algorithm identifiers to Web Crypto API compatible names.
 */
function getSubtleHashName(algorithm: TotpAlgorithm): string {
  switch (algorithm) {
    case 'SHA1':
      return 'SHA-1';
    case 'SHA256':
      return 'SHA-256';
    default:
      throw new Error(`Unsupported hash algorithm: ${algorithm}`);
  }
}

/**
 * Converts an integer counter to an 8-byte ArrayBuffer in Big-Endian order.
 */
function counterToBuffer(counter: number): ArrayBuffer {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  
  // Handle 64-bit integers in JavaScript without overflow risk
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  
  view.setUint32(0, high, false);
  view.setUint32(4, low, false);
  return buffer;
}

/**
 * Generates a Time-based One-Time Password (TOTP) conforming to RFC 6238.
 * 
 * @param secret Secret in Base32 string or binary bytes (Uint8Array)
 * @param options Token configuration options
 * @returns Left-padded numeric token string matching configured digits
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
    throw new Error(`Digits must be 6 or 8. Received: ${digits}`);
  }

  // 1. Obtain secret bytes
  const secretBytes = typeof secret === 'string' ? decodeBase32(secret) : secret;
  if (secretBytes.length === 0) {
    throw new Error('TOTP secret cannot be empty');
  }

  // 2. Determine effective timestamp in seconds with drift offset applied
  const baseTimeMs = timestampSeconds !== undefined
    ? timestampSeconds * 1000
    : Date.now();
  
  const effectiveTimeMs = baseTimeMs + timeDriftOffsetMs;
  const effectiveSeconds = Math.floor(effectiveTimeMs / 1000);

  // 3. Compute time step T = floor(t / period)
  const timeStep = Math.floor(effectiveSeconds / period);
  const counterBuffer = counterToBuffer(timeStep);

  // 4. Import cryptographic key into Web Crypto
  const subtleHash = getSubtleHashName(algorithm);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    secretBytes as unknown as ArrayBuffer,
    { name: 'HMAC', hash: { name: subtleHash } },
    false,
    ['sign']
  );

  // 5. Compute HMAC signature
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
  const hashBytes = new Uint8Array(signature);

  // 6. Dynamic truncation according to RFC 4226 Section 5.4
  const offset = hashBytes[hashBytes.length - 1] & 0x0f;
  const binary =
    ((hashBytes[offset] & 0x7f) << 24) |
    ((hashBytes[offset + 1] & 0xff) << 16) |
    ((hashBytes[offset + 2] & 0xff) << 8) |
    (hashBytes[offset + 3] & 0xff);

  // 7. Apply modulo and left-pad with zeros
  const modulo = Math.pow(10, digits);
  const token = (binary % modulo).toString().padStart(digits, '0');

  return token;
}

/**
 * Returns remaining seconds in the current TOTP cycle (from period down to 0).
 */
export function getTotpRemainingSeconds(period = 30, timeDriftOffsetMs = 0): number {
  const nowMs = Date.now() + timeDriftOffsetMs;
  const seconds = Math.floor(nowMs / 1000);
  const remaining = period - (seconds % period);
  return remaining === 0 ? period : remaining;
}

/**
 * Returns normalized progress of current cycle from 0 to 1 (for SVG circular indicators).
 * 1 = start of cycle, 0 = expired cycle.
 */
export function getTotpProgress(period = 30, timeDriftOffsetMs = 0): number {
  const nowMs = Date.now() + timeDriftOffsetMs;
  const elapsedMs = nowMs % (period * 1000);
  const remainingFraction = 1 - (elapsedMs / (period * 1000));
  return Math.max(0, Math.min(1, remainingFraction));
}

/**
 * Parses a standard otpauth://totp/... URI into a partial VaultItem object.
 * 
 * Example:
 * otpauth://totp/GitHub:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6&period=30&algorithm=SHA1
 */
export function parseOtpAuthUri(uri: string): Partial<VaultItem> {
  if (!uri.startsWith('otpauth://totp/')) {
    throw new Error('Invalid URI format: must start with "otpauth://totp/"');
  }

  const parsedUrl = new URL(uri);
  const fullLabel = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/g, ''));
  
  let issuer = parsedUrl.searchParams.get('issuer') || '';
  let account = fullLabel;

  // If label contains "Issuer:Account", extract both components
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
    throw new Error('Authentication URI missing required "secret" parameter');
  }

  const digitsParam = parsedUrl.searchParams.get('digits');
  const digits: 6 | 8 = digitsParam === '8' ? 8 : 6;

  const periodParam = parsedUrl.searchParams.get('period');
  const period = periodParam ? parseInt(periodParam, 10) : 30;

  const algorithmParam = parsedUrl.searchParams.get('algorithm')?.toUpperCase();
  const algorithm: TotpAlgorithm = algorithmParam === 'SHA256' ? 'SHA256' : 'SHA1';

  return {
    type: 'totp',
    issuer: issuer || 'Unknown',
    account: account || 'Account',
    secret: secret.trim(),
    digits,
    period: isNaN(period) || period <= 0 ? 30 : period,
    algorithm,
  };
}
