// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { create } from 'zustand';
import { CatTokenProvider, PrivacyPassTokenProvider, type MochaIdentity, type AuthMode, type TokenProvider } from '@mocha/protocol';
import { useDebugStore } from './debug-store';
import { useSettingsStore } from './settings-store';

const PP_ISSUER_URL = import.meta.env.VITE_PP_ISSUER_URL || 'https://pat.issuer.mocha-net.dev';

interface AuthState {
  identity: MochaIdentity | null;
  authMode: AuthMode;
  tokenProvider: TokenProvider;
  isLoading: boolean;
  error: string | null;

  setAuthMode: (mode: AuthMode) => void;
  loginAsGuest: (displayName?: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

function createTokenProvider(mode: AuthMode): TokenProvider {
  const moatUrl = useSettingsStore.getState().settings.moatUrl;
  if (mode === 'privacy_pass') {
    return new PrivacyPassTokenProvider({ moatBaseUrl: moatUrl, issuerUrl: PP_ISSUER_URL });
  }
  return new CatTokenProvider({ moatBaseUrl: moatUrl });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  identity: null,
  authMode: 'cat',
  tokenProvider: new CatTokenProvider({ moatBaseUrl: useSettingsStore.getState().settings.moatUrl }),
  isLoading: false,
  error: null,

  setAuthMode: (mode) => {
    set({ authMode: mode, tokenProvider: createTokenProvider(mode) });
  },

  loginAsGuest: async (displayName?: string) => {
    const debug = useDebugStore.getState();
    set({ isLoading: true, error: null });
    try {
      const provider = get().tokenProvider;
      const name = displayName || `Guest-${crypto.randomUUID().slice(0, 8)}`;
      debug.addEvent({ source: 'moat', direction: 'send', label: 'POST /auth/guest', detail: name });
      if (provider instanceof CatTokenProvider) {
        const identity = await provider.loginGuest(name);
        debug.addEvent({ source: 'moat', direction: 'recv', label: 'Guest login OK', detail: identity.userId.slice(0, 8) });
        set({ identity, isLoading: false });
      } else {
        // No-auth or privacy_pass guest: create local identity
        const identity: MochaIdentity = { userId: crypto.randomUUID(), displayName: name };
        set({ identity, isLoading: false });
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  loginWithGoogle: async (idToken: string) => {
    const debug = useDebugStore.getState();
    set({ isLoading: true, error: null });
    try {
      const provider = get().tokenProvider;
      debug.addEvent({ source: 'moat', direction: 'send', label: 'POST /auth/google' });
      if (provider instanceof PrivacyPassTokenProvider) {
        const identity = await provider.loginGoogle(idToken);
        debug.addEvent({ source: 'moat', direction: 'recv', label: 'Google login OK', detail: identity.displayName });
        set({ identity, isLoading: false });
      } else if (provider instanceof CatTokenProvider) {
        const identity = await provider.loginGoogle(idToken);
        debug.addEvent({ source: 'moat', direction: 'recv', label: 'Google login OK', detail: identity.displayName });
        set({ identity, isLoading: false });
      }
    } catch (err) {
      debug.addEvent({ source: 'moat', direction: 'info', label: `Google login failed: ${(err as Error).message}` });
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  logout: () => {
    set({ identity: null });
  },

  clearError: () => set({ error: null }),
}));
