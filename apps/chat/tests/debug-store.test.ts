// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { describe, it, expect, beforeEach } from 'vitest';
import { useDebugStore } from '../src/stores/debug-store';

describe('debug-store', () => {
  beforeEach(() => {
    useDebugStore.getState().clear();
  });

  it('starts with empty state', () => {
    const state = useDebugStore.getState();
    expect(state.events).toHaveLength(0);
    expect(state.visible).toBe(false);
    expect(state.tokenSnippet).toBeNull();
    expect(state.publishedTracks).toHaveLength(0);
    expect(state.subscribedTracks).toHaveLength(0);
  });

  it('adds events', () => {
    useDebugStore.getState().addEvent({
      source: 'relay',
      direction: 'send',
      label: 'PUBLISH',
      detail: 'test/track',
    });
    expect(useDebugStore.getState().events).toHaveLength(1);
    expect(useDebugStore.getState().events[0].label).toBe('PUBLISH');
  });

  it('collapses repeated events', () => {
    const store = useDebugStore.getState();
    store.addEvent({ source: 'relay', direction: 'send', label: 'heartbeat' });
    store.addEvent({ source: 'relay', direction: 'send', label: 'heartbeat' });
    store.addEvent({ source: 'relay', direction: 'send', label: 'heartbeat' });

    const events = useDebugStore.getState().events;
    expect(events).toHaveLength(1);
    expect(events[0].count).toBe(3);
  });

  it('does not collapse different events', () => {
    const store = useDebugStore.getState();
    store.addEvent({ source: 'relay', direction: 'send', label: 'PUBLISH' });
    store.addEvent({ source: 'relay', direction: 'recv', label: 'SUBSCRIBE' });

    expect(useDebugStore.getState().events).toHaveLength(2);
  });

  it('caps events at 201', () => {
    const store = useDebugStore.getState();
    for (let i = 0; i < 250; i++) {
      store.addEvent({ source: 'relay', direction: 'send', label: `event-${i}` });
    }
    expect(useDebugStore.getState().events.length).toBeLessThanOrEqual(201);
  });

  it('toggles visibility', () => {
    expect(useDebugStore.getState().visible).toBe(false);
    useDebugStore.getState().toggle();
    expect(useDebugStore.getState().visible).toBe(true);
  });

  it('sets token snippet (truncated)', () => {
    const longToken = 'a'.repeat(100);
    useDebugStore.getState().setToken(longToken);
    const snippet = useDebugStore.getState().tokenSnippet!;
    expect(snippet.length).toBeLessThan(100);
    expect(snippet).toContain('...');
  });

  it('sets short token as-is', () => {
    useDebugStore.getState().setToken('short-token');
    expect(useDebugStore.getState().tokenSnippet).toBe('short-token');
  });

  it('tracks published tracks', () => {
    useDebugStore.getState().addPublish(['mocha_v1', 'acme', 'org-1', 'chat'], 'msg_v1_dev1');
    expect(useDebugStore.getState().publishedTracks).toContain('mocha_v1/acme/org-1/chat/msg_v1_dev1');
    expect(useDebugStore.getState().namespaces).toContain('mocha_v1/acme/org-1/chat');
  });

  it('deduplicates published tracks', () => {
    const store = useDebugStore.getState();
    store.addPublish(['ns'], 'track1');
    store.addPublish(['ns'], 'track1');
    expect(useDebugStore.getState().publishedTracks).toHaveLength(1);
  });

  it('tracks subscribed tracks', () => {
    useDebugStore.getState().addSubscribe(['mocha_v1', 'acme', 'org-1', 'roster'], 'user_dev1');
    expect(useDebugStore.getState().subscribedTracks).toContain('mocha_v1/acme/org-1/roster/user_dev1');
  });

  it('clears all state', () => {
    const store = useDebugStore.getState();
    store.addEvent({ source: 'relay', direction: 'send', label: 'test' });
    store.addPublish(['ns'], 'track');
    store.addSubscribe(['ns'], 'track');
    store.setToken('token');

    store.clear();
    const after = useDebugStore.getState();
    expect(after.events).toHaveLength(0);
    expect(after.publishedTracks).toHaveLength(0);
    expect(after.subscribedTracks).toHaveLength(0);
    expect(after.tokenSnippet).toBeNull();
  });
});
