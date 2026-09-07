import type { VaultItem } from '../../types/vault';
import { itemToOtpAuthUri } from './otpauthExport';

function escapeCsvCell(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

/**
 * Exports vault items to a Bitwarden-compatible CSV.
 */
export function exportVaultToBitwardenCsv(items: VaultItem[]): string {
  const headers = [
    'folder',
    'favorite',
    'type',
    'name',
    'notes',
    'fields',
    'reprompt',
    'login_uri',
    'login_username',
    'login_password',
    'login_totp',
  ];

  const rows = [headers.join(',')];

  for (const item of items) {
    const otpUri = itemToOtpAuthUri(item);
    const row = [
      escapeCsvCell(''), // folder
      escapeCsvCell(item.pinned ? '1' : '0'), // favorite
      escapeCsvCell('login'), // type
      escapeCsvCell(item.issuer || '2FA'), // name
      escapeCsvCell(item.notes || ''), // notes
      escapeCsvCell(''), // fields
      escapeCsvCell('0'), // reprompt
      escapeCsvCell(''), // login_uri
      escapeCsvCell(item.account || ''), // login_username
      escapeCsvCell(''), // login_password
      escapeCsvCell(otpUri), // login_totp
    ];
    rows.push(row.join(','));
  }

  return rows.join('\r\n');
}
