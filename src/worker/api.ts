/**
 * Zero-Knowledge REST API Router for Cloudflare Workers / Pages Functions.
 * Implements strict security headers, uniform error handling, active session management,
 * passkey registry, and optimistic concurrency control.
 */

import type {
  Env,
  ApiResponse,
  RegisterRequestBody,
  VaultUpdateRequestBody,
  SessionItem,
  PasskeyRecord,
  AuditLogRecord,
  CreateSessionRequestBody,
  RegisterPasskeyRequestBody,
  UpdateSessionRequestBody,
  UpdatePasskeyRequestBody,
} from './types.ts';

/**
 * FIX-03 (v1.3.1): Returns security headers with domain-restricted CORS.
 * Uses APP_DOMAIN env var when set; falls back to '*' only for dev/self-hosted instances
 * where APP_DOMAIN is not configured. Pass `env` from all authenticated API handlers.
 */
function getSecurityHeaders(env?: Env): Record<string, string> {
  return {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Access-Control-Allow-Origin': env?.APP_DOMAIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Session-Token, If-None-Match',
  };
}

/**
 * Generates a JSON response with embedded security headers.
 * Pass `env` to enable domain-restricted CORS (FIX-03).
 */
export function jsonResponse<T>(
  data: ApiResponse<T>,
  status = 200,
  extraHeaders: Record<string, string> = {},
  env?: Env
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    ...getSecurityHeaders(env),
    ...extraHeaders,
  });

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

/**
 * Generates a standardized error response.
 * Pass `env` to enable domain-restricted CORS (FIX-03).
 */
export function errorResponse(
  code: string,
  message: string,
  status = 400,
  details?: unknown,
  env?: Env
): Response {
  return jsonResponse(
    {
      success: false,
      error: {
        code,
        message,
        details,
      },
      timestamp: Date.now(),
    },
    status,
    {},
    env
  );
}


/**
 * Hashes a raw session token using SHA-256 for secure server-side storage.
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generates a cryptographically random session token (64 hex characters).
 */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Parses User-Agent header into a clean, human-readable device string.
 */
export function parseDeviceName(userAgent?: string | null): string {
  if (!userAgent) return 'Dispositivo desconocido';

  let os = 'Dispositivo';
  if (userAgent.includes('Windows NT 10.0') || userAgent.includes('Windows')) {
    os = 'Windows';
  } else if (userAgent.includes('Macintosh') || userAgent.includes('Mac OS X')) {
    os = 'macOS';
  } else if (userAgent.includes('iPhone')) {
    os = 'iPhone';
  } else if (userAgent.includes('iPad')) {
    os = 'iPad';
  } else if (userAgent.includes('Android')) {
    os = 'Android';
  } else if (userAgent.includes('Linux')) {
    os = 'Linux';
  }

  let browser = 'Navegador';
  if (userAgent.includes('Edg/')) {
    browser = 'Edge';
  } else if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) {
    browser = 'Chrome';
  } else if (userAgent.includes('Firefox/')) {
    browser = 'Firefox';
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
    browser = 'Safari';
  } else if (userAgent.includes('OPR/') || userAgent.includes('Opera/')) {
    browser = 'Opera';
  }

  return `${os} · ${browser}`;
}

/**
 * Extracts the user country code from Cloudflare request headers or cf properties.
 */
function getIpCountry(request: Request): string | undefined {
  return request.headers.get('CF-IPCountry') || (request as unknown as { cf?: { country?: string } }).cf?.country || undefined;
}

/**
 * FIX-02 (v1.3.1): Applies rate limit check for a given key.
 * Returns a 429 error Response if limit is exceeded, null otherwise.
 * Degrades gracefully when RATE_LIMITER binding is not configured.
 */
async function applyRateLimit(
  key: string,
  env: Env
): Promise<Response | null> {
  if (!env.RATE_LIMITER) return null;
  const { success } = await env.RATE_LIMITER.limit({ key });
  if (!success) {
    return jsonResponse(
      {
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Intentá nuevamente en un momento.' },
        timestamp: Date.now(),
      },
      429,
      { 'Retry-After': '60' },
      env
    );
  }
  return null;
}

/**
 * FIX-04 (v1.3.1 / v1.4.0): Rotates session token — preserves previous token hash in prev_token_hash,
 * generates a new token_hash, updates D1, and returns the new plaintext token.
 * The caller adds it to the response as X-New-Session-Token.
 */
async function rotateSessionToken(sessionId: string, env: Env): Promise<string | null> {
  try {
    const newToken = generateToken();
    const newTokenHash = await hashToken(newToken);
    const newExpiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // sliding 30d
    await env.DB.prepare(
      'UPDATE sessions SET prev_token_hash = token_hash, token_hash = ?, expires_at = ?, last_active_at = unixepoch() WHERE id = ?'
    )
      .bind(newTokenHash, newExpiresAt, sessionId)
      .run();
    return newToken;
  } catch {
    // Non-fatal: if rotation fails, the old token remains valid until it expires
    return null;
  }
}

/**
 * FIX-04 (v1.3.1 / v1.4.0): If a valid session token is provided, throttles and rotates it,
 * returning the new plaintext token string to be sent in X-New-Session-Token.
 */
async function rotateSessionOnRequest(
  request: Request,
  env: Env,
  userId: string
): Promise<string | null> {
  const sessionToken = request.headers.get('X-Session-Token');
  if (!sessionToken) return null;

  const tokenHash = await hashToken(sessionToken);
  const session = await env.DB.prepare(
    'SELECT id FROM sessions WHERE (token_hash = ? OR prev_token_hash = ?) AND user_id = ? AND is_revoked = 0'
  )
    .bind(tokenHash, tokenHash, userId)
    .first<{ id: string }>();

  if (!session) return null;
  return rotateSessionToken(session.id, env);
}


/**
 * Validates the provided session token if present.
 * Accepts both current token_hash and prev_token_hash (grace window during sliding rotation).
 * If revoked or expired, returns an HTTP 401 error response.
 * Also applies sliding session logic: updates last_active_at and extends expires_at by 30 days.
 */
async function checkSessionValidity(
  request: Request,
  env: Env,
  userId: string
): Promise<Response | null> {
  const sessionToken = request.headers.get('X-Session-Token');
  if (!sessionToken) {
    return null;
  }

  const tokenHash = await hashToken(sessionToken);
  const session = await env.DB.prepare(
    'SELECT id, user_id, is_revoked, expires_at FROM sessions WHERE (token_hash = ? OR prev_token_hash = ?)'
  )
    .bind(tokenHash, tokenHash)
    .first<{ id: string; user_id: string; is_revoked: number; expires_at: number }>();

  if (!session || session.is_revoked === 1 || session.user_id !== userId) {
    return errorResponse(
      'SESSION_REVOKED',
      'Sesión revocada o inválida. Por favor, vuelva a iniciar sesión.',
      401,
      undefined,
      env
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (session.expires_at < nowSeconds) {
    return errorResponse('SESSION_EXPIRED', 'La sesión ha expirado', 401, undefined, env);
  }

  // Sliding session: refresh last_active_at and extend expires_at by 30 days
  const slidingExpiresAt = nowSeconds + 30 * 24 * 60 * 60;
  try {
    await env.DB.prepare('UPDATE sessions SET last_active_at = unixepoch(), expires_at = ? WHERE id = ?')
      .bind(slidingExpiresAt, session.id)
      .run();
  } catch {
    // Non-fatal if update fails
  }

  return null;
}






/**
 * Main REST API request handler.
 */
export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  // Handle CORS preflight (OPTIONS)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: new Headers(getSecurityHeaders(env)),
    });
  }


  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // -----------------------------------------------------------------------
    // GET /api/time: Clock synchronization for Time Drift Compensation
    // -----------------------------------------------------------------------
    if (request.method === 'GET' && (path === '/api/time' || path === '/api/v1/time')) {
      return jsonResponse(
        {
          success: true,
          data: {
            server_time_utc: Date.now(),
          },
          timestamp: Date.now(),
        },
        200,
        { 'Cache-Control': 'no-store' },
        env
      );
    }

    // -----------------------------------------------------------------------
    // GET /api/pwned-check: k-Anonymity edge proxy for HaveIBeenPwned
    // -----------------------------------------------------------------------
    if (request.method === 'GET' && (path === '/api/pwned-check' || path === '/api/v1/pwned-check')) {
      const prefix = url.searchParams.get('prefix')?.trim().toUpperCase();

      if (!prefix || !/^[0-9A-F]{5}$/.test(prefix)) {
        return errorResponse(
          'INVALID_PREFIX',
          'El parámetro prefix es obligatorio y debe contener exactamente 5 caracteres hexadecimales (SHA-1)',
          400
        );
      }

      try {
        const hibpUrl = `https://api.pwnedpasswords.com/range/${prefix}`;
        const hibpResponse = await fetch(hibpUrl, {
          headers: {
            'User-Agent': 'RevoltPass-SecurityScanner/1.3',
            'Add-Padding': 'true',
          },
        });

        if (!hibpResponse.ok) {
          return errorResponse(
            'UPSTREAM_SERVICE_ERROR',
            'Error al consultar el servicio de verificación de filtraciones HaveIBeenPwned',
            502
          );
        }

        const rangeData = await hibpResponse.text();

        return jsonResponse(
          {
            success: true,
            data: {
              prefix,
              range: rangeData,
            },
            timestamp: Date.now(),
          },
          200,
          {
            'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=43200',
          }
        );
      } catch (err: unknown) {
        return errorResponse(
          'UPSTREAM_FETCH_FAILED',
          'No se pudo conectar con el servicio HaveIBeenPwned',
          502,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    // -----------------------------------------------------------------------
    // POST /api/auth/register: Atomic initial registration of user and vault
    // -----------------------------------------------------------------------
    if (request.method === 'POST' && (path === '/api/auth/register' || path === '/api/v1/auth/register')) {
      // FIX-02 (v1.3.1): Rate limiting on registration to prevent automated spam
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateLimitError = await applyRateLimit(`register:${ip}`, env);
      if (rateLimitError) return rateLimitError;

      let body: RegisterRequestBody & { device_name?: string };
      try {
        body = (await request.json()) as RegisterRequestBody & { device_name?: string };
      } catch {
        return errorResponse('INVALID_JSON_BODY', 'El cuerpo de la solicitud no es un JSON válido', 400, undefined, env);
      }


      const { username, kdf_salt, encrypted_blob, iv, passkey_credential_id, device_name } = body;

      if (!username || !kdf_salt || !encrypted_blob || !iv) {
        return errorResponse(
          'MISSING_REQUIRED_FIELDS',
          'Los campos username, kdf_salt, encrypted_blob e iv son obligatorios',
          400
        );
      }

      const cleanUsername = username.trim().toLowerCase();
      if (cleanUsername.length < 3) {
        return errorResponse('INVALID_USERNAME', 'El nombre de usuario debe tener al menos 3 caracteres', 400);
      }

      // 1. Check if user already exists (NOCASE)
      const existingUser = await env.DB.prepare(
        'SELECT id FROM users WHERE username = ? COLLATE NOCASE'
      )
        .bind(cleanUsername)
        .first<{ id: string }>();

      if (existingUser) {
        return errorResponse(
          'USERNAME_ALREADY_EXISTS',
          `El nombre de usuario "${cleanUsername}" ya se encuentra registrado`,
          409
        );
      }

      // 2. Generate canonical user UUID and initial session token
      const userId = `usr_${crypto.randomUUID()}`;
      const sessionToken = generateToken();
      const tokenHash = await hashToken(sessionToken);
      const sessionId = `ses_${crypto.randomUUID()}`;
      const resolvedDeviceName = device_name || parseDeviceName(request.headers.get('User-Agent'));
      const userAgent = request.headers.get('User-Agent') || null;
      const ipCountry = getIpCountry(request) || null;
      const sessionExpiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

      // 3. Atomically insert user, initial vault, session, and audit logs into Cloudflare D1
      const batchStatements = [
        env.DB.prepare(
          `INSERT INTO users (id, username, kdf_salt, passkey_credential_id, created_at, updated_at) 
           VALUES (?, ?, ?, ?, unixepoch(), unixepoch())`
        ).bind(userId, cleanUsername, kdf_salt, passkey_credential_id || null),
        env.DB.prepare(
          `INSERT INTO vaults (user_id, encrypted_blob, iv, version, updated_at) 
           VALUES (?, ?, ?, 1, unixepoch())`
        ).bind(userId, encrypted_blob, iv),
        env.DB.prepare(
          `INSERT INTO sessions (id, user_id, token_hash, device_name, user_agent, ip_country, last_active_at, created_at, expires_at, is_revoked)
           VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch(), ?, 0)`
        ).bind(sessionId, userId, tokenHash, resolvedDeviceName, userAgent, ipCountry, sessionExpiresAt),
        env.DB.prepare(
          `INSERT INTO sync_logs (user_id, action, client_version, server_version, ip_country, created_at) 
           VALUES (?, 'REGISTER', 1, 1, ?, unixepoch())`
        ).bind(userId, ipCountry),
        env.DB.prepare(
          `INSERT INTO audit_logs (user_id, event_type, device_name, ip_country, metadata, created_at)
           VALUES (?, 'REGISTER', ?, ?, ?, unixepoch())`
        ).bind(userId, resolvedDeviceName, ipCountry, JSON.stringify({ session_id: sessionId })),
      ];

      if (passkey_credential_id) {
        batchStatements.push(
          env.DB.prepare(
            `INSERT INTO passkeys (id, user_id, name, device_name, created_at, is_revoked)
             VALUES (?, ?, ?, ?, unixepoch(), 0)`
          ).bind(passkey_credential_id, userId, 'Windows Hello / Dispositivo Principal', resolvedDeviceName)
        );
      }

      await env.DB.batch(batchStatements);

      return jsonResponse(
        {
          success: true,
          data: {
            user_id: userId,
            version: 1,
            session_token: sessionToken,
            updated_at: Math.floor(Date.now() / 1000),
          },
          timestamp: Date.now(),
        },
        201
      );
    }

    // -----------------------------------------------------------------------
    // GET /api/auth/salt: Retrieve kdf_salt for client-side key derivation
    // -----------------------------------------------------------------------
    if (request.method === 'GET' && (path === '/api/auth/salt' || path === '/api/v1/auth/salt')) {
      // FIX-02 (v1.3.1): Rate limiting on salt endpoint to mitigate username enumeration
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateLimitError = await applyRateLimit(`salt:${ip}`, env);
      if (rateLimitError) return rateLimitError;

      const usernameParam = url.searchParams.get('username');

      if (!usernameParam || !usernameParam.trim()) {
        return errorResponse('MISSING_USERNAME', 'El parámetro "username" es obligatorio', 400);
      }

      const cleanUsername = usernameParam.trim().toLowerCase();
      const user = await env.DB.prepare(
        'SELECT id, kdf_salt, passkey_credential_id FROM users WHERE username = ? COLLATE NOCASE'
      )
        .bind(cleanUsername)
        .first<{ id: string; kdf_salt: string; passkey_credential_id: string | null }>();

      if (!user) {
        return errorResponse('USER_NOT_FOUND', `Usuario "${cleanUsername}" no encontrado`, 404);
      }

      return jsonResponse({
        success: true,
        data: {
          user_id: user.id,
          kdf_salt: user.kdf_salt,
          has_passkey: !!user.passkey_credential_id,
        },
        timestamp: Date.now(),
      });
    }

    // -----------------------------------------------------------------------
    // POST /api/auth/session: Generate or refresh active session upon login / unlock
    // -----------------------------------------------------------------------
    if (request.method === 'POST' && (path === '/api/auth/session' || path === '/api/v1/auth/session')) {
      let body: CreateSessionRequestBody & {
        user_id?: string;
        username?: string;
        session_token?: string;
        passkey_id?: string;
      } = {};
      try {
        body = (await request.json()) as CreateSessionRequestBody & {
          user_id?: string;
          username?: string;
          session_token?: string;
          passkey_id?: string;
        };
      } catch {
        // Body is optional
      }

      const headerUserId = request.headers.get('X-User-Id');
      let targetUserId = headerUserId || body.user_id;

      if (!targetUserId && body.username) {
        const cleanUsername = body.username.trim().toLowerCase();
        const user = await env.DB.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
          .bind(cleanUsername)
          .first<{ id: string }>();
        if (user) {
          targetUserId = user.id;
        }
      }

      if (!targetUserId) {
        return errorResponse('UNAUTHORIZED', 'Identificador de usuario requerido', 401);
      }

      const providedToken = request.headers.get('X-Session-Token') || body.session_token;
      const resolvedDeviceName = body.device_name || parseDeviceName(request.headers.get('User-Agent'));
      const userAgent = request.headers.get('User-Agent') || null;
      const ipCountry = getIpCountry(request) || null;
      const nowEpoch = Math.floor(Date.now() / 1000);
      const sessionExpiresAt = nowEpoch + 30 * 24 * 60 * 60; // 30 days

      // 1. If client provided a session token, check if it's currently active and unrevoked
      if (providedToken) {
        const tokenHash = await hashToken(providedToken);
        const existingSession = await env.DB.prepare(
          `SELECT id, user_id, device_name, user_agent, ip_country, last_active_at, created_at, expires_at, is_revoked
           FROM sessions 
           WHERE (token_hash = ? OR prev_token_hash = ?) AND user_id = ? AND is_revoked = 0 AND expires_at > unixepoch()`
        )
          .bind(tokenHash, tokenHash, targetUserId)
          .first<SessionItem>();

        if (existingSession) {
          const updatedDeviceName = body.device_name?.trim() || existingSession.device_name;

          const batchStatements = [
            env.DB.prepare(
              `UPDATE sessions 
               SET last_active_at = unixepoch(), device_name = ?, user_agent = ?, ip_country = ?
               WHERE id = ?`
            ).bind(updatedDeviceName, userAgent, ipCountry, existingSession.id),
          ];

          if (body.passkey_id) {
            batchStatements.push(
              env.DB.prepare(
                'UPDATE passkeys SET last_used_at = unixepoch() WHERE id = ? AND user_id = ?'
              ).bind(body.passkey_id, targetUserId)
            );
          }

          if (userAgent) {
            batchStatements.push(
              env.DB.prepare(
                `UPDATE sessions SET is_revoked = 1 
                 WHERE user_id = ? AND user_agent = ? AND id != ? AND is_revoked = 0`
              ).bind(targetUserId, userAgent, existingSession.id)
            );
          }

          await env.DB.batch(batchStatements);

          return jsonResponse({
            success: true,
            data: {
              session_token: providedToken,
              session: {
                ...existingSession,
                device_name: updatedDeviceName,
                user_agent: userAgent,
                ip_country: ipCountry,
                last_active_at: nowEpoch,
                is_current: true,
              },
            },
            timestamp: Date.now(),
          });
        }
      }

      // 2. If no valid session token provided, check if there's an existing active session
      // from the exact same user_agent to reuse instead of creating duplicate devices
      if (userAgent) {
        const existingDeviceSession = await env.DB.prepare(
          `SELECT id, user_id, device_name, user_agent, ip_country, last_active_at, created_at, expires_at, is_revoked
           FROM sessions 
           WHERE user_id = ? AND user_agent = ? AND is_revoked = 0 AND expires_at > unixepoch()
           ORDER BY last_active_at DESC
           LIMIT 1`
        )
          .bind(targetUserId, userAgent)
          .first<SessionItem>();

        if (existingDeviceSession) {
          const sessionToken = generateToken();
          const tokenHash = await hashToken(sessionToken);
          const updatedDeviceName = body.device_name?.trim() || existingDeviceSession.device_name;

          const batchStatements = [
            env.DB.prepare(
              `UPDATE sessions 
               SET prev_token_hash = token_hash, token_hash = ?, last_active_at = unixepoch(), expires_at = ?, device_name = ?, ip_country = ?
               WHERE id = ?`
            ).bind(tokenHash, sessionExpiresAt, updatedDeviceName, ipCountry, existingDeviceSession.id),
            env.DB.prepare(
              `UPDATE sessions SET is_revoked = 1 
               WHERE user_id = ? AND user_agent = ? AND id != ? AND is_revoked = 0`
            ).bind(targetUserId, userAgent, existingDeviceSession.id),
          ];

          if (body.passkey_id) {
            batchStatements.push(
              env.DB.prepare(
                'UPDATE passkeys SET last_used_at = unixepoch() WHERE id = ? AND user_id = ?'
              ).bind(body.passkey_id, targetUserId)
            );
          }

          await env.DB.batch(batchStatements);

          return jsonResponse({
            success: true,
            data: {
              session_token: sessionToken,
              session: {
                ...existingDeviceSession,
                device_name: updatedDeviceName,
                ip_country: ipCountry,
                last_active_at: nowEpoch,
                expires_at: sessionExpiresAt,
                is_current: true,
              },
            },
            timestamp: Date.now(),
          });
        }
      }

      // 3. Completely new session creation
      const sessionToken = generateToken();
      const tokenHash = await hashToken(sessionToken);
      const sessionId = `ses_${crypto.randomUUID()}`;

      const batchStatements = [
        env.DB.prepare(
          `INSERT INTO sessions (id, user_id, token_hash, device_name, user_agent, ip_country, last_active_at, created_at, expires_at, is_revoked)
           VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch(), ?, 0)`
        ).bind(sessionId, targetUserId, tokenHash, resolvedDeviceName, userAgent, ipCountry, sessionExpiresAt),
        env.DB.prepare(
          `INSERT INTO audit_logs (user_id, event_type, device_name, ip_country, metadata, created_at)
           VALUES (?, 'LOGIN', ?, ?, ?, unixepoch())`
        ).bind(targetUserId, resolvedDeviceName, ipCountry, JSON.stringify({ session_id: sessionId })),
      ];

      if (body.passkey_id) {
        batchStatements.push(
          env.DB.prepare(
            'UPDATE passkeys SET last_used_at = unixepoch() WHERE id = ? AND user_id = ?'
          ).bind(body.passkey_id, targetUserId)
        );
      }

      await env.DB.batch(batchStatements);

      return jsonResponse({
        success: true,
        data: {
          session_token: sessionToken,
          session: {
            id: sessionId,
            user_id: targetUserId,
            device_name: resolvedDeviceName,
            user_agent: userAgent,
            ip_country: ipCountry,
            last_active_at: nowEpoch,
            created_at: nowEpoch,
            expires_at: sessionExpiresAt,
            is_revoked: 0,
            is_current: true,
          },
        },
        timestamp: Date.now(),
      });
    }

    // -----------------------------------------------------------------------
    // GET /api/sessions: List active sessions for user (deduplicated)
    // -----------------------------------------------------------------------
    if (request.method === 'GET' && (path === '/api/sessions' || path === '/api/v1/sessions')) {
      const userId = request.headers.get('X-User-Id');
      if (!userId) {
        return errorResponse('UNAUTHORIZED', 'Cabecera X-User-Id requerida', 401);
      }

      const sessionError = await checkSessionValidity(request, env, userId);
      if (sessionError) return sessionError;

      const { results } = await env.DB.prepare(
        `SELECT id, user_id, device_name, user_agent, ip_country, last_active_at, created_at, expires_at, is_revoked
         FROM sessions 
         WHERE user_id = ? AND is_revoked = 0 
         ORDER BY last_active_at DESC`
      )
        .bind(userId)
        .all<SessionItem>();

      let currentSessionId: string | null = null;
      const sessionToken = request.headers.get('X-Session-Token');
      if (sessionToken) {
        const tokenHash = await hashToken(sessionToken);
        const cur = await env.DB.prepare('SELECT id FROM sessions WHERE (token_hash = ? OR prev_token_hash = ?)')
          .bind(tokenHash, tokenHash)
          .first<{ id: string }>();
        if (cur) currentSessionId = cur.id;
      }

      // Deduplicate active sessions with identical user_agent (keep current or newest)
      const seenAgents = new Set<string>();
      const deduplicatedSessions: SessionItem[] = [];
      const staleDuplicateIds: string[] = [];

      for (const s of results || []) {
        const key = s.user_agent ? `${s.device_name}::${s.user_agent}` : s.id;
        const isCurrent = s.id === currentSessionId;
        if (isCurrent) {
          deduplicatedSessions.push({ ...s, is_current: true });
          seenAgents.add(key);
        } else if (!seenAgents.has(key)) {
          deduplicatedSessions.push({ ...s, is_current: false });
          seenAgents.add(key);
        } else {
          staleDuplicateIds.push(s.id);
        }
      }

      // Automatically clean up stale duplicate sessions in background
      if (staleDuplicateIds.length > 0) {
        const cleanupBatches = staleDuplicateIds.map((id) =>
          env.DB.prepare('UPDATE sessions SET is_revoked = 1 WHERE id = ?').bind(id)
        );
        await env.DB.batch(cleanupBatches);
      }

      return jsonResponse({
        success: true,
        data: { sessions: deduplicatedSessions },
        timestamp: Date.now(),
      });
    }

    // -----------------------------------------------------------------------
    // POST /api/sessions/revoke-others: Revoke all other sessions for user
    // -----------------------------------------------------------------------
    if (request.method === 'POST' && (path === '/api/sessions/revoke-others' || path === '/api/v1/sessions/revoke-others')) {
      const userId = request.headers.get('X-User-Id');
      if (!userId) {
        return errorResponse('UNAUTHORIZED', 'Cabecera X-User-Id requerida', 401);
      }

      const sessionToken = request.headers.get('X-Session-Token');
      if (!sessionToken) {
        return errorResponse('MISSING_SESSION_TOKEN', 'Cabecera X-Session-Token requerida para revocar otras sesiones', 400);
      }

      const sessionError = await checkSessionValidity(request, env, userId);
      if (sessionError) return sessionError;

      const currentHash = await hashToken(sessionToken);
      const currentSession = await env.DB.prepare(
        'SELECT id FROM sessions WHERE (token_hash = ? OR prev_token_hash = ?) AND user_id = ? AND is_revoked = 0'
      )
        .bind(currentHash, currentHash, userId)
        .first<{ id: string }>();

      if (!currentSession) {
        return errorResponse('SESSION_REVOKED', 'Sesión inválida', 401);
      }

      await env.DB.batch([
        env.DB.prepare(
          'UPDATE sessions SET is_revoked = 1 WHERE user_id = ? AND id != ? AND is_revoked = 0'
        ).bind(userId, currentSession.id),
        env.DB.prepare(
          `INSERT INTO audit_logs (user_id, event_type, metadata, created_at)
           VALUES (?, 'REVOKE_OTHER_SESSIONS', ?, unixepoch())`
        ).bind(userId, JSON.stringify({ current_token_hash_prefix: currentHash.slice(0, 8) })),
      ]);

      return jsonResponse({
        success: true,
        data: { message: 'Todas las demás sesiones han sido revocadas exitosamente' },
        timestamp: Date.now(),
      });
    }

    // -----------------------------------------------------------------------
    // DELETE /api/sessions/:id: Remote revocation of individual session
    // -----------------------------------------------------------------------
    const sessionMatch = path.match(/^\/api(?:\/v1)?\/sessions\/([^/]+)$/);
    if (request.method === 'DELETE' && sessionMatch) {
      const targetSessionId = decodeURIComponent(sessionMatch[1]);
      const userId = request.headers.get('X-User-Id');
      if (!userId) {
        return errorResponse('UNAUTHORIZED', 'Cabecera X-User-Id requerida', 401);
      }

      const sessionError = await checkSessionValidity(request, env, userId);
      if (sessionError) return sessionError;

      const sessionItem = await env.DB.prepare(
        'SELECT device_name FROM sessions WHERE id = ? AND user_id = ?'
      )
        .bind(targetSessionId, userId)
        .first<{ device_name?: string }>();

      const resolvedDevice = sessionItem?.device_name || parseDeviceName(request.headers.get('User-Agent'));

      await env.DB.batch([
        env.DB.prepare(
          'UPDATE sessions SET is_revoked = 1 WHERE id = ? AND user_id = ?'
        ).bind(targetSessionId, userId),
        env.DB.prepare(
          `INSERT INTO audit_logs (user_id, event_type, device_name, metadata, created_at)
           VALUES (?, 'SESSION_REVOKED', ?, ?, unixepoch())`
        ).bind(userId, resolvedDevice, JSON.stringify({ revoked_session_id: targetSessionId, device_name: resolvedDevice })),
      ]);

      return jsonResponse({
        success: true,
        data: { revoked_session_id: targetSessionId },
        timestamp: Date.now(),
      });
    }

    // -----------------------------------------------------------------------
    // PATCH /api/sessions/:id: Rename device / session
    // -----------------------------------------------------------------------
    if ((request.method === 'PATCH' || request.method === 'PUT') && sessionMatch) {
      const targetSessionId = decodeURIComponent(sessionMatch[1]);
      const userId = request.headers.get('X-User-Id');
      if (!userId) {
        return errorResponse('UNAUTHORIZED', 'Cabecera X-User-Id requerida', 401);
      }

      const sessionError = await checkSessionValidity(request, env, userId);
      if (sessionError) return sessionError;

      let body: UpdateSessionRequestBody;
      try {
        body = (await request.json()) as UpdateSessionRequestBody;
      } catch {
        return errorResponse('INVALID_JSON_BODY', 'El cuerpo de la solicitud no es un JSON válido', 400);
      }

      const newDeviceName = body.device_name?.trim();
      if (!newDeviceName) {
        return errorResponse('MISSING_DEVICE_NAME', 'El campo device_name es obligatorio', 400);
      }

      const existingSession = await env.DB.prepare(
        'SELECT id, device_name FROM sessions WHERE id = ? AND user_id = ? AND is_revoked = 0'
      )
        .bind(targetSessionId, userId)
        .first<{ id: string; device_name: string }>();

      if (!existingSession) {
        return errorResponse('SESSION_NOT_FOUND', 'La sesión especificada no existe o fue revocada', 404);
      }

      const previousDeviceName = existingSession.device_name;

      await env.DB.batch([
        env.DB.prepare(
          'UPDATE sessions SET device_name = ? WHERE id = ? AND user_id = ?'
        ).bind(newDeviceName, targetSessionId, userId),
        env.DB.prepare(
          `INSERT INTO audit_logs (user_id, event_type, device_name, metadata, created_at)
           VALUES (?, 'DEVICE_RENAMED', ?, ?, unixepoch())`
        ).bind(
          userId,
          newDeviceName,
          JSON.stringify({
            session_id: targetSessionId,
            previous_name: previousDeviceName,
            new_name: newDeviceName,
          })
        ),
      ]);

      return jsonResponse({
        success: true,
        data: {
          session_id: targetSessionId,
          device_name: newDeviceName,
        },
        timestamp: Date.now(),
      });
    }

    // -----------------------------------------------------------------------
    // GET /api/passkeys: List enrolled passkeys for user
    // -----------------------------------------------------------------------
    if (request.method === 'GET' && (path === '/api/passkeys' || path === '/api/v1/passkeys')) {
      const userId = request.headers.get('X-User-Id');
      if (!userId) {
        return errorResponse('UNAUTHORIZED', 'Cabecera X-User-Id requerida', 401);
      }

      const sessionError = await checkSessionValidity(request, env, userId);
      if (sessionError) return sessionError;

      const { results } = await env.DB.prepare(
        `SELECT id, user_id, name, device_name, created_at, last_used_at, is_revoked
         FROM passkeys 
         WHERE user_id = ? AND is_revoked = 0 
         ORDER BY created_at DESC`
      )
        .bind(userId)
        .all<PasskeyRecord>();

      const passkeysList = (results || []).slice();

      // Auto-migration fallback: Check if user has a primary passkey registered in `users`
      // table that has not yet been populated in the `passkeys` table.
      const user = await env.DB.prepare('SELECT passkey_credential_id FROM users WHERE id = ?')
        .bind(userId)
        .first<{ passkey_credential_id: string | null }>();

      if (user?.passkey_credential_id) {
        const alreadyInList = passkeysList.some((p) => p.id === user.passkey_credential_id);
        if (!alreadyInList) {
          const revoked = await env.DB.prepare('SELECT id FROM passkeys WHERE id = ? AND is_revoked = 1')
            .bind(user.passkey_credential_id)
            .first();

          if (!revoked) {
            const resolvedDevice = parseDeviceName(request.headers.get('User-Agent'));
            const nowSec = Math.floor(Date.now() / 1000);
            const synthesized: PasskeyRecord = {
              id: user.passkey_credential_id,
              user_id: userId,
              name: 'Windows Hello / Dispositivo Principal',
              device_name: resolvedDevice,
              created_at: nowSec,
              last_used_at: nowSec,
              is_revoked: 0,
            };

            await env.DB.prepare(
              `INSERT OR IGNORE INTO passkeys (id, user_id, name, device_name, created_at, last_used_at, is_revoked)
               VALUES (?, ?, ?, ?, ?, ?, 0)`
            )
              .bind(
                synthesized.id,
                userId,
                synthesized.name,
                synthesized.device_name,
                synthesized.created_at,
                synthesized.last_used_at
              )
              .run();

            passkeysList.unshift(synthesized);
          }
        }
      }

      return jsonResponse({
        success: true,
        data: { passkeys: passkeysList },
        timestamp: Date.now(),
      });
    }

    // -----------------------------------------------------------------------
    // POST /api/passkeys: Enroll new passkey for user (idempotent upsert)
    // -----------------------------------------------------------------------
    if (request.method === 'POST' && (path === '/api/passkeys' || path === '/api/v1/passkeys')) {
      const userId = request.headers.get('X-User-Id');
      if (!userId) {
        return errorResponse('UNAUTHORIZED', 'Cabecera X-User-Id requerida', 401);
      }

      const sessionError = await checkSessionValidity(request, env, userId);
      if (sessionError) return sessionError;

      let body: RegisterPasskeyRequestBody;
      try {
        body = (await request.json()) as RegisterPasskeyRequestBody;
      } catch {
        return errorResponse('INVALID_JSON_BODY', 'El cuerpo de la solicitud no es un JSON válido', 400);
      }

      const { credential_id, name, device_name } = body;
      if (!credential_id || !name) {
        return errorResponse('MISSING_REQUIRED_FIELDS', 'Los campos credential_id y name son obligatorios', 400);
      }

      const resolvedDeviceName = device_name || parseDeviceName(request.headers.get('User-Agent'));

      const existingRecord = await env.DB.prepare(
        'SELECT name FROM passkeys WHERE id = ? AND user_id = ? AND is_revoked = 0'
      )
        .bind(credential_id, userId)
        .first<{ name?: string }>();

      const finalName = existingRecord?.name ? existingRecord.name : name.trim();

      const batchStatements = [
        env.DB.prepare(
          `INSERT INTO passkeys (id, user_id, name, device_name, created_at, is_revoked)
           VALUES (?, ?, ?, ?, unixepoch(), 0)
           ON CONFLICT(id) DO UPDATE SET 
             is_revoked = 0, 
             name = CASE WHEN passkeys.name IS NOT NULL AND passkeys.name != '' THEN passkeys.name ELSE excluded.name END, 
             last_used_at = unixepoch()`
        ).bind(credential_id, userId, finalName, resolvedDeviceName),
        env.DB.prepare(
          'UPDATE users SET passkey_credential_id = ? WHERE id = ?'
        ).bind(credential_id, userId),
      ];

      if (!existingRecord) {
        batchStatements.push(
          env.DB.prepare(
            `INSERT INTO audit_logs (user_id, event_type, device_name, ip_country, metadata, created_at)
             VALUES (?, 'PASSKEY_ADDED', ?, ?, ?, unixepoch())`
          ).bind(
            userId,
            resolvedDeviceName,
            getIpCountry(request) || null,
            JSON.stringify({ passkey_id: credential_id, name: finalName })
          )
        );
      }

      await env.DB.batch(batchStatements);

      return jsonResponse(
        {
          success: true,
          data: {
            passkey: {
              id: credential_id,
              user_id: userId,
              name: finalName,
              device_name: resolvedDeviceName,
              created_at: Math.floor(Date.now() / 1000),
            },
          },
          timestamp: Date.now(),
        },
        201
      );
    }

    // -----------------------------------------------------------------------
    // DELETE /api/passkeys/:id: Remote revocation of individual passkey
    // -----------------------------------------------------------------------
    const passkeyMatch = path.match(/^\/api(?:\/v1)?\/passkeys\/([^/]+)$/);
    if (request.method === 'DELETE' && passkeyMatch) {
      const targetPasskeyId = decodeURIComponent(passkeyMatch[1]);
      const userId = request.headers.get('X-User-Id');
      if (!userId) {
        return errorResponse('UNAUTHORIZED', 'Cabecera X-User-Id requerida', 401);
      }

      const sessionError = await checkSessionValidity(request, env, userId);
      if (sessionError) return sessionError;

      const existing = await env.DB.prepare(
        'SELECT name, device_name FROM passkeys WHERE id = ? AND user_id = ?'
      )
        .bind(targetPasskeyId, userId)
        .first<{ name?: string; device_name?: string }>();

      const resolvedDevice = existing?.device_name || parseDeviceName(request.headers.get('User-Agent'));

      await env.DB.batch([
        env.DB.prepare(
          'UPDATE passkeys SET is_revoked = 1 WHERE id = ? AND user_id = ?'
        ).bind(targetPasskeyId, userId),
        env.DB.prepare(
          'UPDATE users SET passkey_credential_id = NULL WHERE id = ? AND passkey_credential_id = ?'
        ).bind(userId, targetPasskeyId),
        env.DB.prepare(
          `INSERT INTO audit_logs (user_id, event_type, device_name, metadata, created_at)
           VALUES (?, 'PASSKEY_REVOKED', ?, ?, unixepoch())`
        ).bind(userId, resolvedDevice, JSON.stringify({ revoked_passkey_id: targetPasskeyId, name: existing?.name })),
      ]);

      return jsonResponse({
        success: true,
        data: { revoked_passkey_id: targetPasskeyId },
        timestamp: Date.now(),
      });
    }

    // -----------------------------------------------------------------------
    // PATCH /api/passkeys/:id: Rename passkey
    // -----------------------------------------------------------------------
    if ((request.method === 'PATCH' || request.method === 'PUT') && passkeyMatch) {
      const targetPasskeyId = decodeURIComponent(passkeyMatch[1]);
      const userId = request.headers.get('X-User-Id');
      if (!userId) {
        return errorResponse('UNAUTHORIZED', 'Cabecera X-User-Id requerida', 401);
      }

      const sessionError = await checkSessionValidity(request, env, userId);
      if (sessionError) return sessionError;

      let body: UpdatePasskeyRequestBody;
      try {
        body = (await request.json()) as UpdatePasskeyRequestBody;
      } catch {
        return errorResponse('INVALID_JSON_BODY', 'El cuerpo de la solicitud no es un JSON válido', 400);
      }

      const newPasskeyName = body.name?.trim();
      if (!newPasskeyName) {
        return errorResponse('MISSING_PASSKEY_NAME', 'El campo name es obligatorio', 400);
      }

      const existingPasskey = await env.DB.prepare(
        'SELECT id, name, device_name FROM passkeys WHERE id = ? AND user_id = ? AND is_revoked = 0'
      )
        .bind(targetPasskeyId, userId)
        .first<{ id: string; name: string; device_name?: string }>();

      if (!existingPasskey) {
        return errorResponse('PASSKEY_NOT_FOUND', 'La passkey especificada no existe o fue revocada', 404);
      }

      const previousName = existingPasskey.name;

      let callerDeviceName: string | undefined;
      const sessionToken = request.headers.get('X-Session-Token');
      if (sessionToken) {
        const tokenHash = await hashToken(sessionToken);
        const cur = await env.DB.prepare('SELECT device_name FROM sessions WHERE (token_hash = ? OR prev_token_hash = ?)')
          .bind(tokenHash, tokenHash)
          .first<{ device_name: string }>();
        if (cur?.device_name) callerDeviceName = cur.device_name;
      }

      const deviceName = callerDeviceName || existingPasskey.device_name || parseDeviceName(request.headers.get('User-Agent'));

      await env.DB.batch([
        env.DB.prepare(
          'UPDATE passkeys SET name = ? WHERE id = ? AND user_id = ?'
        ).bind(newPasskeyName, targetPasskeyId, userId),
        env.DB.prepare(
          `INSERT INTO audit_logs (user_id, event_type, device_name, metadata, created_at)
           VALUES (?, 'PASSKEY_RENAMED', ?, ?, unixepoch())`
        ).bind(
          userId,
          deviceName,
          JSON.stringify({
            passkey_id: targetPasskeyId,
            previous_name: previousName,
            new_name: newPasskeyName,
          })
        ),
      ]);

      return jsonResponse({
        success: true,
        data: {
          passkey_id: targetPasskeyId,
          name: newPasskeyName,
        },
        timestamp: Date.now(),
      });
    }

    // -----------------------------------------------------------------------
    // GET /api/audit: Retrieve security event audit logs
    // -----------------------------------------------------------------------
    if (request.method === 'GET' && (path === '/api/audit' || path === '/api/v1/audit')) {
      const userId = request.headers.get('X-User-Id');
      if (!userId) {
        return errorResponse('UNAUTHORIZED', 'Cabecera X-User-Id requerida', 401);
      }

      const sessionError = await checkSessionValidity(request, env, userId);
      if (sessionError) return sessionError;

      const { results } = await env.DB.prepare(
        `SELECT id, user_id, event_type, device_name, ip_country, metadata, created_at
         FROM audit_logs 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT 50`
      )
        .bind(userId)
        .all<AuditLogRecord>();

      return jsonResponse({
        success: true,
        data: { audit_logs: results || [] },
        timestamp: Date.now(),
      });
    }

    // -----------------------------------------------------------------------
    // GET /api/vault: Retrieve current encrypted vault blob
    // -----------------------------------------------------------------------
    if (request.method === 'GET' && (path === '/api/vault' || path === '/api/v1/vault')) {
      const userId = request.headers.get('X-User-Id') || url.searchParams.get('user_id');

      if (!userId) {
        return errorResponse('UNAUTHORIZED', 'Cabecera X-User-Id requerida', 401);
      }

      const sessionError = await checkSessionValidity(request, env, userId);
      if (sessionError) return sessionError;

      // FIX-04 (v1.3.1): Sliding session token rotation on sync
      const newSessionToken = await rotateSessionOnRequest(request, env, userId);

      const vault = await env.DB.prepare(
        'SELECT user_id, encrypted_blob, iv, version, updated_at FROM vaults WHERE user_id = ?'
      )
        .bind(userId)
        .first<{
          user_id: string;
          encrypted_blob: string;
          iv: string;
          version: number;
          updated_at: number;
        }>();

      if (!vault) {
        return errorResponse('VAULT_NOT_FOUND', 'Bóveda no encontrada para este usuario', 404, undefined, env);
      }

      // ETag and HTTP 304 Not Modified support
      const ifNoneMatch = request.headers.get('If-None-Match');
      const etag = `"v${vault.version}"`;

      if (ifNoneMatch === etag || ifNoneMatch === String(vault.version)) {
        const headers = new Headers({
          ...getSecurityHeaders(env),
          ETag: etag,
        });
        if (newSessionToken) {
          headers.set('X-New-Session-Token', newSessionToken);
        }
        return new Response(null, {
          status: 304,
          headers,
        });
      }

      const extraHeaders: Record<string, string> = { ETag: etag };
      if (newSessionToken) {
        extraHeaders['X-New-Session-Token'] = newSessionToken;
      }

      return jsonResponse(
        {
          success: true,
          data: {
            user_id: vault.user_id,
            encrypted_blob: vault.encrypted_blob,
            iv: vault.iv,
            version: vault.version,
            updated_at: vault.updated_at,
          },
          timestamp: Date.now(),
        },
        200,
        extraHeaders,
        env
      );
    }

    // -----------------------------------------------------------------------
    // PUT /api/vault: Update vault with optimistic concurrency control
    // -----------------------------------------------------------------------
    if (request.method === 'PUT' && (path === '/api/vault' || path === '/api/v1/vault')) {
      const userId = request.headers.get('X-User-Id');

      if (!userId) {
        return errorResponse('UNAUTHORIZED', 'Cabecera X-User-Id requerida', 401, undefined, env);
      }

      const sessionError = await checkSessionValidity(request, env, userId);
      if (sessionError) return sessionError;

      // FIX-04 (v1.3.1): Sliding session token rotation on sync
      const newSessionToken = await rotateSessionOnRequest(request, env, userId);

      let body: VaultUpdateRequestBody;
      try {
        body = (await request.json()) as VaultUpdateRequestBody;
      } catch {
        return errorResponse('INVALID_JSON_BODY', 'El cuerpo de la solicitud no es un JSON válido', 400, undefined, env);
      }

      const { encrypted_blob, iv, version } = body;

      if (!encrypted_blob || !iv || typeof version !== 'number') {
        return errorResponse(
          'MISSING_REQUIRED_FIELDS',
          'Los campos encrypted_blob, iv y version (numérico) son requeridos',
          400,
          undefined,
          env
        );
      }

      // Fetch current server version
      const current = await env.DB.prepare('SELECT version FROM vaults WHERE user_id = ?')
        .bind(userId)
        .first<{ version: number }>();

      if (!current) {
        return errorResponse('VAULT_NOT_FOUND', 'Bóveda no encontrada', 404, undefined, env);
      }

      // STRICT OPTIMISTIC CONCURRENCY CONTROL:
      // The incoming version MUST be exactly current.version + 1
      if (version !== current.version + 1) {
        return errorResponse(
          'VAULT_VERSION_CONFLICT',
          `Conflicto de sincronización: la versión enviada (${version}) no es consecutiva a la versión del servidor (${current.version}).`,
          409,
          {
            server_version: current.version,
            client_version: version,
          },
          env
        );
      }

      const resolvedDeviceName = parseDeviceName(request.headers.get('User-Agent'));

      // Update vault and append sync log and audit log entries
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE vaults 
           SET encrypted_blob = ?, iv = ?, version = ?, updated_at = unixepoch() 
           WHERE user_id = ? AND version = ?`
        ).bind(encrypted_blob, iv, version, userId, current.version),
        env.DB.prepare(
          `INSERT INTO sync_logs (user_id, action, client_version, server_version, created_at) 
           VALUES (?, 'SYNC_PUSH', ?, ?, unixepoch())`
        ).bind(userId, version, version),
        env.DB.prepare(
          `INSERT INTO audit_logs (user_id, event_type, device_name, metadata, created_at)
           VALUES (?, 'VAULT_SYNC', ?, ?, unixepoch())`
        ).bind(userId, resolvedDeviceName, JSON.stringify({ version })),
      ]);

      const extraHeaders: Record<string, string> = {};
      if (newSessionToken) {
        extraHeaders['X-New-Session-Token'] = newSessionToken;
      }

      return jsonResponse({
        success: true,
        data: {
          user_id: userId,
          version,
          updated_at: Math.floor(Date.now() / 1000),
        },
        timestamp: Date.now(),
      }, 200, extraHeaders, env);
    }

    // Endpoint not found
    return errorResponse('ENDPOINT_NOT_FOUND', `Ruta de API no encontrada: ${request.method} ${path}`, 404);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return errorResponse('INTERNAL_SERVER_ERROR', message, 500);
  }
}
