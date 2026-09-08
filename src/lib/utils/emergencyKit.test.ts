import { describe, it, expect } from 'vitest';
import { generateEmergencyKitHtml } from './emergencyKit.ts';

describe('Zero-Knowledge Emergency Kit Generator', () => {
  it('generates offline HTML containing user metadata, QR code, and handwritten custody box', () => {
    const html = generateEmergencyKitHtml({
      userId: 'usr_abc123_xyz',
      username: 'ignacio_admin',
      instanceUrl: 'https://pass.revoltgroup.com.ar',
      vaultVersion: 3,
      kdfAlgorithm: 'argon2id',
      createdAt: 1700000000000,
    });

    expect(html).toContain('REVOLT PASS');
    expect(html).toContain('usr_abc123_xyz');
    expect(html).toContain('ignacio_admin');
    expect(html).toContain('https://pass.revoltgroup.com.ar');
    expect(html).toContain('Argon2id 64MB');
    expect(html).toContain('v3');
    expect(html).toContain('<svg');
    expect(html).toContain('ANOTAR EXCLUSIVAMENTE A MANO');
    expect(html).toContain('window.print()');
  });
});
