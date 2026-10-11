// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../src/stores/auth-store';

describe('auth-store', () => {
  beforeEach(() => {
    useAuthStore.setState({
      identity: null,
      authMode: 'cat',
      isLoading: false,
      error: null,
    });
  });

  it('starts with no identity', () => {
    expect(useAuthStore.getState().identity).toBeNull();
  });

  it('starts in cat auth mode', () => {
    expect(useAuthStore.getState().authMode).toBe('cat');
  });

  it('sets auth mode', () => {
    useAuthStore.getState().setAuthMode('privacy_pass');
    expect(useAuthStore.getState().authMode).toBe('privacy_pass');
  });

  it('sets auth mode to no_auth', () => {
    useAuthStore.getState().setAuthMode('no_auth');
    expect(useAuthStore.getState().authMode).toBe('no_auth');
  });

  it('creates token provider when auth mode changes', () => {
    useAuthStore.getState().setAuthMode('privacy_pass');
    expect(useAuthStore.getState().tokenProvider).toBeDefined();
  });

  it('logout clears identity', () => {
    useAuthStore.setState({ identity: { userId: 'test', displayName: 'Test' } });
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().identity).toBeNull();
  });

  it('clears error', () => {
    useAuthStore.setState({ error: 'something went wrong' });
    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('is not loading initially', () => {
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});
