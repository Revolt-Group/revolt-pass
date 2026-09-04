/**
 * Enrutador de API REST Zero-Knowledge para Cloudflare Workers / Pages Functions.
 * Implementa seguridad estricta, manejo de errores homogéneo y control de concurrencia optimista.
 */

import type {
  Env,
  ApiResponse,
  RegisterRequestBody,
  VaultUpdateRequestBody,
} from './types.ts';

const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, If-None-Match',
};

/**
 * Genera una respuesta JSON con las cabeceras de seguridad incorporadas.
 */
export function jsonResponse<T>(
  data: ApiResponse<T>,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

/**
 * Genera una respuesta de error estandarizada.
 */
export function errorResponse(
  code: string,
  message: string,
  status = 400,
  details?: unknown
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
    status
  );
}

/**
 * Manejador principal de peticiones de la API REST.
 */
export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  // Manejo de preflight CORS (OPTIONS)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: new Headers(SECURITY_HEADERS),
    });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // -----------------------------------------------------------------------
    // GET /api/time: Sincronización de reloj para Time Drift Compensation
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
        { 'Cache-Control': 'no-store' }
      );
    }

    // -----------------------------------------------------------------------
    // POST /api/auth/register: Registro atómico inicial de usuario y bóveda
    // -----------------------------------------------------------------------
    if (request.method === 'POST' && (path === '/api/auth/register' || path === '/api/v1/auth/register')) {
      let body: RegisterRequestBody;
      try {
        body = (await request.json()) as RegisterRequestBody;
      } catch {
        return errorResponse('INVALID_JSON_BODY', 'El cuerpo de la solicitud no es un JSON válido', 400);
      }

      const { username, kdf_salt, encrypted_blob, iv, passkey_credential_id } = body;

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

      // 1. Verificar si el usuario ya existe (NOCASE)
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

      // 2. Generar UUID de usuario canónico
      const userId = `usr_${crypto.randomUUID()}`;

      // 3. Insertar atómicamente usuario y bóveda versión 1 en Cloudflare D1
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO users (id, username, kdf_salt, passkey_credential_id, created_at, updated_at) 
           VALUES (?, ?, ?, ?, unixepoch(), unixepoch())`
        ).bind(userId, cleanUsername, kdf_salt, passkey_credential_id || null),
        env.DB.prepare(
          `INSERT INTO vaults (user_id, encrypted_blob, iv, version, updated_at) 
           VALUES (?, ?, ?, 1, unixepoch())`
        ).bind(userId, encrypted_blob, iv),
        env.DB.prepare(
          `INSERT INTO sync_logs (user_id, action, client_version, server_version, created_at) 
           VALUES (?, 'REGISTER', 1, 1, unixepoch())`
        ).bind(userId),
      ]);

      return jsonResponse(
        {
          success: true,
          data: {
            user_id: userId,
            version: 1,
            updated_at: Math.floor(Date.now() / 1000),
          },
          timestamp: Date.now(),
        },
        201
      );
    }

    // -----------------------------------------------------------------------
    // GET /api/auth/salt: Obtener el kdf_salt para derivación de clave en cliente
    // -----------------------------------------------------------------------
    if (request.method === 'GET' && (path === '/api/auth/salt' || path === '/api/v1/auth/salt')) {
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
    // GET /api/vault: Obtener el blob cifrado actual de la bóveda
    // -----------------------------------------------------------------------
    if (request.method === 'GET' && (path === '/api/vault' || path === '/api/v1/vault')) {
      const userId = request.headers.get('X-User-Id') || url.searchParams.get('user_id');

      if (!userId) {
        return errorResponse('UNAUTHORIZED', 'Cabecera X-User-Id requerida', 401);
      }

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
        return errorResponse('VAULT_NOT_FOUND', 'Bóveda no encontrada para este usuario', 404);
      }

      // Soporte para ETag y HTTP 304 Not Modified
      const ifNoneMatch = request.headers.get('If-None-Match');
      const etag = `"v${vault.version}"`;

      if (ifNoneMatch === etag || ifNoneMatch === String(vault.version)) {
        return new Response(null, {
          status: 304,
          headers: new Headers({
            ...SECURITY_HEADERS,
            ETag: etag,
          }),
        });
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
        { ETag: etag }
      );
    }

    // -----------------------------------------------------------------------
    // PUT /api/vault: Actualización de la bóveda con concurrencia optimista
    // -----------------------------------------------------------------------
    if (request.method === 'PUT' && (path === '/api/vault' || path === '/api/v1/vault')) {
      const userId = request.headers.get('X-User-Id');

      if (!userId) {
        return errorResponse('UNAUTHORIZED', 'Cabecera X-User-Id requerida', 401);
      }

      let body: VaultUpdateRequestBody;
      try {
        body = (await request.json()) as VaultUpdateRequestBody;
      } catch {
        return errorResponse('INVALID_JSON_BODY', 'El cuerpo de la solicitud no es un JSON válido', 400);
      }

      const { encrypted_blob, iv, version } = body;

      if (!encrypted_blob || !iv || typeof version !== 'number') {
        return errorResponse(
          'MISSING_REQUIRED_FIELDS',
          'Los campos encrypted_blob, iv y version (numérico) son requeridos',
          400
        );
      }

      // Obtener versión actual en el servidor
      const current = await env.DB.prepare('SELECT version FROM vaults WHERE user_id = ?')
        .bind(userId)
        .first<{ version: number }>();

      if (!current) {
        return errorResponse('VAULT_NOT_FOUND', 'Bóveda no encontrada', 404);
      }

      // CONTROL DE CONCURRENCIA OPTIMISTA ESTRICTO:
      // La versión entrante DEBE ser exactamente current.version + 1
      if (version !== current.version + 1) {
        return errorResponse(
          'VAULT_VERSION_CONFLICT',
          `Conflicto de sincronización: la versión enviada (${version}) no es consecutiva a la versión del servidor (${current.version}).`,
          409,
          {
            server_version: current.version,
            client_version: version,
          }
        );
      }

      // Actualizar la bóveda e insertar registro en auditoría
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
      ]);

      return jsonResponse({
        success: true,
        data: {
          user_id: userId,
          version,
          updated_at: Math.floor(Date.now() / 1000),
        },
        timestamp: Date.now(),
      });
    }

    // Ruta no encontrada en la API
    return errorResponse('ENDPOINT_NOT_FOUND', `Ruta de API no encontrada: ${request.method} ${path}`, 404);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return errorResponse('INTERNAL_SERVER_ERROR', message, 500);
  }
}
