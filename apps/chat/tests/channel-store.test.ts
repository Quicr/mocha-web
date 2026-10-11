// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { describe, it, expect, beforeEach } from 'vitest';
import { useChannelStore } from '../src/stores/channel-store';
import type { MochaMessage, PresenceEntry, TypingIndicator, Reaction, Receipt } from '@mocha/protocol';

describe('channel-store', () => {
  beforeEach(() => {
    // Reset store to initial state
    useChannelStore.setState({
      rooms: [],
      activeChannel: null,
      activeRoom: null,
      messages: [],
      receipts: new Map(),
      reactions: new Map(),
      roster: new Map(),
      typingUsers: new Map(),
    });
  });

  describe('addMessage', () => {
    const makeMsg = (overrides: Partial<MochaMessage> = {}): MochaMessage => ({
      id: { group: 1, object: 0 },
      sender: { userId: 'alice', displayName: 'Alice' },
      timestamp: Date.now(),
      content: { type: 'text/plain', body: 'hello' },
      ...overrides,
    });

    it('adds a message', () => {
      useChannelStore.getState().addMessage(makeMsg());
      expect(useChannelStore.getState().messages).toHaveLength(1);
    });

    it('deduplicates by id + sender', () => {
      const msg = makeMsg();
      useChannelStore.getState().addMessage(msg);
      useChannelStore.getState().addMessage(msg);
      expect(useChannelStore.getState().messages).toHaveLength(1);
    });

    it('handles delete message', () => {
      const original = makeMsg({ id: { group: 1, object: 0 } });
      useChannelStore.getState().addMessage(original);

      const deletion = makeMsg({
        id: { group: 2, object: 0 },
        sender: { userId: 'bob', displayName: 'Bob' },
        content: { type: 'application/x-mocha-deleted', body: '' },
        extensions: { deleteOf: { group: 1, object: 0 } },
      });
      useChannelStore.getState().addMessage(deletion);
      expect(useChannelStore.getState().messages).toHaveLength(0);
    });

    it('handles edit message', () => {
      const original = makeMsg({ id: { group: 1, object: 0 }, content: { type: 'text/plain', body: 'original' } });
      useChannelStore.getState().addMessage(original);

      const edit = makeMsg({
        id: { group: 2, object: 0 },
        content: { type: 'text/plain', body: 'edited' },
        edited: Date.now(),
        extensions: { editOf: { group: 1, object: 0 } },
      });
      useChannelStore.getState().addMessage(edit);

      const msgs = useChannelStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content.body).toBe('edited');
    });

    it('handles draft messages (replaces existing draft from same sender)', () => {
      const draft1 = makeMsg({ draft: true, content: { type: 'text/plain', body: 'typ' } });
      const draft2 = makeMsg({ draft: true, id: { group: 1, object: 1 }, content: { type: 'text/plain', body: 'typing' } });

      useChannelStore.getState().addMessage(draft1);
      expect(useChannelStore.getState().messages).toHaveLength(1);

      useChannelStore.getState().addMessage(draft2);
      expect(useChannelStore.getState().messages).toHaveLength(1);
      expect(useChannelStore.getState().messages[0].content.body).toBe('typing');
    });

    it('final message clears draft from same sender', () => {
      const draft = makeMsg({ draft: true, content: { type: 'text/plain', body: 'typing...' } });
      useChannelStore.getState().addMessage(draft);

      const finalMsg = makeMsg({ id: { group: 1, object: 1 }, draft: false, content: { type: 'text/plain', body: 'done' } });
      useChannelStore.getState().addMessage(finalMsg);

      const msgs = useChannelStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content.body).toBe('done');
      expect(msgs[0].draft).toBeFalsy();
    });

    it('ignores stale call signals', () => {
      const staleSignal = makeMsg({
        timestamp: Date.now() - 60_000,
        content: { type: 'application/x-mocha-call-signal', body: JSON.stringify({ action: 'ring', mode: 'video' }) },
      });
      useChannelStore.getState().addMessage(staleSignal);
      expect(useChannelStore.getState().messages).toHaveLength(0);
    });
  });

  describe('roster (presence)', () => {
    it('adds a user to roster', () => {
      const entry: PresenceEntry = {
        userId: 'bob',
        displayName: 'Bob',
        status: 'online',
        lastSeen: Date.now(),
      };
      useChannelStore.getState().updatePresence(entry);
      expect(useChannelStore.getState().roster.size).toBe(1);
      expect(useChannelStore.getState().roster.get('bob')?.status).toBe('online');
    });

    it('removes user on offline', () => {
      useChannelStore.getState().updatePresence({
        userId: 'bob',
        displayName: 'Bob',
        status: 'online',
        lastSeen: Date.now(),
      });
      useChannelStore.getState().updatePresence({
        userId: 'bob',
        displayName: 'Bob',
        status: 'offline',
        lastSeen: Date.now(),
      });
      expect(useChannelStore.getState().roster.size).toBe(0);
    });
  });

  describe('typing indicators', () => {
    it('tracks typing users', () => {
      const indicator: TypingIndicator = {
        userId: 'charlie',
        displayName: 'Charlie',
        timestamp: Date.now(),
      };
      useChannelStore.getState().updateTyping(indicator);
      expect(useChannelStore.getState().typingUsers.size).toBe(1);
    });
  });

  describe('reactions', () => {
    it('adds a reaction', () => {
      const reaction: Reaction = {
        userId: 'alice',
        displayName: 'Alice',
        messageId: { group: 1, object: 0 },
        emoji: '👍',
        timestamp: Date.now(),
      };
      useChannelStore.getState().addReaction(reaction);
      expect(useChannelStore.getState().reactions.get('1:0')).toHaveLength(1);
    });

    it('deduplicates reactions (same user + emoji)', () => {
      const reaction: Reaction = {
        userId: 'alice',
        displayName: 'Alice',
        messageId: { group: 1, object: 0 },
        emoji: '👍',
        timestamp: Date.now(),
      };
      useChannelStore.getState().addReaction(reaction);
      useChannelStore.getState().addReaction(reaction);
      expect(useChannelStore.getState().reactions.get('1:0')).toHaveLength(1);
    });

    it('allows different emojis from same user', () => {
      const base = { userId: 'alice', displayName: 'Alice', messageId: { group: 1, object: 0 }, timestamp: Date.now() };
      useChannelStore.getState().addReaction({ ...base, emoji: '👍' });
      useChannelStore.getState().addReaction({ ...base, emoji: '❤️' });
      expect(useChannelStore.getState().reactions.get('1:0')).toHaveLength(2);
    });
  });

  describe('receipts', () => {
    it('adds a receipt', () => {
      const receipt: Receipt = {
        userId: 'bob',
        messageId: { group: 1, object: 0 },
        type: 'read',
        timestamp: Date.now(),
      };
      useChannelStore.getState().addReceipt(receipt);
      expect(useChannelStore.getState().receipts.get('1:0')).toHaveLength(1);
    });

    it('deduplicates receipts (same user + type)', () => {
      const receipt: Receipt = {
        userId: 'bob',
        messageId: { group: 1, object: 0 },
        type: 'read',
        timestamp: Date.now(),
      };
      useChannelStore.getState().addReceipt(receipt);
      useChannelStore.getState().addReceipt(receipt);
      expect(useChannelStore.getState().receipts.get('1:0')).toHaveLength(1);
    });
  });

  describe('leaveChannel', () => {
    it('clears all channel state', async () => {
      useChannelStore.setState({
        messages: [{ id: { group: 1, object: 0 }, sender: { userId: 'a', displayName: 'A' }, timestamp: 0, content: { type: 'text/plain', body: '' } }],
        roster: new Map([['a', { userId: 'a', displayName: 'A', status: 'online' as const, lastSeen: 0 }]]),
      });

      await useChannelStore.getState().leaveChannel();

      const state = useChannelStore.getState();
      expect(state.messages).toHaveLength(0);
      expect(state.roster.size).toBe(0);
      expect(state.activeChannel).toBeNull();
      expect(state.activeRoom).toBeNull();
    });
  });
});
