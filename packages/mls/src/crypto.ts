// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { MlsMessageType, type KeyId, type MlsTrackKey, type KeepAlive } from './types.js';

const TRACK_KEY_LABEL = new TextEncoder().encode('mocha_track');
const TRACK_NONCE_LABEL = new TextEncoder().encode('mocha_nonce');

/**
 * Encode a KeyId as a 64-bit value: (epoch << 24) | leaf_index
 */
export function encodeKeyId(kid: KeyId): Uint8Array {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  const combined = BigInt(kid.epoch) << 24n | BigInt(kid.leafIndex);
  view.setBigUint64(0, combined, false);
  return new Uint8Array(buf);
}

/**
 * Decode a 64-bit KeyId back to epoch and leaf_index.
 */
export function decodeKeyId(data: Uint8Array): KeyId {
  if (data.length < 8) throw new Error('KeyId must be 8 bytes');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const combined = view.getBigUint64(0, false);
  return {
    epoch: Number(combined >> 24n),
    leafIndex: Number(combined & 0xFFFFFFn),
  };
}

/**
 * Derive per-track encryption keys from MLS application secret.
 *
 * track_key  = HKDF-Expand(application_secret, "mocha_track" || track_name, key_length)
 * track_nonce = HKDF-Expand(application_secret, "mocha_nonce" || track_name, nonce_length)
 */
export async function deriveTrackKey(
  applicationSecret: Uint8Array,
  trackName: string,
  keyLength: number = 16,
  nonceLength: number = 12,
): Promise<{ key: Uint8Array; nonce: Uint8Array }> {
  const trackNameBytes = new TextEncoder().encode(trackName);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    applicationSecret,
    'HKDF',
    false,
    ['deriveBits'],
  );

  const keyInfo = concat(TRACK_KEY_LABEL, trackNameBytes);
  const keyBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: keyInfo },
    baseKey,
    keyLength * 8,
  );

  const nonceInfo = concat(TRACK_NONCE_LABEL, trackNameBytes);
  const nonceBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: nonceInfo },
    baseKey,
    nonceLength * 8,
  );

  return {
    key: new Uint8Array(keyBits),
    nonce: new Uint8Array(nonceBits),
  };
}

/**
 * Compute keep-alive MAC per draft:
 * mac = HMAC(confirmation_key, epoch_be64 || ts_be64 || nonce_bytes)
 */
export async function computeKeepAliveMac(
  confirmationKey: Uint8Array,
  epoch: number,
  timestamp: bigint,
  nonce: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    confirmationKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const data = new Uint8Array(16 + nonce.length);
  const view = new DataView(data.buffer);
  view.setBigUint64(0, BigInt(epoch), false);
  view.setBigUint64(8, timestamp, false);
  data.set(nonce, 16);

  const sig = await crypto.subtle.sign('HMAC', key, data);
  return new Uint8Array(sig);
}

/**
 * Verify a keep-alive MAC.
 */
export async function verifyKeepAliveMac(
  confirmationKey: Uint8Array,
  keepAlive: KeepAlive,
): Promise<boolean> {
  const expected = await computeKeepAliveMac(
    confirmationKey,
    keepAlive.epoch,
    keepAlive.timestamp,
    keepAlive.nonce,
  );
  return timingSafeEqual(expected, keepAlive.mac);
}

/**
 * Serialize an MLS message with type prefix.
 */
export function serializeMlsObject(type: MlsMessageType, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + payload.length);
  out[0] = type;
  out.set(payload, 1);
  return out;
}

/**
 * Deserialize an MLS object into type + payload.
 */
export function deserializeMlsObject(data: Uint8Array): { type: MlsMessageType; payload: Uint8Array } {
  if (data.length < 2) throw new Error('MLS object too short');
  return {
    type: data[0] as MlsMessageType,
    payload: data.subarray(1),
  };
}

/**
 * Encrypt data with AES-128-GCM using derived track key.
 */
export async function encryptObject(
  trackKey: MlsTrackKey,
  objectId: number,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    trackKey.key,
    'AES-GCM',
    false,
    ['encrypt'],
  );

  // XOR nonce with objectId for per-object uniqueness
  const iv = xorNonce(trackKey.nonce, objectId);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    plaintext,
  );

  return new Uint8Array(ciphertext);
}

/**
 * Decrypt data with AES-128-GCM using derived track key.
 */
export async function decryptObject(
  trackKey: MlsTrackKey,
  objectId: number,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    trackKey.key,
    'AES-GCM',
    false,
    ['decrypt'],
  );

  const iv = xorNonce(trackKey.nonce, objectId);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    ciphertext,
  );

  return new Uint8Array(plaintext);
}

function xorNonce(nonce: Uint8Array, objectId: number): Uint8Array {
  const iv = new Uint8Array(nonce);
  const view = new DataView(iv.buffer, iv.byteOffset, iv.byteLength);
  // XOR the last 4 bytes with objectId
  const offset = iv.length - 4;
  view.setUint32(offset, view.getUint32(offset, false) ^ objectId, false);
  return iv;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
