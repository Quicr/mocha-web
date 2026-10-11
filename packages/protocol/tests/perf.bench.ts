// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { describe, bench } from 'vitest';
import { encode, decode } from '../src/codec.js';
import { MochaNamespace } from '../src/namespace.js';
import type { MochaMessage, PresenceEntry } from '../src/types.js';

describe('codec performance', () => {
  const smallMsg: MochaMessage = {
    id: { group: 1, object: 0 },
    sender: { userId: 'alice', displayName: 'Alice' },
    timestamp: 1700000000000,
    content: { type: 'text/plain', body: 'hello' },
  };

  const largeMsg: MochaMessage = {
    id: { group: 999999, object: 42 },
    sender: { userId: 'alice', displayName: 'Alice Wonderland' },
    timestamp: 1700000000000,
    content: { type: 'text/markdown', body: '# Title\n\n' + 'Lorem ipsum dolor sit amet. '.repeat(100) },
    replyTo: { group: 1, object: 0 },
    mentions: Array.from({ length: 20 }, (_, i) => `user-${i}`),
    extensions: { custom: 'data', nested: { key: 'value' } },
  };

  const presenceMsg: PresenceEntry = {
    userId: 'bob',
    displayName: 'Bob',
    status: 'online',
    statusMessage: 'Working on MOCHA',
    lastSeen: 1700000000000,
  };

  bench('encode small message', () => {
    encode(smallMsg);
  });

  bench('decode small message', () => {
    const encoded = encode(smallMsg);
    decode(encoded);
  });

  bench('encode/decode roundtrip (small)', () => {
    decode(encode(smallMsg));
  });

  bench('encode large message', () => {
    encode(largeMsg);
  });

  bench('decode large message', () => {
    const encoded = encode(largeMsg);
    decode(encoded);
  });

  bench('encode/decode roundtrip (large)', () => {
    decode(encode(largeMsg));
  });

  bench('encode presence entry', () => {
    encode(presenceMsg);
  });

  bench('encode/decode 100 messages batch', () => {
    for (let i = 0; i < 100; i++) {
      decode(encode({ ...smallMsg, id: { group: i, object: 0 } }));
    }
  });
});

describe('namespace performance', () => {
  const config = {
    provider: 'acme-corp',
    orgId: 'org-12345',
    teamId: 'team-67890',
    channelId: 'general-chat',
  };

  bench('MochaNamespace.forChannel', () => {
    MochaNamespace.forChannel(config, 'hclient-abc123');
  });

  bench('chatMessage track ref', () => {
    const ns = MochaNamespace.forChannel(config, 'hclient-abc123');
    ns.chatMessage('hdev-xyz789');
  });

  bench('parse namespace tuple', () => {
    MochaNamespace.parse(['mocha_v1', 'acme', 'org-1', 'chat', 'team-1', 'general', 'hclient-1']);
  });

  bench('trackType lookup', () => {
    MochaNamespace.trackType('msg_v1_hdev-1');
    MochaNamespace.trackType('availability_v1_hdev-1');
    MochaNamespace.trackType('react_v1_hdev-1');
  });

  bench('publishScope string', () => {
    const ns = MochaNamespace.forChannel(config, 'hclient-abc123');
    ns.publishScope('chat', 'hdev-xyz789');
  });

  bench('all prefixes', () => {
    const ns = MochaNamespace.forChannel(config, 'hclient-abc123');
    ns.chatPrefix();
    ns.rosterPrefix();
    ns.availabilityPrefix();
    ns.reactionsPrefix();
    ns.mlsPrefix();
  });
});
