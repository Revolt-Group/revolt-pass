/**
 * Pure RFC 4648 Base32 Encoder and Decoder.
 * Designed for TOTP secrets and zero-dependency client authentication.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// Reverse lookup table O(1)
const BASE32_LOOKUP: Record<string, number> = {};
for (let i = 0; i < BASE32_ALPHABET.length; i++) {
  BASE32_LOOKUP[BASE32_ALPHABET[i]] = i;
}

/**
 * Sanitizes a Base32 string by removing whitespace, tabs, newlines,
 * hyphens, and padding '=' characters.
 */
export function sanitizeBase32(input: string): string {
  return input
    .replace(/[\s\-_=]/g, '')
    .toUpperCase();
}

/**
 * Validates whether a string adheres to Base32 format (alphabet A-Z, 2-7).
 */
export function isValidBase32(input: string): boolean {
  const sanitized = sanitizeBase32(input);
  if (sanitized.length === 0) return false;
  for (let i = 0; i < sanitized.length; i++) {
    if (BASE32_LOOKUP[sanitized[i]] === undefined) {
      return false;
    }
  }
  return true;
}

/**
 * Decodes a Base32 string into a Uint8Array of bytes.
 * Tolerates whitespace, hyphens, and omitted or present padding.
 * 
 * @param input Base32 encoded string
 * @returns Uint8Array containing decoded bytes
 * @throws Error if invalid characters outside RFC 4648 alphabet are encountered
 */
export function decodeBase32(input: string): Uint8Array {
  const sanitized = sanitizeBase32(input);
  if (sanitized.length === 0) {
    return new Uint8Array(0);
  }

  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < sanitized.length; i++) {
    const char = sanitized[i];
    const val = BASE32_LOOKUP[char];
    if (val === undefined) {
      throw new Error(`Invalid Base32 character: "${char}" at position ${i}`);
    }

    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Encodes a Uint8Array into a Base32 string.
 * 
 * @param buffer Bytes to encode
 * @param pad If true, appends '=' padding according to RFC 4648 (default: false)
 * @returns Base32 encoded string
 */
export function encodeBase32(buffer: Uint8Array, pad = false): string {
  if (buffer.length === 0) {
    return '';
  }

  let result = '';
  let bits = 0;
  let value = 0;

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  if (pad) {
    while (result.length % 8 !== 0) {
      result += '=';
    }
  }

  return result;
}
