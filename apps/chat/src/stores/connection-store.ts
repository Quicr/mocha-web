// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { create } from 'zustand';
import { MochaSession, type MochaSessionState, type MochaIdentity, type TokenProvider, type AuthMode, type NamespaceConfig } from '@mocha/protocol';
import { useDebugStore } from './debug-store';
import { useSettingsStore } from './settings-store';

const getRelayUrl = () => useSettingsStore.getState().settings.relayUrl;
const getDraft = () => useSettingsStore.getState().settings.draft;

interface ConnectionState {
  session: MochaSession | null;
  state: MochaSessionState;
  error: string | null;
  tokenProvider: TokenProvider | null;

  connect: (nsConfig: NamespaceConfig, identity: MochaIdentity, tokenProvider: TokenProvider, authMode?: AuthMode) => Promise<MochaSession>;
  disconnect: () => Promise<void>;
  clearToken: () => void;
}

function deriveHClientId(identity: MochaIdentity): string {
  return identity.userId.slice(0, 16);
}

function deriveHDevId(): string {
  let devId = sessionStorage.getItem('mocha_hdevid');
  if (!devId) {
    devId = crypto.randomUUID().slice(0, 12);
    sessionStorage.setItem('mocha_hdevid', devId);
  }
  return devId;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  session: null,
  state: 'disconnected',
  error: null,
  tokenProvider: null,

  connect: async (nsConfig, identity, tokenProvider, authMode) => {
    const existing = get().session;
    if (existing) return existing;

    const debug = useDebugStore.getState();
    const hClientId = deriveHClientId(identity);
    const hDevId = deriveHDevId();

    const session = new MochaSession({
      relayUrl: getRelayUrl(),
      tokenProvider,
      identity,
      namespaceConfig: nsConfig,
      hClientId,
      hDevId,
      authMode,
      draft: getDraft(),
    });

    session.on('state-change', (state) => {
      set({ state: state as MochaSessionState });
      debug.addEvent({ source: 'relay', direction: 'info', label: `session: ${state as string}` });
    });

    session.on('error', (err) => {
      set({ error: (err as Error).message });
      debug.addEvent({ source: 'relay', direction: 'info', label: `error: ${(err as Error).message}` });
    });

    set({ session, state: 'connecting', tokenProvider });
    debug.addEvent({ source: 'relay', direction: 'send', label: 'Connecting', detail: getRelayUrl() });

    try {
      await session.connect();
      if (authMode !== 'no_auth') {
        const tokenLabel = authMode === 'privacy_pass' ? 'PP token (0xda7a)' : 'CAT token (0x63346d)';
        const ttl = Math.round(tokenProvider.getExpiresIn());
        const fresh = ttl > 280;
        debug.addEvent({ source: 'moat', direction: 'recv', label: tokenLabel, detail: fresh ? `issued (${ttl}s)` : `reused (${ttl}s remaining)` });
      } else {
        debug.addEvent({ source: 'relay', direction: 'info', label: 'No auth (token skipped)' });
      }
      debug.addEvent({ source: 'relay', direction: 'recv', label: 'Connected (setup complete)' });
      return session;
    } catch (err) {
      set({ error: (err as Error).message, session: null });
      debug.addEvent({ source: 'relay', direction: 'info', label: `connect failed: ${(err as Error).message}` });
      throw err;
    }
  },

  disconnect: async () => {
    const { session } = get();
    if (session) {
      await session.disconnect();
      set({ session: null, state: 'disconnected', error: null });
    }
  },

  clearToken: () => {
    const { tokenProvider } = get();
    if (tokenProvider) {
      tokenProvider.clearCachedToken();
      useDebugStore.getState().addEvent({ source: 'moat', direction: 'info', label: 'Token cache cleared' });
    }
  },
}));
