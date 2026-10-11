// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { describe, it, expect } from 'vitest';
import {
  encodeKeyId,
  decodeKeyId,
  deriveTrackKey,
  computeKeepAliveMac,
  verifyKeepAliveMac,
  serializeMlsObject,
  deserializeMlsObject,
  encryptObject,
  decryptObject,
  MlsMessageType,
} from '../src/index.js';

describe('KeyId encoding', () => {
  it('encodes epoch and leafIndex into 8 bytes', () => {
    const kid = { epoch: 42, leafIndex: 7 };
    const encoded = encodeKeyId(kid);
    expect(encoded.length).toBe(8);

    const decoded = decodeKeyId(encoded);
    expect(decoded.epoch).toBe(42);
    expect(decoded.leafIndex).toBe(7);
  });

  it('handles large epoch values', () => {
    const kid = { epoch: 1_000_000, leafIndex: 16_777_215 };
    const encoded = encodeKeyId(kid);
    const decoded = decodeKeyId(encoded);
    expect(decoded.epoch).toBe(1_000_000);
    expect(decoded.leafIndex).toBe(16_777_215);
  });

  it('handles zero values', () => {
    const kid = { epoch: 0, leafIndex: 0 };
    const encoded = encodeKeyId(kid);
    const decoded = decodeKeyId(encoded);
    expect(decoded.epoch).toBe(0);
    expect(decoded.leafIndex).toBe(0);
  });

  it('rejects short input', () => {
    expect(() => decodeKeyId(new Uint8Array(4))).toThrow('KeyId must be 8 bytes');
  });
});

describe('Track key derivation', () => {
  it('derives deterministic keys from same secret and track name', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));

    const result1 = await deriveTrackKey(secret, 'msg_v1_alice');
    const result2 = await deriveTrackKey(secret, 'msg_v1_alice');

    expect(result1.key).toEqual(result2.key);
    expect(result1.nonce).toEqual(result2.nonce);
  });

  it('derives different keys for different track names', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));

    const result1 = await deriveTrackKey(secret, 'msg_v1_alice');
    const result2 = await deriveTrackKey(secret, 'msg_v1_bob');

    expect(result1.key).not.toEqual(result2.key);
    expect(result1.nonce).not.toEqual(result2.nonce);
  });

  it('derives different keys for different secrets', async () => {
    const secret1 = crypto.getRandomValues(new Uint8Array(32));
    const secret2 = crypto.getRandomValues(new Uint8Array(32));

    const result1 = await deriveTrackKey(secret1, 'msg_v1_alice');
    const result2 = await deriveTrackKey(secret2, 'msg_v1_alice');

    expect(result1.key).not.toEqual(result2.key);
  });

  it('produces correct key and nonce lengths', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const result = await deriveTrackKey(secret, 'test', 16, 12);

    expect(result.key.length).toBe(16);
    expect(result.nonce.length).toBe(12);
  });

  it('supports custom key lengths', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const result = await deriveTrackKey(secret, 'test', 32, 12);

    expect(result.key.length).toBe(32);
  });
});

describe('Keep-alive MAC', () => {
  it('computes and verifies a valid MAC', async () => {
    const confirmationKey = crypto.getRandomValues(new Uint8Array(32));
    const nonce = crypto.getRandomValues(new Uint8Array(16));
    const epoch = 5;
    const timestamp = BigInt(Date.now());

    const mac = await computeKeepAliveMac(confirmationKey, epoch, timestamp, nonce);
    expect(mac.length).toBe(32); // SHA-256 output

    const valid = await verifyKeepAliveMac(confirmationKey, { epoch, timestamp, nonce, mac });
    expect(valid).toBe(true);
  });

  it('rejects tampered MAC', async () => {
    const confirmationKey = crypto.getRandomValues(new Uint8Array(32));
    const nonce = crypto.getRandomValues(new Uint8Array(16));
    const epoch = 5;
    const timestamp = BigInt(Date.now());

    const mac = await computeKeepAliveMac(confirmationKey, epoch, timestamp, nonce);
    mac[0] ^= 0xFF; // tamper

    const valid = await verifyKeepAliveMac(confirmationKey, { epoch, timestamp, nonce, mac });
    expect(valid).toBe(false);
  });

  it('rejects wrong key', async () => {
    const key1 = crypto.getRandomValues(new Uint8Array(32));
    const key2 = crypto.getRandomValues(new Uint8Array(32));
    const nonce = crypto.getRandomValues(new Uint8Array(16));
    const epoch = 1;
    const timestamp = BigInt(Date.now());

    const mac = await computeKeepAliveMac(key1, epoch, timestamp, nonce);
    const valid = await verifyKeepAliveMac(key2, { epoch, timestamp, nonce, mac });
    expect(valid).toBe(false);
  });
});

describe('MLS object serialization', () => {
  it('serializes and deserializes Proposal', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const obj = serializeMlsObject(MlsMessageType.Proposal, payload);

    expect(obj[0]).toBe(MlsMessageType.Proposal);
    expect(obj.length).toBe(6);

    const { type, payload: decoded } = deserializeMlsObject(obj);
    expect(type).toBe(MlsMessageType.Proposal);
    expect(decoded).toEqual(payload);
  });

  it('serializes all message types', () => {
    const payload = new Uint8Array([0xAB, 0xCD]);

    for (const type of [MlsMessageType.Proposal, MlsMessageType.Commit, MlsMessageType.Welcome, MlsMessageType.KeyPackage]) {
      const obj = serializeMlsObject(type, payload);
      const { type: decoded } = deserializeMlsObject(obj);
      expect(decoded).toBe(type);
    }
  });

  it('rejects too-short objects', () => {
    expect(() => deserializeMlsObject(new Uint8Array([0x01]))).toThrow('MLS object too short');
    expect(() => deserializeMlsObject(new Uint8Array([]))).toThrow('MLS object too short');
  });
});

describe('AES-GCM encryption/decryption', () => {
  it('encrypts and decrypts correctly', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const { key, nonce } = await deriveTrackKey(secret, 'test-track');
    const trackKey = { key, nonce, epoch: 1, leafIndex: 0 };

    const plaintext = new TextEncoder().encode('hello secure world');
    const ciphertext = await encryptObject(trackKey, 42, plaintext);

    expect(ciphertext).not.toEqual(plaintext);
    expect(ciphertext.length).toBeGreaterThan(plaintext.length); // includes GCM tag

    const decrypted = await decryptObject(trackKey, 42, ciphertext);
    expect(decrypted).toEqual(plaintext);
  });

  it('different objectIds produce different ciphertext', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const { key, nonce } = await deriveTrackKey(secret, 'test-track');
    const trackKey = { key, nonce, epoch: 1, leafIndex: 0 };

    const plaintext = new TextEncoder().encode('same data');
    const ct1 = await encryptObject(trackKey, 0, plaintext);
    const ct2 = await encryptObject(trackKey, 1, plaintext);

    expect(ct1).not.toEqual(ct2);
  });

  it('fails to decrypt with wrong key', async () => {
    const secret1 = crypto.getRandomValues(new Uint8Array(32));
    const secret2 = crypto.getRandomValues(new Uint8Array(32));
    const { key: key1, nonce: nonce1 } = await deriveTrackKey(secret1, 'track');
    const { key: key2, nonce: nonce2 } = await deriveTrackKey(secret2, 'track');

    const trackKey1 = { key: key1, nonce: nonce1, epoch: 1, leafIndex: 0 };
    const trackKey2 = { key: key2, nonce: nonce2, epoch: 1, leafIndex: 0 };

    const plaintext = new TextEncoder().encode('secret');
    const ciphertext = await encryptObject(trackKey1, 0, plaintext);

    await expect(decryptObject(trackKey2, 0, ciphertext)).rejects.toThrow();
  });

  it('fails to decrypt with wrong objectId', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const { key, nonce } = await deriveTrackKey(secret, 'track');
    const trackKey = { key, nonce, epoch: 1, leafIndex: 0 };

    const plaintext = new TextEncoder().encode('data');
    const ciphertext = await encryptObject(trackKey, 0, plaintext);

    await expect(decryptObject(trackKey, 1, ciphertext)).rejects.toThrow();
  });
});
