/**
 * Módulo de Autenticación WebAuthn FIDO2 / Platform Authenticator.
 * Soporta Windows Hello (PIN / Biometría en PC) y sensores biométricos en móviles (Touch ID, Face ID, Huella).
 * Permite el desbloqueo rápido seguro mediante envoltura local de la Master Key.
 */

import { bytesToBase64, base64ToBytes, generateIv } from './vault.ts';

export interface WebAuthnSupportStatus {
  isSupported: boolean;
  hasPlatformAuthenticator: boolean;
}

/**
 * Comprueba si el entorno soporta WebAuthn y autenticador de plataforma (Windows Hello / Biometría).
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
 * Enrola el dispositivo actual utilizando el autenticador de plataforma del sistema operativo.
 * En Windows solicita el PIN de Windows Hello; en smartphones solicita huella o Face ID.
 */
export async function registerPlatformPasskey(
  userId: string,
  username: string
): Promise<RegisterPasskeyResult> {
  const support = await checkWebAuthnSupport();
  if (!support.isSupported || !support.hasPlatformAuthenticator) {
    throw new Error('El autenticador de plataforma (Windows Hello / Biometría) no está disponible en este dispositivo.');
  }

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const userIdBytes = new TextEncoder().encode(userId);

  // Opciones estándar WebAuthn Level 3
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
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // Fuerza autenticador local de hardware
      userVerification: 'required', // Fuerza PIN de Windows Hello o biometría
      residentKey: 'preferred',
    },
    timeout: 60000,
    attestation: 'none',
  };

  const credential = (await navigator.credentials.create({
    publicKey: creationOptions,
  })) as PublicKeyCredential;

  if (!credential) {
    throw new Error('No se pudo registrar la credencial de plataforma');
  }

  const rawIdBytes = new Uint8Array(credential.rawId);
  const rawIdBase64 = bytesToBase64(rawIdBytes);

  return {
    credentialId: credential.id,
    rawId: rawIdBase64,
  };
}

/**
 * Ejecuta una aserción de WebAuthn solicitando el PIN de Windows Hello o biometría.
 * 
 * @param credentialIdBase64 ID de la credencial registrada previamente en Base64
 * @returns boolean indicando si la verificación de hardware fue exitosa
 */
export async function verifyPlatformPasskey(credentialIdBase64: string): Promise<boolean> {
  const support = await checkWebAuthnSupport();
  if (!support.isSupported || !support.hasPlatformAuthenticator) {
    throw new Error('El autenticador de plataforma no está disponible.');
  }

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const credentialIdBytes = base64ToBytes(credentialIdBase64);

  const requestOptions: PublicKeyCredentialRequestOptions = {
    challenge: challenge as unknown as ArrayBuffer,
    rpId: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
    allowCredentials: [
      {
        id: credentialIdBytes as unknown as ArrayBuffer,
        type: 'public-key',
        transports: ['internal'],
      },
    ],
    userVerification: 'required',
    timeout: 60000,
  };

  const assertion = (await navigator.credentials.get({
    publicKey: requestOptions,
  })) as PublicKeyCredential;

  return assertion !== null;
}

export interface WrappedKeyPackage {
  wrappedKey: string; // Base64 del ciphertext de la clave de envoltura
  iv: string; // Base64 del IV de envoltura
  deviceSalt: string; // Base64 del salt local del dispositivo
}

/**
 * Envuelve localmente la MasterKey para habilitar el Desbloqueo Rápido.
 * 
 * @param masterKey CryptoKey derivada de la Master Password
 * @param deviceBindingToken Token derivado o ID de la credencial de plataforma
 * @returns Paquete de clave envuelta apto para persistir en IndexedDB
 */
export async function wrapMasterKey(
  masterKey: CryptoKey,
  deviceBindingToken: string
): Promise<WrappedKeyPackage> {
  const deviceSalt = new Uint8Array(16);
  crypto.getRandomValues(deviceSalt);

  // Derivar una clave simétrica local de envoltura vinculada a la credencial
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

  // Envolver la MasterKey exportándola de forma cifrada bajo AES-GCM
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
 * Desenvuelve la MasterKey una vez completada la aserción de Windows Hello / Biometría.
 * 
 * @param wrappedPackage Paquete almacenado en IndexedDB
 * @param deviceBindingToken Token de vinculación de hardware
 * @returns CryptoKey lista para usar en RAM
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
