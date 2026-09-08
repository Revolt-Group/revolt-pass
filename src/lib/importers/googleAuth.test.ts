import { describe, it, expect } from 'vitest';
import { parseGoogleAuthMigration } from './googleAuth';
import { encodeMigrationPayload } from '../exporters/protobufEncoder';
import type { VaultItem } from '../../types/vault';

describe('Google Authenticator Migration Importer', () => {
  const sampleItems: VaultItem[] = [
    {
      id: 'item-1',
      type: 'totp',
      issuer: 'GitHub',
      account: 'octocat',
      secret: 'JBSWY3DPEHPK3PXP',
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
      created_at: 1000,
      updated_at: 1000,
    },
    {
      id: 'item-2',
      type: 'totp',
      issuer: 'Cloudflare',
      account: 'admin@revolt.com',
      secret: 'KRUGS4ZANFZSA53E',
      digits: 8,
      period: 30,
      algorithm: 'SHA256',
      created_at: 2000,
      updated_at: 2000,
    },
  ];

  it('correctly parses valid protobuf encoded migration URI', () => {
    const uri = encodeMigrationPayload(sampleItems);
    const result = parseGoogleAuthMigration(uri);

    expect(result.platform).toBe('google_auth');
    expect(result.platformLabel).toBe('Google Authenticator');
    expect(result.accounts).toHaveLength(2);

    expect(result.accounts[0].issuer).toBe('GitHub');
    expect(result.accounts[0].name).toBe('octocat');
    expect(result.accounts[0].secret).toBe('JBSWY3DPEHPK3PXP');
    expect(result.accounts[0].digits).toBe(6);

    expect(result.accounts[1].issuer).toBe('Cloudflare');
    expect(result.accounts[1].name).toBe('admin@revolt.com');
    expect(result.accounts[1].digits).toBe(8);
    expect(result.accounts[1].algorithm).toBe('SHA256');
  });

  it('rejects invalid URI prefix gracefully with warning', () => {
    const invalidUri = 'https://example.com/otpauth?data=123';
    const result = parseGoogleAuthMigration(invalidUri);

    expect(result.accounts).toHaveLength(0);
    expect(result.warnings[0]).toContain('otpauth-migration://offline');
  });

  it('handles missing data parameter with warning', () => {
    const noDataUri = 'otpauth-migration://offline?foo=bar';
    const result = parseGoogleAuthMigration(noDataUri);

    expect(result.accounts).toHaveLength(0);
    expect(result.warnings[0]).toContain('Parámetro "data" no encontrado');
  });

  it('handles corrupted base64 data without throwing unhandled exceptions', () => {
    const corruptUri = 'otpauth-migration://offline?data=***invalid-base64***';
    const result = parseGoogleAuthMigration(corruptUri);

    expect(result.accounts).toHaveLength(0);
    expect(result.warnings[0]).toContain('Fallo al procesar QR de Google Authenticator');
  });
});
