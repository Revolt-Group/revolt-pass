/**
 * Revolt Pass - Native Web Push Module (RFC 8291 & RFC 8292)
 * 
 * Zero-Knowledge, Zero-Cost Push Notifications for Web and PWA.
 * Implements VAPID ES256 signing and AES-128-GCM payload encryption
 * purely via native Web Crypto API (no heavy Node dependencies).
 */

import type { Env } from './types.ts';

export interface VapidKeys {
  publicKey: string;  // Base64URL encoded uncompressed P-256 point (65 bytes)
  privateKey: string; // Base64URL encoded PKCS#8 private key
}

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string; // Client public key (Base64URL)
  auth: string;   // Client auth secret (Base64URL)
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  eventType?: string;
  timestamp?: number;
}

// =====================================================================
// Base64URL Utilities
// =====================================================================

export function uint8ArrayToBase64Url(buffer: Uint8Array): string {
  let binary = '';
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// =====================================================================
// VAPID Keypair Management (Persistent in D1 app_settings)
// =====================================================================

const VAPID_SETTINGS_KEY = 'vapid_keys';

export async function getOrCreateVapidKeys(env: Env): Promise<VapidKeys> {
  // 1. Check environment variables first
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    };
  }

  // 2. Check D1 app_settings
  const stored = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?')
    .bind(VAPID_SETTINGS_KEY)
    .first<{ value: string }>();

  if (stored?.value) {
    try {
      const parsed = JSON.parse(stored.value) as VapidKeys;
      if (parsed.publicKey && parsed.privateKey) {
        return parsed;
      }
    } catch {
      // Malformed, will regenerate
    }
  }

  // 3. Generate new ECDSA P-256 keypair
  const keyPair = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;

  const rawPublicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const pkcs8PrivateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  const newKeys: VapidKeys = {
    publicKey: uint8ArrayToBase64Url(new Uint8Array(rawPublicKey)),
    privateKey: uint8ArrayToBase64Url(new Uint8Array(pkcs8PrivateKey)),
  };

  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`
  )
    .bind(VAPID_SETTINGS_KEY, JSON.stringify(newKeys))
    .run();

  return newKeys;
}

// =====================================================================
// VAPID JWT Signing (RFC 8292)
// =====================================================================

export async function generateVapidJwt(
  audience: string,
  subject: string,
  privateKeyBase64Url: string
): Promise<string> {
  const header = {
    typ: 'JWT',
    alg: 'ES256',
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 3600, // 12 hours
    sub: subject,
  };

  const enc = new TextEncoder();
  const headerB64 = uint8ArrayToBase64Url(enc.encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64Url(enc.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const privateKeyBytes = base64UrlToUint8Array(privateKeyBase64Url);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes as unknown as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    enc.encode(unsignedToken)
  );

  const signatureB64 = uint8ArrayToBase64Url(new Uint8Array(signature));
  return `${unsignedToken}.${signatureB64}`;
}

// =====================================================================
// RFC 8291 Web Push Payload Encryption (AES-128-GCM)
// =====================================================================

async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, data as unknown as ArrayBuffer);
  return new Uint8Array(sig);
}

export async function encryptPushPayload(
  payloadText: string,
  clientP256dhBase64Url: string,
  clientAuthBase64Url: string
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const clientPublicKeyBytes = base64UrlToUint8Array(clientP256dhBase64Url);
  const authSecretBytes = base64UrlToUint8Array(clientAuthBase64Url);

  // 1. Generate local ephemeral ECDH keypair
  const localKeyPair = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )) as CryptoKeyPair;

  const localPublicKeyBuffer = await crypto.subtle.exportKey('raw', localKeyPair.publicKey);
  const localPublicKeyBytes = new Uint8Array(localPublicKeyBuffer);

  // 2. Import client public key and derive shared ECDH secret
  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKeyBytes as unknown as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  const sharedSecretBuffer = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey },
    localKeyPair.privateKey,
    256
  );
  const sharedSecretBytes = new Uint8Array(sharedSecretBuffer);

  // 3. RFC 8291 Key Derivation
  // auth_info = "WebPush: info\0" + clientPublicKey + localPublicKey
  const webPushInfoPrefix = enc.encode('WebPush: info\0');
  const authInfo = new Uint8Array(
    webPushInfoPrefix.length + clientPublicKeyBytes.length + localPublicKeyBytes.length
  );
  authInfo.set(webPushInfoPrefix, 0);
  authInfo.set(clientPublicKeyBytes, webPushInfoPrefix.length);
  authInfo.set(localPublicKeyBytes, webPushInfoPrefix.length + clientPublicKeyBytes.length);

  // IKM = HMAC-SHA256(auth_secret, shared_secret) followed by HKDF-Expand with authInfo
  const prk1 = await hmacSha256(authSecretBytes, sharedSecretBytes);
  const authInfoWithCounter = new Uint8Array(authInfo.length + 1);
  authInfoWithCounter.set(authInfo, 0);
  authInfoWithCounter[authInfo.length] = 1;
  const ikm = await hmacSha256(prk1, authInfoWithCounter);

  // Salt (16 random bytes)
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  // PRK = HMAC-SHA256(salt, IKM)
  const prkContent = await hmacSha256(salt, ikm);

  // CEK = HKDF-Expand(PRK, "Content-Encoding: aes128gcm\0", 16)
  const cekInfo = enc.encode('Content-Encoding: aes128gcm\0\x01');
  const cekFull = await hmacSha256(prkContent, cekInfo);
  const cek = cekFull.slice(0, 16);

  // Nonce = HKDF-Expand(PRK, "Content-Encoding: nonce\0", 12)
  const nonceInfo = enc.encode('Content-Encoding: nonce\0\x01');
  const nonceFull = await hmacSha256(prkContent, nonceInfo);
  const nonce = nonceFull.slice(0, 12);

  // 4. Encrypt payload: payload + delimiter 0x02
  const payloadBytes = enc.encode(payloadText);
  const recordPlaintext = new Uint8Array(payloadBytes.length + 1);
  recordPlaintext.set(payloadBytes, 0);
  recordPlaintext[payloadBytes.length] = 0x02; // Single record delimiter

  const aesKey = await crypto.subtle.importKey('raw', cek as unknown as ArrayBuffer, 'AES-GCM', false, ['encrypt']);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as unknown as ArrayBuffer, tagLength: 128 },
    aesKey,
    recordPlaintext as unknown as ArrayBuffer
  );
  const ciphertextBytes = new Uint8Array(ciphertextBuffer);

  // 5. Construct RFC 8291 body:
  // salt (16 bytes) + recordSize (4 bytes: 4096 = 0x00 0x00 0x10 0x00) + idlen (1 byte = 65) + localPublicKey (65 bytes) + ciphertext
  const recordSize = 4096;
  const headerSize = 16 + 4 + 1 + 65;
  const body = new Uint8Array(headerSize + ciphertextBytes.length);

  body.set(salt, 0);
  body[16] = (recordSize >> 24) & 0xff;
  body[17] = (recordSize >> 16) & 0xff;
  body[18] = (recordSize >> 8) & 0xff;
  body[19] = recordSize & 0xff;
  body[20] = 65; // local public key length
  body.set(localPublicKeyBytes, 21);
  body.set(ciphertextBytes, headerSize);

  return body;
}

// =====================================================================
// Send Web Push Notification Dispatcher
// =====================================================================

export async function sendWebPushNotification(
  env: Env,
  subscription: PushSubscriptionData,
  payload: PushPayload
): Promise<{ success: boolean; status: number; expired?: boolean; error?: string }> {
  try {
    const vapidKeys = await getOrCreateVapidKeys(env);
    const endpointUrl = new URL(subscription.endpoint);
    const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
    const subject = env.VAPID_SUBJECT || 'mailto:security@revoltgroup.com.ar';

    const jwt = await generateVapidJwt(audience, subject, vapidKeys.privateKey);
    const bodyEncrypted = await encryptPushPayload(
      JSON.stringify(payload),
      subscription.p256dh,
      subscription.auth
    );

    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        TTL: '86400',
        Authorization: `vapid t=${jwt}, k=${vapidKeys.publicKey}`,
      },
      body: bodyEncrypted as unknown as BodyInit,
    });

    if (res.status === 201 || res.status === 200 || res.status === 204) {
      return { success: true, status: res.status };
    }

    if (res.status === 404 || res.status === 410) {
      // Subscription has expired or user revoked browser permission
      return { success: false, status: res.status, expired: true };
    }

    const errText = await res.text();
    return {
      success: false,
      status: res.status,
      error: `Push service rejected notification: ${res.status} ${errText}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error sending web push';
    return { success: false, status: 500, error: msg };
  }
}
