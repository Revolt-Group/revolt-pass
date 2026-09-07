import { sanitizeBase32, isValidBase32 } from '../crypto/base32';
import type { ImportedAccount, ImportResult } from './types';

/**
 * Parses a single otpauth:// URI.
 */
export function parseOtpAuthUri(uri: string, platformFallback: ImportedAccount['platform'] = 'otpauth_list'): ImportedAccount | null {
  const trimmed = uri.trim();
  if (!trimmed.startsWith('otpauth://')) return null;

  try {
    const url = new URL(trimmed);
    const typeStr = url.host.toLowerCase();
    const type: 'totp' | 'hotp' = typeStr === 'hotp' ? 'hotp' : 'totp';

    const rawSecret = url.searchParams.get('secret') || '';
    const sanitizedSecret = sanitizeBase32(rawSecret);
    if (!isValidBase32(sanitizedSecret)) {
      return null;
    }

    // Path is "/Issuer:Account" or "/Account"
    const rawPath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    let name = rawPath;
    let issuer = url.searchParams.get('issuer') || '';

    if (rawPath.includes(':')) {
      const parts = rawPath.split(':');
      if (!issuer) issuer = parts[0].trim();
      name = parts.slice(1).join(':').trim();
    } else if (!issuer) {
      issuer = rawPath || 'TOTP';
    }

    const algoParam = (url.searchParams.get('algorithm') || 'SHA1').toUpperCase();
    const algorithm: 'SHA1' | 'SHA256' | 'SHA512' =
      algoParam === 'SHA256' ? 'SHA256' : algoParam === 'SHA512' ? 'SHA512' : 'SHA1';

    const digits = Number(url.searchParams.get('digits')) === 8 ? 8 : 6;
    const period = Number(url.searchParams.get('period')) || 30;
    const counterParam = url.searchParams.get('counter');
    const counter = counterParam !== null ? Number(counterParam) : undefined;

    return {
      name: name || 'Cuenta TOTP',
      issuer: issuer || 'Autenticador',
      secret: sanitizedSecret,
      type,
      algorithm,
      digits,
      period,
      counter,
      platform: platformFallback,
    };
  } catch {
    return null;
  }
}

/**
 * Parses a plain text file containing multiple otpauth:// URIs (one per line).
 */
export function parseOtpAuthList(textContent: string): ImportResult {
  const lines = textContent.split(/\r?\n/);
  const accounts: ImportedAccount[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('otpauth://')) {
      const parsed = parseOtpAuthUri(line, 'otpauth_list');
      if (parsed) {
        accounts.push(parsed);
      } else {
        warnings.push(`Línea #${i + 1}: URI otpauth no válido o clave secreta corrupta.`);
      }
    }
  }

  return {
    platform: 'otpauth_list',
    platformLabel: 'Lista de URIs (otpauth://)',
    accounts,
    warnings,
  };
}
