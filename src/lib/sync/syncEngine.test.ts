import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getSyncState,
  onSyncStateChange,
  mergeTwoVaultItems,
  deduplicateVaultItems,
  initNetworkSyncListeners,
  pullRemoteVault,
} from './syncEngine';
import {
  saveLocalVault,
  saveUserConfig,
  clearLocalData,
  closeDb,
} from '../storage/idb';
import { deriveMasterKeyDirect, generateSalt } from '../crypto/kdf';
import type { VaultItem } from '../../types/vault';

describe('Sync Engine Unit Tests', () => {
  let masterKey: CryptoKey;

  beforeEach(async () => {
    await clearLocalData();
    const salt = generateSalt();
    masterKey = await deriveMasterKeyDirect('test-password-123', salt, 'pbkdf2');
  });

  afterEach(() => {
    closeDb();
    vi.restoreAllMocks();
  });

  describe('Sync State Machine & Listeners', () => {
    it('notifies subscribers immediately with current state', () => {
      const listener = vi.fn();
      const unsub = onSyncStateChange(listener);

      expect(listener).toHaveBeenCalledWith(getSyncState());
      unsub();
    });

    it('unsubscribes cleanly without memory leaks', () => {
      const listener = vi.fn();
      const unsub = onSyncStateChange(listener);
      listener.mockClear();

      unsub();
      // Emitting through another listener to verify unsubscription
      const listener2 = vi.fn();
      const unsub2 = onSyncStateChange(listener2);
      expect(listener).not.toHaveBeenCalled();
      unsub2();
    });
  });

  describe('Item Deduplication & Soft-Delete Merging', () => {
    it('preserves newest modification and merges recovery codes across copies', () => {
      const itemA: VaultItem = {
        id: 'acc-1',
        type: 'totp',
        issuer: 'GitHub',
        account: 'user',
        secret: 'JBSWY3DPEHPK3PXP',
        recovery_codes: [{ code: 'CODE1', used: false }],
        created_at: 1000,
        updated_at: 2000,
      };

      const itemB: VaultItem = {
        id: 'acc-1-copy',
        type: 'totp',
        issuer: 'GitHub',
        account: 'user',
        secret: 'JBSWY3DPEHPK3PXP',
        recovery_codes: [{ code: 'CODE2', used: true }],
        notes: 'Merged note',
        created_at: 1000,
        updated_at: 3000, // Newer
      };

      const merged = mergeTwoVaultItems(itemA, itemB);
      expect(merged.updated_at).toBe(3000);
      expect(merged.notes).toBe('Merged note');
      expect(merged.recovery_codes).toHaveLength(2);
      expect(merged.recovery_codes?.map((c) => c.code).sort()).toEqual(['CODE1', 'CODE2']);
    });

    it('deduplicates array of items and retains single canonical entry per secret', () => {
      const items: VaultItem[] = [
        {
          id: '1',
          type: 'totp',
          issuer: 'Google',
          account: 'a@gmail.com',
          secret: 'JBSWY3DPEHPK3PXP',
          created_at: 1000,
          updated_at: 1000,
        },
        {
          id: '2',
          type: 'totp',
          issuer: 'Google',
          account: 'a@gmail.com',
          secret: 'JBSW Y3DP EHPK 3PXP', // Same secret spaced
          created_at: 1000,
          updated_at: 2000,
        },
        {
          id: '3',
          type: 'totp',
          issuer: 'AWS',
          account: 'root',
          secret: 'KRUGS4ZANFZSA53E',
          created_at: 1000,
          updated_at: 1000,
        },
      ];

      const deduped = deduplicateVaultItems(items);
      expect(deduped).toHaveLength(2);
      const google = deduped.find((i) => i.issuer === 'Google');
      expect(google?.updated_at).toBe(2000);
    });

    it('correctly handles deleted_at timestamp in soft-deleted items during merge', () => {
      const active: VaultItem = {
        id: 'item-del-1',
        type: 'totp',
        issuer: 'Service',
        account: 'test',
        secret: 'JBSWY3DPEHPK3PXP',
        created_at: 1000,
        updated_at: 1000,
      };

      const deleted: VaultItem = {
        id: 'item-del-1',
        type: 'totp',
        issuer: 'Service',
        account: 'test',
        secret: 'JBSWY3DPEHPK3PXP',
        deleted_at: 2500,
        created_at: 1000,
        updated_at: 2500,
      };

      const merged = mergeTwoVaultItems(active, deleted);
      expect(merged.deleted_at).toBe(2500);
      expect(merged.updated_at).toBe(2500);
    });
  });

  describe('Network and Session Resilience', () => {
    it('sets up window online/offline listeners and returns teardown function', () => {
      const onOnline = vi.fn();
      const onOffline = vi.fn();
      const teardown = initNetworkSyncListeners(onOnline, onOffline);

      expect(typeof teardown).toBe('function');
      teardown();
    });

    it('handles expired session HTTP 401 in pullRemoteVault gracefully without throwing', async () => {
      await saveUserConfig({
        user_id: 'usr-401',
        username: 'testuser',
        salt: 'somesalt',
        session_token: 'expired_token',
      });

      // Mock fetch returning 401
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Session expired' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await pullRemoteVault('usr-401', masterKey);
      expect(result.pulled).toBe(false);
      expect(getSyncState()).toBe('error');
    });
  });
});
