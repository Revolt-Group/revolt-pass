import { describe, it, expect } from 'vitest';
import { computeSha1Hex, checkPasswordPwned } from './pwnedCheck.ts';

describe('HaveIBeenPwned k-Anonymity Client Module (pwnedCheck.ts)', () => {
  it('computes accurate SHA-1 hashes matching official cryptographic test vectors', async () => {
    // Known SHA-1 test vectors
    expect(await computeSha1Hex('password')).toBe(
      '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8'
    );
    expect(await computeSha1Hex('123456')).toBe(
      '7C4A8D09CA3762AF61E59520943DC26494F8941B'
    );
  });

  it('returns false and 0 for empty or whitespace secrets without querying network', async () => {
    let fetchCalled = false;
    const mockFetch = async () => {
      fetchCalled = true;
      return new Response();
    };

    const res = await checkPasswordPwned('', mockFetch as unknown as typeof fetch);
    expect(res.compromised).toBe(false);
    expect(res.count).toBe(0);
    expect(fetchCalled).toBe(false);

    const resWhitespace = await checkPasswordPwned('   ', mockFetch as unknown as typeof fetch);
    expect(resWhitespace.compromised).toBe(false);
    expect(resWhitespace.count).toBe(0);
    expect(fetchCalled).toBe(false);
  });

  it('identifies compromised password when suffix matches mock HIBP range response', async () => {
    // "password" SHA-1 is 5BAA6 1E4C9B93F3F0682250B6CF8331B7EE68FD8
    const prefix = '5BAA6';
    const suffix = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';

    const mockResponseText = [
      '0018A45C4D1DEF81644B54AB7F969B88D65:1',
      `${suffix}:3860493`,
      '00D4F6E8FA6EEC340B4FBCED30C1DD02E39:2',
    ].join('\n');

    const mockFetch = async (url: RequestInfo | URL) => {
      expect(String(url)).toContain(`/api/pwned-check?prefix=${prefix}`);
      return new Response(
        JSON.stringify({
          success: true,
          data: { range: mockResponseText },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const result = await checkPasswordPwned('password', mockFetch as unknown as typeof fetch);
    expect(result.compromised).toBe(true);
    expect(result.count).toBe(3860493);
    expect(result.hashPrefix).toBe('5BAA6');
  });

  it('identifies safe uncompromised password when suffix is not present in range', async () => {
    const mockResponseText = [
      '0018A45C4D1DEF81644B54AB7F969B88D65:1',
      '00D4F6E8FA6EEC340B4FBCED30C1DD02E39:2',
    ].join('\n');

    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          success: true,
          data: { range: mockResponseText },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const result = await checkPasswordPwned(
      'SuperUniqueSecretString_9482_#$',
      mockFetch as unknown as typeof fetch
    );
    expect(result.compromised).toBe(false);
    expect(result.count).toBe(0);
    expect(result.hashPrefix.length).toBe(5);
  });

  it('throws error when server endpoint returns error status', async () => {
    const mockFetch = async () => {
      return new Response(JSON.stringify({ success: false }), { status: 502 });
    };

    await expect(
      checkPasswordPwned('test', mockFetch as unknown as typeof fetch)
    ).rejects.toThrow('Error al verificar filtraciones (HTTP 502)');
  });
});
