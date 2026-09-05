import { describe, it, expect } from 'vitest';
import {
  generateTotp,
  getTotpRemainingSeconds,
  getTotpProgress,
  parseOtpAuthUri,
} from './totp.ts';

describe('RFC 6238 TOTP Engine', () => {
  // =========================================================================
  // Official RFC 6238 Appendix B Vectors
  // Seed SHA1 (20 bytes): ASCII "12345678901234567890"
  // Seed SHA256 (32 bytes): ASCII "12345678901234567890123456789012"
  // =========================================================================

  const sha1SeedBytes = new TextEncoder().encode('12345678901234567890');
  const sha256SeedBytes = new TextEncoder().encode('12345678901234567890123456789012');

  const rfcSha1Vectors = [
    { timeSeconds: 59, expected: '94287082' },
    { timeSeconds: 1111111109, expected: '07081804' },
    { timeSeconds: 1111111111, expected: '14050471' },
    { timeSeconds: 1234567890, expected: '89005924' },
    { timeSeconds: 2000000000, expected: '69279037' },
    { timeSeconds: 20000000000, expected: '65353130' },
  ];

  const rfcSha256Vectors = [
    { timeSeconds: 59, expected: '46119246' },
    { timeSeconds: 1111111109, expected: '68084774' },
    { timeSeconds: 1111111111, expected: '67062674' },
    { timeSeconds: 1234567890, expected: '91819424' },
    { timeSeconds: 2000000000, expected: '90698825' },
    { timeSeconds: 20000000000, expected: '77737706' },
  ];

  it('accurately validates all RFC 6238 Appendix B vectors with HMAC-SHA1 (8 digits)', async () => {
    for (const vector of rfcSha1Vectors) {
      const code = await generateTotp(sha1SeedBytes, {
        timestampSeconds: vector.timeSeconds,
        digits: 8,
        period: 30,
        algorithm: 'SHA1',
      });
      expect(code).toBe(vector.expected);
    }
  });

  it('accurately validates all RFC 6238 Appendix B vectors with HMAC-SHA256 (8 digits)', async () => {
    for (const vector of rfcSha256Vectors) {
      const code = await generateTotp(sha256SeedBytes, {
        timestampSeconds: vector.timeSeconds,
        digits: 8,
        period: 30,
        algorithm: 'SHA256',
      });
      expect(code).toBe(vector.expected);
    }
  });

  it('generates standard 6-digit tokens with Base32 secrets', async () => {
    // Canonical Base32 secret: "JBSWY3DPEHPK3PXP" (ASCII: "Hello!\xde\xad\xbe\xef")
    const secret = 'JBSWY3DPEHPK3PXP';
    const code = await generateTotp(secret, {
      timestampSeconds: 1234567890,
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
    });

    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it('applies Time Drift Compensation', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    // If local clock is 30 seconds behind, offsetMs = +30000 should return the next step code
    const codeNormal = await generateTotp(secret, {
      timestampSeconds: 100, // step T = floor(100 / 30) = 3
      digits: 6,
      period: 30,
    });

    const codeWithDrift = await generateTotp(secret, {
      timestampSeconds: 70, // 70 + 30 = 100 => step T = floor(100 / 30) = 3
      timeDriftOffsetMs: 30000,
      digits: 6,
      period: 30,
    });

    expect(codeWithDrift).toBe(codeNormal);
  });

  it('correctly calculates remaining seconds and progress fraction', () => {
    const remaining = getTotpRemainingSeconds(30, 0);
    expect(remaining).toBeGreaterThanOrEqual(1);
    expect(remaining).toBeLessThanOrEqual(30);

    const progress = getTotpProgress(30, 0);
    expect(progress).toBeGreaterThanOrEqual(0);
    expect(progress).toBeLessThanOrEqual(1);
  });

  it('parses complete otpauth://totp/ URIs including special characters', () => {
    const uri = 'otpauth://totp/GitHub:user%40revoltgroup.com.ar?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6&period=30&algorithm=SHA1';
    const parsed = parseOtpAuthUri(uri);

    expect(parsed.type).toBe('totp');
    expect(parsed.issuer).toBe('GitHub');
    expect(parsed.account).toBe('user@revoltgroup.com.ar');
    expect(parsed.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(parsed.digits).toBe(6);
    expect(parsed.period).toBe(30);
    expect(parsed.algorithm).toBe('SHA1');
  });

  it('throws error when attempting to parse invalid URIs or URIs without secret', () => {
    expect(() => parseOtpAuthUri('https://example.com')).toThrowError(/Invalid URI format/);
    expect(() => parseOtpAuthUri('otpauth://totp/GitHub:user?digits=6')).toThrowError(/required "secret" parameter/);
  });
});
