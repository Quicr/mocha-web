// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MlsSession, MlsMessageType, serializeMlsObject, type MoqtSessionLike, type MlsConfig } from '../src/index.js';

const config: MlsConfig = {
  provider: 'example.com',
  orgId: 'acme',
  teamId: 'engineering',
  channelId: 'general',
  participantId: 'alice-mls-id',
  hDevId: 'device-a3f2',
  hClientId: 'client-xyz',
};

function createMockSession(): MoqtSessionLike & { sentObjects: Array<{ alias: bigint; data: Uint8Array; opts: any }> } {
  let trackCounter = 0n;
  const sentObjects: Array<{ alias: bigint; data: Uint8Array; opts: any }> = [];
  const listeners = new Map<string, Set<(data: any) => void>>();

  return {
    sentObjects,
    publish: vi.fn(async () => ++trackCounter),
    subscribeNamespace: vi.fn(async () => 1),
    sendObject: vi.fn(async (alias, data, opts) => {
      sentObjects.push({ alias, data, opts });
    }),
    setSubscriptionCallback: vi.fn(),
    on: vi.fn((event: string, handler: (data: any) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return () => listeners.get(event)?.delete(handler);
    }),
  };
}

describe('MlsSession', () => {
  let session: MlsSession;
  let mockMoqt: ReturnType<typeof createMockSession>;

  beforeEach(() => {
    session = new MlsSession(config);
    mockMoqt = createMockSession();
  });

  it('initializes and publishes required tracks', async () => {
    await session.initialize(mockMoqt);

    expect(mockMoqt.publish).toHaveBeenCalledTimes(3);
    // MLS track
    expect(mockMoqt.publish).toHaveBeenCalledWith(
      expect.arrayContaining(['mocha_v1', 'example.com', 'acme', 'mls']),
      'mls_v1_device-a3f2',
      { deliveryMode: 'stream' },
    );
    // KeyPackage track
    expect(mockMoqt.publish).toHaveBeenCalledWith(
      expect.arrayContaining(['keypackage']),
      'keypackage_v1_device-a3f2',
      { deliveryMode: 'stream' },
    );
    // KeepAlive track
    expect(mockMoqt.publish).toHaveBeenCalledWith(
      expect.arrayContaining(['mls']),
      'keepalive_v1_device-a3f2',
      { deliveryMode: 'datagram' },
    );

    expect(mockMoqt.subscribeNamespace).toHaveBeenCalledTimes(2);
  });

  it('publishes a KeyPackage', async () => {
    await session.initialize(mockMoqt);

    const kpBytes = new Uint8Array([0x10, 0x20, 0x30]);
    await session.publishKeyPackage(mockMoqt, kpBytes);

    expect(mockMoqt.sentObjects.length).toBe(1);
    const sent = mockMoqt.sentObjects[0];
    expect(sent.data[0]).toBe(MlsMessageType.KeyPackage);
    expect(sent.data.subarray(1)).toEqual(kpBytes);
    expect(sent.opts.groupId).toBe(0);
  });

  it('publishes a Proposal', async () => {
    await session.initialize(mockMoqt);

    const proposal = new Uint8Array([0xAA, 0xBB]);
    await session.publishProposal(mockMoqt, proposal);

    const sent = mockMoqt.sentObjects[0];
    expect(sent.data[0]).toBe(MlsMessageType.Proposal);
  });

  it('rejects Commit from non-committer', async () => {
    await session.initialize(mockMoqt);

    await expect(session.publishCommit(mockMoqt, new Uint8Array([1]))).rejects.toThrow('Only committer');
  });

  it('allows Commit from committer and advances epoch', async () => {
    await session.initialize(mockMoqt);
    session.updateGroupState({
      groupId: new Uint8Array([1, 2, 3]),
      epoch: 0,
      members: [],
      committerId: config.participantId,
      confirmationKey: new Uint8Array(32),
    });
    session.becomeCommitter();

    const commit = new Uint8Array([0xCC, 0xDD]);
    await session.publishCommit(mockMoqt, commit);

    expect(session.currentEpoch).toBe(1);
    const sent = mockMoqt.sentObjects[0];
    expect(sent.data[0]).toBe(MlsMessageType.Commit);
    expect(sent.opts.groupId).toBe(1);
    expect(sent.opts.newGroup).toBe(true);
  });

  it('emits epoch-advance on commit', async () => {
    await session.initialize(mockMoqt);
    session.updateGroupState({
      groupId: new Uint8Array([1]),
      epoch: 5,
      members: [{ participantId: 'alice', hDevId: 'dev1', leafIndex: 0, joinedEpoch: 0 }],
      committerId: config.participantId,
      confirmationKey: new Uint8Array(32),
    });
    session.becomeCommitter();

    const handler = vi.fn();
    session.on('epoch-advance', handler);

    await session.publishCommit(mockMoqt, new Uint8Array([1]));

    expect(handler).toHaveBeenCalledWith({ epoch: 6, members: expect.any(Array) });
  });

  it('derives and caches track keys', async () => {
    await session.initialize(mockMoqt);
    session.updateGroupState({
      groupId: new Uint8Array([1]),
      epoch: 3,
      members: [],
      committerId: null,
      confirmationKey: new Uint8Array(32),
    });

    const secret = crypto.getRandomValues(new Uint8Array(32));
    const key = await session.deriveKeyForTrack(secret, 'msg_v1_alice', 0);

    expect(key.key.length).toBe(16);
    expect(key.nonce.length).toBe(12);
    expect(key.epoch).toBe(3);
    expect(key.leafIndex).toBe(0);

    const cached = session.getTrackKey('msg_v1_alice');
    expect(cached).toEqual(key);
  });

  it('returns null for uncached track key', () => {
    expect(session.getTrackKey('nonexistent')).toBeNull();
  });

  it('cleans up on destroy', async () => {
    await session.initialize(mockMoqt);
    const handler = vi.fn();
    session.on('epoch-advance', handler);

    session.destroy();

    // Handlers should be cleared
    session.updateGroupState({
      groupId: new Uint8Array([1]),
      epoch: 1,
      members: [],
      committerId: null,
      confirmationKey: new Uint8Array(32),
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('throws if not initialized', async () => {
    await expect(session.publishKeyPackage(mockMoqt, new Uint8Array([1]))).rejects.toThrow('not initialized');
    await expect(session.publishProposal(mockMoqt, new Uint8Array([1]))).rejects.toThrow('not initialized');
  });
});
