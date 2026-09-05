/**
 * Bidirectional Synchronization and Offline Mode Orchestrator.
 * Manages reactive state machine, network connectivity listeners,
 * and Last-Write-Wins item-level conflict resolution.
 */

import {
  getLocalVault,
  saveLocalVault,
  setSyncStatus,
  getUserConfig,
} from '../storage/idb.ts';
import { encryptVault, decryptVault } from '../crypto/vault.ts';
import type { VaultItem, SyncStatus, EncryptedVaultPayload } from '../../types/vault.ts';
import type { ApiResponse } from '../../worker/types.ts';

type SyncListener = (state: SyncStatus) => void;

let currentSyncState: SyncStatus = 'synced';
const syncListeners: Set<SyncListener> = new Set();

/**
 * Returns the current synchronization status.
 */
export function getSyncState(): SyncStatus {
  return currentSyncState;
}

/**
 * Subscribes a listener callback to sync state transitions.
 */
export function onSyncStateChange(listener: SyncListener): () => void {
  syncListeners.add(listener);
  listener(currentSyncState);
  return () => syncListeners.delete(listener);
}

function updateSyncState(newState: SyncStatus): void {
  currentSyncState = newState;
  syncListeners.forEach((listener) => listener(newState));
}

/**
 * Item-level Last-Write-Wins reconciliation algorithm (3-Way Merge).
 * Resolves collisions between simultaneous edits on client and server.
 * 
 * @param localItems Decrypted items from local vault
 * @param remoteItems Decrypted items from remote vault
 * @returns Deduplicated unified list retaining the latest version of each account
 */
export function reconcileVaultItems(
  localItems: VaultItem[],
  remoteItems: VaultItem[]
): VaultItem[] {
  const itemMap = new Map<string, VaultItem>();

  // 1. Load all remote items into map
  for (const item of remoteItems) {
    itemMap.set(item.id, item);
  }

  // 2. Compare against local items
  for (const localItem of localItems) {
    const remoteItem = itemMap.get(localItem.id);

    if (!remoteItem) {
      // Item exists only locally (added offline) -> Retain
      itemMap.set(localItem.id, localItem);
    } else {
      // Item exists in both -> Retain the one with more recent updated_at timestamp
      if (localItem.updated_at >= remoteItem.updated_at) {
        itemMap.set(localItem.id, localItem);
      }
    }
  }

  return Array.from(itemMap.values());
}

/**
 * Downloads latest version of remote vault if server has changes (Pull Sync).
 */
export async function pullRemoteVault(
  baseUrl = '',
  customFetch = fetch
): Promise<{ pulled: boolean; version?: number }> {
  const userConfig = await getUserConfig();
  if (!userConfig || !userConfig.user_id) {
    return { pulled: false };
  }

  const localVault = await getLocalVault();
  const localVersion = localVault?.version ?? 0;

  try {
    updateSyncState('syncing');

    const headers: Record<string, string> = {
      'X-User-Id': userConfig.user_id,
      'Accept': 'application/json',
    };

    if (localVersion > 0) {
      headers['If-None-Match'] = `"v${localVersion}"`;
    }

    const response = await customFetch(`${baseUrl}/api/vault`, {
      method: 'GET',
      headers,
    });

    // 304 Not Modified: Server and client are identically synchronized
    if (response.status === 304) {
      await setSyncStatus('synced');
      updateSyncState('synced');
      return { pulled: false, version: localVersion };
    }

    if (!response.ok) {
      throw new Error(`Pull Sync failed: HTTP ${response.status}`);
    }

    const resJson = (await response.json()) as ApiResponse<EncryptedVaultPayload>;
    if (!resJson.success || !resJson.data) {
      throw new Error('Invalid remote vault response payload');
    }

    const remote = resJson.data;

    // Only update locally if remote version is newer
    if (remote.version > localVersion) {
      await saveLocalVault({
        ...remote,
        sync_status: 'synced',
        last_sync_attempt: Date.now(),
      });
      updateSyncState('synced');
      return { pulled: true, version: remote.version };
    }

    updateSyncState('synced');
    return { pulled: false, version: localVersion };
  } catch (err) {
    await setSyncStatus('error', err instanceof Error ? err.message : 'Pull sync failure');
    updateSyncState('error');
    return { pulled: false };
  }
}

/**
 * Pushes local vault version to Cloudflare D1 (Push Sync).
 * If version conflict occurs (HTTP 409), triggers automatic reconciliation.
 */
export async function pushLocalVault(
  baseUrl = '',
  masterKey?: CryptoKey | null,
  customFetch = fetch
): Promise<boolean> {
  const userConfig = await getUserConfig();
  const localVault = await getLocalVault();

  if (!userConfig || !userConfig.user_id || !localVault) {
    return false;
  }

  // If already synced and clean, do not perform redundant push
  if (localVault.sync_status === 'synced') {
    updateSyncState('synced');
    return true;
  }

  try {
    updateSyncState('syncing');

    const payload = {
      encrypted_blob: localVault.encrypted_blob,
      iv: localVault.iv,
      version: localVault.version,
    };

    const response = await customFetch(`${baseUrl}/api/vault`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userConfig.user_id,
      },
      body: JSON.stringify(payload),
    });

    // 200 OK: Synchronization successful
    if (response.ok) {
      await setSyncStatus('synced');
      updateSyncState('synced');
      return true;
    }

    // 409 Conflict: Server version changed while we were offline
    if (response.status === 409) {
      updateSyncState('conflict');

      if (masterKey) {
        // Autonomously resolve conflict with in-memory MasterKey
        return await resolveConflict(baseUrl, masterKey, customFetch);
      } else {
        await setSyncStatus('error', 'Sync conflict: MasterKey required to reconcile');
        updateSyncState('conflict');
        return false;
      }
    }

    throw new Error(`Push Sync failed: HTTP ${response.status}`);
  } catch (err) {
    await setSyncStatus('error', err instanceof Error ? err.message : 'Push sync failure');
    updateSyncState('error');
    return false;
  }
}

/**
 * Version conflict resolution protocol (HTTP 409).
 * Downloads remote copy, decrypts both in RAM, reconciles items via Last-Write-Wins,
 * encrypts resulting version with version = remote.version + 1 and retries push.
 */
export async function resolveConflict(
  baseUrl: string,
  masterKey: CryptoKey,
  customFetch = fetch
): Promise<boolean> {
  const userConfig = await getUserConfig();
  const localVault = await getLocalVault();

  if (!userConfig || !localVault) return false;

  // 1. Fetch full remote version
  const getRes = await customFetch(`${baseUrl}/api/vault`, {
    method: 'GET',
    headers: { 'X-User-Id': userConfig.user_id },
  });

  if (!getRes.ok) {
    updateSyncState('error');
    return false;
  }

  const remoteJson = (await getRes.json()) as ApiResponse<EncryptedVaultPayload>;
  if (!remoteJson.success || !remoteJson.data) {
    updateSyncState('error');
    return false;
  }

  const remoteVault = remoteJson.data;

  // 2. Decrypt both versions in RAM
  const localItems = await decryptVault(localVault.encrypted_blob, localVault.iv, masterKey);
  const remoteItems = await decryptVault(remoteVault.encrypted_blob, remoteVault.iv, masterKey);

  // 3. Reconcile items according to updated_at timestamps
  const mergedItems = reconcileVaultItems(localItems, remoteItems);

  // 4. Encrypt with consecutive version number (remote.version + 1)
  const nextVersion = remoteVault.version + 1;
  const encryptedResult = await encryptVault(mergedItems, masterKey, nextVersion);

  // 5. Save locally
  await saveLocalVault({
    user_id: userConfig.user_id,
    encrypted_blob: encryptedResult.encryptedBlob,
    iv: encryptedResult.iv,
    version: nextVersion,
    updated_at: encryptedResult.updatedAt,
    sync_status: 'dirty',
  });

  // 6. Retry push with unified consecutive version
  return await pushLocalVault(baseUrl, masterKey, customFetch);
}

/**
 * Initializes browser network connectivity listeners.
 */
export function initNetworkSyncListeners(
  onOnlineCallback?: () => void,
  onOfflineCallback?: () => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = () => {
    onOnlineCallback?.();
  };

  const handleOffline = () => {
    if (currentSyncState === 'syncing') {
      updateSyncState('dirty');
    }
    onOfflineCallback?.();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
