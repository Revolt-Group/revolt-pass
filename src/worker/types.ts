/**
 * Revolt Pass - Tipos para Cloudflare Worker y D1
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
