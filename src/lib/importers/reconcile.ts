import type { VaultItem, TotpAlgorithm } from '../../types/vault';
import type {
  ImportedAccount,
  ReconcileItemDiff,
  ReconciliationSummary,
  ReconciliationStrategy,
} from './types';

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Analyzes incoming accounts vs existing vault items, computing diff status for each.
 */
export function analyzeReconciliation(
  existingVault: VaultItem[],
  importedAccounts: ImportedAccount[]
): ReconciliationSummary {
  const diffs: ReconcileItemDiff[] = [];
  let newCount = 0;
  let duplicateCount = 0;
  let conflictCount = 0;

  for (const imported of importedAccounts) {
    // 1. Exact secret match -> duplicate
    const exactSecretMatch = existingVault.find(
      (item) => item.secret.replace(/\s+/g, '') === imported.secret.replace(/\s+/g, '')
    );

    if (exactSecretMatch) {
      diffs.push({
        account: imported,
        status: 'duplicate',
        existingItem: exactSecretMatch,
      });
      duplicateCount++;
      continue;
    }

    // 2. Issuer + Account match with different secret -> conflict
    const nameMatch = existingVault.find(
      (item) =>
        normalize(item.issuer) === normalize(imported.issuer) &&
        normalize(item.account) === normalize(imported.name)
    );

    if (nameMatch) {
      diffs.push({
        account: imported,
        status: 'conflict',
        existingItem: nameMatch,
      });
      conflictCount++;
      continue;
    }

    // 3. New account
    diffs.push({
      account: imported,
      status: 'new',
    });
    newCount++;
  }

  return {
    diffs,
    totalParsed: importedAccounts.length,
    newCount,
    duplicateCount,
    conflictCount,
  };
}

/**
 * Applies the reconciliation strategy and produces a merged VaultItem array.
 */
export function applyReconciliation(
  existingVault: VaultItem[],
  summary: ReconciliationSummary,
  strategy: ReconciliationStrategy
): VaultItem[] {
  const result = [...existingVault];
  const now = Date.now();

  function convertToVaultItem(acc: ImportedAccount, overrideId?: string, nameSuffix?: string): VaultItem {
    const algorithm: TotpAlgorithm = acc.algorithm === 'SHA256' ? 'SHA256' : 'SHA1';
    const digits: 6 | 8 = acc.digits === 8 ? 8 : 6;

    return {
      id: overrideId || acc.originalVaultItem?.id || crypto.randomUUID(),
      type: acc.originalVaultItem?.type || 'totp',
      issuer: acc.issuer,
      account: nameSuffix ? `${acc.name} ${nameSuffix}` : acc.name,
      secret: acc.secret,
      digits,
      period: acc.period || 30,
      algorithm,
      pinned: acc.pinned ?? acc.originalVaultItem?.pinned,
      recovery_codes: acc.recovery_codes ?? acc.originalVaultItem?.recovery_codes,
      notes: acc.notes ?? acc.originalVaultItem?.notes,
      tags: acc.tags ?? acc.originalVaultItem?.tags,
      icon_url: acc.icon_url ?? acc.originalVaultItem?.icon_url,
      created_at: acc.originalVaultItem?.created_at || now,
      updated_at: now,
    };
  }

  for (const diff of summary.diffs) {
    if (diff.status === 'new') {
      result.push(convertToVaultItem(diff.account));
    } else if (diff.status === 'duplicate') {
      if (strategy === 'overwrite' && diff.existingItem) {
        const index = result.findIndex((i) => i.id === diff.existingItem!.id);
        if (index !== -1) {
          result[index] = {
            ...diff.existingItem,
            issuer: diff.account.issuer || diff.existingItem.issuer,
            account: diff.account.name || diff.existingItem.account,
            recovery_codes: diff.account.recovery_codes ?? diff.existingItem.recovery_codes,
            notes: diff.account.notes ?? diff.existingItem.notes,
            tags: diff.account.tags ?? diff.existingItem.tags,
            pinned: diff.account.pinned ?? diff.existingItem.pinned,
            icon_url: diff.account.icon_url ?? diff.existingItem.icon_url,
            updated_at: now,
          };
        }
      } else if (strategy === 'keep_both') {
        result.push(convertToVaultItem(diff.account, undefined, '(Duplicado)'));
      } else if (strategy === 'keep_existing' && diff.existingItem) {
        const existing = diff.existingItem;
        // If existing item has no recovery codes but imported item has them, enrich existing
        if (
          diff.account.recovery_codes &&
          diff.account.recovery_codes.length > 0 &&
          (!existing.recovery_codes || existing.recovery_codes.length === 0)
        ) {
          const index = result.findIndex((i) => i.id === existing.id);
          if (index !== -1) {
            result[index] = {
              ...result[index],
              recovery_codes: diff.account.recovery_codes,
              updated_at: now,
            };
          }
        }
      }
    } else if (diff.status === 'conflict') {
      if (strategy === 'overwrite' && diff.existingItem) {
        const index = result.findIndex((i) => i.id === diff.existingItem!.id);
        if (index !== -1) {
          result[index] = convertToVaultItem(diff.account, diff.existingItem.id);
        }
      } else if (strategy === 'keep_both') {
        result.push(convertToVaultItem(diff.account, undefined, '(Importado)'));
      }
      // 'keep_existing' does nothing (skips)
    }
  }

  return result;
}
