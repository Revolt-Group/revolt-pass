/**
 * Decodificador y Codificador Base32 puro según RFC 4648.
 * Diseñado para secretos TOTP y autenticación sin dependencias externas.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// Tabla de búsqueda inversa O(1)
const BASE32_LOOKUP: Record<string, number> = {};
for (let i = 0; i < BASE32_ALPHABET.length; i++) {
  BASE32_LOOKUP[BASE32_ALPHABET[i]] = i;
}

/**
 * Sanitiza una cadena Base32 eliminando espacios en blanco, tabulaciones,
 * saltos de línea, guiones y caracteres de relleno '='.
 */
export function sanitizeBase32(input: string): string {
  return input
    .replace(/[\s\-_=]/g, '')
    .toUpperCase();
}

/**
 * Valida si una cadena cumple con el formato Base32 (alfabeto A-Z, 2-7).
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
 * Decodifica una cadena Base32 a un Uint8Array de bytes.
 * Tolera espacios, guiones y padding omitido o presente.
 * 
 * @param input Cadena codificada en Base32
 * @returns Uint8Array con los bytes decodificados
 * @throws Error si contiene caracteres fuera del alfabeto RFC 4648
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
      throw new Error(`Carácter Base32 no válido: "${char}" en posición ${i}`);
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
 * Codifica un Uint8Array a una cadena Base32.
 * 
 * @param buffer Bytes a codificar
 * @param pad Si es true, añade '=' al final según RFC 4648 (default: false)
 * @returns Cadena Base32
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
