// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../src/stores/settings-store';

describe('settings-store', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.getState().reset();
  });

  it('has default settings', () => {
    const { settings } = useSettingsStore.getState();
    expect(settings.relayUrl).toBeDefined();
    expect(settings.moatUrl).toBeDefined();
    expect(settings.provider).toBeDefined();
    expect(settings.orgId).toBeDefined();
    expect(settings.teamId).toBeDefined();
    expect(settings.theme).toBe('system');
  });

  it('updates settings', () => {
    useSettingsStore.getState().update({ theme: 'dark' });
    expect(useSettingsStore.getState().settings.theme).toBe('dark');
  });

  it('persists settings to localStorage', () => {
    useSettingsStore.getState().update({ theme: 'light' });
    const stored = JSON.parse(localStorage.getItem('mocha-settings')!);
    expect(stored.theme).toBe('light');
  });

  it('resets to defaults', () => {
    useSettingsStore.getState().update({ theme: 'dark' });
    useSettingsStore.getState().reset();
    expect(useSettingsStore.getState().settings.theme).toBe('system');
    expect(localStorage.getItem('mocha-settings')).toBeNull();
  });

  it('toggles visibility', () => {
    expect(useSettingsStore.getState().visible).toBe(false);
    useSettingsStore.getState().toggle();
    expect(useSettingsStore.getState().visible).toBe(true);
    useSettingsStore.getState().toggle();
    expect(useSettingsStore.getState().visible).toBe(false);
  });

  it('updates relay URL', () => {
    useSettingsStore.getState().update({ relayUrl: 'https://custom.relay.com' });
    expect(useSettingsStore.getState().settings.relayUrl).toBe('https://custom.relay.com');
  });

  it('merges partial updates without losing existing settings', () => {
    const before = { ...useSettingsStore.getState().settings };
    useSettingsStore.getState().update({ theme: 'dark' });
    const after = useSettingsStore.getState().settings;
    expect(after.relayUrl).toBe(before.relayUrl);
    expect(after.moatUrl).toBe(before.moatUrl);
    expect(after.theme).toBe('dark');
  });
});
