import { sanitizeBase32, isValidBase32 } from '../crypto/base32';
import { parseCsv } from './csv';
import { parseOtpAuthUri } from './otpauthList';
import type { ImportedAccount, ImportResult } from './types';

/**
 * Parses Bitwarden export (either JSON or CSV).
 */
export function parseBitwardenExport(content: string): ImportResult {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseBitwardenJson(trimmed);
  }
  return parseBitwardenCsv(trimmed);
}

function parseBitwardenJson(jsonContent: string): ImportResult {
  const warnings: string[] = [];
  const accounts: ImportedAccount[] = [];

  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent);
  } catch {
    return {
      platform: 'bitwarden',
      platformLabel: 'Bitwarden',
      accounts: [],
      warnings: ['El archivo no es un JSON válido'],
    };
  }

  if (parsed.encrypted === true) {
    return {
      platform: 'bitwarden',
      platformLabel: 'Bitwarden',
      accounts: [],
      warnings: [
        'Este archivo de Bitwarden está cifrado. En la bóveda web o app de Bitwarden, exporta seleccionando formato "JSON (sin cifrar)" para importarlo en Revolt Pass.',
      ],
    };
  }

  const items: any[] = parsed.items || [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const totpField = item?.login?.totp;
    if (!totpField || typeof totpField !== 'string' || !totpField.trim()) {
      continue;
    }

    const trimmedTotp = totpField.trim();
    if (trimmedTotp.startsWith('otpauth://')) {
      const parsedUri = parseOtpAuthUri(trimmedTotp, 'bitwarden');
      if (parsedUri) {
        if (!parsedUri.issuer || parsedUri.issuer === 'TOTP') {
          parsedUri.issuer = item.name || 'Bitwarden';
        }
        if (item.name && parsedUri.name === 'Cuenta TOTP') {
          parsedUri.name = item.name;
        }
        accounts.push(parsedUri);
      } else {
        warnings.push(`Elemento "${item.name}": URI otpauth corrupto.`);
      }
    } else {
      // Raw secret string
      const sanitized = sanitizeBase32(trimmedTotp);
      if (isValidBase32(sanitized)) {
        accounts.push({
          name: item.login?.username || item.name || 'Cuenta Bitwarden',
          issuer: item.name || 'Bitwarden',
          secret: sanitized,
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          platform: 'bitwarden',
        });
      } else {
        warnings.push(`Elemento "${item.name}": clave secreta Base32 no válida.`);
      }
    }
  }

  if (accounts.length === 0 && warnings.length === 0) {
    warnings.push('No se encontraron registros con códigos 2FA/TOTP en esta exportación de Bitwarden.');
  }

  return {
    platform: 'bitwarden',
    platformLabel: 'Bitwarden',
    accounts,
    warnings,
  };
}

function parseBitwardenCsv(csvContent: string): ImportResult {
  const warnings: string[] = [];
  const accounts: ImportedAccount[] = [];

  const rows = parseCsv(csvContent);
  if (rows.length === 0) {
    return {
      platform: 'bitwarden',
      platformLabel: 'Bitwarden',
      accounts: [],
      warnings: ['No se pudieron leer filas del archivo CSV'],
    };
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const totpField = row['login_totp'] || row['totp'];
    if (!totpField) continue;

    const name = row['name'] || 'Cuenta Bitwarden';
    const username = row['login_username'] || '';

    if (totpField.startsWith('otpauth://')) {
      const parsedUri = parseOtpAuthUri(totpField, 'bitwarden');
      if (parsedUri) {
        if (!parsedUri.issuer || parsedUri.issuer === 'TOTP') {
          parsedUri.issuer = name;
        }
        if (username && parsedUri.name === 'Cuenta TOTP') {
          parsedUri.name = username;
        }
        accounts.push(parsedUri);
      } else {
        warnings.push(`Fila "${name}": URI otpauth corrupto.`);
      }
    } else {
      const sanitized = sanitizeBase32(totpField);
      if (isValidBase32(sanitized)) {
        accounts.push({
          name: username || name,
          issuer: name,
          secret: sanitized,
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          platform: 'bitwarden',
        });
      } else {
        warnings.push(`Fila "${name}": secreto 2FA inválido.`);
      }
    }
  }

  if (accounts.length === 0 && warnings.length === 0) {
    warnings.push('No se encontraron elementos con códigos 2FA/TOTP en el CSV de Bitwarden.');
  }

  return {
    platform: 'bitwarden',
    platformLabel: 'Bitwarden',
    accounts,
    warnings,
  };
}
