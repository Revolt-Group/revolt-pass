/**
 * Secure Local Storage Manager in IndexedDB using 'idb'.
 * Implements the three canonical object stores per docs/es/02-ARCHITECTURE.md / docs/en/02-ARCHITECTURE.md:
 * - vault_encrypted: Encrypted vault blob and local sync state.
 * - user_config: User profile, KDF salt, and WebAuthn wrapping metadata.
 * - sync_queue: Transactional queue for deferred offline operations.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LocalVaultRecord, LocalUserConfig, SyncStatus } from '../../types/vault.ts';

export const DB_NAME = 'revolt_pass_db';
export const DB_VERSION = 1;

export interface SyncQueueItem {
  id?: number;
  action: 'PUSH_VAULT';
  payload: {
    user_id: string;
    encrypted_blob: string;
    iv: string;
    version: number;
  };
  timestamp: number;
  attempts: number;
}

export interface RevoltPassDBSchema extends DBSchema {
  vault_encrypted: {
    key: string;
    value: LocalVaultRecord;
  };
  user_config: {
    key: string;
    value: LocalUserConfig;
  };
  sync_queue: {
    key: number;
    value: SyncQueueItem;
    autoIncrement: true;
  };
}

let dbPromise: Promise<IDBPDatabase<RevoltPassDBSchema>> | null = null;

/**
 * Obtains singleton IndexedDB connection, initializing object stores if necessary.
 */
export function getDb(): Promise<IDBPDatabase<RevoltPassDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<RevoltPassDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 1. Encrypted vault object store
        if (!db.objectStoreNames.contains('vault_encrypted')) {
          db.createObjectStore('vault_encrypted');
        }

        // 2. User profile and wrapped keys object store
        if (!db.objectStoreNames.contains('user_config')) {
          db.createObjectStore('user_config');
        }

        // 3. Offline synchronization queue object store
        if (!db.objectStoreNames.contains('sync_queue')) {
          db.createObjectStore('sync_queue', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
      },
    });
  }

  return dbPromise;
}

/**
 * Closes active IndexedDB connection (useful for tests or teardown).
 */
export function closeDb(): void {
  if (dbPromise) {
    dbPromise.then((db) => db.close()).catch(() => {});
    dbPromise = null;
  }
}

// =========================================================================
// OPERATIONS ON VAULT_ENCRYPTED
// =========================================================================

/**
 * Retrieves local encrypted vault record ('current').
 */
export async function getLocalVault(): Promise<LocalVaultRecord | undefined> {
  const db = await getDb();
  return db.get('vault_encrypted', 'current');
}

/**
 * Saves or updates encrypted vault in local storage.
 */
export async function saveLocalVault(vault: LocalVaultRecord): Promise<void> {
  const db = await getDb();
  await db.put('vault_encrypted', vault, 'current');
}

/**
 * Updates only the sync status of the local vault record.
 */
export async function setSyncStatus(status: SyncStatus, errorMessage?: string): Promise<void> {
  const db = await getDb();
  const vault = await db.get('vault_encrypted', 'current');
  if (vault) {
    vault.sync_status = status;
    vault.last_sync_attempt = Date.now();
    vault.sync_error_message = errorMessage;
    await db.put('vault_encrypted', vault, 'current');
  }
}

// =========================================================================
// OPERATIONS ON USER_CONFIG
// =========================================================================

/**
 * Retrieves local user profile configuration ('profile').
 */
export async function getUserConfig(): Promise<LocalUserConfig | undefined> {
  const db = await getDb();
  return db.get('user_config', 'profile');
}

/**
 * Saves local user configuration (salt, passkey info, preferences).
 */
export async function saveUserConfig(config: LocalUserConfig): Promise<void> {
  const db = await getDb();
  await db.put('user_config', config, 'profile');
}

/**
 * FIX-04 (v1.3.1): Updates only the session_token in local user profile (sliding session token rotation).
 */
export async function updateSessionToken(newToken: string): Promise<void> {
  const db = await getDb();
  const config = await db.get('user_config', 'profile');
  if (config) {
    config.session_token = newToken;
    await db.put('user_config', config, 'profile');
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('revolt:session-token-updated', {
        detail: { session_token: newToken },
      })
    );
  }
}



// =========================================================================
// OPERATIONS ON SYNC_QUEUE (OFFLINE MUTATIONS)
// =========================================================================

/**
 * Enqueues an operation into the deferred synchronization queue.
 */
export async function enqueueSyncOp(op: Omit<SyncQueueItem, 'id'>): Promise<number> {
  const db = await getDb();
  const key = await db.add('sync_queue', op as SyncQueueItem);
  return key as number;
}

/**
 * Retrieves all pending operations in the sync queue.
 */
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDb();
  return db.getAll('sync_queue');
}

/**
 * Removes an operation from queue upon successful synchronization.
 */
export async function removeSyncOp(id: number): Promise<void> {
  const db = await getDb();
  await db.delete('sync_queue', id);
}

// =========================================================================
// FULL WIPE AND PURGE
// =========================================================================

/**
 * Purges all content from local stores (logout / secure wipe).
 */
export async function clearLocalData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['vault_encrypted', 'user_config', 'sync_queue'], 'readwrite');
  await Promise.all([
    tx.objectStore('vault_encrypted').clear(),
    tx.objectStore('user_config').clear(),
    tx.objectStore('sync_queue').clear(),
    tx.done,
  ]);
}
