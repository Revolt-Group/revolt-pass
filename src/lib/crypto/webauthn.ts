/**
 * WebAuthn FIDO2 / Platform Authenticator Authentication Module.
 * Supports Windows Hello (PIN / Biometrics on PC) and mobile biometric sensors (Touch ID, Face ID, Fingerprint).
 * Enables fast secure unlocking via local wrapping of the Master Key.
 */

import { bytesToBase64, base64ToBytes, generateIv } from './vault.ts';

export interface WebAuthnSupportStatus {
  isSupported: boolean;
  hasPlatformAuthenticator: boolean;
}

/**
 * Checks whether the environment supports WebAuthn and platform authenticators (Windows Hello / Biometrics).
 */
export async function checkWebAuthnSupport(): Promise<WebAuthnSupportStatus> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return { isSupported: false, hasPlatformAuthenticator: false };
  }

  try {
    const hasPlatform = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return {
      isSupported: true,
      hasPlatformAuthenticator: hasPlatform,
    };
  } catch {
    return { isSupported: true, hasPlatformAuthenticator: false };
  }
}

export interface RegisterPasskeyResult {
  credentialId: string; // Base64URL
  rawId: string; // Base64
}

/**
 * Registers a WebAuthn credential (Passkey or YubiKey/FIDO2 Roaming Key).
 * 
 * @param userId Unique user identifier
 * @param username Human-readable account label
 * @param attachment 'platform' for device biometrics/Windows Hello, or 'cross-platform' for physical security keys (YubiKey, etc.)
 * @returns Object with Base64URL credential ID and raw ID
 */
export async function registerPasskey(
  userId: string,
  username: string,
  attachment: 'platform' | 'cross-platform' = 'platform'
): Promise<{ credentialId: string; rawId: string }> {
  const support = await checkWebAuthnSupport();
  if (!support.isSupported) {
    throw new Error('WebAuthn is not supported in this browser environment.');
  }

  if (attachment === 'platform' && !support.hasPlatformAuthenticator) {
    throw new Error('Platform authenticator is not available on this device.');
  }

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const userIdBytes = new TextEncoder().encode(userId);

  // Standard WebAuthn Level 3 options
  const creationOptions: PublicKeyCredentialCreationOptions = {
    challenge: challenge as unknown as ArrayBuffer,
    rp: {
      name: 'Revolt Pass',
      id: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
    },
    user: {
      id: userIdBytes as unknown as ArrayBuffer,
      name: username,
      displayName: username,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' }, // ES256 (NIST P-256)
      { alg: -257, type: 'public-key' }, // RS256
      { alg: -8, type: 'public-key' }, // Ed25519 / EdDSA
    ],
    authenticatorSelection: {
      authenticatorAttachment: attachment,
      userVerification: attachment === 'cross-platform' ? 'preferred' : 'required',
      residentKey: 'preferred',
    },
    timeout: 60000,
    attestation: 'none',
  };

  const credential = (await navigator.credentials.create({
    publicKey: creationOptions,
  })) as PublicKeyCredential;

  if (!credential) {
    throw new Error('Failed to register credential');
  }

  const rawIdBytes = new Uint8Array(credential.rawId);
  const rawIdBase64 = bytesToBase64(rawIdBytes);

  return {
    credentialId: credential.id,
    rawId: rawIdBase64,
  };
}

/**
 * Backward compatibility alias for platform passkeys (Windows Hello, Touch ID).
 */
export const registerPlatformPasskey = (userId: string, username: string) =>
  registerPasskey(userId, username, 'platform');

/**
 * Safely converts Base64 or Base64URL strings into Uint8Array.
 */
function safeBase64ToBytes(input: string): Uint8Array {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return base64ToBytes(base64);
}

/**
 * Performs a WebAuthn assertion requesting Windows Hello PIN, biometrics, or YubiKey touch.
 * 
 * @param credentialId Pre-registered credential ID (Base64 or Base64URL)
 * @returns boolean indicating whether hardware verification succeeded
 */
export async function verifyPlatformPasskey(credentialId: string): Promise<boolean> {
  const support = await checkWebAuthnSupport();
  if (!support.isSupported) {
    throw new Error('WebAuthn is not supported in this browser.');
  }

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const credentialIdBytes = safeBase64ToBytes(credentialId);

  const requestOptions: PublicKeyCredentialRequestOptions = {
    challenge: challenge as unknown as ArrayBuffer,
    rpId: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
    allowCredentials: [
      {
        id: credentialIdBytes as unknown as ArrayBuffer,
        type: 'public-key',
        transports: ['internal', 'usb', 'nfc', 'ble'],
      },
    ],
    userVerification: 'preferred',
    timeout: 60000,
  };

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: requestOptions,
    })) as PublicKeyCredential;

    return assertion !== null;
  } catch (err: unknown) {
    // Handle user cancellation (AbortError or NotAllowedError) cleanly
    if (err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
      return false;
    }
    throw err;
  }
}

export interface WrappedKeyPackage {
  wrappedKey: string; // Base64 ciphertext of wrapped key
  iv: string; // Base64 wrapping IV
  deviceSalt: string; // Base64 local device salt
}

/**
 * Locally wraps the MasterKey to enable Fast Unlock.
 * 
 * @param masterKey CryptoKey derived from Master Password
 * @param deviceBindingToken Derived token or platform credential ID
 * @returns Wrapped key package suitable for IndexedDB persistence
 */
export async function wrapMasterKey(
  masterKey: CryptoKey,
  deviceBindingToken: string
): Promise<WrappedKeyPackage> {
  const deviceSalt = new Uint8Array(16);
  crypto.getRandomValues(deviceSalt);

  // Derive local symmetric wrapping key bound to the credential
  const tokenEncoder = new TextEncoder();
  const tokenKey = await crypto.subtle.importKey(
    'raw',
    tokenEncoder.encode(deviceBindingToken) as unknown as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const wrappingKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: deviceSalt as unknown as ArrayBuffer,
      iterations: 50000,
      hash: 'SHA-256',
    },
    tokenKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey']
  );

  const iv = generateIv();

  // Wrap MasterKey by exporting it encrypted under AES-GCM
  const wrappedBuffer = await crypto.subtle.wrapKey(
    'raw',
    masterKey,
    wrappingKey,
    {
      name: 'AES-GCM',
      iv: iv as unknown as ArrayBuffer,
      tagLength: 128,
    }
  );

  return {
    wrappedKey: bytesToBase64(new Uint8Array(wrappedBuffer)),
    iv: bytesToBase64(iv),
    deviceSalt: bytesToBase64(deviceSalt),
  };
}

/**
 * Unwraps the MasterKey once Windows Hello / Biometric assertion succeeds.
 * 
 * @param wrappedPackage Package stored in IndexedDB
 * @param deviceBindingToken Hardware binding token
 * @returns CryptoKey ready for in-memory use
 */
export async function unwrapMasterKey(
  wrappedPackage: WrappedKeyPackage,
  deviceBindingToken: string,
  extractable = true
): Promise<CryptoKey> {
  const tokenEncoder = new TextEncoder();
  const tokenKey = await crypto.subtle.importKey(
    'raw',
    tokenEncoder.encode(deviceBindingToken) as unknown as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const deviceSaltBytes = base64ToBytes(wrappedPackage.deviceSalt);
  const ivBytes = base64ToBytes(wrappedPackage.iv);
  const wrappedKeyBytes = base64ToBytes(wrappedPackage.wrappedKey);

  const unwrappingKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: deviceSaltBytes as unknown as ArrayBuffer,
      iterations: 50000,
      hash: 'SHA-256',
    },
    tokenKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['unwrapKey']
  );

  const masterKey = await crypto.subtle.unwrapKey(
    'raw',
    wrappedKeyBytes as unknown as ArrayBuffer,
    unwrappingKey,
    {
      name: 'AES-GCM',
      iv: ivBytes as unknown as ArrayBuffer,
      tagLength: 128,
    },
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );

  return masterKey;
}
