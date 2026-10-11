// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { Encoder, Decoder } from 'cbor-x';
import type { MochaMessage, PresenceEntry, TypingIndicator, Receipt, Reaction, RosterEvent, ModerationEvent, DirectoryEntry } from './types.js';

const cborEncoder = new Encoder({ mapsAsObjects: true });
const cborDecoder = new Decoder({ mapsAsObjects: true });
const textDecoder = new TextDecoder();

export type MochaPayload = MochaMessage | PresenceEntry | TypingIndicator | Receipt | Reaction | RosterEvent | ModerationEvent | DirectoryEntry | DirectoryEntry[] | (Reaction & { _type: string });

export function encode(payload: MochaPayload): Uint8Array {
  return cborEncoder.encode(payload);
}

export function decode<T = MochaPayload>(data: Uint8Array): T {
  try {
    return cborDecoder.decode(data) as T;
  } catch {
    // Fallback: try JSON for backward compat with older peers
    return JSON.parse(textDecoder.decode(data)) as T;
  }
}
