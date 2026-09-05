/**
 * Revolt Pass - Types for Cloudflare Worker & D1
 */

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  ENVIRONMENT?: string;
  APP_NAME?: string;
  APP_DOMAIN?: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiErrorPayload;
  timestamp: number;
}

export interface RegisterRequestBody {
  username: string;
  kdf_salt: string;
  encrypted_blob: string;
  iv: string;
  passkey_credential_id?: string;
}

export interface VaultUpdateRequestBody {
  encrypted_blob: string;
  iv: string;
  version: number;
}

export interface SessionItem {
  id: string;
  user_id: string;
  device_name: string;
  user_agent?: string;
  ip_country?: string;
  last_active_at: number;
  created_at: number;
  expires_at: number;
  is_revoked: number;
  is_current?: boolean;
}

export interface PasskeyRecord {
  id: string;
  user_id: string;
  name: string;
  device_name?: string;
  created_at: number;
  last_used_at?: number;
  is_revoked: number;
}

export interface AuditLogRecord {
  id: number;
  user_id: string;
  event_type: string;
  device_name?: string;
  ip_country?: string;
  metadata?: string;
  created_at: number;
}

export interface CreateSessionRequestBody {
  device_name?: string;
  session_token?: string;
  passkey_id?: string;
}

export interface RegisterPasskeyRequestBody {
  credential_id: string;
  name: string;
  device_name?: string;
}

export interface UpdateSessionRequestBody {
  device_name: string;
}

export interface UpdatePasskeyRequestBody {
  name: string;
}

