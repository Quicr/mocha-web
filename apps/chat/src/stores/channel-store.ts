// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { create } from 'zustand';
import type { MochaSession, MochaChannel, MochaMessage, PresenceEntry, TypingIndicator, Receipt, Reaction, MessageId, RosterEvent, ModerationEvent } from '@mocha/protocol';
import { useDebugStore } from './debug-store';
import { useAuthStore } from './auth-store';
import { useSettingsStore } from './settings-store';
import { useMediaStore } from './media-store';
import type { CallMode } from './media-store';

interface Room {
  id: string;
  name: string;
  namespace_prefix: string;
  visibility: 'public' | 'authenticated' | 'private';
}

interface ChannelState {
  rooms: Room[];
  activeChannel: MochaChannel | null;
  activeRoom: Room | null;
  messages: MochaMessage[];
  receipts: Map<string, Receipt[]>;
  reactions: Map<string, Reaction[]>;
  roster: Map<string, PresenceEntry>;
  typingUsers: Map<string, TypingIndicator>;

  fetchRooms: () => Promise<void>;
  joinChannel: (session: MochaSession, room: Room) => Promise<void>;
  leaveChannel: () => Promise<void>;
  addMessage: (msg: MochaMessage) => void;
  addReceipt: (receipt: Receipt) => void;
  addReaction: (reaction: Reaction) => void;
  sendReaction: (messageId: MessageId, emoji: string) => void;
  markRead: (messageId: MessageId) => void;
  updatePresence: (entry: PresenceEntry) => void;
  updateTyping: (indicator: TypingIndicator) => void;
}

const getMoatUrl = () => useSettingsStore.getState().settings.moatUrl;

let presenceCleanupInterval: ReturnType<typeof setInterval> | null = null;

export const useChannelStore = create<ChannelState>((set, get) => ({
  rooms: [],
  activeChannel: null,
  activeRoom: null,
  messages: [],
  receipts: new Map(),
  reactions: new Map(),
  roster: new Map(),
  typingUsers: new Map(),

  fetchRooms: async () => {
    try {
      const res = await fetch(`${getMoatUrl()}/rooms`);
      if (!res.ok) return;
      const data = await res.json();
      const rooms: Room[] = data.map((r: { id: string; name: string; namespace_prefix: string; visibility?: string }) => ({
        id: r.id,
        name: r.name,
        namespace_prefix: r.namespace_prefix,
        visibility: (r.visibility || 'public') as Room['visibility'],
      }));
      set({ rooms });
    } catch {
      // silent
    }
  },

  joinChannel: async (session, room) => {
    const debug = useDebugStore.getState();
    const existing = get().activeChannel;
    if (existing) {
      await existing.deactivate();
    }

    debug.addEvent({ source: 'protocol', direction: 'send', label: `joinChannel: ${room.name}` });
    const debugHook = (evt: { direction: string; label: string; detail?: string }) => {
      debug.addEvent({ source: 'relay', direction: evt.direction as 'send' | 'recv', label: evt.label, detail: evt.detail });
      if (evt.label === 'PUBLISH') {
        const parts = evt.detail?.split('/') ?? [];
        debug.addPublish(parts.slice(0, -1), parts[parts.length - 1] ?? '');
      }
      if (evt.label === 'SUBSCRIBE') {
        const parts = evt.detail?.split('/') ?? [];
        debug.addSubscribe(parts.slice(0, -1), parts[parts.length - 1] ?? '');
      }
    };
    const channel = await session.joinChannel(room.name, debugHook);
    debug.addEvent({ source: 'protocol', direction: 'recv', label: `channel active: ${room.name}` });

    session.on('message', (data) => {
      const msg = data as MochaMessage;
      get().addMessage(msg);
      debug.addEvent({ source: 'relay', direction: 'recv', label: `msg from ${msg.sender.displayName}`, detail: msg.content.body?.slice(0, 40) });
      // Ensure sender appears in roster even if their presence heartbeat hasn't arrived yet
      if (msg.sender?.userId && !get().roster.has(msg.sender.userId)) {
        get().updatePresence({ userId: msg.sender.userId, displayName: msg.sender.displayName, status: 'online', lastSeen: Date.now() });
      }
    });

    session.on('presence-update', (data) => {
      const entry = data as PresenceEntry;
      get().updatePresence(entry);
      debug.addEvent({ source: 'relay', direction: 'recv', label: `presence: ${entry.displayName} ${entry.status}` });
    });

    session.on('typing-update', (data) => {
      const indicator = data as TypingIndicator;
      get().updateTyping(indicator);
      debug.addEvent({ source: 'relay', direction: 'recv', label: `typing: ${indicator.displayName}` });
    });

    session.on('receipt', (data) => {
      const receipt = data as Receipt;
      get().addReceipt(receipt);
    });

    session.on('reaction', (data) => {
      const reaction = data as Reaction;
      get().addReaction(reaction);
    });

    session.on('roster-update', (data) => {
      const event = data as RosterEvent;
      if (event.action === 'join') {
        get().updatePresence({ userId: event.userId, displayName: event.displayName, status: 'online', lastSeen: event.timestamp });
      } else if (event.action === 'leave') {
        get().updatePresence({ userId: event.userId, displayName: event.displayName, status: 'offline', lastSeen: event.timestamp });
      }
      debug.addEvent({ source: 'relay', direction: 'recv', label: `roster: ${event.displayName} ${event.action}` });
    });

    session.on('moderation-action', (data) => {
      const event = data as ModerationEvent;
      const { identity } = useAuthStore.getState();
      debug.addEvent({ source: 'relay', direction: 'recv', label: `mod: ${event.action} → ${event.targetUserId.slice(0, 8)}` });
      if (event.targetUserId === identity?.userId) {
        if (event.action === 'kick' || event.action === 'ban') {
          get().leaveChannel();
          alert(`You have been ${event.action === 'kick' ? 'kicked' : 'banned'} from the channel${event.reason ? `: ${event.reason}` : ''}`);
        }
      }
    });

    // Load cached messages from previous session
    const cacheKey = `mocha-messages:${room.name}`;
    let cachedMessages: MochaMessage[] = [];
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        cachedMessages = JSON.parse(raw) as MochaMessage[];
      }
    } catch { /* ignore corrupt cache */ }

    presenceCleanupInterval = setInterval(() => {
      const { roster } = get();
      const { identity } = useAuthStore.getState();
      const now = Date.now();
      const staleThreshold = 15_000;
      let changed = false;
      const updated = new Map(roster);
      for (const [userId, entry] of updated) {
        if (userId === identity?.userId) continue;
        if (now - entry.lastSeen > staleThreshold) {
          updated.delete(userId);
          changed = true;
        }
      }
      if (changed) set({ roster: updated });
    }, 5000);

    set({ activeChannel: channel, activeRoom: room, messages: cachedMessages, receipts: new Map(), reactions: new Map(), roster: new Map(), typingUsers: new Map() });
  },

  leaveChannel: async () => {
    const { activeChannel } = get();
    if (activeChannel) {
      await activeChannel.deactivate();
    }
    if (presenceCleanupInterval) {
      clearInterval(presenceCleanupInterval);
      presenceCleanupInterval = null;
    }
    set({ activeChannel: null, activeRoom: null, messages: [], receipts: new Map(), reactions: new Map(), roster: new Map(), typingUsers: new Map() });
  },

  addMessage: (msg) => {
    // Handle call signal messages — show incoming call UI, don't display as chat
    if (msg.content.type === 'application/x-mocha-call-signal') {
      try {
        const signal = JSON.parse(msg.content.body);
        // Ignore stale call signals (older than 30s)
        if (Date.now() - msg.timestamp > 30_000) return;
        if (signal.action === 'ring') {
          const mediaState = useMediaStore.getState();
          if (!mediaState.inCall) {
            useMediaStore.setState({
              incomingCall: {
                from: msg.sender.userId,
                displayName: msg.sender.displayName,
                channelName: get().activeRoom?.name ?? '',
                mode: (signal.mode || 'video') as CallMode,
                timestamp: msg.timestamp,
              },
            });
          }
        }
      } catch { /* ignore malformed signal */ }
      return;
    }

    // Handle media signals (screen share stop, etc.)
    if (msg.content.type === 'application/x-mocha-media-signal') {
      if (Date.now() - msg.timestamp > 30_000) return;
      try {
        const signal = JSON.parse(msg.content.body);
        if (signal.action === 'screen-share-stop') {
          const mediaState = useMediaStore.getState();
          const userId = msg.sender.userId;
          const remoteScreenUsers = mediaState.remoteScreenUsers.filter((uid) => uid !== userId);
          const screenSubToUser = new Map(mediaState.screenSubToUser);
          for (const [subId, uid] of screenSubToUser) {
            if (uid === userId) screenSubToUser.delete(subId);
          }
          useMediaStore.setState({ remoteScreenUsers, screenSubToUser });
        }
      } catch { /* ignore malformed signal */ }
      return;
    }

    set((s) => {
      // Handle delete
      const deleteOf = msg.extensions?.deleteOf as { group: number; object: number } | undefined;
      if (deleteOf) {
        const messages = s.messages.filter(
          (m) => !(m.id.group === deleteOf.group && m.id.object === deleteOf.object)
        );
        return { messages };
      }

      // Handle edit
      const editOf = msg.extensions?.editOf as { group: number; object: number } | undefined;
      if (editOf) {
        const messages = s.messages.map((m) => {
          if (m.id.group === editOf.group && m.id.object === editOf.object) {
            return { ...m, content: msg.content, edited: msg.edited || msg.timestamp };
          }
          return m;
        });
        return { messages };
      }

      if (msg.draft) {
        const idx = s.messages.findIndex(
          (m) => m.draft && m.sender.userId === msg.sender.userId
        );
        if (idx >= 0) {
          const messages = [...s.messages];
          messages[idx] = msg;
          return { messages };
        }
        return { messages: [...s.messages, msg] };
      }

      // Deduplicate by message ID + sender (IDs are per-publisher, not global)
      if (s.messages.some((m) => m.id.group === msg.id.group && m.id.object === msg.id.object && m.sender.userId === msg.sender.userId)) {
        return s;
      }

      // Final message: remove any draft from this sender and append
      const messages = s.messages.filter(
        (m) => !(m.draft && m.sender.userId === msg.sender.userId)
      );
      return { messages: [...messages, msg] };
    });
  },

  addReceipt: (receipt) => {
    set((s) => {
      const key = `${receipt.messageId.group}:${receipt.messageId.object}`;
      const receipts = new Map(s.receipts);
      const existing = receipts.get(key) || [];
      if (!existing.find((r) => r.userId === receipt.userId && r.type === receipt.type)) {
        receipts.set(key, [...existing, receipt]);
      }
      return { receipts };
    });
  },

  markRead: (messageId) => {
    const { activeChannel } = get();
    if (activeChannel) {
      activeChannel.markRead(messageId);
    }
  },

  addReaction: (reaction) => {
    set((s) => {
      const key = `${reaction.messageId.group}:${reaction.messageId.object}`;
      const reactions = new Map(s.reactions);
      const existing = reactions.get(key) || [];
      if (!existing.find((r) => r.userId === reaction.userId && r.emoji === reaction.emoji)) {
        reactions.set(key, [...existing, reaction]);
      }
      return { reactions };
    });
  },

  sendReaction: (messageId, emoji) => {
    const { activeChannel } = get();
    if (activeChannel) {
      const { identity } = useAuthStore.getState();
      const key = `${messageId.group}:${messageId.object}`;
      const existing = get().reactions.get(key) || [];
      const myReaction = existing.find((r) => r.userId === (identity?.userId ?? '') && r.emoji === emoji);

      if (myReaction) {
        // Toggle off: remove locally
        set((s) => {
          const reactions = new Map(s.reactions);
          const list = (reactions.get(key) || []).filter((r) => r !== myReaction);
          if (list.length) reactions.set(key, list);
          else reactions.delete(key);
          return { reactions };
        });
        return;
      }

      activeChannel.sendReaction(messageId, emoji);
      get().addReaction({
        userId: identity?.userId ?? '',
        displayName: identity?.displayName ?? '',
        messageId,
        emoji,
        timestamp: Date.now(),
      });
    }
  },

  updatePresence: (entry) => {
    set((s) => {
      const roster = new Map(s.roster);
      if (entry.status === 'offline') {
        roster.delete(entry.userId);
      } else {
        roster.set(entry.userId, entry);
      }
      return { roster };
    });
  },

  updateTyping: (indicator) => {
    set((s) => {
      const typingUsers = new Map(s.typingUsers);
      typingUsers.set(indicator.userId, indicator);
      return { typingUsers };
    });

    // Auto-remove after 5 seconds
    setTimeout(() => {
      set((s) => {
        const typingUsers = new Map(s.typingUsers);
        const current = typingUsers.get(indicator.userId);
        if (current && current.timestamp === indicator.timestamp) {
          typingUsers.delete(indicator.userId);
        }
        return { typingUsers };
      });
    }, 5000);
  },
}));

// Persist non-draft messages to localStorage on change
const MAX_CACHED_MESSAGES = 200;
useChannelStore.subscribe((state, prev) => {
  if (state.messages !== prev.messages && state.activeRoom) {
    const cacheKey = `mocha-messages:${state.activeRoom.name}`;
    const toCache = state.messages
      .filter((m) => !m.draft)
      .slice(-MAX_CACHED_MESSAGES);
    try {
      localStorage.setItem(cacheKey, JSON.stringify(toCache));
    } catch { /* quota exceeded, ignore */ }
  }
});
