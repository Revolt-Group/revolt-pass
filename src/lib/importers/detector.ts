import { parseGoogleAuthMigration } from './googleAuth';
import { parseAuthyExport } from './authy';
import { parseAegisExport } from './aegis';
import { parseTwoFasExport } from './twoFas';
import { parseBitwardenExport } from './bitwarden';
import { parseOnePasswordExport } from './onePassword';
import { parseProtonPassExport } from './protonPass';
import { parseEnteAuthExport } from './enteAuth';
import { parseLastPassExport } from './lastPass';
import { parseOtpAuthList } from './otpauthList';
import type { ImportResult } from './types';

export function detectAndParseImport(content: string, fileName?: string): ImportResult {
  const trimmed = content.trim();
  const lowerFileName = (fileName || '').toLowerCase();

  // 1. Google Authenticator Migration URI
  if (trimmed.startsWith('otpauth-migration://offline')) {
    return parseGoogleAuthMigration(trimmed);
  }

  // 2. 2FAS file by extension or schema
  if (
    lowerFileName.endsWith('.2fas') ||
    (trimmed.startsWith('{') && (trimmed.includes('"services"') || trimmed.includes('"schemaVersion"')) && trimmed.includes('"otp"'))
  ) {
    const res = parseTwoFasExport(trimmed);
    if (res.accounts.length > 0 || res.warnings.length > 0) return res;
  }

  // 3. Aegis Authenticator
  if (trimmed.startsWith('{') && (trimmed.includes('"entries"') || trimmed.includes('"db"') || trimmed.includes('aegis'))) {
    const res = parseAegisExport(trimmed);
    if (res.accounts.length > 0 || res.warnings.length > 0) return res;
  }

  // 4. Authy
  if (
    trimmed.includes('decrypted_secret') ||
    trimmed.includes('secret_seed') ||
    trimmed.includes('authenticator_tokens') ||
    trimmed.includes('decryptedSecret')
  ) {
    const res = parseAuthyExport(trimmed);
    if (res.accounts.length > 0) return res;
  }

  // 5. Bitwarden (CSV or JSON)
  if (
    trimmed.includes('login_totp') ||
    (trimmed.includes('"items"') && trimmed.includes('"login"'))
  ) {
    const res = parseBitwardenExport(trimmed);
    if (res.accounts.length > 0 || res.warnings.length > 0) return res;
  }

  // 6. Proton Pass
  if (
    trimmed.includes('totpUri') ||
    (trimmed.startsWith('{') && trimmed.includes('"content"') && trimmed.includes('proton')) ||
    (trimmed.includes('totp') && trimmed.includes('username,password,note,totp'))
  ) {
    const res = parseProtonPassExport(trimmed);
    if (res.accounts.length > 0 || res.warnings.length > 0) return res;
  }

  // 7. 1Password
  if (
    trimmed.includes('one-time password') ||
    trimmed.includes('"designation"') ||
    (lowerFileName.includes('1password') || lowerFileName.includes('.1pux'))
  ) {
    const res = parseOnePasswordExport(trimmed);
    if (res.accounts.length > 0 || res.warnings.length > 0) return res;
  }

  // 8. LastPass
  if (trimmed.includes('extra') && trimmed.includes('grouping') && trimmed.includes('fav')) {
    const res = parseLastPassExport(trimmed);
    if (res.accounts.length > 0 || res.warnings.length > 0) return res;
  }

  // 9. Ente Auth
  if (trimmed.startsWith('[') && (trimmed.includes('"secret"') && (trimmed.includes('"account"') || trimmed.includes('"service"')))) {
    const res = parseEnteAuthExport(trimmed);
    if (res.accounts.length > 0) return res;
  }

  // 10. Multi-line otpauth:// list
  if (trimmed.includes('otpauth://')) {
    const res = parseOtpAuthList(trimmed);
    if (res.accounts.length > 0) return res;
  }

  // 11. Fallback Heuristics: try each parser in turn
  const parsers = [
    parseGoogleAuthMigration,
    parseAegisExport,
    parseTwoFasExport,
    parseAuthyExport,
    parseBitwardenExport,
    parseOnePasswordExport,
    parseProtonPassExport,
    parseEnteAuthExport,
    parseLastPassExport,
    parseOtpAuthList,
  ];

  for (const parser of parsers) {
    try {
      const res = parser(trimmed);
      if (res.accounts.length > 0) {
        return res;
      }
    } catch {
      // Continue to next parser
    }
  }

  return {
    platform: 'unknown',
    platformLabel: 'Desconocido',
    accounts: [],
    warnings: [
      'No se pudo reconocer el formato del archivo importado. Asegúrate de que sea un archivo exportado válido de Google Authenticator, Authy, Aegis, 2FAS, Bitwarden, 1Password, Proton Pass, Ente o lista de otpauth://.',
    ],
  };
}
