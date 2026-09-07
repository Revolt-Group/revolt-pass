import { describe, it, expect } from 'vitest';
import { evaluateVaultHygiene } from './vaultHygiene.ts';
import type { VaultItem } from '../../types/vault.ts';

function createMockItem(partial: Partial<VaultItem> = {}): VaultItem {
  return {
    id: 'test-item-1',
    type: 'totp',
    issuer: 'GitHub',
    account: 'developer@example.com',
    secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', // 32 chars Base32 (160 bits)
    digits: 6,
    period: 30,
    algorithm: 'SHA1',
    recovery_codes: [{ code: '1111-2222', used: false }],
    created_at: Date.now(),
    updated_at: Date.now(),
    ...partial,
  };
}

describe('Vault Hygiene & Resilience Engine (vaultHygiene.ts)', () => {
  const mockNow = 1725600000000; // Fixed timestamp
  const recentBackup = mockNow - 2 * 24 * 60 * 60 * 1000; // 2 days ago

  it('rates a pristine vault with 100% score and excellent grade', () => {
    const items: VaultItem[] = [
      createMockItem({ id: 'item-1', issuer: 'GitHub', secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' }),
      createMockItem({ id: 'item-2', issuer: 'Google', secret: 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU' }),
    ];

    const result = evaluateVaultHygiene(items, recentBackup, mockNow);
    expect(result.score).toBe(100);
    expect(result.grade).toBe('excellent');
    expect(result.issues.length).toBe(0);
    expect(result.stats.duplicateSecretsCount).toBe(0);
    expect(result.stats.weakSecretsCount).toBe(0);
    expect(result.stats.daysSinceLastBackup).toBe(2);
  });

  it('deducts 20 points and issues warning when no backup has ever been made', () => {
    const items: VaultItem[] = [createMockItem()];

    const result = evaluateVaultHygiene(items, null, mockNow);
    expect(result.score).toBe(80);
    expect(result.grade).toBe('good');
    expect(result.issues.some((i) => i.id === 'issue-no-backup-ever')).toBe(true);
    expect(result.stats.daysSinceLastBackup).toBeNull();
  });

  it('deducts 20 points and warns when backup is older than 30 days', () => {
    const oldBackup = mockNow - 45 * 24 * 60 * 60 * 1000; // 45 days ago
    const items: VaultItem[] = [createMockItem()];

    const result = evaluateVaultHygiene(items, oldBackup, mockNow);
    expect(result.score).toBe(80);
    expect(result.issues.some((i) => i.id === 'issue-backup-outdated')).toBe(true);
    expect(result.stats.daysSinceLastBackup).toBe(45);
  });

  it('detects duplicated TOTP secrets across multiple services', () => {
    const sharedSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    const items: VaultItem[] = [
      createMockItem({ id: 'item-1', issuer: 'GitHub', secret: sharedSecret }),
      createMockItem({ id: 'item-2', issuer: 'GitLab', secret: sharedSecret.toLowerCase() }), // tests normalization
    ];

    const result = evaluateVaultHygiene(items, recentBackup, mockNow);
    expect(result.stats.duplicateSecretsCount).toBe(2);
    expect(result.issues.some((i) => i.category === 'duplicate_secret')).toBe(true);
    expect(result.score).toBe(85); // 100 - 15
  });

  it('detects weak Base32 secrets having less than 16 characters (< 80 bits)', () => {
    const items: VaultItem[] = [
      createMockItem({ id: 'item-1', issuer: 'WeakService', secret: 'SHORT78' }), // 7 chars
    ];

    const result = evaluateVaultHygiene(items, recentBackup, mockNow);
    expect(result.stats.weakSecretsCount).toBe(1);
    expect(result.issues.some((i) => i.category === 'weak_secret')).toBe(true);
    expect(result.score).toBe(90); // 100 - 10
  });

  it('detects accounts with missing or completely exhausted recovery codes', () => {
    const items: VaultItem[] = [
      createMockItem({ id: 'item-1', issuer: 'NoCodes', recovery_codes: [] }),
      createMockItem({
        id: 'item-2',
        issuer: 'ExhaustedCodes',
        recovery_codes: [{ code: 'USED-1', used: true }],
      }),
    ];

    const result = evaluateVaultHygiene(items, recentBackup, mockNow);
    expect(result.stats.noRecoveryCodesCount).toBe(1);
    expect(result.issues.some((i) => i.category === 'no_recovery_codes')).toBe(true);
    expect(result.issues.some((i) => i.category === 'exhausted_recovery_codes')).toBe(true);
  });

  it('calculates compound issues and correctly assigns critical grade below 50', () => {
    const sharedWeak = 'SHORT'; // weak + duplicate
    const items: VaultItem[] = [
      createMockItem({ id: 'item-1', issuer: 'A', secret: sharedWeak, recovery_codes: [] }),
      createMockItem({ id: 'item-2', issuer: 'B', secret: sharedWeak, recovery_codes: [] }),
      createMockItem({ id: 'item-3', issuer: 'C', secret: 'WEAK2', recovery_codes: [] }),
    ];

    // No backup (-20), Duplicate group (-15), 3 weak secrets (-30), 3 no recovery (-15)
    // 100 - 20 - 15 - 30 - 15 = 20
    const result = evaluateVaultHygiene(items, null, mockNow);
    expect(result.score).toBe(20);
    expect(result.grade).toBe('critical');
  });
});
