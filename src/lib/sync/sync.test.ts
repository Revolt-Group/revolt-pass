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

describe('Sincronización y Reconciliación de Bóveda', () => {
  beforeEach(async () => {
    await clearLocalData();
    setTimeDriftOffsetMs(0);
  });

  afterEach(() => {
    closeDb();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Pruebas de Time Drift Compensation
  // =========================================================================
  describe('Time Drift Compensation (timeSync)', () => {
    it('debe devolver y ajustar manualmente el offset de deriva temporal', () => {
      expect(getTimeDriftOffsetMs()).toBe(0);
      setTimeDriftOffsetMs(5000); // 5 segundos de adelanto respecto al servidor
      expect(getTimeDriftOffsetMs()).toBe(5000);

      const before = Date.now();
      const calibrated = getCalibratedNow();
      expect(calibrated).toBeGreaterThanOrEqual(before + 5000);
    });

    it('debe calcular el offset exacto contra /api/time descontando el RTT', async () => {
      const simulatedServerTime = Date.now() + 15000; // El servidor está 15s adelantado

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
        // El offset debe rondar los ~15,000 ms
        expect(Math.abs(calculatedOffset - 15000)).toBeLessThan(500);
        expect(getTimeDriftOffsetMs()).toBe(calculatedOffset);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('debe aplicar banda muerta (offset 0) si la diferencia es menor a 1 segundo para evitar jitter', async () => {
      const simulatedServerTime = Date.now() + 400; // Solo 400ms de diferencia (ruido de red habitual)

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

    it('debe descartar timestamps con anomalías (> 24h) y no corromper el reloj', async () => {
      const simulatedServerTime = Date.now() + 48 * 60 * 60 * 1000; // 48 horas en el futuro (anomalía extrema)
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

    it('debe manejar caídas de red o HTTP 500 sin romper la aplicación', async () => {
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
  // 2. Pruebas de Reconciliación de Ítems (3-Way Merge / Last-Write-Wins)
  // =========================================================================
  describe('Algoritmo de Reconciliación (reconcileVaultItems)', () => {
    it('debe combinar ítems únicos de ambas fuentes sin pérdidas', () => {
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

    it('debe prevalecer la versión con updated_at más reciente ante colisión en el mismo ítem', () => {
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
        updated_at: 2000, // Versión local antigua
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
        updated_at: 3000, // Versión remota más reciente
      };

      const reconciled = reconcileVaultItems([localItemOld], [remoteItemNew]);
      expect(reconciled).toHaveLength(1);
      expect(reconciled[0].account).toBe('admin_updated_in_remote');
      expect(reconciled[0].secret).toBe('NEW_SECRET_BASE32');
      expect(reconciled[0].updated_at).toBe(3000);
    });

    it('debe prevalecer la versión local si updated_at es más reciente que en el servidor', () => {
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
        updated_at: 5000, // Modificado en este dispositivo más recientemente
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
  });

  // =========================================================================
  // 3. Pruebas de Flujo de Push/Pull y Resolución Automática de Conflictos
  // =========================================================================
  describe('Pull / Push Sync Engine', () => {
    it('Pull Sync: debe respetar HTTP 304 Not Modified y no alterar la versión local', async () => {
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

    it('Push Sync con Resolución Automática de Conflicto 409', async () => {
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

      // Cifrar estado local versión 2 (desactualizado)
      const localEnc = await encryptVault([localItem], masterKey, 2);
      await saveLocalVault({
        user_id: userId,
        encrypted_blob: localEnc.encryptedBlob,
        iv: localEnc.iv,
        version: 2,
        updated_at: localEnc.updatedAt,
        sync_status: 'dirty',
      });

      // Simular que en el servidor la versión actual ya es la 3
      const remoteEnc = await encryptVault([remoteItem], masterKey, 3);

      let putAttempts = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        const method = init.method || 'GET';

        // 1. Primer PUT: El servidor rechaza con 409 (servidor está en v3, cliente envió v2)
        if (method === 'PUT' && putAttempts === 0) {
          putAttempts++;
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'VAULT_VERSION_CONFLICT',
                message: 'Conflicto de versión',
                details: { server_version: 3, client_version: 2 },
              },
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // 2. GET /api/vault: El motor descarga la versión 3 del servidor para conciliar
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

        // 3. Segundo PUT: El motor resolvió el conflicto y envía la versión 4 (3 + 1)
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

      // Ejecutar Push Sync con masterKey presente
      const success = await pushLocalVault('', masterKey, mockFetch as unknown as typeof fetch);
      expect(success).toBe(true);

      // Verificar que la bóveda local ahora está en versión 4 y en estado 'synced'
      const vaultAfter = await getLocalVault();
      expect(vaultAfter?.version).toBe(4);
      expect(vaultAfter?.sync_status).toBe('synced');
    });
  });
});
