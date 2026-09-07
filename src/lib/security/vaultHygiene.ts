import type { VaultItem } from '../../types/vault.ts';

export type HygieneSeverity = 'critical' | 'warning' | 'info';
export type HygieneCategory =
  | 'breached'
  | 'weak_secret'
  | 'duplicate_secret'
  | 'no_backup'
  | 'no_recovery_codes'
  | 'exhausted_recovery_codes';

export interface HygieneIssue {
  id: string;
  severity: HygieneSeverity;
  category: HygieneCategory;
  itemId?: string;
  itemTitle?: string;
  titleKey: string;
  descKey: string;
  descParams?: Record<string, string | number>;
  actionType?: 'open_item' | 'open_backup';
}

export interface VaultHealthScore {
  score: number; // 0 to 100
  grade: 'excellent' | 'good' | 'warning' | 'critical';
  totalAccounts: number;
  issues: HygieneIssue[];
  stats: {
    duplicateSecretsCount: number;
    weakSecretsCount: number;
    noRecoveryCodesCount: number;
    daysSinceLastBackup: number | null;
  };
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Evaluates the cryptographic hygiene and resilience of the current vault items.
 *
 * @param items List of decrypted vault items.
 * @param lastBackupAt Timestamp in ms of the last backup export (if any).
 * @param now Optional timestamp for deterministic testing.
 */
export function evaluateVaultHygiene(
  items: VaultItem[],
  lastBackupAt?: number | null,
  now: number = Date.now()
): VaultHealthScore {
  const issues: HygieneIssue[] = [];

  // 1. Evaluate Backup Freshness
  let daysSinceLastBackup: number | null = null;
  if (!lastBackupAt) {
    issues.push({
      id: 'issue-no-backup-ever',
      severity: 'warning',
      category: 'no_backup',
      titleKey: 'hygiene.issues.noBackupEverTitle',
      descKey: 'hygiene.issues.noBackupEverDesc',
      actionType: 'open_backup',
    });
  } else {
    const elapsedMs = now - lastBackupAt;
    daysSinceLastBackup = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
    if (elapsedMs > THIRTY_DAYS_MS) {
      issues.push({
        id: 'issue-backup-outdated',
        severity: 'warning',
        category: 'no_backup',
        titleKey: 'hygiene.issues.backupOutdatedTitle',
        descKey: 'hygiene.issues.backupOutdatedDesc',
        descParams: { days: daysSinceLastBackup },
        actionType: 'open_backup',
      });
    }
  }

  // 2. Evaluate Duplicated Secrets
  const secretMap = new Map<string, VaultItem[]>();
  for (const item of items) {
    const normalizedSecret = (item.secret || '').replace(/\s|-/g, '').toUpperCase();
    if (!normalizedSecret) continue;
    const existing = secretMap.get(normalizedSecret) || [];
    existing.push(item);
    secretMap.set(normalizedSecret, existing);
  }

  let duplicateSecretsCount = 0;
  secretMap.forEach((matchedItems, secret) => {
    if (matchedItems.length > 1) {
      duplicateSecretsCount += matchedItems.length;
      const names = matchedItems.map((i) => i.issuer || i.account).join(', ');
      issues.push({
        id: `issue-duplicate-${secret.slice(0, 6)}`,
        severity: 'warning',
        category: 'duplicate_secret',
        itemId: matchedItems[0].id,
        itemTitle: matchedItems[0].issuer,
        titleKey: 'hygiene.issues.duplicateSecretTitle',
        descKey: 'hygiene.issues.duplicateSecretDesc',
        descParams: { count: matchedItems.length, names },
        actionType: 'open_item',
      });
    }
  });

  // 3. Evaluate Weak Secrets (< 16 Base32 characters = < 80 bits entropy)
  let weakSecretsCount = 0;
  for (const item of items) {
    const cleanSecret = (item.secret || '').replace(/\s|-/g, '');
    if (cleanSecret.length > 0 && cleanSecret.length < 16) {
      weakSecretsCount += 1;
      issues.push({
        id: `issue-weak-${item.id}`,
        severity: 'warning',
        category: 'weak_secret',
        itemId: item.id,
        itemTitle: item.issuer || item.account,
        titleKey: 'hygiene.issues.weakSecretTitle',
        descKey: 'hygiene.issues.weakSecretDesc',
        descParams: { issuer: item.issuer || item.account, length: cleanSecret.length },
        actionType: 'open_item',
      });
    }
  }

  // 4. Evaluate Recovery Codes
  let noRecoveryCodesCount = 0;
  for (const item of items) {
    if (!item.recovery_codes || item.recovery_codes.length === 0) {
      noRecoveryCodesCount += 1;
      issues.push({
        id: `issue-no-recovery-${item.id}`,
        severity: 'info',
        category: 'no_recovery_codes',
        itemId: item.id,
        itemTitle: item.issuer || item.account,
        titleKey: 'hygiene.issues.noRecoveryCodesTitle',
        descKey: 'hygiene.issues.noRecoveryCodesDesc',
        descParams: { issuer: item.issuer || item.account },
        actionType: 'open_item',
      });
    } else if (item.recovery_codes.every((rc) => rc.used)) {
      issues.push({
        id: `issue-exhausted-recovery-${item.id}`,
        severity: 'warning',
        category: 'exhausted_recovery_codes',
        itemId: item.id,
        itemTitle: item.issuer || item.account,
        titleKey: 'hygiene.issues.exhaustedRecoveryCodesTitle',
        descKey: 'hygiene.issues.exhaustedRecoveryCodesDesc',
        descParams: { issuer: item.issuer || item.account },
        actionType: 'open_item',
      });
    }
  }

  // 5. Calculate Weighted Health Score (0 - 100)
  let score = 100;

  // Deduct for backup
  if (!lastBackupAt || (now - lastBackupAt > THIRTY_DAYS_MS)) {
    score -= 20;
  }

  // Deduct for duplicate secrets (-15 per duplicate group)
  secretMap.forEach((matchedItems) => {
    if (matchedItems.length > 1) {
      score -= 15;
    }
  });

  // Deduct for weak secrets (-10 each)
  score -= weakSecretsCount * 10;

  // Deduct for accounts lacking recovery codes (-5 each, capped at -20)
  const recoveryDeduction = Math.min(noRecoveryCodesCount * 5, 20);
  score -= recoveryDeduction;

  // Ensure bounds [0, 100]
  score = Math.max(0, Math.min(100, score));

  // Determine Grade
  let grade: VaultHealthScore['grade'] = 'excellent';
  if (score < 50) {
    grade = 'critical';
  } else if (score < 70) {
    grade = 'warning';
  } else if (score < 90) {
    grade = 'good';
  }

  return {
    score,
    grade,
    totalAccounts: items.length,
    issues,
    stats: {
      duplicateSecretsCount,
      weakSecretsCount,
      noRecoveryCodesCount,
      daysSinceLastBackup,
    },
  };
}
