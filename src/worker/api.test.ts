import { describe, it, expect, beforeEach } from 'vitest';
import worker from './index.ts';
import { handleApiRequest, hashToken } from './api.ts';
import type {
  Env,
  ApiResponse,
  SessionItem,
  PasskeyRecord,
  AuditLogRecord,
} from './types.ts';

/**
 * Robust in-memory Cloudflare D1 mock for API integration tests.
 */
class MockD1Database {
  public users = new Map<string, {
    id: string;
    username: string;
    kdf_salt: string;
    kdf_algorithm: string;
    passkey_credential_id: string | null;
    created_at: number;
    updated_at: number;
  }>();

  public vaults = new Map<string, {
    user_id: string;
    encrypted_blob: string;
    iv: string;
    version: number;
    updated_at: number;
  }>();

  public sessions = new Map<string, SessionItem & { token_hash: string; prev_token_hash?: string }>();
  public passkeys = new Map<string, PasskeyRecord>();
  public auditLogs: AuditLogRecord[] = [];
  public syncLogs: Array<{
    user_id: string;
    action: string;
    client_version: number;
    server_version: number;
    created_at: number;
  }> = [];
  public vaultSnapshots: Array<{
    id: number;
    user_id: string;
    encrypted_blob: string;
    iv: string;
    vault_version: number;
    created_at: number;
  }> = [];
  public snapshotSeq = 1;
  public appSettings = new Map<string, string>();
  public pushSubscriptions = new Map<string, {
    id: string;
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    user_agent?: string;
    created_at: number;
  }>();
  public notificationSettings = new Map<string, {
    user_id: string;
    email_enabled: number;
    email_provider: string;
    resend_api_key?: string | null;
    resend_from_email?: string | null;
    destination_email?: string | null;
    notify_on_new_country: number;
    notify_on_new_session: number;
    notify_on_session_revoked: number;
    notify_on_passkey_added: number;
    updated_at: number;
  }>();

  public prepare(query: string) {
    const db = this;

    return {
      bind(...params: unknown[]) {
        return {
          async first<T>(): Promise<T | null> {
            const normalizedQuery = query.toLowerCase().replace(/\s+/g, ' ');

            // SELECT id FROM users WHERE username = ? COLLATE NOCASE
            if (normalizedQuery.includes('from users where username =')) {
              const usernameParam = String(params[0]).toLowerCase();
              for (const u of db.users.values()) {
                if (u.username.toLowerCase() === usernameParam) {
                  return {
                    id: u.id,
                    username: u.username,
                    kdf_salt: u.kdf_salt,
                    kdf_algorithm: u.kdf_algorithm || 'pbkdf2',
                    passkey_credential_id: u.passkey_credential_id,
                  } as unknown as T;
                }
              }
              return null;
            }

            // SELECT id FROM users WHERE id = ? or passkey_credential_id
            if (normalizedQuery.includes('from users where id =')) {
              const userId = String(params[0]);
              const u = db.users.get(userId);
              return (u ? { id: u.id, username: u.username, passkey_credential_id: u.passkey_credential_id } : null) as unknown as T;
            }

            // SELECT id, user_id, is_revoked, expires_at FROM sessions WHERE (token_hash = ? OR prev_token_hash = ?)
            if (
              normalizedQuery.includes('from sessions where token_hash =') ||
              normalizedQuery.includes('from sessions where (token_hash = ? or prev_token_hash = ?)')
            ) {
              const hash = String(params[0]);
              const checkRevoked0 = normalizedQuery.includes('is_revoked = 0');
              for (const s of db.sessions.values()) {
                if ((s.token_hash === hash || s.prev_token_hash === hash) && (!checkRevoked0 || s.is_revoked === 0)) {
                  return {
                    id: s.id,
                    user_id: s.user_id,
                    device_name: s.device_name,
                    user_agent: s.user_agent,
                    ip_country: s.ip_country,
                    last_active_at: s.last_active_at,
                    created_at: s.created_at,
                    expires_at: s.expires_at,
                    is_revoked: s.is_revoked,
                  } as unknown as T;
                }
              }
              return null;
            }

            // SELECT ... FROM sessions WHERE user_id = ? AND user_agent = ?
            if (normalizedQuery.includes('from sessions where user_id =') && normalizedQuery.includes('user_agent =')) {
              const userId = String(params[0]);
              const uAgent = String(params[1]);
              for (const s of db.sessions.values()) {
                if (s.user_id === userId && s.user_agent === uAgent && s.is_revoked === 0) {
                  return { ...s } as unknown as T;
                }
              }
              return null;
            }

            // SELECT id, user_id, device_name FROM sessions WHERE id = ? AND user_id = ? AND is_revoked = 0
            if (normalizedQuery.includes('from sessions where id =') && normalizedQuery.includes('user_id =')) {
              const sessionId = String(params[0]);
              const userId = String(params[1]);
              const s = db.sessions.get(sessionId);
              if (s && s.user_id === userId && s.is_revoked === 0) {
                return { id: s.id, user_id: s.user_id, device_name: s.device_name } as unknown as T;
              }
              return null;
            }

            // SELECT id, user_id, name FROM passkeys WHERE id = ? AND user_id = ? AND is_revoked = 0
            if (normalizedQuery.includes('from passkeys where id =') && normalizedQuery.includes('user_id =') && normalizedQuery.includes('is_revoked = 0')) {
              const pkId = String(params[0]);
              const userId = String(params[1]);
              const p = db.passkeys.get(pkId);
              if (p && p.user_id === userId && p.is_revoked === 0) {
                return { id: p.id, user_id: p.user_id, name: p.name, device_name: p.device_name } as unknown as T;
              }
              return null;
            }

            // SELECT id FROM passkeys WHERE id = ? AND is_revoked = 1
            if (normalizedQuery.includes('from passkeys where id =') && normalizedQuery.includes('is_revoked = 1')) {
              const pkId = String(params[0]);
              const p = db.passkeys.get(pkId);
              return (p && p.is_revoked === 1 ? { id: p.id } : null) as unknown as T;
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

            // SELECT value FROM app_settings WHERE key = ?
            if (normalizedQuery.includes('from app_settings where key =')) {
              const key = String(params[0]);
              const val = db.appSettings.get(key);
              return (val !== undefined ? { value: val } : null) as unknown as T;
            }

            // SELECT ... FROM user_notification_settings WHERE user_id = ?
            if (normalizedQuery.includes('from user_notification_settings where user_id =')) {
              const userId = String(params[0]);
              const s = db.notificationSettings.get(userId);
              return (s ? { ...s } : null) as unknown as T;
            }

            // SELECT encrypted_blob, iv, vault_version FROM vault_snapshots WHERE user_id = ? AND vault_version = ?
            if (normalizedQuery.includes('from vault_snapshots where user_id =') && normalizedQuery.includes('vault_version =')) {
              const userId = String(params[0]);
              const version = Number(params[1]);
              const found = db.vaultSnapshots
                .filter((s) => s.user_id === userId && s.vault_version === version)
                .sort((a, b) => b.created_at - a.created_at || b.id - a.id)[0];
              return (found ? { ...found } : null) as unknown as T;
            }

            // SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?
            if (normalizedQuery.includes('from push_subscriptions where user_id =') && normalizedQuery.includes('endpoint =')) {
              const userId = String(params[0]);
              const endpoint = String(params[1]);
              for (const p of db.pushSubscriptions.values()) {
                if (p.user_id === userId && p.endpoint === endpoint) {
                  return { id: p.id } as unknown as T;
                }
              }
              return null;
            }

            return null;
          },

          async all<T>(): Promise<D1Result<T>> {
            const normalizedQuery = query.toLowerCase().replace(/\s+/g, ' ');

            // SELECT id, user_id, vault_version, created_at FROM vault_snapshots WHERE user_id = ?
            if (normalizedQuery.includes('from vault_snapshots where user_id =')) {
              const userId = String(params[0]);
              const results = db.vaultSnapshots
                .filter((s) => s.user_id === userId)
                .sort((a, b) => b.created_at - a.created_at || b.id - a.id);
              return {
                results: results as unknown as T[],
                success: true,
                meta: {} as unknown as D1Meta,
              };
            }

            // SELECT ... FROM sessions WHERE user_id = ? AND is_revoked = 0
            if (normalizedQuery.includes('from sessions where user_id =')) {
              const userId = String(params[0]);
              const results = Array.from(db.sessions.values())
                .filter((s) => s.user_id === userId && s.is_revoked === 0)
                .sort((a, b) => b.last_active_at - a.last_active_at);

              return {
                results: results as unknown as T[],
                success: true,
                meta: {} as unknown as D1Meta,
              };
            }

            // SELECT ... FROM passkeys WHERE user_id = ? AND is_revoked = 0
            if (normalizedQuery.includes('from passkeys where user_id =')) {
              const userId = String(params[0]);
              const results = Array.from(db.passkeys.values())
                .filter((p) => p.user_id === userId && p.is_revoked === 0)
                .sort((a, b) => b.created_at - a.created_at);

              return {
                results: results as unknown as T[],
                success: true,
                meta: {} as unknown as D1Meta,
              };
            }

            // SELECT ... FROM audit_logs WHERE user_id = ?
            if (normalizedQuery.includes('from audit_logs where user_id =')) {
              const userId = String(params[0]);
              const results = db.auditLogs
                .filter((l) => l.user_id === userId)
                .sort((a, b) => b.created_at - a.created_at);

              return {
                results: results as unknown as T[],
                success: true,
                meta: {} as unknown as D1Meta,
              };
            }

            return { results: [], success: true, meta: {} as unknown as D1Meta };
          },

          async run(): Promise<D1Response> {
            const normalizedQuery = query.toLowerCase().replace(/\s+/g, ' ');

            // UPDATE sessions SET prev_token_hash = token_hash, token_hash = ?, expires_at = ?, last_active_at = unixepoch() WHERE id = ?
            if (
              normalizedQuery.includes('update sessions set token_hash =') ||
              normalizedQuery.includes('update sessions set prev_token_hash = token_hash, token_hash =')
            ) {
              const tokenHash = String(params[0]);
              const expiresAt = Number(params[1]);
              const sessionId = String(params[2]);
              const s = db.sessions.get(sessionId);
              if (s) {
                s.prev_token_hash = s.token_hash;
                s.token_hash = tokenHash;
                s.expires_at = expiresAt;
                s.last_active_at = Math.floor(Date.now() / 1000);
              }
            }

            // UPDATE sessions SET last_active_at = unixepoch() WHERE id = ?
            if (normalizedQuery.includes('update sessions set last_active_at =') && !normalizedQuery.includes('token_hash =')) {
              const sessionId = String(params[0]);
              const s = db.sessions.get(sessionId);
              if (s) {
                s.last_active_at = Math.floor(Date.now() / 1000);
              }
            }

            // UPDATE sessions SET is_revoked = 1 WHERE id = ?
            if (normalizedQuery.includes('update sessions set is_revoked = 1 where id = ?')) {
              const sessionId = String(params[0]);
              const s = db.sessions.get(sessionId);
              if (s) s.is_revoked = 1;
            }

            // INSERT OR IGNORE INTO passkeys
            if (normalizedQuery.includes('insert or ignore into passkeys')) {
              const [id, user_id, name, device_name, created_at, last_used_at] = params as [
                string,
                string,
                string,
                string,
                number,
                number
              ];
              if (!db.passkeys.has(id)) {
                db.passkeys.set(id, {
                  id,
                  user_id,
                  name,
                  device_name,
                  created_at,
                  last_used_at,
                  is_revoked: 0,
                });
              }
            }

            // INSERT INTO app_settings
            if (normalizedQuery.includes('into app_settings')) {
              const [key, value] = params as [string, string];
              db.appSettings.set(key, value);
            }

            // INSERT INTO push_subscriptions
            if (normalizedQuery.includes('into push_subscriptions')) {
              const [id, user_id, endpoint, p256dh, auth, user_agent] = params as [
                string,
                string,
                string,
                string,
                string,
                string | undefined
              ];
              db.pushSubscriptions.set(id, {
                id,
                user_id,
                endpoint,
                p256dh,
                auth,
                user_agent,
                created_at: Math.floor(Date.now() / 1000),
              });
            }

            // DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?
            if (normalizedQuery.includes('from push_subscriptions where user_id =') && normalizedQuery.includes('endpoint =')) {
              const userId = String(params[0]);
              const endpoint = String(params[1]);
              for (const [k, p] of db.pushSubscriptions.entries()) {
                if (p.user_id === userId && p.endpoint === endpoint) {
                  db.pushSubscriptions.delete(k);
                }
              }
            }

            // INSERT INTO user_notification_settings ... ON CONFLICT
            if (normalizedQuery.includes('into user_notification_settings')) {
              const [
                user_id,
                push_enabled,
                email_enabled,
                email_provider,
                resend_api_key,
                resend_from_email,
                destination_email,
                notify_on_new_country,
                notify_on_new_session,
                notify_on_passkey_added,
                notify_on_session_revoked,
              ] = params as [
                string,
                number,
                number,
                string,
                string | null,
                string | null,
                string | null,
                number,
                number,
                number,
                number
              ];
              db.notificationSettings.set(user_id, {
                user_id,
                push_enabled,
                email_enabled,
                email_provider,
                resend_api_key: resend_api_key || null,
                resend_from_email: resend_from_email || null,
                destination_email: destination_email || null,
                notify_on_new_country,
                notify_on_new_session,
                notify_on_passkey_added,
                notify_on_session_revoked,
                updated_at: Math.floor(Date.now() / 1000),
              });
            }

            return { success: true, meta: {} as unknown as D1Meta };
          },
        };
      },
    };
  }

  // Helper methods for feeding simulation state
  public addUser(user: {
    id: string;
    username: string;
    kdf_salt: string;
    kdf_algorithm?: string;
    passkey_credential_id?: string | null;
  }) {
    this.users.set(user.id, {
      ...user,
      kdf_algorithm: user.kdf_algorithm || 'pbkdf2',
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
            const prepared = db.prepare(query).bind(...params);
            return {
              first: prepared.first,
              all: prepared.all,
              run: prepared.run,
              query,
              params,
            };
          },
        } as unknown as D1PreparedStatement;
      },

      async batch(statements: D1PreparedStatement[]): Promise<D1Response[]> {
        for (const st of statements) {
          const s = st as unknown as { query: string; params: unknown[] };
          const q = s.query.toLowerCase().replace(/\s+/g, ' ');

          if (q.includes('insert into users')) {
            const params = s.params as any[];
            const id = params[0];
            const username = params[1];
            const kdf_salt = params[2];
            let kdf_algorithm = 'pbkdf2';
            let passkey_id = null;
            if (params.length >= 5) {
              kdf_algorithm = params[3];
              passkey_id = params[4];
            } else {
              passkey_id = params[3];
            }
            db.addUser({ id, username, kdf_salt, kdf_algorithm, passkey_credential_id: passkey_id });
          } else if (q.includes('update users set kdf_salt =')) {
            const [kdf_salt, kdf_algorithm, userId] = s.params as [string, string, string];
            const u = db.users.get(userId);
            if (u) {
              u.kdf_salt = kdf_salt;
              u.kdf_algorithm = kdf_algorithm;
            }
          } else if (q.includes('insert into vaults')) {
            const [user_id, encrypted_blob, iv] = s.params as [string, string, string];
            db.addVault({ user_id, encrypted_blob, iv, version: 1 });
          } else if (q.includes('insert into vault_snapshots')) {
            const [user_id, encrypted_blob, iv, vault_version] = s.params as [string, string, string, number];
            db.vaultSnapshots.push({
              id: db.snapshotSeq++,
              user_id,
              encrypted_blob,
              iv,
              vault_version,
              created_at: Math.floor(Date.now() / 1000),
            });
          } else if (q.includes('delete from vault_snapshots')) {
            const userId = String(s.params[0]);
            const userSnaps = db.vaultSnapshots
              .filter((snap) => snap.user_id === userId)
              .sort((a, b) => b.created_at - a.created_at || b.id - a.id);
            const keepIds = new Set(userSnaps.slice(0, 5).map((snap) => snap.id));
            db.vaultSnapshots = db.vaultSnapshots.filter(
              (snap) => snap.user_id !== userId || keepIds.has(snap.id)
            );
          } else if (q.includes('update vaults')) {
            const [encrypted_blob, iv, version, user_id] = s.params as [string, string, number, string];
            db.addVault({ user_id, encrypted_blob, iv, version });
          } else if (q.includes('insert into sessions')) {
            const [id, user_id, token_hash, device_name, user_agent, ip_country, expires_at] = s.params as [
              string,
              string,
              string,
              string,
              string | undefined,
              string | undefined,
              number
            ];
            db.sessions.set(id, {
              id,
              user_id,
              token_hash,
              device_name,
              user_agent,
              ip_country,
              last_active_at: Math.floor(Date.now() / 1000),
              created_at: Math.floor(Date.now() / 1000),
              expires_at: expires_at || Math.floor(Date.now() / 1000) + 86400,
              is_revoked: 0,
            });
          } else if (q.includes('update sessions set last_active_at =')) {
            const [devName, uAgent, country, id] = s.params as [string, string, string, string];
            const session = db.sessions.get(id);
            if (session) {
              session.device_name = devName;
              session.user_agent = uAgent;
              session.ip_country = country;
              session.last_active_at = Math.floor(Date.now() / 1000);
            }
          } else if (q.includes('update sessions set token_hash =') || q.includes('update sessions set prev_token_hash = token_hash, token_hash =')) {
            const [tokenHash, expAt, devName, country, id] = s.params as [string, number, string, string, string];
            const session = db.sessions.get(id);
            if (session) {
              session.prev_token_hash = session.token_hash;
              session.token_hash = tokenHash;
              session.expires_at = expAt;
              session.device_name = devName;
              session.ip_country = country;
              session.last_active_at = Math.floor(Date.now() / 1000);
            }
          } else if (q.includes('update sessions set is_revoked = 1 where user_id = ? and user_agent = ? and id != ?')) {
            const [userId, uAgent, keepId] = s.params as [string, string, string];
            for (const session of db.sessions.values()) {
              if (session.user_id === userId && session.user_agent === uAgent && session.id !== keepId) {
                session.is_revoked = 1;
              }
            }
          } else if (q.includes('update sessions set is_revoked = 1 where id = ? and user_id = ?')) {
            const [id, user_id] = s.params as [string, string];
            const session = db.sessions.get(id);
            if (session && session.user_id === user_id) {
              session.is_revoked = 1;
            }
          } else if (q.includes('update sessions set is_revoked = 1 where user_id = ? and token_hash != ?')) {
            const [user_id, currentHash] = s.params as [string, string];
            for (const session of db.sessions.values()) {
              if (session.user_id === user_id && session.token_hash !== currentHash) {
                session.is_revoked = 1;
              }
            }
          } else if (q.includes('update sessions set is_revoked = 1 where user_id = ? and id != ?')) {
            const [user_id, keepId] = s.params as [string, string];
            for (const session of db.sessions.values()) {
              if (session.user_id === user_id && session.id !== keepId) {
                session.is_revoked = 1;
              }
            }
          } else if (q.includes('update sessions set device_name =')) {
            const [devName, id, user_id] = s.params as [string, string, string];
            const session = db.sessions.get(id);
            if (session && session.user_id === user_id) {
              session.device_name = devName;
            }
          } else if (q.includes('update passkeys set name =')) {
            const [pkName, id, user_id] = s.params as [string, string, string];
            const passkey = db.passkeys.get(id);
            if (passkey && passkey.user_id === user_id) {
              passkey.name = pkName;
            }
          } else if (q.includes('insert into passkeys')) {
            const [id, user_id, name, device_name] = s.params as [string, string, string, string];
            const existing = db.passkeys.get(id);
            if (existing) {
              existing.is_revoked = 0;
              existing.last_used_at = Math.floor(Date.now() / 1000);
              if (!existing.name) existing.name = name;
            } else {
              db.passkeys.set(id, {
                id,
                user_id,
                name,
                device_name,
                created_at: Math.floor(Date.now() / 1000),
                is_revoked: 0,
              });
            }
          } else if (q.includes('update passkeys set last_used_at =')) {
            const [pkId, uId] = s.params as [string, string];
            const passkey = db.passkeys.get(pkId);
            if (passkey && passkey.user_id === uId) {
              passkey.last_used_at = Math.floor(Date.now() / 1000);
            }
          } else if (q.includes('update passkeys set is_revoked = 1 where id = ? and user_id = ?')) {
            const [id, user_id] = s.params as [string, string];
            const passkey = db.passkeys.get(id);
            if (passkey && passkey.user_id === user_id) {
              passkey.is_revoked = 1;
            }
          } else if (q.includes('update users set passkey_credential_id =')) {
            const [pkId, uId] = s.params as [string, string];
            const u = db.users.get(uId);
            if (u) u.passkey_credential_id = pkId;
          } else if (q.includes('insert into audit_logs')) {
            const eventMatch = s.query.match(/values\s*\(\s*\?,\s*'([^']+)'/i);
            const event_type = (eventMatch ? eventMatch[1] : (s.params[1] as string)).toUpperCase();
            const user_id = String(s.params[0]);
            let device_name: string | undefined;
            let ip_country: string | undefined;
            let metadata: string | undefined;

            if (eventMatch) {
              if (s.params.length === 4) {
                device_name = s.params[1] as string;
                ip_country = s.params[2] as string;
                metadata = s.params[3] as string;
              } else if (s.params.length === 3) {
                device_name = s.params[1] as string;
                metadata = s.params[2] as string;
              } else if (s.params.length === 2) {
                metadata = s.params[1] as string;
              }
            } else {
              device_name = s.params[2] as string;
              ip_country = s.params[3] as string;
              metadata = s.params[4] as string;
            }

            db.auditLogs.push({
              id: db.auditLogs.length + 1,
              user_id,
              event_type,
              device_name,
              ip_country,
              metadata,
              created_at: Math.floor(Date.now() / 1000),
            });
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

  it('GET /api/time returns server timestamp with Cache-Control no-store', async () => {
    const req = new Request('https://pass.example.com/api/time', { method: 'GET' });
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

  it('POST /api/auth/register atomically registers user, creates initial vault, and issues session token', async () => {
    const payload = {
      username: 'revolt_admin',
      kdf_salt: '4a7b3c2d1e0f9a8b7c6d5e4f3a2b1c0d',
      encrypted_blob: 'VGhpcyBpcyBhbiBlbmNyeXB0ZWQgdmF1bHQ...',
      iv: 'MDEyMzQ1Njc4OTAx',
      passkey_credential_id: 'passkey_cred_1',
    };

    const req = new Request('https://pass.example.com/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      },
      body: JSON.stringify(payload),
    });

    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(201);

    const json = (await res.json()) as ApiResponse<{ user_id: string; version: number; session_token: string }>;
    expect(json.success).toBe(true);
    expect(json.data?.user_id).toMatch(/^usr_/);
    expect(json.data?.version).toBe(1);
    expect(typeof json.data?.session_token).toBe('string');
    expect(json.data?.session_token.length).toBe(64);

    // Verify vault exists in simulated database
    const savedVault = mockDb.getVault(json.data!.user_id);
    expect(savedVault).toBeDefined();
    expect(savedVault?.version).toBe(1);
    expect(savedVault?.encrypted_blob).toBe(payload.encrypted_blob);

    // Verify session and passkey records
    expect(mockDb.sessions.size).toBe(1);
    expect(mockDb.passkeys.size).toBe(1);
    expect(mockDb.auditLogs.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/auth/register rejects duplicate username with HTTP 409 Conflict', async () => {
    mockDb.addUser({
      id: 'usr_existente',
      username: 'revolt_admin',
      kdf_salt: 'salt123',
    });

    const payload = {
      username: 'REVOLT_ADMIN',
      kdf_salt: 'saltNuevo',
      encrypted_blob: 'blob...',
      iv: 'iv...',
    };

    const req = new Request('https://pass.example.com/api/auth/register', {
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

  it('GET /api/auth/salt returns salt for requested user', async () => {
    mockDb.addUser({
      id: 'usr_test_1',
      username: 'operador',
      kdf_salt: 'salt_super_secreto_16_bytes',
      passkey_credential_id: 'cred_abc_123',
    });

    const req = new Request('https://pass.example.com/api/auth/salt?username=operador', {
      method: 'GET',
    });

    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(200);

    const json = (await res.json()) as ApiResponse<{ kdf_salt: string; has_passkey: boolean }>;
    expect(json.success).toBe(true);
    expect(json.data?.kdf_salt).toBe('salt_super_secreto_16_bytes');
    expect(json.data?.has_passkey).toBe(true);
  });

  it('GET /api/auth/salt returns 404 if user does not exist', async () => {
    const req = new Request('https://pass.example.com/api/auth/salt?username=no_existe', {
      method: 'GET',
    });

    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(404);
  });

  it('GET /api/vault requires X-User-Id and supports ETag (HTTP 304 Not Modified)', async () => {
    const reqUnauthorized = new Request('https://pass.example.com/api/vault', {
      method: 'GET',
    });
    const resUnauthorized = await handleApiRequest(reqUnauthorized, env);
    expect(resUnauthorized.status).toBe(401);

    const userId = 'usr_valido_99';
    mockDb.addUser({ id: userId, username: 'user99', kdf_salt: 'salt' });
    mockDb.addVault({
      user_id: userId,
      encrypted_blob: 'blob_v1',
      iv: 'iv_v1',
      version: 1,
    });

    const reqOk = new Request('https://pass.example.com/api/vault', {
      method: 'GET',
      headers: { 'X-User-Id': userId },
    });
    const resOk = await handleApiRequest(reqOk, env);
    expect(resOk.status).toBe(200);
    expect(resOk.headers.get('ETag')).toBe('"v1"');

    const json = (await resOk.json()) as ApiResponse<{ version: number; encrypted_blob: string }>;
    expect(json.data?.version).toBe(1);
    expect(json.data?.encrypted_blob).toBe('blob_v1');

    const reqNotModified = new Request('https://pass.example.com/api/vault', {
      method: 'GET',
      headers: {
        'X-User-Id': userId,
        'If-None-Match': '"v1"',
      },
    });
    const resNotModified = await handleApiRequest(reqNotModified, env);
    expect(resNotModified.status).toBe(304);
  });

  it('PUT /api/vault enforces optimistic concurrency control and returns 409 if version is not consecutive', async () => {
    const userId = 'usr_sync_test';
    mockDb.addUser({ id: userId, username: 'syncer', kdf_salt: 'salt' });
    mockDb.addVault({
      user_id: userId,
      encrypted_blob: 'blob_inicial',
      iv: 'iv_inicial',
      version: 2,
    });

    // Attempt 1: Send version 4 (skipping 3) -> 409 Conflict
    const reqConflict = new Request('https://pass.example.com/api/vault', {
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

    // Attempt 2: Send version 3 (exactly server.version + 1) -> 200 OK
    const reqValid = new Request('https://pass.example.com/api/vault', {
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

    // Verify database update
    const updatedVault = mockDb.getVault(userId);
    expect(updatedVault?.version).toBe(3);
    expect(updatedVault?.encrypted_blob).toBe('blob_v3_valido');
  });

  // -------------------------------------------------------------------------
  // Milestone v2.0 Vault Snapshots & Historical Rollback Tests
  // -------------------------------------------------------------------------
  it('archives snapshots automatically on PUT /api/vault, prunes to max 5, lists snapshots, and performs rollback', async () => {
    const userId = 'usr_snapshot_tester';
    mockDb.addUser({ id: userId, username: 'snapuser', kdf_salt: 'salt_snap' });
    mockDb.addVault({
      user_id: userId,
      encrypted_blob: 'blob_v1',
      iv: 'iv_v1',
      version: 1,
    });

    // 1. Update from v1 to v2 -> v1 should be archived into vault_snapshots
    const putV2 = new Request('https://pass.example.com/api/vault', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      },
      body: JSON.stringify({
        encrypted_blob: 'blob_v2',
        iv: 'iv_v2',
        version: 2,
      }),
    });
    const resV2 = await handleApiRequest(putV2, env);
    expect(resV2.status).toBe(200);

    // Verify snapshot v1 is present
    expect(mockDb.vaultSnapshots).toHaveLength(1);
    expect(mockDb.vaultSnapshots[0].vault_version).toBe(1);
    expect(mockDb.vaultSnapshots[0].encrypted_blob).toBe('blob_v1');

    // 2. Perform updates to v3, v4, v5, v6, v7 (total 6 updates -> snapshots should prune to top 5)
    for (let ver = 3; ver <= 7; ver++) {
      const putRes = await handleApiRequest(
        new Request('https://pass.example.com/api/vault', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
          body: JSON.stringify({
            encrypted_blob: `blob_v${ver}`,
            iv: `iv_v${ver}`,
            version: ver,
          }),
        }),
        env
      );
      expect(putRes.status).toBe(200);
    }

    // Strictly capped at 5 snapshots maximum
    const userSnaps = mockDb.vaultSnapshots.filter((s) => s.user_id === userId);
    expect(userSnaps).toHaveLength(5);
    // The oldest snapshot (v1) should have been pruned; remaining versions should be v2, v3, v4, v5, v6
    const versions = userSnaps.map((s) => s.vault_version).sort((a, b) => a - b);
    expect(versions).toEqual([2, 3, 4, 5, 6]);

    // 3. GET /api/vault/snapshots -> returns list of snapshots
    const getSnapsReq = new Request('https://pass.example.com/api/vault/snapshots', {
      method: 'GET',
      headers: { 'X-User-Id': userId },
    });
    const getSnapsRes = await handleApiRequest(getSnapsReq, env);
    expect(getSnapsRes.status).toBe(200);
    const snapsJson = (await getSnapsRes.json()) as ApiResponse<Array<{ vault_version: number }>>;
    expect(snapsJson.success).toBe(true);
    expect(snapsJson.data).toHaveLength(5);

    // 4. POST /api/vault/restore/4 -> Rollback to version 4
    const restoreReq = new Request('https://pass.example.com/api/vault/restore/4', {
      method: 'POST',
      headers: { 'X-User-Id': userId },
    });
    const restoreRes = await handleApiRequest(restoreReq, env);
    expect(restoreRes.status).toBe(200);
    const restoreJson = (await restoreRes.json()) as ApiResponse<{
      version: number;
      encrypted_blob: string;
      restored_from_version: number;
    }>;
    expect(restoreJson.success).toBe(true);
    // Restoring increments version from current (7) to 8 for OCC consistency
    expect(restoreJson.data?.version).toBe(8);
    expect(restoreJson.data?.encrypted_blob).toBe('blob_v4');
    expect(restoreJson.data?.restored_from_version).toBe(4);

    // Verify current vault in database
    const restoredVault = mockDb.getVault(userId);
    expect(restoredVault?.version).toBe(8);
    expect(restoredVault?.encrypted_blob).toBe('blob_v4');

    // Verify audit log recorded VAULT_RESTORE_SNAPSHOT
    const restoreAudit = mockDb.auditLogs.find((l) => l.event_type === 'VAULT_RESTORE_SNAPSHOT');
    expect(restoreAudit).toBeDefined();
    expect(JSON.parse(restoreAudit?.metadata || '{}').restored_from_version).toBe(4);

    // 5. Attempt to restore nonexistent version (e.g. 99) -> 404
    const badRestoreReq = new Request('https://pass.example.com/api/vault/restore/99', {
      method: 'POST',
      headers: { 'X-User-Id': userId },
    });
    const badRestoreRes = await handleApiRequest(badRestoreReq, env);
    expect(badRestoreRes.status).toBe(404);
    const badJson = (await badRestoreRes.json()) as ApiResponse;
    expect(badJson.error?.code).toBe('SNAPSHOT_NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // v1.1 Active Session Control & Remote Revocation Tests
  // -------------------------------------------------------------------------
  it('manages active sessions, detects current session, and revokes individual sessions', async () => {
    const userId = 'usr_session_user';
    mockDb.addUser({ id: userId, username: 'sessionuser', kdf_salt: 'salt1' });
    mockDb.addVault({ user_id: userId, encrypted_blob: 'blob', iv: 'iv', version: 1 });

    // 1. Create Device 1 Session (e.g. Windows PC)
    const reqSession1 = new Request('https://pass.example.com/api/auth/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      },
      body: JSON.stringify({ device_name: 'Windows 11 · PC Principal' }),
    });
    const resSession1 = await handleApiRequest(reqSession1, env);
    expect(resSession1.status).toBe(200);
    const jsonS1 = (await resSession1.json()) as ApiResponse<{ session_token: string; session: SessionItem }>;
    const token1 = jsonS1.data!.session_token;
    const sessionId1 = jsonS1.data!.session.id;

    // 2. Create Device 2 Session (e.g. Alien PC / Remote)
    const reqSession2 = new Request('https://pass.example.com/api/auth/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
      },
      body: JSON.stringify({ device_name: 'macOS · Oficina' }),
    });
    const resSession2 = await handleApiRequest(reqSession2, env);
    expect(resSession2.status).toBe(200);
    const jsonS2 = (await resSession2.json()) as ApiResponse<{ session_token: string; session: SessionItem }>;
    const token2 = jsonS2.data!.session_token;
    const sessionId2 = jsonS2.data!.session.id;

    // 3. List sessions from Device 1
    const reqList = new Request('https://pass.example.com/api/sessions', {
      method: 'GET',
      headers: {
        'X-User-Id': userId,
        'X-Session-Token': token1,
      },
    });
    const resList = await handleApiRequest(reqList, env);
    expect(resList.status).toBe(200);
    const jsonList = (await resList.json()) as ApiResponse<{ sessions: SessionItem[] }>;
    expect(jsonList.data?.sessions.length).toBe(2);

    const currentSession = jsonList.data?.sessions.find((s) => s.id === sessionId1);
    const remoteSession = jsonList.data?.sessions.find((s) => s.id === sessionId2);
    expect(currentSession?.is_current).toBe(true);
    expect(remoteSession?.is_current).toBe(false);

    // 4. Device 1 revokes Device 2 remotely
    const reqRevoke = new Request(`https://pass.example.com/api/sessions/${sessionId2}`, {
      method: 'DELETE',
      headers: {
        'X-User-Id': userId,
        'X-Session-Token': token1,
      },
    });
    const resRevoke = await handleApiRequest(reqRevoke, env);
    expect(resRevoke.status).toBe(200);

    // 5. Verify Device 2 session is now rejected with 401 SESSION_REVOKED
    const reqDevice2Sync = new Request('https://pass.example.com/api/vault', {
      method: 'GET',
      headers: {
        'X-User-Id': userId,
        'X-Session-Token': token2,
      },
    });
    const resDevice2Sync = await handleApiRequest(reqDevice2Sync, env);
    expect(resDevice2Sync.status).toBe(401);
    const errJson = (await resDevice2Sync.json()) as ApiResponse;
    expect(errJson.error?.code).toBe('SESSION_REVOKED');
  });

  it('revokes all other sessions with POST /api/sessions/revoke-others', async () => {
    const userId = 'usr_bulk_user';
    mockDb.addUser({ id: userId, username: 'bulkuser', kdf_salt: 'salt2' });

    // Create session A and session B
    const tokenA = 'tok_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const hashA = await hashToken(tokenA);
    const tokenB = 'tok_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const hashB = await hashToken(tokenB);

    mockDb.sessions.set('ses_a', {
      id: 'ses_a',
      user_id: userId,
      token_hash: hashA,
      device_name: 'Device A',
      last_active_at: Date.now(),
      created_at: Date.now(),
      expires_at: Date.now() + 100000,
      is_revoked: 0,
    });

    mockDb.sessions.set('ses_b', {
      id: 'ses_b',
      user_id: userId,
      token_hash: hashB,
      device_name: 'Device B',
      last_active_at: Date.now(),
      created_at: Date.now(),
      expires_at: Date.now() + 100000,
      is_revoked: 0,
    });

    // Device A calls revoke-others
    const reqRevokeOthers = new Request('https://pass.example.com/api/sessions/revoke-others', {
      method: 'POST',
      headers: {
        'X-User-Id': userId,
        'X-Session-Token': tokenA,
      },
    });
    const resRevokeOthers = await handleApiRequest(reqRevokeOthers, env);
    expect(resRevokeOthers.status).toBe(200);

    // Session A should remain active, Session B should be revoked
    expect(mockDb.sessions.get('ses_a')?.is_revoked).toBe(0);
    expect(mockDb.sessions.get('ses_b')?.is_revoked).toBe(1);
  });

  // -------------------------------------------------------------------------
  // v1.1 Passkey Registry & Remote Revocation Tests
  // -------------------------------------------------------------------------
  it('registers, lists, and revokes passkeys', async () => {
    const userId = 'usr_passkey_test';
    mockDb.addUser({ id: userId, username: 'passkeyuser', kdf_salt: 'salt3' });

    // 1. Register new passkey
    const reqAdd = new Request('https://pass.example.com/api/passkeys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      },
      body: JSON.stringify({
        credential_id: 'cred_laptop_pc',
        name: 'Windows Hello (Laptop Asus)',
        device_name: 'Windows · Chrome',
      }),
    });
    const resAdd = await handleApiRequest(reqAdd, env);
    expect(resAdd.status).toBe(201);

    // 2. List passkeys
    const reqList = new Request('https://pass.example.com/api/passkeys', {
      method: 'GET',
      headers: { 'X-User-Id': userId },
    });
    const resList = await handleApiRequest(reqList, env);
    expect(resList.status).toBe(200);
    const jsonList = (await resList.json()) as ApiResponse<{ passkeys: PasskeyRecord[] }>;
    expect(jsonList.data?.passkeys.length).toBe(1);
    expect(jsonList.data?.passkeys[0].name).toBe('Windows Hello (Laptop Asus)');

    // 3. Delete passkey remotely
    const reqDelete = new Request('https://pass.example.com/api/passkeys/cred_laptop_pc', {
      method: 'DELETE',
      headers: { 'X-User-Id': userId },
    });
    const resDelete = await handleApiRequest(reqDelete, env);
    expect(resDelete.status).toBe(200);

    expect(mockDb.passkeys.get('cred_laptop_pc')?.is_revoked).toBe(1);
  });

  // -------------------------------------------------------------------------
  // v1.1 Audit Logs Feed Tests
  // -------------------------------------------------------------------------
  it('retrieves security event audit logs with GET /api/audit', async () => {
    const userId = 'usr_audit_user';
    mockDb.addUser({ id: userId, username: 'audituser', kdf_salt: 'salt4' });
    mockDb.auditLogs.push(
      {
        id: 1,
        user_id: userId,
        event_type: 'REGISTER',
        device_name: 'Windows · Chrome',
        ip_country: 'AR',
        created_at: 1000,
      },
      {
        id: 2,
        user_id: userId,
        event_type: 'LOGIN',
        device_name: 'iPhone · Safari',
        ip_country: 'AR',
        created_at: 2000,
      }
    );

    const req = new Request('https://pass.example.com/api/audit', {
      method: 'GET',
      headers: { 'X-User-Id': userId },
    });
    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(200);

    const json = (await res.json()) as ApiResponse<{ audit_logs: AuditLogRecord[] }>;
    expect(json.data?.audit_logs.length).toBe(2);
    expect(json.data?.audit_logs[0].event_type).toBe('LOGIN'); // sorted DESC
  });

  it('reuses existing session when session token or device is supplied without creating duplicates', async () => {
    const userId = 'usr_dedup_test';
    mockDb.addUser({ id: userId, username: 'dedupuser', kdf_salt: 'salt_dedup' });

    // 1. First login creates session
    const req1 = new Request('https://pass.example.com/api/auth/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/133.0.0.0',
      },
      body: JSON.stringify({ device_name: 'Windows · Chrome' }),
    });
    const res1 = await handleApiRequest(req1, env);
    expect(res1.status).toBe(200);
    const json1 = (await res1.json()) as ApiResponse<{ session_token: string; session: SessionItem }>;
    const sessionToken = json1.data!.session_token;
    const initialSessionId = json1.data!.session.id;
    expect(mockDb.sessions.size).toBe(1);

    // 2. Second unlock with the same session token reuses the existing session
    const req2 = new Request('https://pass.example.com/api/auth/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        'X-Session-Token': sessionToken,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/133.0.0.0',
      },
      body: JSON.stringify({ user_id: userId, session_token: sessionToken }),
    });
    const res2 = await handleApiRequest(req2, env);
    expect(res2.status).toBe(200);
    const json2 = (await res2.json()) as ApiResponse<{ session_token: string; session: SessionItem }>;
    expect(json2.data?.session_token).toBe(sessionToken);
    expect(json2.data?.session.id).toBe(initialSessionId);
    expect(mockDb.sessions.size).toBe(1); // No duplicate created!
  });

  it('auto-migrates primary passkey from users table into passkeys registry', async () => {
    const userId = 'usr_legacy_passkey';
    // User was registered in v1.0 with a passkey, but passkeys table is empty
    mockDb.addUser({
      id: userId,
      username: 'legacyuser',
      kdf_salt: 'salt_leg',
      passkey_credential_id: 'cred_legacy_windows_hello',
    });

    expect(mockDb.passkeys.size).toBe(0);

    // GET /api/passkeys should detect users.passkey_credential_id and migrate it
    const req = new Request('https://pass.example.com/api/passkeys', {
      method: 'GET',
      headers: { 'X-User-Id': userId },
    });
    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(200);

    const json = (await res.json()) as ApiResponse<{ passkeys: PasskeyRecord[] }>;
    expect(json.data?.passkeys.length).toBe(1);
    expect(json.data?.passkeys[0].id).toBe('cred_legacy_windows_hello');
    expect(mockDb.passkeys.has('cred_legacy_windows_hello')).toBe(true);
  });

  it('OPTIONS responds with 204 and CORS preflight headers', async () => {
    const req = new Request('https://pass.example.com/api/vault', {
      method: 'OPTIONS',
    });

    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-Session-Token');
  });

  it('renames a session via PATCH /api/sessions/:id and creates an audit log', async () => {
    const userId = 'usr_rename_sess';
    const sessionToken = 'token_rename_test';
    const tokenH = await hashToken(sessionToken);
    const sessionId = 'sess_target_rename';

    mockDb.sessions.set(sessionId, {
      id: sessionId,
      user_id: userId,
      token_hash: tokenH,
      device_name: 'Original Laptop Name',
      user_agent: 'Chrome',
      ip_country: 'AR',
      last_active_at: Math.floor(Date.now() / 1000),
      created_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      is_revoked: 0,
    });

    const req = new Request(`https://pass.example.com/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        'X-Session-Token': sessionToken,
      },
      body: JSON.stringify({ device_name: 'Work MacBook Pro M3' }),
    });

    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(200);

    const json = (await res.json()) as ApiResponse<{ success: boolean }>;
    expect(json.success).toBe(true);

    const updated = mockDb.sessions.get(sessionId);
    expect(updated?.device_name).toBe('Work MacBook Pro M3');

    const audit = mockDb.auditLogs.find((l) => l.event_type === 'DEVICE_RENAMED');
    expect(audit).toBeDefined();
    expect(audit?.device_name).toBe('Work MacBook Pro M3');
  });

  it('renames a passkey via PATCH /api/passkeys/:id and creates an audit log', async () => {
    const userId = 'usr_rename_pk';
    const sessionToken = 'token_rename_pk_test';
    const tokenH = await hashToken(sessionToken);
    const passkeyId = 'cred_pk_to_rename';

    mockDb.sessions.set('sess_caller', {
      id: 'sess_caller',
      user_id: userId,
      token_hash: tokenH,
      device_name: 'Main Desktop',
      user_agent: 'Chrome',
      ip_country: 'US',
      last_active_at: Math.floor(Date.now() / 1000),
      created_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      is_revoked: 0,
    });

    mockDb.passkeys.set(passkeyId, {
      id: passkeyId,
      user_id: userId,
      name: 'Old YubiKey',
      device_name: 'USB-C Key',
      created_at: Math.floor(Date.now() / 1000),
      is_revoked: 0,
    });

    const req = new Request(`https://pass.example.com/api/passkeys/${passkeyId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        'X-Session-Token': sessionToken,
      },
      body: JSON.stringify({ name: 'Primary YubiKey 5C NFC' }),
    });

    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(200);

    const json = (await res.json()) as ApiResponse<{ success: boolean }>;
    expect(json.success).toBe(true);

    const updated = mockDb.passkeys.get(passkeyId);
    expect(updated?.name).toBe('Primary YubiKey 5C NFC');

    const audit = mockDb.auditLogs.find((l) => l.event_type === 'PASSKEY_RENAMED');
    expect(audit).toBeDefined();
    expect(audit?.device_name).toBe('Main Desktop');
  });

  it('preserves customized device_name when refreshing session via POST /api/auth/session without explicit device_name', async () => {
    const userId = 'usr_preserve_device';
    const sessionToken = 'token_preserve_dev_test';
    const tokenH = await hashToken(sessionToken);
    const sessionId = 'sess_preserve_1';

    mockDb.sessions.set(sessionId, {
      id: sessionId,
      user_id: userId,
      token_hash: tokenH,
      device_name: 'Custom PC Name',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      ip_country: 'AR',
      last_active_at: Math.floor(Date.now() / 1000),
      created_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      is_revoked: 0,
    });

    // Client reloads and touches session without sending a new device_name
    const req = new Request('https://pass.example.com/api/auth/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        'X-Session-Token': sessionToken,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      body: JSON.stringify({ user_id: userId, session_token: sessionToken }),
    });

    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(200);

    const json = (await res.json()) as ApiResponse<{ session: { device_name: string } }>;
    expect(json.data?.session.device_name).toBe('Custom PC Name');

    const inDb = mockDb.sessions.get(sessionId);
    expect(inDb?.device_name).toBe('Custom PC Name');
  });

  it('preserves customized passkey name when re-syncing passkey via POST /api/passkeys with default name', async () => {
    const userId = 'usr_preserve_passkey';
    const sessionToken = 'token_preserve_pk_test';
    const tokenH = await hashToken(sessionToken);
    const passkeyId = 'cred_preserve_pk';

    mockDb.sessions.set('sess_pres_pk', {
      id: 'sess_pres_pk',
      user_id: userId,
      token_hash: tokenH,
      device_name: 'Main Desktop',
      user_agent: 'Chrome',
      ip_country: 'AR',
      last_active_at: Math.floor(Date.now() / 1000),
      created_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      is_revoked: 0,
    });

    // Passkey was customized by user
    mockDb.passkeys.set(passkeyId, {
      id: passkeyId,
      user_id: userId,
      name: 'Mi Windows Hello Personal',
      device_name: 'Windows · Chrome',
      created_at: Math.floor(Date.now() / 1000),
      is_revoked: 0,
    });

    // Client reloads and auto-sync sends POST /api/passkeys with default name
    const req = new Request('https://pass.example.com/api/passkeys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        'X-Session-Token': sessionToken,
      },
      body: JSON.stringify({
        credential_id: passkeyId,
        name: 'Windows Hello / Dispositivo Principal',
      }),
    });

    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(201);

    const json = (await res.json()) as ApiResponse<{ passkey: { name: string } }>;
    expect(json.data?.passkey.name).toBe('Mi Windows Hello Personal');

    const inDb = mockDb.passkeys.get(passkeyId);
    expect(inDb?.name).toBe('Mi Windows Hello Personal');
  });

  describe('HaveIBeenPwned k-Anonymity Edge Proxy (GET /api/pwned-check)', () => {
    it('returns 400 when prefix is missing or has invalid format', async () => {
      const invalidPrefixes = ['', '123', '123456', 'GGGGG', 'XYZ12'];

      for (const prefix of invalidPrefixes) {
        const req = new Request(`https://pass.example.com/api/pwned-check?prefix=${prefix}`, {
          method: 'GET',
        });
        const res = await handleApiRequest(req, env);
        expect(res.status).toBe(400);

        const json = (await res.json()) as ApiResponse;
        expect(json.success).toBe(false);
        expect(json.error?.code).toBe('INVALID_PREFIX');
      }
    });

    it('successfully proxies valid 5-character hex prefix to HIBP API and returns range', async () => {
      const originalFetch = globalThis.fetch;
      try {
        const mockHibpData = '0018A45C4D1DEF81644B54AB7F969B88D65:1\n00D4F6E8FA6EEC340B4FBCED30C1DD02E39:2';
        globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
          const urlStr = typeof input === 'string' ? input : input.toString();
          if (urlStr.includes('api.pwnedpasswords.com/range/21BD8')) {
            return new Response(mockHibpData, {
              status: 200,
              headers: { 'Content-Type': 'text/plain' },
            });
          }
          return originalFetch(input, init);
        };

        const req = new Request('https://pass.example.com/api/pwned-check?prefix=21bd8', {
          method: 'GET',
        });
        const res = await handleApiRequest(req, env);

        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toContain('public');
        expect(res.headers.get('Cache-Control')).toContain('max-age=86400');

        const json = (await res.json()) as ApiResponse<{ prefix: string; range: string }>;
        expect(json.success).toBe(true);
        expect(json.data?.prefix).toBe('21BD8');
        expect(json.data?.range).toContain('0018A45C4D1DEF81644B54AB7F969B88D65:1');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns 502 if upstream HIBP returns non-200 status', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () => {
          return new Response('Rate limited', { status: 429 });
        };

        const req = new Request('https://pass.example.com/api/pwned-check?prefix=A1B2C', {
          method: 'GET',
        });
        const res = await handleApiRequest(req, env);

        expect(res.status).toBe(502);
        const json = (await res.json()) as ApiResponse;
        expect(json.success).toBe(false);
        expect(json.error?.code).toBe('UPSTREAM_SERVICE_ERROR');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // v1.3.1 SECURITY HARDENING TESTS (FIX-01, FIX-02, FIX-03, FIX-04)
  // =========================================================================
  describe('v1.3.1 Security Hardening Tests', () => {
    it('FIX-01: Static asset responses include Content-Security-Policy header', async () => {
      const mockAssets: any = {
        fetch: async () => new Response('<!DOCTYPE html><html><body>Revolt Pass</body></html>', {
          status: 200,
          headers: new Headers({ 'Content-Type': 'text/html' }),
        }),
      };

      const envWithAssets: Env = {
        ...env,
        ASSETS: mockAssets,
      };

      const req = new Request('https://pass.revoltgroup.com.ar/', { method: 'GET' });
      const res = await worker.fetch(req, envWithAssets);

      expect(res.status).toBe(200);
      const csp = res.headers.get('Content-Security-Policy');
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('FIX-02: Returns HTTP 429 and Retry-After when rate limit is exceeded on GET /api/auth/salt', async () => {
      const mockRateLimiter = {
        limit: async () => ({ success: false }),
      };

      const rateLimitedEnv: Env = {
        ...env,
        RATE_LIMITER: mockRateLimiter,
      };

      const req = new Request('https://pass.example.com/api/auth/salt?username=alice', {
        method: 'GET',
        headers: { 'CF-Connecting-IP': '198.51.100.1' },
      });

      const res = await handleApiRequest(req, rateLimitedEnv);
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('60');

      const json = (await res.json()) as ApiResponse;
      expect(json.success).toBe(false);
      expect(json.error?.code).toBe('RATE_LIMITED');
    });

    it('FIX-02: Returns HTTP 429 and Retry-After when rate limit is exceeded on POST /api/auth/register', async () => {
      const mockRateLimiter = {
        limit: async () => ({ success: false }),
      };

      const rateLimitedEnv: Env = {
        ...env,
        RATE_LIMITER: mockRateLimiter,
      };

      const req = new Request('https://pass.example.com/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.2',
        },
        body: JSON.stringify({
          username: 'spammer',
          kdf_salt: 'salt123',
          encrypted_blob: 'blob123',
          iv: 'iv123',
        }),
      });

      const res = await handleApiRequest(req, rateLimitedEnv);
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('60');

      const json = (await res.json()) as ApiResponse;
      expect(json.success).toBe(false);
      expect(json.error?.code).toBe('RATE_LIMITED');
    });

    it('FIX-03: Reflects APP_DOMAIN in Access-Control-Allow-Origin header and falls back to wildcard when unset', async () => {
      const prodEnv: Env = {
        ...env,
        APP_DOMAIN: 'https://pass.revoltgroup.com.ar',
      };

      const reqOptions = new Request('https://pass.revoltgroup.com.ar/api/vault', {
        method: 'OPTIONS',
      });
      const resOptions = await handleApiRequest(reqOptions, prodEnv);
      expect(resOptions.headers.get('Access-Control-Allow-Origin')).toBe('https://pass.revoltgroup.com.ar');

      const reqTime = new Request('https://pass.revoltgroup.com.ar/api/time', {
        method: 'GET',
      });
      const resTime = await handleApiRequest(reqTime, prodEnv);
      expect(resTime.headers.get('Access-Control-Allow-Origin')).toBe('https://pass.revoltgroup.com.ar');

      // Fallback to '*' when APP_DOMAIN is undefined
      const devEnv: Env = {
        ...env,
        APP_DOMAIN: undefined,
      };
      const resDev = await handleApiRequest(reqOptions, devEnv);
      expect(resDev.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('FIX-04: Rotates session token on vault sync, issues X-New-Session-Token, and invalidates old token', async () => {
      // 1. Register user and receive initial session token
      const reqReg = new Request('https://pass.example.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'rotation_user',
          kdf_salt: 'salt_rot',
          encrypted_blob: 'blob_rot_1',
          iv: 'iv_rot_1',
        }),
      });
      const resReg = await handleApiRequest(reqReg, env);
      expect(resReg.status).toBe(201);
      const regJson = (await resReg.json()) as ApiResponse<{ user_id: string; session_token: string }>;
      const userId = regJson.data!.user_id;
      const initialToken = regJson.data!.session_token;

      // 2. Perform GET /api/vault with initialToken -> triggers rotation
      const reqSync1 = new Request('https://pass.example.com/api/vault', {
        method: 'GET',
        headers: {
          'X-User-Id': userId,
          'X-Session-Token': initialToken,
        },
      });
      const resSync1 = await handleApiRequest(reqSync1, env);
      expect(resSync1.status).toBe(200);

      const rotatedToken = resSync1.headers.get('X-New-Session-Token');
      expect(rotatedToken).toBeDefined();
      expect(typeof rotatedToken).toBe('string');
      expect(rotatedToken).not.toBe(initialToken);

      // 3. Second sync using rotatedToken succeeds
      const reqSync2 = new Request('https://pass.example.com/api/vault', {
        method: 'GET',
        headers: {
          'X-User-Id': userId,
          'X-Session-Token': rotatedToken!,
          'If-None-Match': '"v1"',
        },
      });
      const resSync2 = await handleApiRequest(reqSync2, env);
      expect(resSync2.status).toBe(304);

      // 4. Replaying initialToken is now rejected with 401 SESSION_REVOKED
      const reqReplay = new Request('https://pass.example.com/api/vault', {
        method: 'GET',
        headers: {
          'X-User-Id': userId,
          'X-Session-Token': initialToken,
        },
      });
      const resReplay = await handleApiRequest(reqReplay, env);
      expect(resReplay.status).toBe(401);
      const replayJson = (await resReplay.json()) as ApiResponse;
      expect(replayJson.error?.code).toBe('SESSION_REVOKED');
    });

    it('prev_token_hash sliding grace window allows GET /api/sessions, /api/passkeys, and /api/audit right after rotation', async () => {
      // 1. Register
      const reqReg = new Request('https://pass.example.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'gracetest_user',
          kdf_salt: 'salt_grace',
          encrypted_blob: 'blob_grace',
          iv: 'iv_grace',
        }),
      });
      const resReg = await handleApiRequest(reqReg, env);
      expect(resReg.status).toBe(201);
      const regData = (await resReg.json()) as ApiResponse<{ user_id: string; session_token: string }>;
      const userId = regData.data!.user_id;
      const token1 = regData.data!.session_token;

      // 2. Perform sync which rotates token1 -> token2
      const reqSync = new Request('https://pass.example.com/api/vault', {
        method: 'GET',
        headers: {
          'X-User-Id': userId,
          'X-Session-Token': token1,
        },
      });
      const resSync = await handleApiRequest(reqSync, env);
      expect(resSync.status).toBe(200);
      const token2 = resSync.headers.get('X-New-Session-Token');
      expect(token2).toBeTruthy();

      // 3. Query /api/sessions with old token1 -> MUST SUCCEED because token1 is in prev_token_hash grace window!
      const reqSessions = new Request('https://pass.example.com/api/sessions', {
        method: 'GET',
        headers: {
          'X-User-Id': userId,
          'X-Session-Token': token1,
        },
      });
      const resSessions = await handleApiRequest(reqSessions, env);
      expect(resSessions.status).toBe(200);
      const sessionsJson = (await resSessions.json()) as ApiResponse<{ sessions: Array<{ id: string; is_current: boolean }> }>;
      expect(sessionsJson.success).toBe(true);
      expect(sessionsJson.data?.sessions.length).toBeGreaterThan(0);

      // 4. Query /api/passkeys with old token1 -> MUST SUCCEED
      const reqPasskeys = new Request('https://pass.example.com/api/passkeys', {
        method: 'GET',
        headers: {
          'X-User-Id': userId,
          'X-Session-Token': token1,
        },
      });
      const resPasskeys = await handleApiRequest(reqPasskeys, env);
      expect(resPasskeys.status).toBe(200);

      // 5. Query /api/audit with old token1 -> MUST SUCCEED
      const reqAudit = new Request('https://pass.example.com/api/audit', {
        method: 'GET',
        headers: {
          'X-User-Id': userId,
          'X-Session-Token': token1,
        },
      });
      const resAudit = await handleApiRequest(reqAudit, env);
      expect(resAudit.status).toBe(200);
    });
  });

  describe('Milestone v1.5: Argon2id KDF & Proactive Notifications', () => {
    it('registers user with Argon2id algorithm by default and retrieves it via GET /api/auth/salt', async () => {
      const reqReg = new Request('https://pass.example.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'argon_user',
          kdf_salt: 'salt_argon_123',
          kdf_algorithm: 'argon2id',
          encrypted_blob: 'blob_argon_1',
          iv: 'iv_argon_1',
        }),
      });
      const resReg = await handleApiRequest(reqReg, env);
      expect(resReg.status).toBe(201);
      const regJson = (await resReg.json()) as ApiResponse<{ user_id: string; session_token: string }>;
      expect(regJson.success).toBe(true);

      const reqSalt = new Request('https://pass.example.com/api/auth/salt?username=argon_user', {
        method: 'GET',
      });
      const resSalt = await handleApiRequest(reqSalt, env);
      expect(resSalt.status).toBe(200);
      const saltJson = (await resSalt.json()) as ApiResponse<{ user_id: string; kdf_salt: string; kdf_algorithm: string }>;
      expect(saltJson.success).toBe(true);
      expect(saltJson.data?.kdf_algorithm).toBe('argon2id');
    });

    it('upgrades user from PBKDF2 to Argon2id via POST /api/auth/upgrade-kdf', async () => {
      // 1. Register legacy user with PBKDF2
      const reqReg = new Request('https://pass.example.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'legacy_pbkdf2_user',
          kdf_salt: 'salt_old_pbkdf2',
          kdf_algorithm: 'pbkdf2',
          encrypted_blob: 'blob_pbkdf2_1',
          iv: 'iv_pbkdf2_1',
        }),
      });
      const resReg = await handleApiRequest(reqReg, env);
      const regJson = (await resReg.json()) as ApiResponse<{ user_id: string; session_token: string }>;
      const userId = regJson.data!.user_id;
      const sessionToken = regJson.data!.session_token;

      // 2. Perform atomic upgrade to Argon2id
      const reqUpgrade = new Request('https://pass.example.com/api/auth/upgrade-kdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
          'X-Session-Token': sessionToken,
        },
        body: JSON.stringify({
          kdf_salt: 'salt_new_argon2id',
          kdf_algorithm: 'argon2id',
          encrypted_blob: 'blob_argon2id_reencrypted',
          iv: 'iv_argon2id_new',
        }),
      });
      const resUpgrade = await handleApiRequest(reqUpgrade, env);
      expect(resUpgrade.status).toBe(200);
      const upJson = (await resUpgrade.json()) as ApiResponse<{ kdf_algorithm: string; version: number }>;
      expect(upJson.success).toBe(true);
      expect(upJson.data?.kdf_algorithm).toBe('argon2id');
      expect(upJson.data?.version).toBe(2);

      // 3. Verify that salt query now returns argon2id
      const reqSalt = new Request('https://pass.example.com/api/auth/salt?username=legacy_pbkdf2_user', {
        method: 'GET',
      });
      const resSalt = await handleApiRequest(reqSalt, env);
      const saltJson = (await resSalt.json()) as ApiResponse<{ kdf_algorithm: string; kdf_salt: string }>;
      expect(saltJson.data?.kdf_algorithm).toBe('argon2id');
      expect(saltJson.data?.kdf_salt).toBe('salt_new_argon2id');
    });

    it('generates and returns VAPID public key via GET /api/notifications/vapid-public-key', async () => {
      const reqVapid = new Request('https://pass.example.com/api/notifications/vapid-public-key', {
        method: 'GET',
      });
      const resVapid = await handleApiRequest(reqVapid, env);
      expect(resVapid.status).toBe(200);
      const vapidJson = (await resVapid.json()) as ApiResponse<{ public_key: string }>;
      expect(vapidJson.success).toBe(true);
      expect(typeof vapidJson.data?.public_key).toBe('string');
      expect(vapidJson.data!.public_key.length).toBeGreaterThan(20);
    });

    it('manages BYOK notification settings via GET and POST /api/notifications/settings', async () => {
      // 1. Create a user
      const reqReg = new Request('https://pass.example.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'notif_settings_user',
          kdf_salt: 'salt_notif',
          encrypted_blob: 'blob_notif',
          iv: 'iv_notif',
        }),
      });
      const resReg = await handleApiRequest(reqReg, env);
      const regJson = (await resReg.json()) as ApiResponse<{ user_id: string; session_token: string }>;
      const userId = regJson.data!.user_id;
      const sessionToken = regJson.data!.session_token;

      // 2. GET default notification settings
      const reqGet = new Request('https://pass.example.com/api/notifications/settings', {
        method: 'GET',
        headers: {
          'X-User-Id': userId,
          'X-Session-Token': sessionToken,
        },
      });
      const resGet = await handleApiRequest(reqGet, env);
      expect(resGet.status).toBe(200);
      const getJson = (await resGet.json()) as ApiResponse<{ email_enabled: boolean }>;
      expect(getJson.success).toBe(true);
      expect(getJson.data?.email_enabled).toBe(false);

      // 3. POST updated settings (BYOK Resend)
      const reqPost = new Request('https://pass.example.com/api/notifications/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
          'X-Session-Token': sessionToken,
        },
        body: JSON.stringify({
          email_enabled: true,
          email_provider: 'resend',
          resend_api_key: 're_test_key_123',
          resend_from_email: 'alerts@example.com',
          destination_email: 'user@example.com',
          notify_on_new_country: true,
          notify_on_new_session: true,
          notify_on_session_revoked: true,
          notify_on_passkey_added: false,
        }),
      });
      const resPost = await handleApiRequest(reqPost, env);
      expect(resPost.status).toBe(200);
      const postJson = (await resPost.json()) as ApiResponse<{ message: string }>;
      expect(postJson.success).toBe(true);

      // 4. Verify round-trip persistence via GET
      const reqGet2 = new Request('https://pass.example.com/api/notifications/settings', {
        method: 'GET',
        headers: {
          'X-User-Id': userId,
          'X-Session-Token': sessionToken,
        },
      });
      const resGet2 = await handleApiRequest(reqGet2, env);
      expect(resGet2.status).toBe(200);
      const getJson2 = (await resGet2.json()) as ApiResponse<{ email_enabled: boolean; destination_email: string; has_resend_api_key: boolean }>;
      expect(getJson2.success).toBe(true);
      expect(getJson2.data?.email_enabled).toBe(true);
      expect(getJson2.data?.destination_email).toBe('user@example.com');
      expect(getJson2.data?.has_resend_api_key).toBe(true);
    });

    it('subscribes and unsubscribes Web Push notifications via API', async () => {
      // 1. Create a user
      const reqReg = new Request('https://pass.example.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'push_sub_user',
          kdf_salt: 'salt_push',
          encrypted_blob: 'blob_push',
          iv: 'iv_push',
        }),
      });
      const resReg = await handleApiRequest(reqReg, env);
      const regJson = (await resReg.json()) as ApiResponse<{ user_id: string; session_token: string }>;
      const userId = regJson.data!.user_id;
      const sessionToken = regJson.data!.session_token;

      // 2. Subscribe to push
      const testEndpoint = 'https://fcm.googleapis.com/fcm/send/test-sub-12345';
      const reqSub = new Request('https://pass.example.com/api/notifications/push-subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
          'X-Session-Token': sessionToken,
        },
        body: JSON.stringify({
          endpoint: testEndpoint,
          p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9AcFY3XWM2BgVRWnuvSGA7CQ0tSpfScZZWkd81GneuQnQ4=',
          auth: 'tBHItJI5svbpez7KI4CCXg==',
        }),
      });
      const resSub = await handleApiRequest(reqSub, env);
      expect(resSub.status).toBe(200);
      const subJson = (await resSub.json()) as ApiResponse<{ subscribed: boolean }>;
      expect(subJson.success).toBe(true);
      expect(subJson.data?.subscribed).toBe(true);

      // 3. Unsubscribe from push
      const reqUnsub = new Request('https://pass.example.com/api/notifications/push-unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
          'X-Session-Token': sessionToken,
        },
        body: JSON.stringify({
          endpoint: testEndpoint,
        }),
      });
      const resUnsub = await handleApiRequest(reqUnsub, env);
      expect(resUnsub.status).toBe(200);
      const unsubJson = (await resUnsub.json()) as ApiResponse<{ unsubscribed: boolean }>;
      expect(unsubJson.success).toBe(true);
      expect(unsubJson.data?.unsubscribed).toBe(true);
    });
  });
});

