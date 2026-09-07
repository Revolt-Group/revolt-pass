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
  updateSessionToken,
} from '../storage/idb.ts';
import { encryptVault, decryptVault } from '../crypto/vault.ts';
import { sanitizeBase32 } from '../crypto/base32.ts';
import type { VaultItem, SyncStatus, EncryptedVaultPayload, RecoveryCode } from '../../types/vault.ts';
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
 * Merges two copies of the same account (e.g. from different devices or backup import).
 * Retains recovery codes, notes, tags, pinned status, and newest modification timestamp.
 */
export function mergeTwoVaultItems(a: VaultItem, b: VaultItem): VaultItem {
  const aTime = a.updated_at || 0;
  const bTime = b.updated_at || 0;
  const primary = aTime >= bTime ? a : b;
  const secondary = aTime >= bTime ? b : a;

  // Merge recovery codes: prioritize whichever has codes, or union them if both have codes
  let mergedCodes = primary.recovery_codes;
  if (!mergedCodes || mergedCodes.length === 0) {
    mergedCodes = secondary.recovery_codes;
  } else if (secondary.recovery_codes && secondary.recovery_codes.length > 0) {
    const codeMap = new Map<string, RecoveryCode>();
    for (const c of secondary.recovery_codes) {
      if (c?.code) codeMap.set(c.code.trim().toUpperCase(), c);
    }
    for (const c of mergedCodes) {
      if (c?.code) codeMap.set(c.code.trim().toUpperCase(), c);
    }
    mergedCodes = Array.from(codeMap.values());
  }

  // Merge tags
  const tagsSet = new Set<string>();
  if (primary.tags) primary.tags.forEach((t) => tagsSet.add(t));
  if (secondary.tags) secondary.tags.forEach((t) => tagsSet.add(t));
  const tags = tagsSet.size > 0 ? Array.from(tagsSet) : undefined;

  // Keep ID of the item that has recovery codes if one does and the other doesn't
  const idToKeep =
    primary.recovery_codes && primary.recovery_codes.length > 0
      ? primary.id
      : secondary.recovery_codes && secondary.recovery_codes.length > 0
      ? secondary.id
      : primary.id;

  return {
    ...primary,
    id: idToKeep,
    recovery_codes: mergedCodes,
    notes: primary.notes || secondary.notes,
    tags,
    pinned: primary.pinned || secondary.pinned,
    icon_url: primary.icon_url || secondary.icon_url,
    created_at: Math.min(primary.created_at || Date.now(), secondary.created_at || Date.now()),
    updated_at: Math.max(aTime, bTime),
  };
}

/**
 * Deduplicates an array of VaultItems by ID, sanitized TOTP secret, or (issuer + account).
 * Merges duplicate entries so no recovery codes, notes, or tags are lost.
 */
export function deduplicateVaultItems(items: VaultItem[]): VaultItem[] {
  const result: VaultItem[] = [];

  for (const item of items) {
    const itemSecret = item.secret ? sanitizeBase32(item.secret) : '';
    const itemKey = `${(item.issuer || '').trim().toLowerCase()}:::${(item.account || '').trim().toLowerCase()}`;

    const existingIndex = result.findIndex((existing) => {
      // 1. Direct ID match
      if (existing.id === item.id) return true;
      // 2. Exact TOTP secret match (must be at least 8 chars)
      if (itemSecret && itemSecret.length >= 8 && existing.secret) {
        if (sanitizeBase32(existing.secret) === itemSecret) return true;
      }
      // 3. Exact Issuer + Account match (if both non-empty)
      const existingKey = `${(existing.issuer || '').trim().toLowerCase()}:::${(existing.account || '').trim().toLowerCase()}`;
      if (itemKey !== ':::' && existingKey === itemKey) return true;
      return false;
    });

    if (existingIndex === -1) {
      result.push(item);
    } else {
      result[existingIndex] = mergeTwoVaultItems(result[existingIndex], item);
    }
  }

  return result;
}

/**
 * Item-level Last-Write-Wins reconciliation algorithm (3-Way Merge).
 * Resolves collisions between simultaneous edits on client and server.
 * Deduplicates items by ID, secret, and account name to prevent cross-device duplicates.
 */
export function reconcileVaultItems(
  localItems: VaultItem[],
  remoteItems: VaultItem[]
): VaultItem[] {
  return deduplicateVaultItems([...localItems, ...remoteItems]);
}

async function attemptSessionRefresh(
  baseUrl: string,
  userId: string,
  deviceName?: string,
  customFetch = fetch
): Promise<string | null> {
  try {
    const res = await customFetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      },
      body: JSON.stringify({ user_id: userId, device_name: deviceName }),
    });
    if (res.ok) {
      const data = (await res.json()) as ApiResponse<{ session_token: string }>;
      if (data.success && data.data?.session_token) {
        await updateSessionToken(data.data.session_token);
        return data.data.session_token;
      }
    }
  } catch {
    // Non-blocking
  }
  return null;
}

function handleAuthStatus(status: number): void {
  if (status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('revolt:session-revoked'));
  }
}

/**
 * Downloads latest version of remote vault if server has changes (Pull Sync).
 */
export async function pullRemoteVault(
  baseUrl = '',
  masterKeyOrFetch?: CryptoKey | null | typeof fetch,
  customFetch?: typeof fetch
): Promise<{ pulled: boolean; version?: number; items?: VaultItem[] }> {
  let masterKey: CryptoKey | null = null;
  let fetchFn: typeof fetch = fetch;

  if (typeof masterKeyOrFetch === 'function') {
    fetchFn = masterKeyOrFetch;
  } else {
    masterKey = masterKeyOrFetch ?? null;
    if (customFetch) {
      fetchFn = customFetch;
    }
  }

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

    if (userConfig.session_token) {
      headers['X-Session-Token'] = userConfig.session_token;
    }

    if (localVersion > 0) {
      headers['If-None-Match'] = `"v${localVersion}"`;
    }

    let response = await fetchFn(`${baseUrl}/api/vault`, {
      method: 'GET',
      headers,
    });

    if (response.status === 401) {
      // Clear rejected token to break any potential lockout loops
      await updateSessionToken('');

      // Attempt silent refresh before declaring revocation
      const refreshedToken = await attemptSessionRefresh(baseUrl, userConfig.user_id, undefined, fetchFn);
      if (refreshedToken) {
        headers['X-Session-Token'] = refreshedToken;
        response = await fetchFn(`${baseUrl}/api/vault`, {
          method: 'GET',
          headers,
        });
      }

      if (response.status === 401) {
        handleAuthStatus(401);
        throw new Error('SESSION_REVOKED');
      }
    }

    // FIX-04 (v1.3.1): Sliding session token rotation pickup
    const newSessionToken = response.headers?.get?.('X-New-Session-Token');
    if (newSessionToken) {
      await updateSessionToken(newSessionToken);
    }

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

      let decryptedItems: VaultItem[] | undefined;
      if (masterKey) {
        try {
          decryptedItems = await decryptVault(remote.encrypted_blob, remote.iv, masterKey);
        } catch (e) {
          console.error('Failed to decrypt remote vault with current masterKey:', e);
        }
      }

      if (typeof window !== 'undefined' && decryptedItems) {
        window.dispatchEvent(
          new CustomEvent('revolt:vault-synced', {
            detail: { version: remote.version, items: decryptedItems },
          })
        );
      }

      return { pulled: true, version: remote.version, items: decryptedItems };
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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-User-Id': userConfig.user_id,
    };

    if (userConfig.session_token) {
      headers['X-Session-Token'] = userConfig.session_token;
    }

    let response = await customFetch(`${baseUrl}/api/vault`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      await updateSessionToken('');
      const refreshedToken = await attemptSessionRefresh(baseUrl, userConfig.user_id, undefined, customFetch);
      if (refreshedToken) {
        headers['X-Session-Token'] = refreshedToken;
        response = await customFetch(`${baseUrl}/api/vault`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });
      }

      if (response.status === 401) {
        handleAuthStatus(401);
        throw new Error('SESSION_REVOKED');
      }
    }

    // 200 OK: Synchronization successful
    if (response.ok) {
      // FIX-04 (v1.3.1): Sliding session token rotation pickup
      const newSessionToken = response.headers?.get?.('X-New-Session-Token');
      if (newSessionToken) {
        await updateSessionToken(newSessionToken);
      }

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
  const getHeaders: Record<string, string> = {
    'X-User-Id': userConfig.user_id,
  };
  if (userConfig.session_token) {
    getHeaders['X-Session-Token'] = userConfig.session_token;
  }

  let getRes = await customFetch(`${baseUrl}/api/vault`, {
    method: 'GET',
    headers: getHeaders,
  });

  if (getRes.status === 401) {
    await updateSessionToken('');
    const refreshedToken = await attemptSessionRefresh(baseUrl, userConfig.user_id, undefined, customFetch);
    if (refreshedToken) {
      getHeaders['X-Session-Token'] = refreshedToken;
      getRes = await customFetch(`${baseUrl}/api/vault`, {
        method: 'GET',
        headers: getHeaders,
      });
    }

    if (getRes.status === 401) {
      handleAuthStatus(401);
      updateSyncState('error');
      return false;
    }
  }

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
  const pushSuccess = await pushLocalVault(baseUrl, masterKey, customFetch);
  if (pushSuccess && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('revolt:vault-synced', {
        detail: { version: nextVersion, items: mergedItems },
      })
    );
  }
  return pushSuccess;
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
