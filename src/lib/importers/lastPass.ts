import { sanitizeBase32, isValidBase32 } from '../crypto/base32';
import { parseCsv } from './csv';
import { parseOtpAuthUri } from './otpauthList';
import type { ImportedAccount, ImportResult } from './types';

/**
 * Parses LastPass CSV export looking for TOTP secrets in extra/notes fields.
 */
export function parseLastPassExport(csvContent: string): ImportResult {
  const warnings: string[] = [];
  const accounts: ImportedAccount[] = [];

  const rows = parseCsv(csvContent);
  if (rows.length === 0) {
    return {
      platform: 'lastpass',
      platformLabel: 'LastPass',
      accounts: [],
      warnings: ['No se pudieron leer registros del CSV de LastPass'],
    };
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const extra = row['extra'] || row['notes'] || '';
    const name = row['name'] || 'LastPass';
    const username = row['username'] || '';

    if (!extra) continue;

    // LastPass format often includes: "otp:otpauth://totp/..." or "otp:JBSWY3DPEHPK3PXP" or "totp:..."
    const match = extra.match(/(?:otp|totp):\s*(otpauth:\/\/[^\s\r\n]+|[A-Za-z2-7=]{16,})/i);
    if (!match) continue;

    const matchedSecretOrUri = match[1].trim();

    if (matchedSecretOrUri.startsWith('otpauth://')) {
      const parsedUri = parseOtpAuthUri(matchedSecretOrUri, 'lastpass');
      if (parsedUri) {
        if (!parsedUri.issuer || parsedUri.issuer === 'TOTP') {
          parsedUri.issuer = name;
        }
        if (username && parsedUri.name === 'Cuenta TOTP') {
          parsedUri.name = username;
        }
        accounts.push(parsedUri);
      }
    } else {
      const sanitized = sanitizeBase32(matchedSecretOrUri);
      if (isValidBase32(sanitized)) {
        accounts.push({
          name: username || name,
          issuer: name,
          secret: sanitized,
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          platform: 'lastpass',
        });
      }
    }
  }

  if (accounts.length === 0 && warnings.length === 0) {
    warnings.push('No se encontraron secretos OTP/2FA en el campo extra del CSV de LastPass.');
  }

  return {
    platform: 'lastpass',
    platformLabel: 'LastPass',
    accounts,
    warnings,
  };
}
