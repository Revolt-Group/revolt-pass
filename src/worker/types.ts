/**
 * Revolt Pass - Types for Cloudflare Worker & D1
 */

/**
 * Cloudflare Workers Rate Limiter binding.
 * Configured via [[unsafe.bindings]] in wrangler.toml.
 * Optional so the Worker degrades gracefully in dev environments.
 */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  ENVIRONMENT?: string;
  APP_NAME?: string;
  APP_DOMAIN?: string;
  /** FIX-02 (v1.3.1): Cloudflare native rate limiter — optional, degrades gracefully if absent. */
  RATE_LIMITER?: RateLimiter;
  /** v1.5: Push & Email alert configurations */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  SEND_EMAIL?: {
    send: (message: { from: string; to: string; subject: string; content: string }) => Promise<void>;
  };
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

export type KdfAlgorithm = 'pbkdf2' | 'argon2id';

export interface RegisterRequestBody {
  username: string;
  kdf_salt: string;
  kdf_algorithm?: KdfAlgorithm;
  encrypted_blob: string;
  iv: string;
  passkey_credential_id?: string;
  device_name?: string;
}

export interface UpgradeKdfRequestBody {
  kdf_salt: string;
  kdf_algorithm: KdfAlgorithm;
  encrypted_blob: string;
  iv: string;
}

export interface PushSubscriptionRequestBody {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string;
}

export interface UserNotificationSettingsRecord {
  user_id: string;
  push_enabled: number;
  email_enabled: number;
  email_provider: 'resend' | 'cloudflare';
  resend_api_key?: string | null;
  resend_from_email?: string | null;
  destination_email?: string | null;
  notify_new_country: number;
  notify_new_session: number;
  notify_passkey_added: number;
  notify_session_revoked: number;
  updated_at: number;
}

export interface UpdateNotificationSettingsRequestBody {
  push_enabled?: boolean;
  email_enabled?: boolean;
  email_provider?: 'resend' | 'cloudflare';
  resend_api_key?: string;
  resend_from_email?: string;
  destination_email?: string;
  notify_new_country?: boolean;
  notify_new_session?: boolean;
  notify_passkey_added?: boolean;
  notify_session_revoked?: boolean;
}

export interface TestEmailRequestBody {
  provider?: 'resend' | 'cloudflare';
  resend_api_key?: string;
  resend_from_email?: string;
  destination_email: string;
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

