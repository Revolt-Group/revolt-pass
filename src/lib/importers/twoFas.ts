import { sanitizeBase32, isValidBase32 } from '../crypto/base32';
import type { ImportedAccount, ImportResult } from './types';

/**
 * Parses 2FAS Authenticator export (.2fas or JSON).
 */
export function parseTwoFasExport(jsonContent: string): ImportResult {
  const warnings: string[] = [];
  const accounts: ImportedAccount[] = [];

  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent);
  } catch {
    return {
      platform: '2fas',
      platformLabel: '2FAS Authenticator',
      accounts: [],
      warnings: ['El archivo no es un JSON válido'],
    };
  }

  // Check if 2FAS file is password encrypted
  if (parsed.servicesEncrypted || (parsed.passcode && !parsed.services)) {
    return {
      platform: '2fas',
      platformLabel: '2FAS Authenticator',
      accounts: [],
      warnings: [
        'El respaldo .2fas está protegido con contraseña. En la app 2FAS, exporta sin contraseña para poder importarlo localmente.',
      ],
    };
  }

  const services = parsed.services || parsed.items || [];
  if (!Array.isArray(services) || services.length === 0) {
    return {
      platform: '2fas',
      platformLabel: '2FAS Authenticator',
      accounts: [],
      warnings: ['No se encontraron servicios ni tokens en el archivo de 2FAS'],
    };
  }

  for (let i = 0; i < services.length; i++) {
    const s = services[i];
    const rawSecret = s.secret || s.otp?.secret || s.otp?.link;
    if (!rawSecret) {
      warnings.push(`Servicio #${i + 1} ("${s.name || 'Sin nombre'}"): omitido por falta de secreto.`);
      continue;
    }

    // If otp.link is an otpauth:// uri
    let secret = rawSecret;
    if (typeof rawSecret === 'string' && rawSecret.startsWith('otpauth://')) {
      try {
        const u = new URL(rawSecret);
        secret = u.searchParams.get('secret') || '';
      } catch {
        // keep raw
      }
    }

    const sanitizedSecret = sanitizeBase32(secret);
    if (!isValidBase32(sanitizedSecret)) {
      warnings.push(`Servicio #${i + 1} ("${s.name || 'Sin nombre'}"): clave secreta Base32 inválida.`);
      continue;
    }

    const name = s.otp?.account || s.name || 'Cuenta 2FAS';
    const issuer = s.otp?.issuer || s.name || '2FAS';
    const algoRaw = (s.otp?.algorithm || 'SHA1').toUpperCase();
    const algorithm: 'SHA1' | 'SHA256' | 'SHA512' =
      algoRaw === 'SHA256' ? 'SHA256' : algoRaw === 'SHA512' ? 'SHA512' : 'SHA1';
    const digits = s.otp?.digits === 8 ? 8 : 6;
    const period = s.otp?.period || 30;
    const type: 'totp' | 'hotp' = s.otp?.tokenType?.toLowerCase() === 'hotp' ? 'hotp' : 'totp';

    accounts.push({
      name,
      issuer,
      secret: sanitizedSecret,
      type,
      algorithm,
      digits,
      period,
      platform: '2fas',
    });
  }

  return {
    platform: '2fas',
    platformLabel: '2FAS Authenticator',
    accounts,
    warnings,
  };
}
