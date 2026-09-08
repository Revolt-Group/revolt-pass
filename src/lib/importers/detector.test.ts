import { describe, it, expect } from 'vitest';
import { detectAndParseImport } from './detector';

describe('Format Detector & Auto-Parser', () => {
  it('detects Google Authenticator migration payload', () => {
    const content = 'otpauth-migration://offline?data=CjEKCkhlbGxvIWtpZGIN';
    const result = detectAndParseImport(content);
    expect(result.platform).toBe('google_auth');
    expect(result.platformLabel).toBe('Google Authenticator');
  });

  it('detects Aegis JSON format', () => {
    const content = JSON.stringify({
      version: 1,
      header: { slots: null, params: null },
      db: {
        version: 1,
        entries: [
          {
            type: 'totp',
            name: 'alice@example.com',
            issuer: 'AegisTest',
            info: { secret: 'JBSWY3DPEHPK3PXP', algo: 'SHA1', digits: 6, period: 30 },
          },
        ],
      },
    });

    const result = detectAndParseImport(content, 'aegis_export.json');
    expect(result.platform).toBe('aegis');
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].issuer).toBe('AegisTest');
  });

  it('detects 2FAS by .2fas extension or JSON schema', () => {
    const content = JSON.stringify({
      schemaVersion: 4,
      services: [
        {
          name: '2FASTest',
          otp: { account: 'bob', label: '2FASTest', secret: 'KRUGS4ZANFZSA53E', digits: 6, period: 30, algorithm: 'SHA1' },
        },
      ],
    });

    const result = detectAndParseImport(content, 'backup.2fas');
    expect(result.platform).toBe('2fas');
    expect(result.accounts).toHaveLength(1);
  });

  it('detects Bitwarden CSV export', () => {
    const csvContent =
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n' +
      ',0,login,BitwardenTest,,,0,,testuser,,otpauth://totp/BitwardenTest:testuser?secret=JBSWY3DPEHPK3PXP';

    const result = detectAndParseImport(csvContent, 'bitwarden_export.csv');
    expect(result.platform).toBe('bitwarden');
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].issuer).toBe('BitwardenTest');
  });

  it('detects raw otpauth:// URI list', () => {
    const listContent =
      '# Exported accounts\n' +
      'otpauth://totp/PlainTest:user?secret=JBSWY3DPEHPK3PXP&issuer=PlainTest\n' +
      'otpauth://totp/Other:admin?secret=KRUGS4ZANFZSA53E&issuer=Other';

    const result = detectAndParseImport(listContent);
    expect(result.platform).toBe('otpauth_list');
    expect(result.accounts).toHaveLength(2);
  });

  it('handles unrecognized format gracefully with warning', () => {
    const unknown = 'random unformatted text here';
    const result = detectAndParseImport(unknown);
    expect(result.accounts).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
