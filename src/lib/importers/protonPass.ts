import { sanitizeBase32, isValidBase32 } from '../crypto/base32';
import { parseCsv } from './csv';
import { parseOtpAuthUri } from './otpauthList';
import type { ImportedAccount, ImportResult } from './types';

/**
 * Parses Proton Pass exports (JSON or CSV).
 */
export function parseProtonPassExport(content: string): ImportResult {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseProtonPassJson(trimmed);
  }
  return parseProtonPassCsv(trimmed);
}

function parseProtonPassJson(jsonContent: string): ImportResult {
  const warnings: string[] = [];
  const accounts: ImportedAccount[] = [];

  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent);
  } catch {
    return {
      platform: 'proton_pass',
      platformLabel: 'Proton Pass',
      accounts: [],
      warnings: ['El archivo no es un JSON válido'],
    };
  }

  const items: any[] = parsed.items || (Array.isArray(parsed) ? parsed : []);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const name = item.name || item.data?.metadata?.name || 'Proton Pass';
    const username = item.data?.content?.username || '';
    const totpUri = item.data?.content?.totpUri || item.totpUri || item.data?.content?.totp;

    if (!totpUri || typeof totpUri !== 'string') continue;

    const trimmedUri = totpUri.trim();
    if (trimmedUri.startsWith('otpauth://')) {
      const parsedUri = parseOtpAuthUri(trimmedUri, 'proton_pass');
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
      const sanitized = sanitizeBase32(trimmedUri);
      if (isValidBase32(sanitized)) {
        accounts.push({
          name: username || name,
          issuer: name,
          secret: sanitized,
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          platform: 'proton_pass',
        });
      }
    }
  }

  if (accounts.length === 0 && warnings.length === 0) {
    warnings.push('No se encontraron credenciales 2FA/TOTP en el archivo de Proton Pass.');
  }

  return {
    platform: 'proton_pass',
    platformLabel: 'Proton Pass',
    accounts,
    warnings,
  };
}

function parseProtonPassCsv(csvContent: string): ImportResult {
  const warnings: string[] = [];
  const accounts: ImportedAccount[] = [];

  const rows = parseCsv(csvContent);
  if (rows.length === 0) {
    return {
      platform: 'proton_pass',
      platformLabel: 'Proton Pass',
      accounts: [],
      warnings: ['No se pudieron leer registros del CSV de Proton Pass'],
    };
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const totpVal = row['totp'] || row['2fa'] || row['otp'];
    if (!totpVal) continue;

    const name = row['name'] || 'Proton Pass';
    const username = row['username'] || '';

    if (totpVal.startsWith('otpauth://')) {
      const parsed = parseOtpAuthUri(totpVal, 'proton_pass');
      if (parsed) {
        if (!parsed.issuer || parsed.issuer === 'TOTP') {
          parsed.issuer = name;
        }
        if (username && parsed.name === 'Cuenta TOTP') {
          parsed.name = username;
        }
        accounts.push(parsed);
      }
    } else {
      const sanitized = sanitizeBase32(totpVal);
      if (isValidBase32(sanitized)) {
        accounts.push({
          name: username || name,
          issuer: name,
          secret: sanitized,
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          platform: 'proton_pass',
        });
      }
    }
  }

  return {
    platform: 'proton_pass',
    platformLabel: 'Proton Pass',
    accounts,
    warnings,
  };
}
