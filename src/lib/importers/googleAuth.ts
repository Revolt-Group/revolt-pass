import { decodeMigrationProtobuf } from './protobuf';
import type { ImportResult } from './types';

/**
 * Parses a Google Authenticator export URI (otpauth-migration://offline?data=...)
 */
export function parseGoogleAuthMigration(uriString: string): ImportResult {
  const warnings: string[] = [];
  const trimmed = uriString.trim();

  if (!trimmed.startsWith('otpauth-migration://offline')) {
    return {
      platform: 'google_auth',
      platformLabel: 'Google Authenticator',
      accounts: [],
      warnings: ['El URI no corresponde al formato otpauth-migration://offline'],
    };
  }

  try {
    const url = new URL(trimmed);
    const dataParam = url.searchParams.get('data');
    if (!dataParam) {
      return {
        platform: 'google_auth',
        platformLabel: 'Google Authenticator',
        accounts: [],
        warnings: ['Parámetro "data" no encontrado en el URI de migración'],
      };
    }

    // In URLs, '+' might be encoded as '%2B' or space. Handle base64url or standard base64.
    let cleanB64 = decodeURIComponent(dataParam);
    cleanB64 = cleanB64.replace(/-/g, '+').replace(/_/g, '/');
    while (cleanB64.length % 4 !== 0) {
      cleanB64 += '=';
    }

    const binaryStr = atob(cleanB64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const accounts = decodeMigrationProtobuf(bytes);

    if (accounts.length === 0) {
      warnings.push('No se encontraron cuentas válidas dentro del paquete de migración.');
    }

    return {
      platform: 'google_auth',
      platformLabel: 'Google Authenticator',
      accounts,
      warnings,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido al decodificar migración';
    return {
      platform: 'google_auth',
      platformLabel: 'Google Authenticator',
      accounts: [],
      warnings: [`Fallo al procesar QR de Google Authenticator: ${msg}`],
    };
  }
}
