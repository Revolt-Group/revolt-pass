import { sanitizeBase32, isValidBase32 } from '../crypto/base32';
import { parseCsv } from './csv';
import { parseOtpAuthUri } from './otpauthList';
import type { ImportedAccount, ImportResult } from './types';

/**
 * Parses 1Password export (CSV or 1PUX JSON format).
 */
export function parseOnePasswordExport(content: string): ImportResult {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseOnePasswordJson(trimmed);
  }
  return parseOnePasswordCsv(trimmed);
}

function parseOnePasswordCsv(csvContent: string): ImportResult {
  const warnings: string[] = [];
  const accounts: ImportedAccount[] = [];

  const rows = parseCsv(csvContent);
  if (rows.length === 0) {
    return {
      platform: '1password',
      platformLabel: '1Password',
      accounts: [],
      warnings: ['No se pudieron leer registros del archivo CSV de 1Password'],
    };
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Look for OTP column in various 1Password header conventions
    const otpKey = Object.keys(row).find(
      (k) => k.includes('one-time') || k === 'otp' || k.includes('totp')
    );
    const otpVal = otpKey ? row[otpKey] : '';
    if (!otpVal) continue;

    const title = row['title'] || row['name'] || '1Password';
    const username = row['username'] || '';

    if (otpVal.startsWith('otpauth://')) {
      const parsed = parseOtpAuthUri(otpVal, '1password');
      if (parsed) {
        if (!parsed.issuer || parsed.issuer === 'TOTP') {
          parsed.issuer = title;
        }
        if (username && parsed.name === 'Cuenta TOTP') {
          parsed.name = username;
        }
        accounts.push(parsed);
      } else {
        warnings.push(`Elemento "${title}": enlace OTP corrupto.`);
      }
    } else {
      const sanitized = sanitizeBase32(otpVal);
      if (isValidBase32(sanitized)) {
        accounts.push({
          name: username || title,
          issuer: title,
          secret: sanitized,
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          platform: '1password',
        });
      } else {
        warnings.push(`Elemento "${title}": clave secreta Base32 no válida.`);
      }
    }
  }

  if (accounts.length === 0 && warnings.length === 0) {
    warnings.push('No se encontraron contraseñas de un solo uso (OTP) en este CSV de 1Password.');
  }

  return {
    platform: '1password',
    platformLabel: '1Password',
    accounts,
    warnings,
  };
}

function parseOnePasswordJson(jsonContent: string): ImportResult {
  const warnings: string[] = [];
  const accounts: ImportedAccount[] = [];

  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent);
  } catch {
    return {
      platform: '1password',
      platformLabel: '1Password',
      accounts: [],
      warnings: ['El archivo no es un JSON válido'],
    };
  }

  const items: any[] = parsed.accounts || parsed.items || (Array.isArray(parsed) ? parsed : []);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const title = item.title || item.overview?.title || '1Password';
    const username = item.overview?.subtitle || item.username || '';

    // Search in details.sections.fields or fields
    const fields: any[] = [];
    if (Array.isArray(item.fields)) fields.push(...item.fields);
    if (Array.isArray(item.details?.sections)) {
      for (const sec of item.details.sections) {
        if (Array.isArray(sec.fields)) fields.push(...sec.fields);
      }
    }

    for (const f of fields) {
      const isOtp =
        f.type === 'OTP' ||
        f.t === 'OTP' ||
        (f.designation === 'username' ? false : f.id?.includes('totp') || f.n?.includes('totp'));

      const val = String(f.value || f.v || '').trim();
      if (isOtp && val) {
        if (val.startsWith('otpauth://')) {
          const parsedUri = parseOtpAuthUri(val, '1password');
          if (parsedUri) {
            if (!parsedUri.issuer || parsedUri.issuer === 'TOTP') {
              parsedUri.issuer = title;
            }
            accounts.push(parsedUri);
          }
        } else {
          const sanitized = sanitizeBase32(val);
          if (isValidBase32(sanitized)) {
            accounts.push({
              name: username || title,
              issuer: title,
              secret: sanitized,
              type: 'totp',
              algorithm: 'SHA1',
              digits: 6,
              period: 30,
              platform: '1password',
            });
          }
        }
      }
    }
  }

  return {
    platform: '1password',
    platformLabel: '1Password',
    accounts,
    warnings,
  };
}
