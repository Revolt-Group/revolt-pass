import { sanitizeBase32, isValidBase32 } from '../crypto/base32';
import { parseOtpAuthUri } from './otpauthList';
import type { ImportedAccount, ImportResult } from './types';

/**
 * Parses Ente Auth export (JSON or plaintext).
 */
export function parseEnteAuthExport(content: string): ImportResult {
  const trimmed = content.trim();
  const warnings: string[] = [];
  const accounts: ImportedAccount[] = [];

  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      platform: 'ente',
      platformLabel: 'Ente Auth',
      accounts: [],
      warnings: ['El archivo no es un JSON válido'],
    };
  }

  const list = Array.isArray(parsed) ? parsed : parsed.items || parsed.accounts || [];
  if (list.length === 0) {
    return {
      platform: 'ente',
      platformLabel: 'Ente Auth',
      accounts: [],
      warnings: ['No se encontraron tokens en la exportación de Ente Auth'],
    };
  }

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const rawSecret = item.secret || item.token || item.uri;
    if (!rawSecret) continue;

    if (typeof rawSecret === 'string' && rawSecret.startsWith('otpauth://')) {
      const parsedUri = parseOtpAuthUri(rawSecret, 'ente');
      if (parsedUri) {
        accounts.push(parsedUri);
      }
    } else {
      const sanitized = sanitizeBase32(rawSecret);
      if (isValidBase32(sanitized)) {
        accounts.push({
          name: item.account || item.name || 'Ente Auth',
          issuer: item.issuer || item.service || 'Ente Auth',
          secret: sanitized,
          type: item.type?.toLowerCase() === 'hotp' ? 'hotp' : 'totp',
          algorithm: item.algorithm?.toUpperCase() === 'SHA256' ? 'SHA256' : item.algorithm?.toUpperCase() === 'SHA512' ? 'SHA512' : 'SHA1',
          digits: item.digits === 8 ? 8 : 6,
          period: item.period || 30,
          platform: 'ente',
        });
      }
    }
  }

  return {
    platform: 'ente',
    platformLabel: 'Ente Auth',
    accounts,
    warnings,
  };
}
