// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { describe, bench } from 'vitest';
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

describe('MLS crypto performance', () => {
  const keyId = { epoch: 100, leafIndex: 42 };

  bench('encodeKeyId', () => {
    encodeKeyId(keyId);
  });

  bench('decodeKeyId', () => {
    const encoded = encodeKeyId(keyId);
    decodeKeyId(encoded);
  });

  bench('serializeMlsObject', () => {
    const payload = new Uint8Array(128);
    serializeMlsObject(MlsMessageType.Commit, payload);
  });

  bench('deserializeMlsObject', () => {
    const payload = new Uint8Array(128);
    const serialized = serializeMlsObject(MlsMessageType.Commit, payload);
    deserializeMlsObject(serialized);
  });
});

describe('MLS crypto async performance', () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));

  bench('deriveTrackKey', async () => {
    await deriveTrackKey(secret, 'chat-track');
  });

  bench('computeKeepAliveMac', async () => {
    const key = await deriveTrackKey(secret, 'keepalive');
    await computeKeepAliveMac(key.key, 42);
  });

  bench('verifyKeepAliveMac', async () => {
    const key = await deriveTrackKey(secret, 'keepalive');
    const mac = await computeKeepAliveMac(key.key, 42);
    await verifyKeepAliveMac(key.key, 42, mac);
  });

  bench('encrypt + decrypt roundtrip', async () => {
    const key = await deriveTrackKey(secret, 'msg-track');
    const plaintext = new Uint8Array(256);
    const ct = await encryptObject(key, plaintext, 1);
    await decryptObject(key, ct, 1);
  });
});
