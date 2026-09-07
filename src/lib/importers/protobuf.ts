/**
 * Zero-dependency Protobuf decoder tailored for Google Authenticator Migration payloads.
 * Format: otpauth-migration://offline?data=<base64-encoded-protobuf>
 */
import { encodeBase32 } from '../crypto/base32';
import type { ImportedAccount } from './types';

export function decodeMigrationProtobuf(bytes: Uint8Array): ImportedAccount[] {
  let offset = 0;
  const accounts: ImportedAccount[] = [];

  function readVarint(): number {
    let result = 0;
    let shift = 0;
    while (offset < bytes.length) {
      const byte = bytes[offset++];
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) break; // prevent overflow
    }
    return result;
  }

  function skipField(wireType: number): void {
    if (wireType === 0) {
      readVarint();
    } else if (wireType === 1) {
      offset += 8;
    } else if (wireType === 2) {
      const len = readVarint();
      offset += len;
    } else if (wireType === 5) {
      offset += 4;
    }
  }

  function parseOtpParameters(paramBytes: Uint8Array): ImportedAccount | null {
    let pOffset = 0;
    let secretBytes: Uint8Array | null = null;
    let name = '';
    let issuer = '';
    let algorithm: 'SHA1' | 'SHA256' | 'SHA512' = 'SHA1';
    let digits = 6;
    let type: 'totp' | 'hotp' = 'totp';
    let counter: number | undefined = undefined;

    function pReadVarint(): number {
      let result = 0;
      let shift = 0;
      while (pOffset < paramBytes.length) {
        const byte = paramBytes[pOffset++];
        result |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
        if (shift > 35) break;
      }
      return result;
    }

    while (pOffset < paramBytes.length) {
      const tag = pReadVarint();
      const fieldNum = tag >>> 3;
      const wireType = tag & 0x07;

      if (fieldNum === 1 && wireType === 2) {
        // secret (raw bytes)
        const len = pReadVarint();
        secretBytes = paramBytes.slice(pOffset, pOffset + len);
        pOffset += len;
      } else if (fieldNum === 2 && wireType === 2) {
        // name
        const len = pReadVarint();
        name = new TextDecoder().decode(paramBytes.slice(pOffset, pOffset + len));
        pOffset += len;
      } else if (fieldNum === 3 && wireType === 2) {
        // issuer
        const len = pReadVarint();
        issuer = new TextDecoder().decode(paramBytes.slice(pOffset, pOffset + len));
        pOffset += len;
      } else if (fieldNum === 4 && wireType === 0) {
        // algorithm: 1=SHA1, 2=SHA256, 3=SHA512
        const val = pReadVarint();
        if (val === 2) algorithm = 'SHA256';
        else if (val === 3) algorithm = 'SHA512';
        else algorithm = 'SHA1';
      } else if (fieldNum === 5 && wireType === 0) {
        // digits: 1=6, 2=8
        const val = pReadVarint();
        digits = val === 2 ? 8 : 6;
      } else if (fieldNum === 6 && wireType === 0) {
        // type: 1=HOTP, 2=TOTP
        const val = pReadVarint();
        type = val === 1 ? 'hotp' : 'totp';
      } else if (fieldNum === 7 && wireType === 0) {
        // counter
        counter = pReadVarint();
      } else {
        // skip unknown field
        if (wireType === 0) pReadVarint();
        else if (wireType === 1) pOffset += 8;
        else if (wireType === 2) {
          const len = pReadVarint();
          pOffset += len;
        } else if (wireType === 5) pOffset += 4;
        else break;
      }
    }

    if (!secretBytes || secretBytes.length === 0) {
      return null;
    }

    const secretBase32 = encodeBase32(secretBytes);

    // If issuer is empty, Google Auth often formats name as "Issuer:Account"
    if (!issuer && name.includes(':')) {
      const parts = name.split(':');
      issuer = parts[0].trim();
      name = parts.slice(1).join(':').trim();
    }

    return {
      name: name || 'Cuenta Importada',
      issuer: issuer || 'Google Authenticator',
      secret: secretBase32,
      type,
      algorithm,
      digits,
      period: 30,
      counter,
      platform: 'google_auth',
    };
  }

  while (offset < bytes.length) {
    const tag = readVarint();
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    if (fieldNum === 1 && wireType === 2) {
      // repeated OtpParameters
      const len = readVarint();
      const paramBytes = bytes.slice(offset, offset + len);
      offset += len;
      const parsed = parseOtpParameters(paramBytes);
      if (parsed) {
        accounts.push(parsed);
      }
    } else {
      skipField(wireType);
    }
  }

  return accounts;
}
