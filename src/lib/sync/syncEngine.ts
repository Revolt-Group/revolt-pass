/**
 * Orquestador de Sincronización Bidireccional y Modo Offline.
 * Maneja la máquina de estados reactiva, eventos de red y el protocolo
 * de resolución de conflictos Last-Write-Wins a nivel de ítem.
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
 * Devuelve el estado actual de sincronización.
 */
export function getSyncState(): SyncStatus {
  return currentSyncState;
}

/**
 * Suscribe un callback a las transiciones de estado de sincronización.
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
 * Algoritmo de conciliación Last-Write-Wins a nivel de ítem individual (3-Way Merge).
 * Resuelve colisiones entre ediciones simultáneas en cliente y servidor.
 * 
 * @param localItems Ítems descifrados de la bóveda local
 * @param remoteItems Ítems descifrados de la bóveda remota
 * @returns Lista combinada sin duplicados, conservando la versión más reciente de cada cuenta
 */
export function reconcileVaultItems(
  localItems: VaultItem[],
  remoteItems: VaultItem[]
): VaultItem[] {
  const itemMap = new Map<string, VaultItem>();

  // 1. Cargar todos los ítems remotos en el mapa
  for (const item of remoteItems) {
    itemMap.set(item.id, item);
  }

  // 2. Comparar con los ítems locales
  for (const localItem of localItems) {
    const remoteItem = itemMap.get(localItem.id);

    if (!remoteItem) {
      // El ítem solo existe en local (añadido offline) -> Conservarlo
      itemMap.set(localItem.id, localItem);
    } else {
      // El ítem existe en ambos -> Conservar el que tenga updated_at más reciente
      if (localItem.updated_at >= remoteItem.updated_at) {
        itemMap.set(localItem.id, localItem);
      }
    }
  }

  return Array.from(itemMap.values());
}

/**
 * Descarga la última versión de la bóveda remota si el servidor tiene cambios (Pull Sync).
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

    // 304 Not Modified: El servidor y el cliente están exactamente sincronizados
    if (response.status === 304) {
      await setSyncStatus('synced');
      updateSyncState('synced');
      return { pulled: false, version: localVersion };
    }

    if (!response.ok) {
      throw new Error(`Error en Pull Sync: HTTP ${response.status}`);
    }

    const resJson = (await response.json()) as ApiResponse<EncryptedVaultPayload>;
    if (!resJson.success || !resJson.data) {
      throw new Error('Respuesta de bóveda remota inválida');
    }

    const remote = resJson.data;

    // Solo actualizar localmente si la versión remota es más nueva
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
    await setSyncStatus('error', err instanceof Error ? err.message : 'Fallo en pull sync');
    updateSyncState('error');
    return { pulled: false };
  }
}

/**
 * Envía la versión local de la bóveda a Cloudflare D1 (Push Sync).
 * Si ocurre un conflicto de versión (HTTP 409), dispara la conciliación automática.
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

  // Si ya está sincronizado y no hay cambios sucios, no hacer push redundante
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

    // 200 OK: Sincronización exitosa
    if (response.ok) {
      await setSyncStatus('synced');
      updateSyncState('synced');
      return true;
    }

    // 409 Conflict: La versión del servidor cambió mientras estábamos offline
    if (response.status === 409) {
      updateSyncState('conflict');

      if (masterKey) {
        // Resolver conflicto de forma autónoma con la MasterKey en RAM
        return await resolveConflict(baseUrl, masterKey, customFetch);
      } else {
        await setSyncStatus('error', 'Conflicto de sincronización: se requiere MasterKey para conciliar');
        updateSyncState('conflict');
        return false;
      }
    }

    throw new Error(`Error en Push Sync: HTTP ${response.status}`);
  } catch (err) {
    await setSyncStatus('error', err instanceof Error ? err.message : 'Fallo en push sync');
    updateSyncState('error');
    return false;
  }
}

/**
 * Protocolo de resolución de conflictos de versión (HTTP 409).
 * Descarga la copia remota, descifra ambas en memoria, concilia ítems con Last-Write-Wins,
 * cifra la versión resultante con version = remote.version + 1 y reintenta el push.
 */
export async function resolveConflict(
  baseUrl: string,
  masterKey: CryptoKey,
  customFetch = fetch
): Promise<boolean> {
  const userConfig = await getUserConfig();
  const localVault = await getLocalVault();

  if (!userConfig || !localVault) return false;

  // 1. Obtener la versión remota completa
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

  // 2. Descifrar ambas versiones en RAM
  const localItems = await decryptVault(localVault.encrypted_blob, localVault.iv, masterKey);
  const remoteItems = await decryptVault(remoteVault.encrypted_blob, remoteVault.iv, masterKey);

  // 3. Conciliar ítems según updated_at
  const mergedItems = reconcileVaultItems(localItems, remoteItems);

  // 4. Cifrar con la nueva versión consecutiva (remote.version + 1)
  const nextVersion = remoteVault.version + 1;
  const encryptedResult = await encryptVault(mergedItems, masterKey, nextVersion);

  // 5. Guardar localmente
  await saveLocalVault({
    user_id: userConfig.user_id,
    encrypted_blob: encryptedResult.encryptedBlob,
    iv: encryptedResult.iv,
    version: nextVersion,
    updated_at: encryptedResult.updatedAt,
    sync_status: 'dirty',
  });

  // 6. Reintentar push con la versión unificada
  return await pushLocalVault(baseUrl, masterKey, customFetch);
}

/**
 * Inicializa los escuchadores de conectividad del navegador.
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
