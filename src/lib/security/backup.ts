/**
 * Módulo de Respaldo y Migración Criptográfica (Backup & Restore)
 *
 * Provee exportación de bóveda en dos variantes:
 * 1. Respaldo Cifrado (Recomendado): Cifrado simétrico AES-256-GCM con la Master Key actual.
 *    Totalmente seguro para almacenar en la nube, USB o disco local.
 * 2. Respaldo en Texto Plano: Exportación JSON legible con confirmación de riesgo para migración
 *    a otros gestores o copias de seguridad en frío en entornos aislados (air-gapped).
 *
 * Provee importación con validación exhaustiva de esquemas y reconciliación (merge o replace).
 */

import type { VaultItem } from '../../types/vault';
import { encryptVault, decryptVault } from '../crypto/vault';

export interface EncryptedBackupPayload {
  format: 'revolt-pass-backup-encrypted';
  version: number;
  salt: string;
  iv: string;
  encryptedBlob: string;
  exported_at: string;
  item_count: number;
}

export interface PlaintextBackupPayload {
  format: 'revolt-pass-backup-plaintext';
  version: number;
  exported_at: string;
  items: VaultItem[];
}

/**
 * Exporta la bóveda en un paquete cifrado con AES-GCM-256.
 */
export async function exportEncryptedBackup(
  items: VaultItem[],
  masterKey: CryptoKey,
  salt: string,
  version = 1
): Promise<string> {
  const encResult = await encryptVault(items, masterKey, version);

  const payload: EncryptedBackupPayload = {
    format: 'revolt-pass-backup-encrypted',
    version,
    salt,
    iv: encResult.iv,
    encryptedBlob: encResult.encryptedBlob,
    exported_at: new Date().toISOString(),
    item_count: items.length,
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Exporta la bóveda en formato JSON en texto plano.
 */
export function exportPlaintextBackup(items: VaultItem[], version = 1): string {
  const payload: PlaintextBackupPayload = {
    format: 'revolt-pass-backup-plaintext',
    version,
    exported_at: new Date().toISOString(),
    items,
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Detecta el formato de un archivo de respaldo.
 */
export function detectBackupFormat(jsonString: string): 'encrypted' | 'plaintext' | 'invalid' {
  try {
    const parsed = JSON.parse(jsonString);
    if (parsed && typeof parsed === 'object') {
      if (
        parsed.format === 'revolt-pass-backup-encrypted' &&
        parsed.encryptedBlob &&
        parsed.iv
      ) {
        return 'encrypted';
      }
      if (
        (parsed.format === 'revolt-pass-backup-plaintext' && Array.isArray(parsed.items)) ||
        Array.isArray(parsed.items) ||
        Array.isArray(parsed)
      ) {
        return 'plaintext';
      }
    }
  } catch {
    return 'invalid';
  }
  return 'invalid';
}

/**
 * Descifra e importa un archivo de respaldo cifrado.
 */
export async function importEncryptedBackup(
  jsonString: string,
  masterKey: CryptoKey
): Promise<VaultItem[]> {
  const parsed = JSON.parse(jsonString) as EncryptedBackupPayload;
  if (!parsed.encryptedBlob || !parsed.iv) {
    throw new Error('Formato de respaldo cifrado inválido: faltan campos iv o encryptedBlob');
  }

  const decryptedItems = await decryptVault(parsed.encryptedBlob, parsed.iv, masterKey);
  validateItemsSchema(decryptedItems);
  return decryptedItems;
}

/**
 * Importa y valida un archivo de respaldo en texto plano.
 */
export function importPlaintextBackup(jsonString: string): VaultItem[] {
  const parsed = JSON.parse(jsonString);
  let itemsToValidate: VaultItem[];

  if (parsed.format === 'revolt-pass-backup-plaintext' && Array.isArray(parsed.items)) {
    itemsToValidate = parsed.items;
  } else if (Array.isArray(parsed.items)) {
    itemsToValidate = parsed.items;
  } else if (Array.isArray(parsed)) {
    itemsToValidate = parsed;
  } else {
    throw new Error('Formato de respaldo en texto plano irreconocible');
  }

  validateItemsSchema(itemsToValidate);
  return itemsToValidate;
}

/**
 * Valida que la estructura contenga campos requeridos de VaultItem.
 */
export function validateItemsSchema(items: unknown): asserts items is VaultItem[] {
  if (!Array.isArray(items)) {
    throw new Error('Estructura de bóveda inválida: los ítems deben ser un array');
  }

  for (let i = 0; i < items.length; i++) {
    const acc = items[i];
    if (!acc || typeof acc !== 'object') {
      throw new Error(`Cuenta #${i + 1} inválida`);
    }
    if (!acc.id || !acc.issuer || !acc.secret) {
      throw new Error(`Cuenta #${i + 1} incompleta (requiere id, issuer, secret)`);
    }
  }
}

/**
 * Fusiona las cuentas importadas con las existentes, actualizando duplicados si la fecha de modificación es posterior.
 */
export function mergeVaultItems(
  existingItems: VaultItem[],
  importedItems: VaultItem[]
): VaultItem[] {
  const itemMap = new Map<string, VaultItem>();

  // Cargar existentes
  for (const item of existingItems) {
    itemMap.set(item.id, item);
  }

  // Fusionar o agregar importadas
  for (const item of importedItems) {
    if (itemMap.has(item.id)) {
      const existing = itemMap.get(item.id)!;
      const existingTime = existing.updated_at || 0;
      const importedTime = item.updated_at || 0;
      if (importedTime >= existingTime) {
        itemMap.set(item.id, item);
      }
    } else {
      itemMap.set(item.id, item);
    }
  }

  return Array.from(itemMap.values());
}

/**
 * Helper para descargar un archivo generado en el navegador.
 */
export function triggerFileDownload(content: string, filename: string, mimeType: string): void {
  if (typeof document === 'undefined') return;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
