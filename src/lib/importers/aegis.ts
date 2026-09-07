import { sanitizeBase32, isValidBase32 } from '../crypto/base32';
import type { ImportedAccount, ImportResult } from './types';

interface AegisEntry {
  type: string;
  name?: string;
  issuer?: string;
  info?: {
    secret?: string;
    algo?: string;
    digits?: number;
    period?: number;
    counter?: number;
  };
}

/**
 * Parses unencrypted Aegis Authenticator JSON export.
 */
export function parseAegisExport(jsonContent: string): ImportResult {
  const warnings: string[] = [];
  const accounts: ImportedAccount[] = [];

  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent);
  } catch {
    return {
      platform: 'aegis',
      platformLabel: 'Aegis Authenticator',
      accounts: [],
      warnings: ['El archivo no es un JSON válido'],
    };
  }

  // Check if encrypted
  if (parsed.header && parsed.header.slots && parsed.header.slots.length > 0 && typeof parsed.db === 'string') {
    return {
      platform: 'aegis',
      platformLabel: 'Aegis Authenticator',
      accounts: [],
      warnings: [
        'Esta bóveda de Aegis está cifrada con contraseña maestra. Por favor, en Aegis ve a Ajustes > Exportar y selecciona "Texto sin formato (JSON)" para importar tus tokens en Revolt Pass de forma segura en tu navegador.',
      ],
    };
  }

  const entries: AegisEntry[] = parsed?.db?.entries || parsed?.entries || [];

  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      platform: 'aegis',
      platformLabel: 'Aegis Authenticator',
      accounts: [],
      warnings: ['No se encontraron entradas en el archivo exportado de Aegis'],
    };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const rawSecret = entry.info?.secret;
    if (!rawSecret) {
      warnings.push(`Entrada #${i + 1} ("${entry.name || 'Sin nombre'}"): omitida por no tener secreto.`);
      continue;
    }

    const sanitizedSecret = sanitizeBase32(rawSecret);
    if (!isValidBase32(sanitizedSecret)) {
      warnings.push(`Entrada #${i + 1} ("${entry.name || 'Sin nombre'}"): secreto Base32 inválido.`);
      continue;
    }

    const algoRaw = (entry.info?.algo || 'SHA1').toUpperCase();
    const algorithm: 'SHA1' | 'SHA256' | 'SHA512' =
      algoRaw === 'SHA256' ? 'SHA256' : algoRaw === 'SHA512' ? 'SHA512' : 'SHA1';

    const type: 'totp' | 'hotp' = entry.type?.toLowerCase() === 'hotp' ? 'hotp' : 'totp';
    const digits = entry.info?.digits === 8 ? 8 : 6;
    const period = entry.info?.period || 30;

    accounts.push({
      name: entry.name || 'Cuenta Aegis',
      issuer: entry.issuer || 'Aegis',
      secret: sanitizedSecret,
      type,
      algorithm,
      digits,
      period,
      counter: entry.info?.counter,
      platform: 'aegis',
    });
  }

  return {
    platform: 'aegis',
    platformLabel: 'Aegis Authenticator',
    accounts,
    warnings,
  };
}
