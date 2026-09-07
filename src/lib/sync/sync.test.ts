import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getTimeDriftOffsetMs,
  setTimeDriftOffsetMs,
  getCalibratedNow,
  syncTimeWithServer,
} from './timeSync.ts';
import {
  reconcileVaultItems,
  deduplicateVaultItems,
  pullRemoteVault,
  pushLocalVault,
} from './syncEngine.ts';
import {
  saveLocalVault,
  saveUserConfig,
  clearLocalData,
  closeDb,
  getLocalVault,
} from '../storage/idb.ts';
import { deriveMasterKeyDirect, generateSalt } from '../crypto/kdf.ts';
import { encryptVault } from '../crypto/vault.ts';
import type { VaultItem } from '../../types/vault.ts';

describe('Vault Synchronization and Reconciliation', () => {
  beforeEach(async () => {
    await clearLocalData();
    setTimeDriftOffsetMs(0);
  });

  afterEach(() => {
    closeDb();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Time Drift Compensation Tests
  // =========================================================================
  describe('Time Drift Compensation (timeSync)', () => {
    it('returns and manually sets time drift offset', () => {
      expect(getTimeDriftOffsetMs()).toBe(0);
      setTimeDriftOffsetMs(5000); // 5 seconds ahead of server
      expect(getTimeDriftOffsetMs()).toBe(5000);

      const before = Date.now();
      const calibrated = getCalibratedNow();
      expect(calibrated).toBeGreaterThanOrEqual(before + 5000);
    });

    it('calculates exact offset against /api/time subtracting RTT', async () => {
      const simulatedServerTime = Date.now() + 15000; // Server is 15s ahead

      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            success: true,
            data: { server_time_utc: simulatedServerTime },
            timestamp: simulatedServerTime,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      try {
        const calculatedOffset = await syncTimeWithServer('https://pass.example.com');
        // Offset should be around ~15,000 ms
        expect(Math.abs(calculatedOffset - 15000)).toBeLessThan(500);
        expect(getTimeDriftOffsetMs()).toBe(calculatedOffset);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('applies deadband (offset 0) if difference is under 1 second to prevent jitter', async () => {
      const simulatedServerTime = Date.now() + 400; // Only 400ms difference (routine network noise)

      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            success: true,
            data: { server_time_utc: simulatedServerTime },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      try {
        const calculatedOffset = await syncTimeWithServer('https://pass.example.com');
        expect(calculatedOffset).toBe(0);
        expect(getTimeDriftOffsetMs()).toBe(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('discards timestamp anomalies (> 24h) without corrupting clock', async () => {
      const simulatedServerTime = Date.now() + 48 * 60 * 60 * 1000; // 48 hours in future (extreme anomaly)
      setTimeDriftOffsetMs(0);

      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            success: true,
            data: { server_time_utc: simulatedServerTime },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      try {
        const calculatedOffset = await syncTimeWithServer('https://pass.example.com');
        expect(calculatedOffset).toBe(0);
        expect(getTimeDriftOffsetMs()).toBe(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('handles network failures or HTTP 500 without breaking application', async () => {
      setTimeDriftOffsetMs(0);

      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      try {
        const calculatedOffset = await syncTimeWithServer('https://pass.example.com');
        expect(calculatedOffset).toBe(0);
        expect(getTimeDriftOffsetMs()).toBe(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // 2. Item Reconciliation Tests (3-Way Merge / Last-Write-Wins)
  // =========================================================================
  describe('Reconciliation Algorithm (reconcileVaultItems)', () => {
    it('merges unique items from both sources without loss', () => {
      const localItems: VaultItem[] = [
        {
          id: 'item-1',
          type: 'totp',
          issuer: 'GitHub',
          account: 'user1',
          secret: 'JBSWY3DPEHPK3PXP',
          digits: 6,
          period: 30,
          algorithm: 'SHA1',
          created_at: 1000,
          updated_at: 1000,
        },
      ];

      const remoteItems: VaultItem[] = [
        {
          id: 'item-2',
          type: 'totp',
          issuer: 'Google',
          account: 'user2',
          secret: 'KRSXG5CTMVRXEZLU',
          digits: 6,
          period: 30,
          algorithm: 'SHA1',
          created_at: 2000,
          updated_at: 2000,
        },
      ];

      const reconciled = reconcileVaultItems(localItems, remoteItems);
      expect(reconciled).toHaveLength(2);
      expect(reconciled.map((i) => i.id)).toContain('item-1');
      expect(reconciled.map((i) => i.id)).toContain('item-2');
    });

    it('prefers version with more recent updated_at on collision on same item', () => {
      const localItemOld: VaultItem = {
        id: 'shared-item',
        type: 'totp',
        issuer: 'AWS',
        account: 'admin_old',
        secret: 'OLD_SECRET_BASE32',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        created_at: 1000,
        updated_at: 2000, // Older local version
      };

      const remoteItemNew: VaultItem = {
        id: 'shared-item',
        type: 'totp',
        issuer: 'AWS',
        account: 'admin_updated_in_remote',
        secret: 'NEW_SECRET_BASE32',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        created_at: 1000,
        updated_at: 3000, // Newer remote version
      };

      const reconciled = reconcileVaultItems([localItemOld], [remoteItemNew]);
      expect(reconciled).toHaveLength(1);
      expect(reconciled[0].account).toBe('admin_updated_in_remote');
      expect(reconciled[0].secret).toBe('NEW_SECRET_BASE32');
      expect(reconciled[0].updated_at).toBe(3000);
    });

    it('prefers local version if updated_at is more recent than on server', () => {
      const localItemNew: VaultItem = {
        id: 'shared-item',
        type: 'totp',
        issuer: 'Cloudflare',
        account: 'cf_updated_locally',
        secret: 'LOCAL_SECRET',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        created_at: 1000,
        updated_at: 5000, // Modified more recently on this device
      };

      const remoteItemOld: VaultItem = {
        id: 'shared-item',
        type: 'totp',
        issuer: 'Cloudflare',
        account: 'cf_stale_server',
        secret: 'SERVER_SECRET',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        created_at: 1000,
        updated_at: 4000,
      };

      const reconciled = reconcileVaultItems([localItemNew], [remoteItemOld]);
      expect(reconciled).toHaveLength(1);
      expect(reconciled[0].account).toBe('cf_updated_locally');
      expect(reconciled[0].secret).toBe('LOCAL_SECRET');
      expect(reconciled[0].updated_at).toBe(5000);
    });

    it('merges and preserves recovery codes on colliding items', () => {
      const localWithoutCodes: VaultItem = {
        id: 'shared-item',
        type: 'totp',
        issuer: 'GitHub',
        account: 'octocat',
        secret: 'LOCAL_SECRET',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        created_at: 1000,
        updated_at: 5000, // Newer local edit
      };

      const remoteWithCodes: VaultItem = {
        id: 'shared-item',
        type: 'totp',
        issuer: 'GitHub',
        account: 'octocat',
        secret: 'OLD_SECRET',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        recovery_codes: [{ code: 'REC-1234', used: false }],
        created_at: 1000,
        updated_at: 2000,
      };

      const reconciled = reconcileVaultItems([localWithoutCodes], [remoteWithCodes]);
      expect(reconciled).toHaveLength(1);
      expect(reconciled[0].account).toBe('octocat');
      expect(reconciled[0].secret).toBe('LOCAL_SECRET');
      expect(reconciled[0].recovery_codes).toEqual([{ code: 'REC-1234', used: false }]);
    });

    it('collapses duplicated accounts from different devices matching by TOTP secret and preserves recovery codes', () => {
      const pcAccountWithCodes: VaultItem = {
        id: 'id-pc-1',
        type: 'totp',
        issuer: 'Google',
        account: 'user@example.com',
        secret: 'JBSWY3DPEHPK3PXP',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        recovery_codes: [
          { code: 'REC-AAA-111', used: false },
          { code: 'REC-BBB-222', used: true },
        ],
        notes: 'Personal account',
        tags: ['Work', 'Email'],
        created_at: 1000,
        updated_at: 2000,
      };

      const mobileAccountWithoutCodes: VaultItem = {
        id: 'id-mobile-1',
        type: 'totp',
        issuer: 'Google',
        account: 'user@example.com',
        secret: 'JBSWY3DPEHPK3PXP', // Exact same secret, different ID from import
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        recovery_codes: [], // Missing recovery codes from mobile import
        created_at: 3000,
        updated_at: 3500,
      };

      const deduplicated = deduplicateVaultItems([pcAccountWithCodes, mobileAccountWithoutCodes]);
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].id).toBe('id-pc-1');
      expect(deduplicated[0].recovery_codes).toHaveLength(2);
      expect(deduplicated[0].recovery_codes).toEqual([
        { code: 'REC-AAA-111', used: false },
        { code: 'REC-BBB-222', used: true },
      ]);
      expect(deduplicated[0].notes).toBe('Personal account');
      expect(deduplicated[0].tags).toEqual(['Work', 'Email']);
      expect(deduplicated[0].updated_at).toBe(3500);
    });

    it('unions recovery codes from both duplicates without repeating identical codes', () => {
      const itemA: VaultItem = {
        id: 'item-a',
        type: 'totp',
        issuer: 'GitHub',
        account: 'octocat',
        secret: 'KRSXG5CTMVRXEZLU',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        recovery_codes: [
          { code: 'CODE-1', used: false },
          { code: 'CODE-2', used: false },
        ],
        created_at: 1000,
        updated_at: 2000,
      };

      const itemB: VaultItem = {
        id: 'item-b',
        type: 'totp',
        issuer: 'GitHub',
        account: 'octocat',
        secret: 'KRSXG5CTMVRXEZLU',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        recovery_codes: [
          { code: 'code-2', used: true },
          { code: 'CODE-3', used: false },
        ],
        created_at: 1000,
        updated_at: 2500,
      };

      const deduplicated = deduplicateVaultItems([itemA, itemB]);
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].recovery_codes).toHaveLength(3);
      const codes = deduplicated[0].recovery_codes!.map((c) => c.code.toUpperCase());
      expect(codes).toContain('CODE-1');
      expect(codes).toContain('CODE-2');
      expect(codes).toContain('CODE-3');
    });
  });

  // =========================================================================
  // 3. Push/Pull and Automatic Conflict Resolution Flow Tests
  // =========================================================================
  describe('Pull / Push Sync Engine', () => {
    it('Pull Sync: respects HTTP 304 Not Modified and does not alter local version', async () => {
      await saveUserConfig({
        user_id: 'usr_pull_test',
        username: 'pull_user',
        kdf_salt: 'salt',
        auto_lock_minutes: 5,
        clipboard_clear_seconds: 45,
      });

      await saveLocalVault({
        user_id: 'usr_pull_test',
        encrypted_blob: 'blob_local_v2',
        iv: 'iv_local',
        version: 2,
        updated_at: 100,
        sync_status: 'synced',
      });

      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response(null, { status: 304 });
      });

      const res = await pullRemoteVault('', mockFetch as unknown as typeof fetch);
      expect(res.pulled).toBe(false);
      expect(res.version).toBe(2);

      const vault = await getLocalVault();
      expect(vault?.version).toBe(2);
      expect(vault?.sync_status).toBe('synced');
    });

    it('Pull Sync: downloads newer version and decrypts items in RAM if masterKey is provided', async () => {
      const salt = generateSalt(16);
      const masterKey = await deriveMasterKeyDirect('ContraseñaTest!123', salt, 1000);
      const userId = 'usr_pull_decrypt_test';

      await saveUserConfig({
        user_id: userId,
        username: 'decrypt_user',
        kdf_salt: 'salt',
        auto_lock_minutes: 5,
        clipboard_clear_seconds: 45,
      });

      // Local vault version 1
      await saveLocalVault({
        user_id: userId,
        encrypted_blob: 'blob',
        iv: 'iv',
        version: 1,
        updated_at: 1000,
        sync_status: 'synced',
      });

      // Remote vault version 2 with 1 account
      const remoteAccount: VaultItem = {
        id: 'acc-remote',
        type: 'totp',
        issuer: 'AWS',
        account: 'cloud_admin',
        secret: 'JBSWY3DPEHPK3PXP',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        recovery_codes: [{ code: 'AWS-REC-1', used: false }],
        created_at: 2000,
        updated_at: 2000,
      };

      const remoteEnc = await encryptVault([remoteAccount], masterKey, 2);

      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user_id: userId,
            encrypted_blob: remoteEnc.encryptedBlob,
            iv: remoteEnc.iv,
            version: 2,
            updated_at: 2000,
          },
        }),
      });

      const res = await pullRemoteVault('', masterKey, mockFetch as unknown as typeof fetch);
      expect(res.pulled).toBe(true);
      expect(res.version).toBe(2);
      expect(res.items).toBeDefined();
      expect(res.items).toHaveLength(1);
      expect(res.items![0].issuer).toBe('AWS');
      expect(res.items![0].recovery_codes).toEqual([{ code: 'AWS-REC-1', used: false }]);
    });

    it('Push Sync with Automatic 409 Conflict Resolution', async () => {
      const salt = generateSalt(16);
      const masterKey = await deriveMasterKeyDirect('ContraseñaTest!123', salt, 1000);

      const userId = 'usr_conflict_test';
      await saveUserConfig({
        user_id: userId,
        username: 'conflict_user',
        kdf_salt: 'salt',
        auto_lock_minutes: 5,
        clipboard_clear_seconds: 45,
      });

      const localItem: VaultItem = {
        id: 'item-local-only',
        type: 'totp',
        issuer: 'Local Service',
        account: 'user',
        secret: 'JBSWY3DPEHPK3PXP',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        created_at: 100,
        updated_at: 100,
      };

      const remoteItem: VaultItem = {
        id: 'item-remote-only',
        type: 'totp',
        issuer: 'Remote Service',
        account: 'user',
        secret: 'KRSXG5CTMVRXEZLU',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        created_at: 200,
        updated_at: 200,
      };

      // Encrypt outdated local version 2
      const localEnc = await encryptVault([localItem], masterKey, 2);
      await saveLocalVault({
        user_id: userId,
        encrypted_blob: localEnc.encryptedBlob,
        iv: localEnc.iv,
        version: 2,
        updated_at: localEnc.updatedAt,
        sync_status: 'dirty',
      });

      // Simulate that server current version is already 3
      const remoteEnc = await encryptVault([remoteItem], masterKey, 3);

      let putAttempts = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        const method = init.method || 'GET';

        // 1. First PUT: Server rejects with 409 (server is at v3, client sent v2)
        if (method === 'PUT' && putAttempts === 0) {
          putAttempts++;
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'VAULT_VERSION_CONFLICT',
                message: 'Version conflict',
                details: { server_version: 3, client_version: 2 },
              },
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // 2. GET /api/vault: Sync engine fetches version 3 from server to reconcile
        if (method === 'GET') {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                user_id: userId,
                encrypted_blob: remoteEnc.encryptedBlob,
                iv: remoteEnc.iv,
                version: 3,
                updated_at: remoteEnc.updatedAt,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // 3. Second PUT: Sync engine resolved conflict and sends version 4 (3 + 1)
        if (method === 'PUT' && putAttempts > 0) {
          const body = JSON.parse(init.body as string);
          expect(body.version).toBe(4);
          return new Response(
            JSON.stringify({
              success: true,
              data: { user_id: userId, version: 4 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response('Not Found', { status: 404 });
      });

      // Execute Push Sync with masterKey present
      const success = await pushLocalVault('', masterKey, mockFetch as unknown as typeof fetch);
      expect(success).toBe(true);

      // Verify local vault is now at version 4 and in 'synced' state
      const vaultAfter = await getLocalVault();
      expect(vaultAfter?.version).toBe(4);
      expect(vaultAfter?.sync_status).toBe('synced');
    });

    it('Pull Sync: seamlessly refreshes session on 401 and retries request without throwing', async () => {
      await saveUserConfig({
        user_id: 'usr_refresh_test',
        username: 'refresh_user',
        kdf_salt: 'salt',
        session_token: 'stale_token_123',
        auto_lock_minutes: 5,
        clipboard_clear_seconds: 45,
      });

      let vaultGetAttempts = 0;
      let sessionPostAttempts = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit = {}) => {
        const method = init.method || 'GET';

        if (url.includes('/api/vault') && method === 'GET') {
          vaultGetAttempts++;
          if (vaultGetAttempts === 1) {
            // First attempt with stale_token_123 returns 401
            return new Response(
              JSON.stringify({ success: false, error: { code: 'SESSION_REVOKED' } }),
              { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
          }
          // Second attempt with refreshed token returns 304 Not Modified
          return new Response(null, { status: 304 });
        }

        if (url.includes('/api/auth/session') && method === 'POST') {
          sessionPostAttempts++;
          return new Response(
            JSON.stringify({
              success: true,
              data: { session_token: 'new_fresh_token_456' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response('Not Found', { status: 404 });
      });

      const res = await pullRemoteVault('', mockFetch as unknown as typeof fetch);
      expect(vaultGetAttempts).toBe(2);
      expect(sessionPostAttempts).toBe(1);
      expect(res.pulled).toBe(false);
    });
  });
});
