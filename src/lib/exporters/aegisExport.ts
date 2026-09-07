import type { VaultItem } from '../../types/vault';

export interface AegisExportFormat {
  version: number;
  header: {
    slots: null;
    params: null;
  };
  db: {
    version: 1;
    entries: Array<{
      type: string;
      uuid: string;
      name: string;
      issuer: string;
      note?: string;
      favorite?: boolean;
      info: {
        secret: string;
        algo: string;
        digits: number;
        period: number;
      };
    }>;
  };
}

/**
 * Exports vault items to an unencrypted JSON format fully compatible with Aegis Authenticator.
 */
export function exportVaultToAegis(items: VaultItem[]): string {
  const aegisDoc: AegisExportFormat = {
    version: 1,
    header: {
      slots: null,
      params: null,
    },
    db: {
      version: 1,
      entries: items.map((item) => ({
        type: 'totp',
        uuid: item.id,
        name: item.account,
        issuer: item.issuer,
        note: item.notes || '',
        favorite: !!item.pinned,
        info: {
          secret: item.secret.replace(/\s+/g, ''),
          algo: item.algorithm || 'SHA1',
          digits: item.digits || 6,
          period: item.period || 30,
        },
      })),
    },
  };

  return JSON.stringify(aegisDoc, null, 2);
}
