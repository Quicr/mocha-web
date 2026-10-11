// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { describe, it, expect } from 'vitest';
import { encode, decode } from '../src/codec.js';
import type { MochaMessage, PresenceEntry, TypingIndicator, Reaction, RosterEvent } from '../src/types.js';

describe('CBOR codec', () => {
  it('round-trips a MochaMessage', () => {
    const msg: MochaMessage = {
      id: { group: 1, object: 0 },
      sender: { userId: 'alice', displayName: 'Alice' },
      timestamp: 1700000000000,
      content: { type: 'text/plain', body: 'hello world' },
    };

    const encoded = encode(msg);
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decode<MochaMessage>(encoded);
    expect(decoded.id.group).toBe(1);
    expect(decoded.id.object).toBe(0);
    expect(decoded.sender.userId).toBe('alice');
    expect(decoded.content.body).toBe('hello world');
    expect(decoded.content.type).toBe('text/plain');
  });

  it('round-trips a PresenceEntry', () => {
    const entry: PresenceEntry = {
      userId: 'bob',
      displayName: 'Bob',
      status: 'online',
      statusMessage: 'Working',
      lastSeen: 1700000000000,
    };

    const decoded = decode<PresenceEntry>(encode(entry));
    expect(decoded.userId).toBe('bob');
    expect(decoded.status).toBe('online');
    expect(decoded.statusMessage).toBe('Working');
  });

  it('round-trips a TypingIndicator', () => {
    const indicator: TypingIndicator = {
      userId: 'charlie',
      displayName: 'Charlie',
      timestamp: 1700000000000,
    };

    const decoded = decode<TypingIndicator>(encode(indicator));
    expect(decoded.userId).toBe('charlie');
    expect(decoded.displayName).toBe('Charlie');
  });

  it('round-trips a Reaction', () => {
    const reaction: Reaction = {
      userId: 'dave',
      displayName: 'Dave',
      messageId: { group: 5, object: 3 },
      emoji: '👍',
      timestamp: 1700000000000,
    };

    const decoded = decode<Reaction>(encode(reaction));
    expect(decoded.emoji).toBe('👍');
    expect(decoded.messageId.group).toBe(5);
    expect(decoded.messageId.object).toBe(3);
  });

  it('round-trips a RosterEvent', () => {
    const event: RosterEvent = {
      userId: 'eve',
      displayName: 'Eve',
      action: 'join',
      role: 'member',
      timestamp: 1700000000000,
    };

    const decoded = decode<RosterEvent>(encode(event));
    expect(decoded.action).toBe('join');
    expect(decoded.role).toBe('member');
  });

  it('handles message with optional fields', () => {
    const msg: MochaMessage = {
      id: { group: 2, object: 1 },
      sender: { userId: 'frank', displayName: 'Frank' },
      timestamp: 1700000000000,
      content: { type: 'text/markdown', body: '**bold**' },
      replyTo: { group: 1, object: 0 },
      mentions: ['alice', 'bob'],
      draft: true,
      extensions: { custom: 'data' },
    };

    const decoded = decode<MochaMessage>(encode(msg));
    expect(decoded.replyTo?.group).toBe(1);
    expect(decoded.mentions).toEqual(['alice', 'bob']);
    expect(decoded.draft).toBe(true);
    expect(decoded.extensions?.custom).toBe('data');
  });

  it('falls back to JSON for non-CBOR data', () => {
    const jsonMsg = { userId: 'test', status: 'online' };
    const jsonBytes = new TextEncoder().encode(JSON.stringify(jsonMsg));

    const decoded = decode<{ userId: string; status: string }>(jsonBytes);
    expect(decoded.userId).toBe('test');
    expect(decoded.status).toBe('online');
  });

  it('handles empty string content', () => {
    const msg: MochaMessage = {
      id: { group: 0, object: 0 },
      sender: { userId: 'x', displayName: 'X' },
      timestamp: 0,
      content: { type: 'application/x-mocha-deleted', body: '' },
    };

    const decoded = decode<MochaMessage>(encode(msg));
    expect(decoded.content.body).toBe('');
    expect(decoded.content.type).toBe('application/x-mocha-deleted');
  });

  it('handles array of DirectoryEntry', () => {
    const entries = [
      { name: 'general', visibility: 'public' as const, memberCount: 42 },
      { name: 'private-room', visibility: 'private' as const },
    ];

    const decoded = decode<typeof entries>(encode(entries));
    expect(decoded).toHaveLength(2);
    expect(decoded[0].name).toBe('general');
    expect(decoded[0].memberCount).toBe(42);
    expect(decoded[1].visibility).toBe('private');
  });
});
