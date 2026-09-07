import { describe, it, expect } from 'vitest';
import {
  decodeMigrationProtobuf,
  parseGoogleAuthMigration,
  parseAuthyExport,
  parseAegisExport,
  parseTwoFasExport,
  parseBitwardenExport,
  parseOnePasswordExport,
  parseProtonPassExport,
  parseEnteAuthExport,
  parseLastPassExport,
  parseOtpAuthList,
  detectAndParseImport,
  analyzeReconciliation,
  applyReconciliation,
} from './index';
import {
  exportVaultToOtpAuthList,
  exportVaultToAegis,
  exportVaultToBitwardenCsv,
} from '../exporters/index';
import type { VaultItem } from '../../types/vault';

describe('Universal Importers & Open Exporters', () => {
  describe('Google Authenticator Protobuf & Migration URI', () => {
    it('decodes migration payload bytes with varint and tags', () => {
      // Create sample binary protobuf for 1 OTP parameter:
      // Field 1 (bytes secret) = "12345678901234567890" (20 bytes)
      // Field 2 (string name) = "alice@example.com"
      // Field 3 (string issuer) = "GitHub"
      // Field 4 (algo) = 1 (SHA1)
      // Field 5 (digits) = 1 (6)
      // Field 6 (type) = 2 (TOTP)
      const secretRaw = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const nameBytes = new TextEncoder().encode('alice@example.com');
      const issuerBytes = new TextEncoder().encode('GitHub');

      const otpParamParts: number[] = [
        // secret: tag 1, wireType 2 (10) -> (1 << 3) | 2 = 10
        10, secretRaw.length, ...Array.from(secretRaw),
        // name: tag 2, wireType 2 -> (2 << 3) | 2 = 18
        18, nameBytes.length, ...Array.from(nameBytes),
        // issuer: tag 3, wireType 2 -> (3 << 3) | 2 = 26
        26, issuerBytes.length, ...Array.from(issuerBytes),
        // algorithm: tag 4, wireType 0 -> (4 << 3) | 0 = 32, val = 1
        32, 1,
        // digits: tag 5, wireType 0 -> (5 << 3) | 0 = 40, val = 1
        40, 1,
        // type: tag 6, wireType 0 -> (6 << 3) | 0 = 48, val = 2
        48, 2,
      ];

      // MigrationPayload: Field 1 (repeated OtpParameters) = tag 1, wireType 2 -> 10
      const payload: number[] = [
        10, otpParamParts.length, ...otpParamParts,
      ];

      const accounts = decodeMigrationProtobuf(new Uint8Array(payload));
      expect(accounts.length).toBe(1);
      expect(accounts[0].name).toBe('alice@example.com');
      expect(accounts[0].issuer).toBe('GitHub');
      expect(accounts[0].digits).toBe(6);
      expect(accounts[0].algorithm).toBe('SHA1');
      expect(accounts[0].type).toBe('totp');
      expect(accounts[0].secret).toBeTruthy();
    });

    it('parses complete otpauth-migration://offline URL', () => {
      // Base64 encode the sample payload
      const secretRaw = new Uint8Array([10, 20, 30, 40, 50]);
      const nameBytes = new TextEncoder().encode('test@acme.org');
      const paramBytes = [
        10, secretRaw.length, ...Array.from(secretRaw),
        18, nameBytes.length, ...Array.from(nameBytes),
      ];
      const payload = [10, paramBytes.length, ...paramBytes];
      let b64 = '';
      for (const b of payload) b64 += String.fromCharCode(b);
      const encoded = btoa(b64);

      const uri = `otpauth-migration://offline?data=${encodeURIComponent(encoded)}`;
      const result = parseGoogleAuthMigration(uri);
      expect(result.accounts.length).toBe(1);
      expect(result.accounts[0].name).toBe('test@acme.org');
      expect(result.platform).toBe('google_auth');
    });
  });

  describe('Authy Importer', () => {
    it('parses community export array of tokens', () => {
      const json = JSON.stringify([
        {
          name: 'Personal GitHub',
          decrypted_secret: 'JBSWY3DPEHPK3PXP',
          digits: 6,
          period: 30,
          issuer: 'GitHub',
        },
        {
          original_name: 'AWS',
          secret_seed: 'HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ',
          digits: 8,
          period: 30,
        },
      ]);

      const res = parseAuthyExport(json);
      expect(res.accounts.length).toBe(2);
      expect(res.accounts[0].issuer).toBe('GitHub');
      expect(res.accounts[0].digits).toBe(6);
      expect(res.accounts[1].issuer).toBe('AWS');
      expect(res.accounts[1].digits).toBe(8);
    });
  });

  describe('Aegis Importer', () => {
    it('parses standard unencrypted Aegis JSON format', () => {
      const aegisJson = JSON.stringify({
        version: 1,
        header: { slots: null, params: null },
        db: {
          version: 1,
          entries: [
            {
              type: 'totp',
              name: 'user@proton.me',
              issuer: 'Proton',
              info: {
                secret: 'JBSWY3DPEHPK3PXP',
                algo: 'SHA256',
                digits: 6,
                period: 30,
              },
            },
          ],
        },
      });

      const res = parseAegisExport(aegisJson);
      expect(res.accounts.length).toBe(1);
      expect(res.accounts[0].issuer).toBe('Proton');
      expect(res.accounts[0].algorithm).toBe('SHA256');
    });

    it('warns when Aegis file is password encrypted', () => {
      const encAegis = JSON.stringify({
        version: 1,
        header: { slots: [{ type: 'password' }], params: {} },
        db: 'encrypted_payload_string',
      });

      const res = parseAegisExport(encAegis);
      expect(res.accounts.length).toBe(0);
      expect(res.warnings[0]).toContain('cifrada');
    });
  });

  describe('2FAS Importer', () => {
    it('parses .2fas JSON structure', () => {
      const twoFasJson = JSON.stringify({
        schemaVersion: 4,
        services: [
          {
            name: 'Cloudflare',
            secret: 'JBSWY3DPEHPK3PXP',
            otp: {
              account: 'ops@revoltgroup.com',
              issuer: 'Cloudflare',
              digits: 6,
              period: 30,
              algorithm: 'SHA1',
              tokenType: 'TOTP',
            },
          },
        ],
      });

      const res = parseTwoFasExport(twoFasJson);
      expect(res.accounts.length).toBe(1);
      expect(res.accounts[0].issuer).toBe('Cloudflare');
      expect(res.accounts[0].name).toBe('ops@revoltgroup.com');
    });
  });

  describe('Bitwarden Importer', () => {
    it('parses Bitwarden JSON with login.totp', () => {
      const bwJson = JSON.stringify({
        encrypted: false,
        items: [
          {
            name: 'GitLab',
            login: {
              username: 'developer@revolt.io',
              totp: 'otpauth://totp/GitLab:developer@revolt.io?secret=JBSWY3DPEHPK3PXP&issuer=GitLab',
            },
          },
        ],
      });

      const res = parseBitwardenExport(bwJson);
      expect(res.accounts.length).toBe(1);
      expect(res.accounts[0].issuer).toBe('GitLab');
      expect(res.accounts[0].name).toBe('developer@revolt.io');
    });

    it('parses Bitwarden CSV with login_totp column', () => {
      const bwCsv = `folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp
,0,login,Discord,,,0,,alex,secretpw,otpauth://totp/Discord:alex?secret=JBSWY3DPEHPK3PXP`;

      const res = parseBitwardenExport(bwCsv);
      expect(res.accounts.length).toBe(1);
      expect(res.accounts[0].issuer).toBe('Discord');
      expect(res.accounts[0].name).toBe('alex');
    });
  });

  describe('1Password Importer', () => {
    it('parses 1Password CSV with one-time password column', () => {
      const opCsv = `title,website,username,password,notes,one-time password
Stripe,https://stripe.com,admin@revolt.app,pw,note,otpauth://totp/Stripe:admin@revolt.app?secret=JBSWY3DPEHPK3PXP&issuer=Stripe`;

      const res = parseOnePasswordExport(opCsv);
      expect(res.accounts.length).toBe(1);
      expect(res.accounts[0].issuer).toBe('Stripe');
    });
  });

  describe('Proton Pass Importer', () => {
    it('parses Proton Pass JSON', () => {
      const protonJson = JSON.stringify({
        items: [
          {
            name: 'Slack',
            data: {
              content: {
                username: 'team@revolt.io',
                totpUri: 'otpauth://totp/Slack:team@revolt.io?secret=JBSWY3DPEHPK3PXP&issuer=Slack',
              },
            },
          },
        ],
      });

      const res = parseProtonPassExport(protonJson);
      expect(res.accounts.length).toBe(1);
      expect(res.accounts[0].issuer).toBe('Slack');
    });
  });

  describe('Multi-line otpauth:// List', () => {
    it('parses multiple otpauth URLs in single text', () => {
      const txt = `
# Exported tokens
otpauth://totp/Google:user@gmail.com?secret=JBSWY3DPEHPK3PXP&issuer=Google
otpauth://totp/Vercel:team@revolt.io?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=Vercel
`;
      const res = parseOtpAuthList(txt);
      expect(res.accounts.length).toBe(2);
      expect(res.accounts[0].issuer).toBe('Google');
      expect(res.accounts[1].issuer).toBe('Vercel');
    });
  });

  describe('Format Auto-Detection', () => {
    it('detects Aegis, 2FAS, Bitwarden, and plain otpauth lists automatically', () => {
      const aegisRaw = '{"header":{"slots":null},"db":{"entries":[{"type":"totp","name":"a","info":{"secret":"JBSWY3DPEHPK3PXP"}}]}}';
      expect(detectAndParseImport(aegisRaw).platform).toBe('aegis');

      const twoFasRaw = '{"schemaVersion":4,"services":[{"name":"a","secret":"JBSWY3DPEHPK3PXP"}]}';
      expect(detectAndParseImport(twoFasRaw, 'backup.2fas').platform).toBe('2fas');

      const otpListRaw = 'otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP';
      expect(detectAndParseImport(otpListRaw).platform).toBe('otpauth_list');
    });
  });

  describe('Reconciliation Engine', () => {
    const existing: VaultItem[] = [
      {
        id: '1111',
        type: 'totp',
        issuer: 'Google',
        account: 'alice@gmail.com',
        secret: 'JBSWY3DPEHPK3PXP',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        created_at: 1000,
        updated_at: 1000,
      },
      {
        id: '2222',
        type: 'totp',
        issuer: 'GitHub',
        account: 'alice',
        secret: 'HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        created_at: 1000,
        updated_at: 1000,
      },
    ];

    it('identifies new, duplicate, and conflict accounts', () => {
      const incoming = [
        // Duplicate (same secret)
        {
          name: 'alice@gmail.com',
          issuer: 'Google',
          secret: 'JBSWY3DPEHPK3PXP',
          type: 'totp' as const,
          algorithm: 'SHA1' as const,
          digits: 6,
          period: 30,
          platform: 'google_auth' as const,
        },
        // Conflict (same issuer & account, different secret)
        {
          name: 'alice',
          issuer: 'GitHub',
          secret: 'MZXW6YTBOI======',
          type: 'totp' as const,
          algorithm: 'SHA1' as const,
          digits: 6,
          period: 30,
          platform: 'google_auth' as const,
        },
        // Brand new
        {
          name: 'admin@revolt.app',
          issuer: 'Cloudflare',
          secret: 'NBSWY3DPEHPK3PXP',
          type: 'totp' as const,
          algorithm: 'SHA1' as const,
          digits: 6,
          period: 30,
          platform: 'google_auth' as const,
        },
      ];

      const summary = analyzeReconciliation(existing, incoming);
      expect(summary.totalParsed).toBe(3);
      expect(summary.duplicateCount).toBe(1);
      expect(summary.conflictCount).toBe(1);
      expect(summary.newCount).toBe(1);

      // Test keep_existing strategy
      const keptExisting = applyReconciliation(existing, summary, 'keep_existing');
      expect(keptExisting.length).toBe(3); // 2 existing + 1 new

      // Test keep_both strategy
      const keptBoth = applyReconciliation(existing, summary, 'keep_both');
      expect(keptBoth.length).toBe(5); // 2 existing + 1 new + 1 duplicate copy + 1 conflict copy

      // Test overwrite strategy
      const overwritten = applyReconciliation(existing, summary, 'overwrite');
      expect(overwritten.length).toBe(3);
      const updatedGh = overwritten.find((i) => i.issuer === 'GitHub');
      expect(updatedGh?.secret).toBe('MZXW6YTBOI======');
    });
  });

  describe('Open Vault Exporters', () => {
    const items: VaultItem[] = [
      {
        id: 'uuid-1',
        type: 'totp',
        issuer: 'Google',
        account: 'user@gmail.com',
        secret: 'JBSWY3DPEHPK3PXP',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        notes: 'Backup key',
        pinned: true,
        created_at: 1000,
        updated_at: 1000,
      },
    ];

    it('exports to otpauth plaintext list', () => {
      const output = exportVaultToOtpAuthList(items);
      expect(output).toContain('otpauth://totp/Google:user%40gmail.com?secret=JBSWY3DPEHPK3PXP');
      expect(output).toContain('# Revolt Pass');
    });

    it('exports to Aegis unencrypted JSON', () => {
      const json = exportVaultToAegis(items);
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe(1);
      expect(parsed.db.entries.length).toBe(1);
      expect(parsed.db.entries[0].name).toBe('user@gmail.com');
      expect(parsed.db.entries[0].info.secret).toBe('JBSWY3DPEHPK3PXP');
    });

    it('exports to Bitwarden CSV', () => {
      const csv = exportVaultToBitwardenCsv(items);
      expect(csv).toContain('login_totp');
      expect(csv).toContain('otpauth://totp/Google:user%40gmail.com');
    });
  });
});
