import { describe, it, expect } from 'vitest';
import { decodeBase32, encodeBase32, isValidBase32, sanitizeBase32 } from './base32.ts';

describe('Base32 RFC 4648 Encoder/Decoder', () => {
  // Official RFC 4648 test vectors (Section 10)
  const rfcVectors = [
    { text: '', base32Padded: '', base32Unpadded: '' },
    { text: 'f', base32Padded: 'MY======', base32Unpadded: 'MY' },
    { text: 'fo', base32Padded: 'MZXQ====', base32Unpadded: 'MZXQ' },
    { text: 'foo', base32Padded: 'MZXW6===', base32Unpadded: 'MZXW6' },
    { text: 'foob', base32Padded: 'MZXW6YQ=', base32Unpadded: 'MZXW6YQ' },
    { text: 'fooba', base32Padded: 'MZXW6YTB', base32Unpadded: 'MZXW6YTB' },
    { text: 'foobar', base32Padded: 'MZXW6YTBOI======', base32Unpadded: 'MZXW6YTBOI' },
  ];

  it('correctly encodes official RFC 4648 test vectors with and without padding', () => {
    const encoder = new TextEncoder();
    for (const vector of rfcVectors) {
      const bytes = encoder.encode(vector.text);
      expect(encodeBase32(bytes, false)).toBe(vector.base32Unpadded);
      expect(encodeBase32(bytes, true)).toBe(vector.base32Padded);
    }
  });

  it('correctly decodes strings with or without padding (=)', () => {
    const decoder = new TextDecoder();

    for (const vector of rfcVectors) {
      const decodedPadded = decodeBase32(vector.base32Padded);
      const decodedUnpadded = decodeBase32(vector.base32Unpadded);

      expect(decoder.decode(decodedPadded)).toBe(vector.text);
      expect(decoder.decode(decodedUnpadded)).toBe(vector.text);
    }
  });

  it('transparently sanitizes whitespace, hyphens, and lowercase characters', () => {
    // Typical TOTP secret case with whitespace and hyphens: "jbsw y3dp-ehpk 3pxp"
    const dirty = ' jbsw-y3dp - ehpk 3pxp= ';
    const clean = sanitizeBase32(dirty);
    expect(clean).toBe('JBSWY3DPEHPK3PXP');

    const decoded = decodeBase32(dirty);
    const expected = decodeBase32('JBSWY3DPEHPK3PXP');
    expect(decoded).toEqual(expected);
  });

  it('validates valid and invalid Base32 strings', () => {
    expect(isValidBase32('JBSWY3DPEHPK3PXP')).toBe(true);
    expect(isValidBase32('jbswy3dpehpk3pxp')).toBe(true); // Auto-converts to uppercase
    expect(isValidBase32('JBSW-Y3DP-EHPK-3PXP')).toBe(true);
    expect(isValidBase32('')).toBe(false);
    expect(isValidBase32('1890')).toBe(false); // '1', '8', '9', '0' do not exist in Base32 alphabet
    expect(isValidBase32('JBSW8')).toBe(false);
  });

  it('throws error when decoding characters outside Base32 alphabet', () => {
    expect(() => decodeBase32('JBSWY3D!EHPK')).toThrowError(/Invalid Base32 character/);
    expect(() => decodeBase32('8901')).toThrowError(/Invalid Base32 character/);
  });
});
