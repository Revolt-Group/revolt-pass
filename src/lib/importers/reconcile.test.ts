import { describe, it, expect } from 'vitest';
import { analyzeReconciliation, applyReconciliation } from './reconcile';
import type { VaultItem } from '../../types/vault';
import type { ImportedAccount } from './types';

describe('Reconciliation Engine', () => {
  const existingVault: VaultItem[] = [
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
      issuer: 'AWS',
      account: 'root',
      secret: 'SECRETOLD1111111',
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
      created_at: 1000,
      updated_at: 1000,
    },
  ];

  const incomingAccounts: ImportedAccount[] = [
    // 1. Exact duplicate of GitHub (same secret)
    {
      issuer: 'GitHub',
      name: 'octocat',
      secret: 'JBSWY3DPEHPK3PXP',
      type: 'totp',
    },
    // 2. Conflict on AWS (same issuer & name, different secret)
    {
      issuer: 'AWS',
      name: 'root',
      secret: 'SECRETNEW2222222',
      type: 'totp',
    },
    // 3. Brand new account
    {
      issuer: 'Cloudflare',
      name: 'dev@revolt.com',
      secret: 'KRUGS4ZANFZSA53E',
      type: 'totp',
    },
  ];

  it('correctly classifies items into duplicate, conflict and new', () => {
    const summary = analyzeReconciliation(existingVault, incomingAccounts);

    expect(summary.totalParsed).toBe(3);
    expect(summary.duplicateCount).toBe(1);
    expect(summary.conflictCount).toBe(1);
    expect(summary.newCount).toBe(1);

    expect(summary.diffs[0].status).toBe('duplicate');
    expect(summary.diffs[1].status).toBe('conflict');
    expect(summary.diffs[2].status).toBe('new');
  });

  it('applies "keep_existing" strategy without overwriting conflicts', () => {
    const summary = analyzeReconciliation(existingVault, incomingAccounts);
    const merged = applyReconciliation(existingVault, summary, 'keep_existing');

    expect(merged).toHaveLength(3); // 2 existing + 1 new
    const aws = merged.find((i) => i.issuer === 'AWS');
    expect(aws?.secret).toBe('SECRETOLD1111111');
    const cloudflare = merged.find((i) => i.issuer === 'Cloudflare');
    expect(cloudflare).toBeDefined();
  });

  it('applies "overwrite" strategy updating existing items with incoming data', () => {
    const summary = analyzeReconciliation(existingVault, incomingAccounts);
    const merged = applyReconciliation(existingVault, summary, 'overwrite');

    expect(merged).toHaveLength(3);
    const aws = merged.find((i) => i.issuer === 'AWS');
    expect(aws?.secret).toBe('SECRETNEW2222222');
  });

  it('applies "keep_both" strategy appending conflicting items with suffix', () => {
    const summary = analyzeReconciliation(existingVault, incomingAccounts);
    const merged = applyReconciliation(existingVault, summary, 'keep_both');

    // 2 existing + 1 new + 1 duplicate kept + 1 conflict kept as copy = 5 items
    expect(merged).toHaveLength(5);
    const awsItems = merged.filter((i) => i.issuer === 'AWS');
    expect(awsItems).toHaveLength(2);
    expect(awsItems.some((i) => i.account.includes('(Importado)'))).toBe(true);
  });
});
