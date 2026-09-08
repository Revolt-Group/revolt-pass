import { describe, it, expect } from 'vitest';
import { exportVaultToBitwardenCsv } from './bitwardenExport';
import type { VaultItem } from '../../types/vault';

describe('Bitwarden CSV Exporter', () => {
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
      pinned: true,
      notes: 'Contains, commas and "quotes"',
      created_at: 1000,
      updated_at: 1000,
    },
    {
      id: 'item-2',
      type: 'totp',
      issuer: 'Slack',
      account: 'team@company.org',
      secret: 'KRUGS4ZANFZSA53E',
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
      pinned: false,
      notes: 'Line 1\nLine 2',
      created_at: 2000,
      updated_at: 2000,
    },
  ];

  it('generates CSV with required Bitwarden header columns', () => {
    const csv = exportVaultToBitwardenCsv(sampleItems);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp'
    );
  });

  it('correctly maps favorite flag and populates login_totp with otpauth URI', () => {
    const csv = exportVaultToBitwardenCsv(sampleItems);
    expect(csv).toContain('GitHub');
    expect(csv).toContain('octocat');
    expect(csv).toContain('otpauth://totp/GitHub:octocat?');
    expect(csv).toContain(',1,login,GitHub'); // favorite=true
    expect(csv).toContain(',0,login,Slack'); // favorite=false
  });

  it('escapes cells containing commas, double quotes and newlines', () => {
    const csv = exportVaultToBitwardenCsv(sampleItems);
    expect(csv).toContain('""quotes""');
    expect(csv).toContain('"Line 1\nLine 2"');
  });

  it('handles empty vault returning only the header row', () => {
    const csv = exportVaultToBitwardenCsv([]);
    expect(csv.trim()).toBe(
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp'
    );
  });
});
