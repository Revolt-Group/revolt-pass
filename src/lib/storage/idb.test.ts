import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getLocalVault,
  saveLocalVault,
  setSyncStatus,
  getUserConfig,
  saveUserConfig,
  enqueueSyncOp,
  getSyncQueue,
  removeSyncOp,
  clearLocalData,
  closeDb,
} from './idb.ts';
import type { LocalVaultRecord, LocalUserConfig } from '../../types/vault.ts';

describe('IndexedDB Storage Layer (idb)', () => {
  beforeEach(async () => {
    await clearLocalData();
  });

  afterEach(() => {
    closeDb();
  });

  it('correctly saves and retrieves local encrypted vault', async () => {
    const vaultRecord: LocalVaultRecord = {
      user_id: 'usr_idb_1',
      encrypted_blob: 'VGhpcyBpcyBhIGJsb2I...',
      iv: 'MDEyMzQ1Njc4OTAx',
      version: 1,
      updated_at: 1772719200,
      sync_status: 'synced',
    };

    await saveLocalVault(vaultRecord);
    const retrieved = await getLocalVault();

    expect(retrieved).toBeDefined();
    expect(retrieved?.user_id).toBe('usr_idb_1');
    expect(retrieved?.encrypted_blob).toBe(vaultRecord.encrypted_blob);
    expect(retrieved?.version).toBe(1);
    expect(retrieved?.sync_status).toBe('synced');
  });

  it('updates sync_status without overwriting vault content', async () => {
    const vaultRecord: LocalVaultRecord = {
      user_id: 'usr_idb_status',
      encrypted_blob: 'blob_status',
      iv: 'iv_status',
      version: 2,
      updated_at: 1772719200,
      sync_status: 'dirty',
    };

    await saveLocalVault(vaultRecord);
    await setSyncStatus('synced');

    const updated = await getLocalVault();
    expect(updated?.sync_status).toBe('synced');
    expect(updated?.encrypted_blob).toBe('blob_status');
    expect(updated?.last_sync_attempt).toBeDefined();
  });

  it('saves and retrieves user configuration (user_config)', async () => {
    const userConfig: LocalUserConfig = {
      user_id: 'usr_cfg_1',
      username: 'revolt_user',
      kdf_salt: 'salt_local_16_bytes',
      webauthn_credential_id: 'cred_win_hello',
      wrapped_master_key: 'wrapped_key_payload',
      auto_lock_minutes: 5,
      clipboard_clear_seconds: 45,
    };

    await saveUserConfig(userConfig);
    const retrieved = await getUserConfig();

    expect(retrieved).toBeDefined();
    expect(retrieved?.user_id).toBe('usr_cfg_1');
    expect(retrieved?.username).toBe('revolt_user');
    expect(retrieved?.wrapped_master_key).toBe('wrapped_key_payload');
    expect(retrieved?.auto_lock_minutes).toBe(5);
  });

  it('enqueues, lists, and removes operations in sync_queue', async () => {
    const op1 = {
      action: 'PUSH_VAULT' as const,
      payload: {
        user_id: 'usr_q',
        encrypted_blob: 'blob_1',
        iv: 'iv_1',
        version: 1,
      },
      timestamp: Date.now(),
      attempts: 0,
    };

    const op2 = {
      action: 'PUSH_VAULT' as const,
      payload: {
        user_id: 'usr_q',
        encrypted_blob: 'blob_2',
        iv: 'iv_2',
        version: 2,
      },
      timestamp: Date.now(),
      attempts: 0,
    };

    const id1 = await enqueueSyncOp(op1);
    const id2 = await enqueueSyncOp(op2);

    expect(typeof id1).toBe('number');
    expect(typeof id2).toBe('number');

    const queueBefore = await getSyncQueue();
    expect(queueBefore).toHaveLength(2);

    await removeSyncOp(id1);

    const queueAfter = await getSyncQueue();
    expect(queueAfter).toHaveLength(1);
    expect(queueAfter[0].id).toBe(id2);
  });

  it('purges all stores when executing clearLocalData', async () => {
    await saveLocalVault({
      user_id: 'usr_wipe',
      encrypted_blob: 'b',
      iv: 'i',
      version: 1,
      updated_at: 100,
      sync_status: 'synced',
    });

    await saveUserConfig({
      user_id: 'usr_wipe',
      username: 'wipe_user',
      kdf_salt: 's',
      auto_lock_minutes: 5,
      clipboard_clear_seconds: 45,
    });

    await enqueueSyncOp({
      action: 'PUSH_VAULT',
      payload: { user_id: 'usr_wipe', encrypted_blob: 'b', iv: 'i', version: 1 },
      timestamp: 100,
      attempts: 0,
    });

    await clearLocalData();

    const vault = await getLocalVault();
    const config = await getUserConfig();
    const queue = await getSyncQueue();

    expect(vault).toBeUndefined();
    expect(config).toBeUndefined();
    expect(queue).toHaveLength(0);
  });
});
