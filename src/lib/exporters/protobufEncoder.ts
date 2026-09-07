/**
 * Pure TypeScript Protocol Buffers Encoder for Google Authenticator Migration Payloads.
 * Schema:
 *   message MigrationPayload {
 *     repeated OtpParameters otp_parameters = 1;
 *     int32 version = 2;
 *     int32 batch_size = 3;
 *     int32 batch_index = 4;
 *     int32 batch_id = 5;
 *   }
 */
import { decodeBase32 } from '../crypto/base32';
import type { VaultItem } from '../../types/vault';

/**
 * Encodes a 32-bit unsigned integer into a Protobuf varint byte sequence.
 */
export function encodeVarint(val: number): Uint8Array {
  const bytes: number[] = [];
  let v = Math.floor(Math.max(0, val));
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  bytes.push(v & 0x7f);
  return new Uint8Array(bytes);
}

/**
 * Concatenates multiple Uint8Arrays into a single contiguous Uint8Array.
 */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, curr) => acc + curr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function encodeTag(fieldNumber: number, wireType: number): Uint8Array {
  return encodeVarint((fieldNumber << 3) | wireType);
}

function encodeLengthDelimited(fieldNumber: number, data: Uint8Array): Uint8Array {
  const tag = encodeTag(fieldNumber, 2);
  const len = encodeVarint(data.length);
  return concatUint8Arrays([tag, len, data]);
}

function encodeVarintField(fieldNumber: number, val: number): Uint8Array {
  const tag = encodeTag(fieldNumber, 0);
  const v = encodeVarint(val);
  return concatUint8Arrays([tag, v]);
}

/**
 * Encodes a single VaultItem into an OtpParameters Protobuf message.
 */
export function encodeOtpParameters(item: VaultItem): Uint8Array {
  const textEncoder = new TextEncoder();
  const fields: Uint8Array[] = [];

  // Field 1: secret (raw bytes decoded from Base32)
  const secretBytes = decodeBase32(item.secret);
  fields.push(encodeLengthDelimited(1, secretBytes));

  // Field 2: name (account identifier in Google Auth)
  const fullName = item.account || item.issuer || 'Cuenta';
  fields.push(encodeLengthDelimited(2, textEncoder.encode(fullName)));

  // Field 3: issuer
  if (item.issuer) {
    fields.push(encodeLengthDelimited(3, textEncoder.encode(item.issuer)));
  }

  // Field 4: algorithm (1=SHA1, 2=SHA256, 3=SHA512)
  let algoVal = 1;
  const algoStr = (item.algorithm as string) || 'SHA1';
  if (algoStr === 'SHA256') algoVal = 2;
  else if (algoStr === 'SHA512') algoVal = 3;
  fields.push(encodeVarintField(4, algoVal));

  // Field 5: digits (1=6, 2=8)
  const digitsVal = item.digits === 8 ? 2 : 1;
  fields.push(encodeVarintField(5, digitsVal));

  // Field 6: type (1=HOTP, 2=TOTP)
  fields.push(encodeVarintField(6, 2));

  return concatUint8Arrays(fields);
}

/**
 * Cross-environment Uint8Array to Base64 converter.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Encodes a list of accounts into a complete Google Authenticator migration URI:
 * `otpauth-migration://offline?data=<base64>`
 */
export function encodeMigrationPayload(
  accounts: VaultItem[],
  batchIndex: number = 0,
  batchSize: number = 1,
  batchId?: number
): string {
  const fields: Uint8Array[] = [];

  // Field 1: repeated OtpParameters
  for (const account of accounts) {
    try {
      const paramBytes = encodeOtpParameters(account);
      fields.push(encodeLengthDelimited(1, paramBytes));
    } catch {
      // Skip invalid items with corrupted secrets
    }
  }

  // Field 2: version = 1
  fields.push(encodeVarintField(2, 1));

  // Field 3: batch_size
  fields.push(encodeVarintField(3, batchSize));

  // Field 4: batch_index
  fields.push(encodeVarintField(4, batchIndex));

  // Field 5: batch_id
  const assignedBatchId = batchId !== undefined ? batchId : Math.floor(Math.random() * 1000000);
  fields.push(encodeVarintField(5, assignedBatchId));

  const payloadBytes = concatUint8Arrays(fields);
  const base64 = uint8ArrayToBase64(payloadBytes);

  return `otpauth-migration://offline?data=${encodeURIComponent(base64)}`;
}

/**
 * Partitions vault accounts into readable batches for QR code rendering.
 * By default, 7 accounts per QR yields a low-density QR code that any smartphone camera
 * can focus and read in milliseconds.
 */
export function chunkAccountsForMigration(
  accounts: VaultItem[],
  maxPerBatch: number = 7
): VaultItem[][] {
  if (accounts.length === 0) return [];
  const chunks: VaultItem[][] = [];
  for (let i = 0; i < accounts.length; i += maxPerBatch) {
    chunks.push(accounts.slice(i, i + maxPerBatch));
  }
  return chunks;
}

/**
 * Generates a standard universal `otpauth://` URI for a single vault account.
 */
export function buildOtpAuthUri(item: VaultItem): string {
  const issuerPart = item.issuer ? encodeURIComponent(item.issuer) : '';
  const accountPart = encodeURIComponent(item.account);
  const label = issuerPart ? `${issuerPart}:${accountPart}` : accountPart;

  const params = new URLSearchParams();
  params.set('secret', item.secret.replace(/\s+/g, '').toUpperCase());

  if (item.issuer) {
    params.set('issuer', item.issuer);
  }
  if (item.algorithm && item.algorithm !== 'SHA1') {
    params.set('algorithm', item.algorithm);
  }
  if (item.digits && item.digits !== 6) {
    params.set('digits', item.digits.toString());
  }
  if (item.period && item.period !== 30) {
    params.set('period', item.period.toString());
  }

  return `otpauth://totp/${label}?${params.toString()}`;
}
