// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { create } from 'zustand';

export interface DebugEvent {
  id: number;
  timestamp: number;
  source: 'moat' | 'relay' | 'protocol' | 'media';
  direction: 'send' | 'recv' | 'info';
  label: string;
  detail?: string;
  count?: number;
}

const DEFAULT_RELAY_URL = import.meta.env.VITE_RELAY_URL || 'https://relay.mocha-net.dev';

interface DebugState {
  events: DebugEvent[];
  visible: boolean;
  tokenSnippet: string | null;
  publishedTracks: string[];
  subscribedTracks: string[];
  namespaces: string[];
  relayUrl: string;

  toggle: () => void;
  addEvent: (event: Omit<DebugEvent, 'id' | 'timestamp'>) => void;
  setToken: (token: string) => void;
  addPublish: (ns: string[], track: string) => void;
  addSubscribe: (ns: string[], track: string) => void;
  setRelayUrl: (url: string) => void;
  clear: () => void;
}

let nextId = 0;

export const useDebugStore = create<DebugState>((set) => ({
  events: [],
  visible: false,
  tokenSnippet: null,
  publishedTracks: [],
  subscribedTracks: [],
  namespaces: [],
  relayUrl: localStorage.getItem('mocha-relay-url') || DEFAULT_RELAY_URL,

  toggle: () => set((s) => ({ visible: !s.visible })),

  addEvent: (event) =>
    set((s) => {
      const last = s.events[s.events.length - 1];
      if (last && last.source === event.source && last.direction === event.direction && last.label === event.label) {
        const updated = [...s.events];
        updated[updated.length - 1] = { ...last, count: (last.count || 1) + 1, timestamp: Date.now() };
        return { events: updated };
      }
      return { events: [...s.events.slice(-200), { ...event, id: nextId++, timestamp: Date.now() }] };
    }),

  setToken: (token) =>
    set(() => ({
      tokenSnippet: token.length > 40 ? token.slice(0, 20) + '...' + token.slice(-12) : token,
    })),

  addPublish: (ns, track) =>
    set((s) => {
      const full = [...ns, track].join('/');
      const nsStr = ns.join('/');
      return {
        publishedTracks: s.publishedTracks.includes(full) ? s.publishedTracks : [...s.publishedTracks, full],
        namespaces: s.namespaces.includes(nsStr) ? s.namespaces : [...s.namespaces, nsStr],
      };
    }),

  addSubscribe: (ns, track) =>
    set((s) => {
      const full = [...ns, track].join('/');
      const nsStr = ns.join('/');
      return {
        subscribedTracks: s.subscribedTracks.includes(full) ? s.subscribedTracks : [...s.subscribedTracks, full],
        namespaces: s.namespaces.includes(nsStr) ? s.namespaces : [...s.namespaces, nsStr],
      };
    }),

  setRelayUrl: (url) => {
    localStorage.setItem('mocha-relay-url', url);
    set({ relayUrl: url });
  },

  clear: () => set({ events: [], publishedTracks: [], subscribedTracks: [], namespaces: [], tokenSnippet: null }),
}));
