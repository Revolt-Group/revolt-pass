/**
 * Módulo de Persistencia Local Segura con IndexedDB (idb wrapper).
 * Implementa los tres almacenes canónicos según docs/02-ARCHITECTURE.md:
 * - vault_encrypted: Bóveda cifrada y estado de sincronización local.
 * - user_config: Perfil de usuario, salt y envoltura WebAuthn.
 * - sync_queue: Cola transaccional de operaciones diferidas offline.
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
 * Obtiene la conexión singleton a IndexedDB, inicializando los almacenes si es necesario.
 */
export function getDb(): Promise<IDBPDatabase<RevoltPassDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<RevoltPassDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 1. Almacén de bóveda cifrada
        if (!db.objectStoreNames.contains('vault_encrypted')) {
          db.createObjectStore('vault_encrypted');
        }

        // 2. Almacén de configuración de usuario y llaves envueltas
        if (!db.objectStoreNames.contains('user_config')) {
          db.createObjectStore('user_config');
        }

        // 3. Cola de operaciones de sincronización offline
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
 * Cierra la conexión activa a IndexedDB (útil para pruebas o reinicios).
 */
export function closeDb(): void {
  if (dbPromise) {
    dbPromise.then((db) => db.close()).catch(() => {});
    dbPromise = null;
  }
}

// =========================================================================
// OPERACIONES SOBRE VAULT_ENCRYPTED
// =========================================================================

/**
 * Obtiene la bóveda cifrada local ('current').
 */
export async function getLocalVault(): Promise<LocalVaultRecord | undefined> {
  const db = await getDb();
  return db.get('vault_encrypted', 'current');
}

/**
 * Guarda o actualiza la bóveda cifrada en almacenamiento local.
 */
export async function saveLocalVault(vault: LocalVaultRecord): Promise<void> {
  const db = await getDb();
  await db.put('vault_encrypted', vault, 'current');
}

/**
 * Actualiza únicamente el estado de sincronización de la bóveda local.
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
// OPERACIONES SOBRE USER_CONFIG
// =========================================================================

/**
 * Obtiene la configuración y perfil del usuario local ('profile').
 */
export async function getUserConfig(): Promise<LocalUserConfig | undefined> {
  const db = await getDb();
  return db.get('user_config', 'profile');
}

/**
 * Guarda la configuración del usuario local (salt, passkey info, etc.).
 */
export async function saveUserConfig(config: LocalUserConfig): Promise<void> {
  const db = await getDb();
  await db.put('user_config', config, 'profile');
}

// =========================================================================
// OPERACIONES SOBRE SYNC_QUEUE (OFFLINE MUTATIONS)
// =========================================================================

/**
 * Añade una operación a la cola de sincronización diferida.
 */
export async function enqueueSyncOp(op: Omit<SyncQueueItem, 'id'>): Promise<number> {
  const db = await getDb();
  const key = await db.add('sync_queue', op as SyncQueueItem);
  return key as number;
}

/**
 * Obtiene todas las operaciones pendientes en la cola de sincronización.
 */
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDb();
  return db.getAll('sync_queue');
}

/**
 * Elimina una operación de la cola tras haber sido sincronizada con éxito.
 */
export async function removeSyncOp(id: number): Promise<void> {
  const db = await getDb();
  await db.delete('sync_queue', id);
}

// =========================================================================
// LIMPIEZA TOTAL Y SEGURIDAD
// =========================================================================

/**
 * Purga todo el contenido de los almacenes locales (cierre de sesión / borrado seguro).
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
