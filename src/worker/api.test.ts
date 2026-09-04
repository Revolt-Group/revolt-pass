import { describe, it, expect, beforeEach } from 'vitest';
import { handleApiRequest } from './api.ts';
import type { Env } from './types.ts';

/**
 * Mock robusto de Cloudflare D1 en memoria para pruebas de integración de la API.
 */
class MockD1Database {
  private users = new Map<string, {
    id: string;
    username: string;
    kdf_salt: string;
    passkey_credential_id: string | null;
    created_at: number;
    updated_at: number;
  }>();

  private vaults = new Map<string, {
    user_id: string;
    encrypted_blob: string;
    iv: string;
    version: number;
    updated_at: number;
  }>();

  private syncLogs: Array<{
    user_id: string;
    action: string;
    client_version: number;
    server_version: number;
    created_at: number;
  }> = [];

  public prepare(query: string) {
    const db = this;

    return {
      bind(...params: unknown[]) {
        return {
          async first<T>(): Promise<T | null> {
            const normalizedQuery = query.toLowerCase();

            // SELECT id FROM users WHERE username = ? COLLATE NOCASE
            if (normalizedQuery.includes('from users where username =')) {
              const usernameParam = String(params[0]).toLowerCase();
              for (const u of db.users.values()) {
                if (u.username.toLowerCase() === usernameParam) {
                  return {
                    id: u.id,
                    username: u.username,
                    kdf_salt: u.kdf_salt,
                    passkey_credential_id: u.passkey_credential_id,
                  } as unknown as T;
                }
              }
              return null;
            }

            // SELECT version FROM vaults WHERE user_id = ?
            if (normalizedQuery.includes('select version from vaults where user_id =')) {
              const userId = String(params[0]);
              const vault = db.vaults.get(userId);
              return (vault ? { version: vault.version } : null) as unknown as T;
            }

            // SELECT user_id, encrypted_blob, iv, version, updated_at FROM vaults WHERE user_id = ?
            if (normalizedQuery.includes('from vaults where user_id =')) {
              const userId = String(params[0]);
              const vault = db.vaults.get(userId);
              return (vault ? { ...vault } : null) as unknown as T;
            }

            return null;
          },

          async run() {
            return { success: true };
          },
        };
      },
    };
  }

  public async batch(_statements: Array<ReturnType<MockD1Database['prepare']>>) {
    return [];
  }

  // Métodos auxiliares para alimentar la simulación
  public addUser(user: {
    id: string;
    username: string;
    kdf_salt: string;
    passkey_credential_id?: string | null;
  }) {
    this.users.set(user.id, {
      ...user,
      passkey_credential_id: user.passkey_credential_id || null,
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
    });
  }

  public addVault(vault: {
    user_id: string;
    encrypted_blob: string;
    iv: string;
    version: number;
  }) {
    this.vaults.set(vault.user_id, {
      ...vault,
      updated_at: Math.floor(Date.now() / 1000),
    });
  }

  public getVault(userId: string) {
    return this.vaults.get(userId);
  }

  public createD1Wrapper(): D1Database {
    const db = this;

    return {
      prepare(query: string) {
        return {
          bind(...params: unknown[]) {
            return {
              async first<T>(): Promise<T | null> {
                return db.prepare(query).bind(...params).first<T>();
              },
              async all<T>(): Promise<D1Result<T>> {
                return { results: [], success: true, meta: {} as unknown as D1Meta };
              },
              async run(): Promise<D1Response> {
                return { success: true, meta: {} as unknown as D1Meta };
              },
              // Metadata
              query,
              params,
            };
          },
        } as unknown as D1PreparedStatement;
      },

      async batch(statements: D1PreparedStatement[]): Promise<D1Response[]> {
        for (const st of statements) {
          const s = st as unknown as { query: string; params: unknown[] };
          const q = s.query.toLowerCase();

          if (q.includes('insert into users')) {
            const [id, username, kdf_salt, passkey_id] = s.params as [string, string, string, string | null];
            db.addUser({ id, username, kdf_salt, passkey_credential_id: passkey_id });
          } else if (q.includes('insert into vaults')) {
            const [user_id, encrypted_blob, iv] = s.params as [string, string, string];
            db.addVault({ user_id, encrypted_blob, iv, version: 1 });
          } else if (q.includes('update vaults')) {
            const [encrypted_blob, iv, version, user_id] = s.params as [string, string, number, string];
            db.addVault({ user_id, encrypted_blob, iv, version });
          } else if (q.includes('insert into sync_logs')) {
            const [user_id, action, client_v, server_v] = s.params as [string, string, number, number];
            db.syncLogs.push({
              user_id,
              action: action || 'LOG',
              client_version: client_v || 1,
              server_version: server_v || 1,
              created_at: Date.now(),
            });
          }
        }
        return [];
      },

      async exec(): Promise<D1ExecResult> {
        return { count: 0, duration: 0 };
      },
      async dump(): Promise<ArrayBuffer> {
        return new ArrayBuffer(0);
      },
    } as unknown as D1Database;
  }
}

describe('API REST Cloudflare Workers & D1 Integration Tests', () => {
  let mockDb: MockD1Database;
  let env: Env;

  beforeEach(() => {
    mockDb = new MockD1Database();
    env = {
      DB: mockDb.createD1Wrapper(),
    };
  });

  it('GET /api/time debe devolver el timestamp del servidor con Cache-Control no-store', async () => {
    const req = new Request('https://pass.revoltgroup.com.ar/api/time', { method: 'GET' });
    const res = await handleApiRequest(req, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');

    const body = (await res.json()) as ApiResponse<{ server_time_utc: number }>;
    expect(body.success).toBe(true);
    expect(typeof body.data?.server_time_utc).toBe('number');
    expect(Math.abs(Date.now() - (body.data?.server_time_utc ?? 0))).toBeLessThan(1000);
  });

  it('POST /api/auth/register debe registrar un usuario y crear su bóveda inicial atómicamente', async () => {
    const payload = {
      username: 'revolt_admin',
      kdf_salt: '4a7b3c2d1e0f9a8b7c6d5e4f3a2b1c0d',
      encrypted_blob: 'VGhpcyBpcyBhbiBlbmNyeXB0ZWQgdmF1bHQ...',
      iv: 'MDEyMzQ1Njc4OTAx',
    };

    const req = new Request('https://pass.revoltgroup.com.ar/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(201);

    const json = (await res.json()) as ApiResponse<{ user_id: string; version: number }>;
    expect(json.success).toBe(true);
    expect(json.data?.user_id).toMatch(/^usr_/);
    expect(json.data?.version).toBe(1);

    // Verificar que la bóveda existe en la base de datos
    const savedVault = mockDb.getVault(json.data!.user_id);
    expect(savedVault).toBeDefined();
    expect(savedVault?.version).toBe(1);
    expect(savedVault?.encrypted_blob).toBe(payload.encrypted_blob);
  });

  it('POST /api/auth/register debe rechazar usuarios duplicados con HTTP 409 Conflict', async () => {
    // Registrar usuario previamente
    mockDb.addUser({
      id: 'usr_existente',
      username: 'revolt_admin',
      kdf_salt: 'salt123',
    });

    const payload = {
      username: 'REVOLT_ADMIN', // Case-insensitive test
      kdf_salt: 'saltNuevo',
      encrypted_blob: 'blob...',
      iv: 'iv...',
    };

    const req = new Request('https://pass.revoltgroup.com.ar/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(409);

    const json = (await res.json()) as ApiResponse;
    expect(json.success).toBe(false);
    expect(json.error?.code).toBe('USERNAME_ALREADY_EXISTS');
  });

  it('GET /api/auth/salt debe devolver el salt del usuario solicitado', async () => {
    mockDb.addUser({
      id: 'usr_test_1',
      username: 'operador',
      kdf_salt: 'salt_super_secreto_16_bytes',
      passkey_credential_id: 'cred_abc_123',
    });

    const req = new Request('https://pass.revoltgroup.com.ar/api/auth/salt?username=operador', {
      method: 'GET',
    });

    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(200);

    const json = (await res.json()) as ApiResponse<{ kdf_salt: string; has_passkey: boolean }>;
    expect(json.success).toBe(true);
    expect(json.data?.kdf_salt).toBe('salt_super_secreto_16_bytes');
    expect(json.data?.has_passkey).toBe(true);
  });

  it('GET /api/auth/salt debe devolver 404 si el usuario no existe', async () => {
    const req = new Request('https://pass.revoltgroup.com.ar/api/auth/salt?username=no_existe', {
      method: 'GET',
    });

    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(404);
  });

  it('GET /api/vault debe requerir X-User-Id y soportar ETag (HTTP 304 Not Modified)', async () => {
    // 1. Sin cabecera de autenticación -> 401
    const reqUnauthorized = new Request('https://pass.revoltgroup.com.ar/api/vault', {
      method: 'GET',
    });
    const resUnauthorized = await handleApiRequest(reqUnauthorized, env);
    expect(resUnauthorized.status).toBe(401);

    // 2. Con usuario registrado y bóveda
    const userId = 'usr_valido_99';
    mockDb.addUser({ id: userId, username: 'user99', kdf_salt: 'salt' });
    mockDb.addVault({
      user_id: userId,
      encrypted_blob: 'blob_v1',
      iv: 'iv_v1',
      version: 1,
    });

    const reqOk = new Request('https://pass.revoltgroup.com.ar/api/vault', {
      method: 'GET',
      headers: { 'X-User-Id': userId },
    });
    const resOk = await handleApiRequest(reqOk, env);
    expect(resOk.status).toBe(200);
    expect(resOk.headers.get('ETag')).toBe('"v1"');

    const json = (await resOk.json()) as ApiResponse<{ version: number; encrypted_blob: string }>;
    expect(json.data?.version).toBe(1);
    expect(json.data?.encrypted_blob).toBe('blob_v1');

    // 3. Petición condicional con If-None-Match idéntico -> 304 Not Modified
    const reqNotModified = new Request('https://pass.revoltgroup.com.ar/api/vault', {
      method: 'GET',
      headers: {
        'X-User-Id': userId,
        'If-None-Match': '"v1"',
      },
    });
    const resNotModified = await handleApiRequest(reqNotModified, env);
    expect(resNotModified.status).toBe(304);
  });

  it('PUT /api/vault debe aplicar control de concurrencia optimista y devolver 409 si la versión no es consecutiva', async () => {
    const userId = 'usr_sync_test';
    mockDb.addUser({ id: userId, username: 'syncer', kdf_salt: 'salt' });
    mockDb.addVault({
      user_id: userId,
      encrypted_blob: 'blob_inicial',
      iv: 'iv_inicial',
      version: 2, // Versión actual en servidor = 2
    });

    // Intento 1: Enviar versión 4 (salteando la 3) -> Conflicto 409
    const reqConflict = new Request('https://pass.revoltgroup.com.ar/api/vault', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      },
      body: JSON.stringify({
        encrypted_blob: 'blob_v4',
        iv: 'iv_v4',
        version: 4,
      }),
    });

    const resConflict = await handleApiRequest(reqConflict, env);
    expect(resConflict.status).toBe(409);

    const jsonConflict = (await resConflict.json()) as ApiResponse;
    expect(jsonConflict.error?.code).toBe('VAULT_VERSION_CONFLICT');
    expect((jsonConflict.error?.details as any)?.server_version).toBe(2);
    expect((jsonConflict.error?.details as any)?.client_version).toBe(4);

    // Intento 2: Enviar versión 3 (exactamente servidor.version + 1) -> Exitoso 200
    const reqValid = new Request('https://pass.revoltgroup.com.ar/api/vault', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      },
      body: JSON.stringify({
        encrypted_blob: 'blob_v3_valido',
        iv: 'iv_v3',
        version: 3,
      }),
    });

    const resValid = await handleApiRequest(reqValid, env);
    expect(resValid.status).toBe(200);

    const jsonValid = (await resValid.json()) as ApiResponse<{ version: number }>;
    expect(jsonValid.success).toBe(true);
    expect(jsonValid.data?.version).toBe(3);

    // Verificar actualización en la base de datos
    const updatedVault = mockDb.getVault(userId);
    expect(updatedVault?.version).toBe(3);
    expect(updatedVault?.encrypted_blob).toBe('blob_v3_valido');

    // Intento 3: Reintentar enviar versión 3 -> Conflicto 409 porque ahora el servidor está en 3
    const reqRetry = new Request('https://pass.revoltgroup.com.ar/api/vault', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      },
      body: JSON.stringify({
        encrypted_blob: 'blob_v3_valido',
        iv: 'iv_v3',
        version: 3,
      }),
    });
    const resRetry = await handleApiRequest(reqRetry, env);
    expect(resRetry.status).toBe(409);
    const jsonRetry = (await resRetry.json()) as ApiResponse;
    expect(jsonRetry.error?.code).toBe('VAULT_VERSION_CONFLICT');
    expect((jsonRetry.error?.details as any)?.server_version).toBe(3);
    expect((jsonRetry.error?.details as any)?.client_version).toBe(3);
  });

  it('OPTIONS debe responder con 204 y cabeceras CORS en preflight', async () => {
    const req = new Request('https://pass.revoltgroup.com.ar/api/vault', {
      method: 'OPTIONS',
    });

    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
  });
});
