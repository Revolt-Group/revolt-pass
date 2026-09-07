import { describe, it, expect } from 'vitest';
import {
  encodeMigrationPayload,
  encodeOtpParameters,
  chunkAccountsForMigration,
  buildOtpAuthUri,
} from './protobufEncoder';
import { decodeMigrationProtobuf } from '../importers/protobuf';
import { parseGoogleAuthMigration } from '../importers/googleAuth';
import type { VaultItem } from '../../types/vault';

describe('Protobuf Encoder for Google Authenticator Migration', () => {
  const sampleItems: VaultItem[] = [
    {
      id: 'item-1',
      type: 'totp',
      issuer: 'GitHub',
      account: 'octocat@github.com',
      secret: 'JBSWY3DPEHPK3PXP', // Base32 for 'Hello!'
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
      account: 'admin@revoltgroup.com.ar',
      secret: 'KRUGS4ZANFZSA53E',
      digits: 8,
      period: 30,
      algorithm: 'SHA256',
      created_at: 2000,
      updated_at: 2000,
    },
    {
      id: 'item-3',
      type: 'totp',
      issuer: 'AWS',
      account: 'root',
      secret: 'KVKFKRSTPE======',
      digits: 6,
      period: 30,
      algorithm: 'SHA512',
      created_at: 3000,
      updated_at: 3000,
    },
  ];

  it('correctly serializes and round-trips via parseGoogleAuthMigration', () => {
    const uri = encodeMigrationPayload(sampleItems, 0, 1, 42);
    expect(uri).toContain('otpauth-migration://offline?data=');

    const result = parseGoogleAuthMigration(uri);
    expect(result.platform).toBe('google_auth');
    expect(result.accounts.length).toBe(3);

    // Item 1
    expect(result.accounts[0].issuer).toBe('GitHub');
    expect(result.accounts[0].name).toBe('octocat@github.com');
    expect(result.accounts[0].secret).toBe('JBSWY3DPEHPK3PXP');
    expect(result.accounts[0].digits).toBe(6);
    expect(result.accounts[0].algorithm).toBe('SHA1');

    // Item 2
    expect(result.accounts[1].issuer).toBe('Cloudflare');
    expect(result.accounts[1].name).toBe('admin@revoltgroup.com.ar');
    expect(result.accounts[1].secret).toBe('KRUGS4ZANFZSA53E');
    expect(result.accounts[1].digits).toBe(8);
    expect(result.accounts[1].algorithm).toBe('SHA256');

    // Item 3
    expect(result.accounts[2].issuer).toBe('AWS');
    expect(result.accounts[2].name).toBe('root');
    expect(result.accounts[2].secret).toBe('KVKFKRSTPE');
    expect(result.accounts[2].digits).toBe(6);
    expect(result.accounts[2].algorithm).toBe('SHA512');
  });

  it('correctly chunks accounts into batches', () => {
    const twentyAccounts: VaultItem[] = Array.from({ length: 20 }, (_, i) => ({
      id: `acc-${i}`,
      type: 'totp',
      issuer: `Service ${i}`,
      account: `user${i}@test.com`,
      secret: 'JBSWY3DPEHPK3PXP',
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
      created_at: 1000 + i,
      updated_at: 1000 + i,
    }));

    const batches = chunkAccountsForMigration(twentyAccounts, 7);
    expect(batches.length).toBe(3); // 7 + 7 + 6
    expect(batches[0].length).toBe(7);
    expect(batches[1].length).toBe(7);
    expect(batches[2].length).toBe(6);
  });

  it('generates standard universal otpauth:// URIs with buildOtpAuthUri', () => {
    const uri1 = buildOtpAuthUri(sampleItems[0]);
    expect(uri1).toContain('otpauth://totp/GitHub:octocat%40github.com?');
    expect(uri1).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri1).toContain('issuer=GitHub');

    const uri2 = buildOtpAuthUri(sampleItems[1]);
    expect(uri2).toContain('algorithm=SHA256');
    expect(uri2).toContain('digits=8');
  });
});
