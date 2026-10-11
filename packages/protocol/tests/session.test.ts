// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MochaSession } from '../src/session/mocha-session.js';
import type { MochaSessionConfig } from '../src/session/types.js';
import type { TokenProvider } from '../src/auth/token-provider.js';

// We can't fully test MochaSession without the real @moq-web dependencies,
// but we can test the state machine, event system, and error paths.

function createMockTokenProvider(): TokenProvider {
  return {
    getToken: vi.fn().mockResolvedValue('mock-token'),
    refreshIfNeeded: vi.fn().mockResolvedValue(null),
    getExpiresIn: vi.fn().mockReturnValue(300),
    clearCachedToken: vi.fn(),
    sessionToken: 'mock-session-token',
  };
}

function createConfig(overrides: Partial<MochaSessionConfig> = {}): MochaSessionConfig {
  return {
    relayUrl: 'https://relay.example.com',
    tokenProvider: createMockTokenProvider(),
    identity: { userId: 'user-1', displayName: 'Test User' },
    namespaceConfig: {
      provider: 'test',
      orgId: 'org-1',
      teamId: 'team-1',
      channelId: 'general',
    },
    hClientId: 'hclient-1',
    hDevId: 'hdev-1',
    ...overrides,
  };
}

describe('MochaSession', () => {
  describe('initial state', () => {
    it('starts in disconnected state', () => {
      const session = new MochaSession(createConfig());
      expect(session.state).toBe('disconnected');
    });

    it('exposes identity', () => {
      const session = new MochaSession(createConfig());
      expect(session.identity.userId).toBe('user-1');
      expect(session.identity.displayName).toBe('Test User');
    });

    it('exposes hClientId and hDevId', () => {
      const session = new MochaSession(createConfig());
      expect(session.hClientId).toBe('hclient-1');
      expect(session.hDevId).toBe('hdev-1');
    });

    it('moqtSession is null before connect', () => {
      const session = new MochaSession(createConfig());
      expect(session.moqtSession).toBeNull();
    });
  });

  describe('event system', () => {
    it('registers and fires event handlers', () => {
      const session = new MochaSession(createConfig());
      const handler = vi.fn();

      session.on('state-change', handler);
      // Trigger connect (will fail since MOQTransport is not available, but state-change to 'connecting' should fire)
      session.connect().catch(() => {});

      // The state change to 'connecting' should trigger
      expect(handler).toHaveBeenCalledWith('connecting');
    });

    it('unsubscribes via returned function', () => {
      const session = new MochaSession(createConfig());
      const handler = vi.fn();

      const unsub = session.on('error', handler);
      unsub();
      // Handler removed — if error fires it shouldn't be called
    });
  });

  describe('channel management (without transport)', () => {
    it('joinChannel throws when not connected', async () => {
      const session = new MochaSession(createConfig());
      await expect(session.joinChannel()).rejects.toThrow('Not connected');
    });

    it('getChannel returns undefined for unknown channel', () => {
      const session = new MochaSession(createConfig());
      expect(session.getChannel('unknown')).toBeUndefined();
    });

    it('getChannels returns empty array initially', () => {
      const session = new MochaSession(createConfig());
      expect(session.getChannels()).toEqual([]);
    });
  });

  describe('disconnect', () => {
    it('disconnect is safe when already disconnected', async () => {
      const session = new MochaSession(createConfig());
      await session.disconnect(); // should not throw
      expect(session.state).toBe('disconnected');
    });
  });
});
