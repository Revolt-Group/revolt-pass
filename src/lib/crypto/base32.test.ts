import { describe, it, expect } from 'vitest';
import { decodeBase32, encodeBase32, isValidBase32, sanitizeBase32 } from './base32.ts';

describe('Base32 RFC 4648 Encoder/Decoder', () => {
  // Vectores oficiales de prueba del RFC 4648 (Sección 10)
  const rfcVectors = [
    { text: '', base32Padded: '', base32Unpadded: '' },
    { text: 'f', base32Padded: 'MY======', base32Unpadded: 'MY' },
    { text: 'fo', base32Padded: 'MZXQ====', base32Unpadded: 'MZXQ' },
    { text: 'foo', base32Padded: 'MZXW6===', base32Unpadded: 'MZXW6' },
    { text: 'foob', base32Padded: 'MZXW6YQ=', base32Unpadded: 'MZXW6YQ' },
    { text: 'fooba', base32Padded: 'MZXW6YTB', base32Unpadded: 'MZXW6YTB' },
    { text: 'foobar', base32Padded: 'MZXW6YTBOI======', base32Unpadded: 'MZXW6YTBOI' },
  ];

  it('debe codificar correctamente los vectores de prueba oficiales RFC 4648 con y sin padding', () => {
    const encoder = new TextEncoder();
    for (const vector of rfcVectors) {
      const bytes = encoder.encode(vector.text);
      expect(encodeBase32(bytes, false)).toBe(vector.base32Unpadded);
      expect(encodeBase32(bytes, true)).toBe(vector.base32Padded);
    }
  });

  it('debe decodificar correctamente cadenas con o sin relleno (=)', () => {
    const decoder = new TextDecoder();

    for (const vector of rfcVectors) {
      const decodedPadded = decodeBase32(vector.base32Padded);
      const decodedUnpadded = decodeBase32(vector.base32Unpadded);

      expect(decoder.decode(decodedPadded)).toBe(vector.text);
      expect(decoder.decode(decodedUnpadded)).toBe(vector.text);
    }
  });

  it('debe sanitizar espacios en blanco, guiones y minúsculas de forma transparente', () => {
    // Caso típico de secreto TOTP con espacios y guiones: "jbsw y3dp-ehpk 3pxp"
    const dirty = ' jbsw-y3dp - ehpk 3pxp= ';
    const clean = sanitizeBase32(dirty);
    expect(clean).toBe('JBSWY3DPEHPK3PXP');

    const decoded = decodeBase32(dirty);
    const expected = decodeBase32('JBSWY3DPEHPK3PXP');
    expect(decoded).toEqual(expected);
  });

  it('debe validar cadenas Base32 válidas e inválidas', () => {
    expect(isValidBase32('JBSWY3DPEHPK3PXP')).toBe(true);
    expect(isValidBase32('jbswy3dpehpk3pxp')).toBe(true); // Se auto-convierte a mayúsculas
    expect(isValidBase32('JBSW-Y3DP-EHPK-3PXP')).toBe(true);
    expect(isValidBase32('')).toBe(false);
    expect(isValidBase32('1890')).toBe(false); // '1', '8', '9', '0' no existen en Base32
    expect(isValidBase32('JBSW8')).toBe(false);
  });

  it('debe lanzar error al intentar decodificar caracteres fuera del alfabeto Base32', () => {
    expect(() => decodeBase32('JBSWY3D!EHPK')).toThrowError(/Carácter Base32 no válido/);
    expect(() => decodeBase32('8901')).toThrowError(/Carácter Base32 no válido/);
  });
});
