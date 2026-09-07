import type { VaultItem } from '../../types/vault';

export type ImportPlatform =
  | 'google_auth'
  | 'authy'
  | 'aegis'
  | '2fas'
  | 'bitwarden'
  | '1password'
  | 'proton_pass'
  | 'ente'
  | 'lastpass'
  | 'otpauth_list'
  | 'unknown';

export interface ImportedAccount {
  name: string;
  issuer: string;
  secret: string; // Sanitized Base32
  type: 'totp' | 'hotp';
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: number;
  period: number;
  counter?: number;
  platform: ImportPlatform;
}

export interface ImportResult {
  platform: ImportPlatform;
  platformLabel: string;
  accounts: ImportedAccount[];
  warnings: string[];
}

export type ReconciliationStrategy = 'keep_existing' | 'overwrite' | 'keep_both';

export interface ReconcileItemDiff {
  account: ImportedAccount;
  status: 'new' | 'duplicate' | 'conflict';
  existingItem?: VaultItem;
}

export interface ReconciliationSummary {
  diffs: ReconcileItemDiff[];
  totalParsed: number;
  newCount: number;
  duplicateCount: number;
  conflictCount: number;
}
