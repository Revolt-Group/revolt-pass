import type { VaultItem } from '../../types/vault';

/**
 * Builds an otpauth:// URI for a single vault item.
 */
export function itemToOtpAuthUri(item: VaultItem): string {
  const label = `${encodeURIComponent(item.issuer)}:${encodeURIComponent(item.account)}`;
  const params = new URLSearchParams({
    secret: item.secret.replace(/\s+/g, ''),
    issuer: item.issuer,
    algorithm: item.algorithm || 'SHA1',
    digits: String(item.digits || 6),
    period: String(item.period || 30),
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Exports vault items as a newline-separated list of otpauth:// URIs.
 */
export function exportVaultToOtpAuthList(items: VaultItem[]): string {
  const lines = [
    '# Revolt Pass - Exportación Abierta de Tokens 2FA (otpauth://)',
    `# Fecha: ${new Date().toISOString()}`,
    `# Total de cuentas: ${items.length}`,
    '',
    ...items.map(itemToOtpAuthUri),
  ];

  return lines.join('\n');
}
