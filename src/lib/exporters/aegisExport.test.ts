import { describe, it, expect } from 'vitest';
import { exportVaultToAegis, type AegisExportFormat } from './aegisExport';
import type { VaultItem } from '../../types/vault';

describe('Aegis Exporter', () => {
  const sampleItems: VaultItem[] = [
    {
      id: 'item-1',
      type: 'totp',
      issuer: 'GitHub',
      account: 'octocat@github.com',
      secret: 'JBSW Y3DP EHPK 3PXP', // Contains spaces to test sanitization
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
      pinned: true,
      notes: 'Work account',
      created_at: 1000,
      updated_at: 1000,
    },
    {
      id: 'item-2',
      type: 'totp',
      issuer: 'AWS & Cloud "Dev"',
      account: 'admin <super>',
      secret: 'KRUGS4ZANFZSA53E',
      digits: 8,
      period: 60,
      algorithm: 'SHA256',
      pinned: false,
      created_at: 2000,
      updated_at: 2000,
    },
  ];

  it('generates valid parseable JSON matching Aegis schema', () => {
    const jsonStr = exportVaultToAegis(sampleItems);
    const parsed: AegisExportFormat = JSON.parse(jsonStr);

    expect(parsed.version).toBe(1);
    expect(parsed.header.slots).toBeNull();
    expect(parsed.db.version).toBe(1);
    expect(parsed.db.entries).toHaveLength(2);
  });

  it('correctly maps TOTP parameters and strips spaces from secret', () => {
    const jsonStr = exportVaultToAegis(sampleItems);
    const parsed: AegisExportFormat = JSON.parse(jsonStr);

    const entry1 = parsed.db.entries[0];
    expect(entry1.type).toBe('totp');
    expect(entry1.uuid).toBe('item-1');
    expect(entry1.name).toBe('octocat@github.com');
    expect(entry1.issuer).toBe('GitHub');
    expect(entry1.note).toBe('Work account');
    expect(entry1.favorite).toBe(true);
    expect(entry1.info.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(entry1.info.algo).toBe('SHA1');
    expect(entry1.info.digits).toBe(6);
    expect(entry1.info.period).toBe(30);

    const entry2 = parsed.db.entries[1];
    expect(entry2.issuer).toBe('AWS & Cloud "Dev"');
    expect(entry2.name).toBe('admin <super>');
    expect(entry2.favorite).toBe(false);
    expect(entry2.info.digits).toBe(8);
    expect(entry2.info.period).toBe(60);
    expect(entry2.info.algo).toBe('SHA256');
  });

  it('handles empty vault gracefully', () => {
    const jsonStr = exportVaultToAegis([]);
    const parsed: AegisExportFormat = JSON.parse(jsonStr);

    expect(parsed.version).toBe(1);
    expect(parsed.db.entries).toEqual([]);
  });
});
