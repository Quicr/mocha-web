// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { create } from 'zustand';
import type { DraftVersion } from '@mocha/protocol';

const DEFAULT_RELAY_URL = import.meta.env.VITE_RELAY_URL || 'https://relay.mocha-net.dev';
const DEFAULT_MOAT_URL = import.meta.env.VITE_TOKEN_SERVICE_URL || 'https://api.mocha-net.dev/v1';
const DEFAULT_PROVIDER = import.meta.env.VITE_MOCHA_PROVIDER || 'mocha-net.dev';
const DEFAULT_ORG_ID = import.meta.env.VITE_MOCHA_ORG_ID || 'demo-org';
const DEFAULT_TEAM_ID = import.meta.env.VITE_MOCHA_TEAM_ID || 'demo-team';
const DEFAULT_DRAFT: DraftVersion = (typeof __MOQT_VERSION__ !== 'undefined' ? __MOQT_VERSION__ : 'draft-16') as DraftVersion;

export type Theme = 'light' | 'dark' | 'system';

export interface Settings {
  relayUrl: string;
  moatUrl: string;
  provider: string;
  orgId: string;
  teamId: string;
  draft: DraftVersion;
  theme: Theme;
}

interface SettingsState {
  settings: Settings;
  visible: boolean;
  toggle: () => void;
  update: (partial: Partial<Settings>) => void;
  reset: () => void;
  applyTheme: () => void;
}

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem('mocha-settings');
    if (stored) return { ...defaults(), ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return defaults();
}

function defaults(): Settings {
  return {
    relayUrl: DEFAULT_RELAY_URL,
    moatUrl: DEFAULT_MOAT_URL,
    provider: DEFAULT_PROVIDER,
    orgId: DEFAULT_ORG_ID,
    teamId: DEFAULT_TEAM_ID,
    draft: DEFAULT_DRAFT,
    theme: 'system',
  };
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

function applyThemeToDOM(theme: Theme) {
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: loadSettings(),
  visible: false,

  toggle: () => set((s) => ({ visible: !s.visible })),

  update: (partial) => {
    const settings = { ...get().settings, ...partial };
    localStorage.setItem('mocha-settings', JSON.stringify(settings));
    set({ settings });
    applyThemeToDOM(settings.theme);
  },

  reset: () => {
    localStorage.removeItem('mocha-settings');
    const s = defaults();
    set({ settings: s });
    applyThemeToDOM(s.theme);
  },

  applyTheme: () => {
    applyThemeToDOM(get().settings.theme);
  },
}));

// Apply theme on load
applyThemeToDOM(useSettingsStore.getState().settings.theme);

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const { theme } = useSettingsStore.getState().settings;
  if (theme === 'system') applyThemeToDOM('system');
});
