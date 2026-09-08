import { describe, it, expect } from 'vitest';
import { itemToOtpAuthUri, exportVaultToOtpAuthList } from './otpauthExport';
import type { VaultItem } from '../../types/vault';

describe('otpauth:// Exporter', () => {
  const item: VaultItem = {
    id: 'item-1',
    type: 'totp',
    issuer: 'Google Services',
    account: 'user@gmail.com',
    secret: 'JBSW Y3DP EHPK 3PXP',
    digits: 6,
    period: 30,
    algorithm: 'SHA1',
    created_at: 1000,
    updated_at: 1000,
  };

  const complexItem: VaultItem = {
    id: 'item-2',
    type: 'totp',
    issuer: 'Work & Co: Team',
    account: 'admin/lead?ops',
    secret: 'KRUGS4ZANFZSA53E',
    digits: 8,
    period: 60,
    algorithm: 'SHA256',
    created_at: 2000,
    updated_at: 2000,
  };

  it('builds standard RFC 6238 compliant otpauth:// URI', () => {
    const uri = itemToOtpAuthUri(item);
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('Google%20Services:user%40gmail.com');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=Google+Services');
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('correctly encodes special characters in issuer and account label', () => {
    const uri = itemToOtpAuthUri(complexItem);
    expect(uri).toContain('Work%20%26%20Co%3A%20Team:admin%2Flead%3Fops');
    expect(uri).toContain('digits=8');
    expect(uri).toContain('period=60');
    expect(uri).toContain('algorithm=SHA256');
  });

  it('exports formatted list with header and comments', () => {
    const list = exportVaultToOtpAuthList([item, complexItem]);
    expect(list).toContain('# Revolt Pass - Exportación Abierta de Tokens 2FA');
    expect(list).toContain('# Total de cuentas: 2');
    const lines = list.split('\n');
    expect(lines.length).toBeGreaterThan(4);
    expect(lines[lines.length - 2]).toContain('otpauth://totp/');
    expect(lines[lines.length - 1]).toContain('otpauth://totp/');
  });

  it('handles empty vault with valid header', () => {
    const list = exportVaultToOtpAuthList([]);
    expect(list).toContain('# Total de cuentas: 0');
  });
});
