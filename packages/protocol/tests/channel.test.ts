// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MochaChannel } from '../src/channel/channel.js';
import type { MochaEvent } from '../src/session/types.js';

/**
 * Mock MOQTSession that records publish/subscribe/sendObject calls.
 */
function createMockSession() {
  let nextAlias = 1n;
  let nextSubId = 1;
  const published: Array<{ namespace: string[]; trackName: string }> = [];
  const sentObjects: Array<{ alias: bigint; data: Uint8Array; groupId: number; objectId: number }> = [];
  const subscribedNamespaces: string[][] = [];
  const callbacks = new Map<string, (event: any) => void>();

  return {
    published,
    sentObjects,
    subscribedNamespaces,
    callbacks,

    async publish(namespace: string[], trackName: string, _opts?: any): Promise<bigint> {
      published.push({ namespace, trackName });
      return nextAlias++;
    },

    async sendObject(alias: bigint, data: Uint8Array, opts: { groupId: number; objectId: number; newGroup?: boolean }): Promise<void> {
      sentObjects.push({ alias, data, groupId: opts.groupId, objectId: opts.objectId });
    },

    async subscribeNamespace(prefix: string[]): Promise<number> {
      subscribedNamespaces.push(prefix);
      return nextSubId++;
    },

    async unsubscribeNamespace(_id: number): Promise<void> {},

    async unpublish(_alias: bigint): Promise<void> {},

    async subscribe(_ns: string[], _tn: string, _filter: any, _cb: any): Promise<number> {
      return nextSubId++;
    },

    on(event: string, handler: (event: any) => void): () => void {
      callbacks.set(event, handler);
      return () => { callbacks.delete(event); };
    },

    setSubscriptionCallback(_subId: number, _cb: any): void {},

    setOwnClientId(_id: string): void {},

    async close(): Promise<void> {},
  };
}

const nsConfig = {
  provider: 'test-provider',
  orgId: 'test-org',
  teamId: 'test-team',
  channelId: 'test-channel',
};

const identity = {
  userId: 'user-1',
  displayName: 'Test User',
};

describe('MochaChannel', () => {
  let session: ReturnType<typeof createMockSession>;
  let events: Array<{ event: MochaEvent; data: unknown }>;
  let channel: MochaChannel;

  beforeEach(() => {
    session = createMockSession();
    events = [];
    channel = new MochaChannel(
      session as any,
      nsConfig,
      'hclient-1',
      'hdev-1',
      identity,
      (event, data) => { events.push({ event, data }); },
    );
  });

  describe('activate', () => {
    it('publishes 5 tracks on activate', async () => {
      await channel.activate();
      expect(session.published).toHaveLength(5);

      const trackNames = session.published.map((p) => p.trackName);
      expect(trackNames).toContain('msg_v1_hdev-1');
      expect(trackNames).toContain('availability_v1_hdev-1');
      expect(trackNames).toContain('typing_v1_hdev-1');
      expect(trackNames).toContain('user_hdev-1');
      expect(trackNames).toContain('react_v1_hdev-1');
    });

    it('subscribes to 4 namespace prefixes', async () => {
      await channel.activate();
      expect(session.subscribedNamespaces).toHaveLength(4);

      const functions = session.subscribedNamespaces.map((ns) => ns[3]);
      expect(functions).toContain('chat');
      expect(functions).toContain('roster');
      expect(functions).toContain('availability');
      expect(functions).toContain('reactions');
    });

    it('sends initial presence and roster join on activate', async () => {
      await channel.activate();
      // Presence (online) + roster (join) = at least 2 objects sent
      expect(session.sentObjects.length).toBeGreaterThanOrEqual(2);
    });

    it('is idempotent', async () => {
      await channel.activate();
      const count = session.published.length;
      await channel.activate();
      expect(session.published.length).toBe(count);
    });
  });

  describe('sendMessage', () => {
    it('sends a text message', async () => {
      await channel.activate();
      const initialCount = session.sentObjects.length;

      const msg = await channel.sendMessage({ type: 'text/plain', body: 'hello' });
      expect(msg.sender.userId).toBe('user-1');
      expect(msg.content.body).toBe('hello');
      expect(msg.draft).toBe(false);
      expect(session.sentObjects.length).toBe(initialCount + 1);
    });

    it('increments message sequence', async () => {
      await channel.activate();
      const before = session.sentObjects.length;

      await channel.sendMessage({ type: 'text/plain', body: 'msg1' });
      await channel.sendMessage({ type: 'text/plain', body: 'msg2' });

      // Wait for write queue to flush
      await new Promise((r) => setTimeout(r, 10));

      const newObjects = session.sentObjects.slice(before);
      expect(newObjects.length).toBeGreaterThanOrEqual(2);
      expect(newObjects[0].groupId).not.toBe(newObjects[1].groupId);
    });

    it('throws when channel is not active', () => {
      expect(() =>
        channel.prepareMessage({ type: 'text/plain', body: 'hello' })
      ).toThrow('Channel not active');
    });
  });

  describe('sendMessage with options', () => {
    it('includes replyTo', async () => {
      await channel.activate();
      const msg = await channel.sendMessage(
        { type: 'text/plain', body: 'reply' },
        { replyTo: { group: 1, object: 0 } },
      );
      expect(msg.replyTo).toEqual({ group: 1, object: 0 });
    });

    it('includes mentions', async () => {
      await channel.activate();
      const msg = await channel.sendMessage(
        { type: 'text/plain', body: 'hey @alice' },
        { mentions: ['alice'] },
      );
      expect(msg.mentions).toEqual(['alice']);
    });
  });

  describe('editMessage', () => {
    it('sends an edit with editOf extension', async () => {
      await channel.activate();
      const edited = await channel.editMessage(
        { group: 1, object: 0 },
        { type: 'text/plain', body: 'corrected text' },
      );
      expect(edited.content.body).toBe('corrected text');
      expect(edited.edited).toBeDefined();
      expect(edited.extensions?.editOf).toEqual({ group: 1, object: 0 });
    });
  });

  describe('deleteMessage', () => {
    it('sends a deletion marker', async () => {
      await channel.activate();
      const deleted = await channel.deleteMessage({ group: 1, object: 0 });
      expect(deleted.content.type).toBe('application/x-mocha-deleted');
      expect(deleted.content.body).toBe('');
      expect(deleted.extensions?.deleteOf).toEqual({ group: 1, object: 0 });
    });
  });

  describe('presence', () => {
    it('sends presence update', async () => {
      await channel.activate();
      const before = session.sentObjects.length;
      await channel.setPresence('away', 'BRB');
      expect(session.sentObjects.length).toBe(before + 1);
    });
  });

  describe('typing indicator', () => {
    it('sends typing indicator', async () => {
      await channel.activate();
      const before = session.sentObjects.length;
      await channel.sendTypingIndicator();
      expect(session.sentObjects.length).toBe(before + 1);
    });
  });

  describe('reactions', () => {
    it('sends a reaction', async () => {
      await channel.activate();
      const before = session.sentObjects.length;
      await channel.sendReaction({ group: 1, object: 0 }, '👍');
      expect(session.sentObjects.length).toBe(before + 1);
    });
  });

  describe('roster events', () => {
    it('publishes roster events', async () => {
      await channel.activate();
      const before = session.sentObjects.length;
      await channel.publishRosterEvent('leave');
      expect(session.sentObjects.length).toBe(before + 1);
    });
  });

  describe('moderation', () => {
    it('sends moderation event', async () => {
      await channel.activate();
      const before = session.sentObjects.length;
      await channel.moderate('mute', 'user-2', 'spam');
      expect(session.sentObjects.length).toBe(before + 1);
    });
  });

  describe('deactivate', () => {
    it('sends leave event and offline presence', async () => {
      await channel.activate();
      const beforeDeactivate = session.sentObjects.length;
      await channel.deactivate();
      // Should have sent leave roster event + offline presence
      expect(session.sentObjects.length).toBeGreaterThan(beforeDeactivate);
    });

    it('is idempotent', async () => {
      await channel.activate();
      await channel.deactivate();
      const count = session.sentObjects.length;
      await channel.deactivate();
      expect(session.sentObjects.length).toBe(count);
    });
  });

  describe('debug hook', () => {
    it('fires debug hook on publish', async () => {
      const debugEvents: any[] = [];
      const debugChannel = new MochaChannel(
        session as any,
        nsConfig,
        'hclient-1',
        'hdev-1',
        identity,
        () => {},
        (e) => debugEvents.push(e),
      );

      await debugChannel.activate();
      expect(debugEvents.length).toBeGreaterThan(0);
      expect(debugEvents[0].direction).toBe('send');
      expect(debugEvents[0].label).toBe('PUBLISH');
    });
  });

  describe('file operations', () => {
    it('publishes a file in chunks', async () => {
      await channel.activate();
      const data = new Uint8Array(128 * 1024); // 128 KB
      const progress: number[] = [];

      const ns = await channel.publishFile('file-1', data, (sent, total) => {
        progress.push(sent);
      });

      expect(ns).toBeDefined();
      expect(ns.length).toBeGreaterThan(0);
      expect(progress.length).toBeGreaterThan(0);
      expect(progress[progress.length - 1]).toBe(128 * 1024);
    });
  });
});
