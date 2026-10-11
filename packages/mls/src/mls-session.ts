// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { MlsMessageType, type MlsConfig, type MlsGroupState, type MlsTrackKey, type MlsSessionEvents, type KeepAlive } from './types.js';
import { MlsNamespace } from './namespace.js';
import { serializeMlsObject, deserializeMlsObject, deriveTrackKey, computeKeepAliveMac } from './crypto.js';

type EventHandler<K extends keyof MlsSessionEvents> = (data: MlsSessionEvents[K]) => void;

/**
 * MLS session over MoQ Transport.
 *
 * Implements the leader-follower model from draft-jennings-moq-mocha-mls-keying-00:
 * - Any member MAY publish Proposals
 * - A single committer collects Proposals and publishes Commits
 * - All followers subscribe and apply Commits
 */
export class MlsSession {
  private readonly ns: MlsNamespace;
  private readonly config: MlsConfig;
  private state: MlsGroupState | null = null;
  private handlers = new Map<keyof MlsSessionEvents, Set<EventHandler<any>>>();
  private trackKeys = new Map<string, MlsTrackKey>();
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private mlsTrackAlias: bigint | null = null;
  private keyPackageAlias: bigint | null = null;
  private keepAliveAlias: bigint | null = null;
  private epoch = 0;
  private objectSeq = 0;
  private kpObjectSeq = 0;
  private kaObjectSeq = 0;

  constructor(config: MlsConfig) {
    this.config = config;
    this.ns = new MlsNamespace(config);
  }

  get groupState(): MlsGroupState | null {
    return this.state;
  }

  get currentEpoch(): number {
    return this.epoch;
  }

  get isCommitter(): boolean {
    return this.state?.committerId === this.config.participantId;
  }

  on<K extends keyof MlsSessionEvents>(event: K, handler: EventHandler<K>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => { this.handlers.get(event)?.delete(handler); };
  }

  private emit<K extends keyof MlsSessionEvents>(event: K, data: MlsSessionEvents[K]): void {
    this.handlers.get(event)?.forEach((h) => (h as EventHandler<K>)(data));
  }

  /**
   * Initialize the MLS session, publishing tracks and subscribing to group.
   * @param moqtSession The underlying MOQT session (duck-typed to avoid hard coupling)
   */
  async initialize(moqtSession: MoqtSessionLike): Promise<void> {
    const mlsTrack = this.ns.mlsTrack();
    this.mlsTrackAlias = await moqtSession.publish(
      mlsTrack.namespace,
      mlsTrack.trackName,
      { deliveryMode: 'stream' },
    );

    const kpTrack = this.ns.keyPackageTrack();
    this.keyPackageAlias = await moqtSession.publish(
      kpTrack.namespace,
      kpTrack.trackName,
      { deliveryMode: 'stream' },
    );

    const kaTrack = this.ns.keepAliveTrack();
    this.keepAliveAlias = await moqtSession.publish(
      kaTrack.namespace,
      kaTrack.trackName,
      { deliveryMode: 'datagram' },
    );

    // Subscribe to MLS and keypackage namespace prefixes
    await moqtSession.subscribeNamespace(this.ns.mlsPrefix());
    await moqtSession.subscribeNamespace(this.ns.keyPackagePrefix());

    // Listen for incoming MLS publishes
    moqtSession.on('incoming-publish', (event: IncomingPublishEvent) => {
      this.handleIncomingPublish(moqtSession, event);
    });
  }

  /**
   * Publish a fresh KeyPackage for other members to discover.
   */
  async publishKeyPackage(moqtSession: MoqtSessionLike, keyPackageBytes: Uint8Array): Promise<void> {
    if (this.keyPackageAlias === null) throw new Error('MLS session not initialized');

    const obj = serializeMlsObject(MlsMessageType.KeyPackage, keyPackageBytes);
    await moqtSession.sendObject(this.keyPackageAlias, obj, {
      groupId: this.epoch,
      objectId: this.kpObjectSeq++,
      newGroup: this.kpObjectSeq === 1,
    });
  }

  /**
   * Publish a Proposal (Add, Remove, Update).
   */
  async publishProposal(moqtSession: MoqtSessionLike, proposalBytes: Uint8Array): Promise<void> {
    if (this.mlsTrackAlias === null) throw new Error('MLS session not initialized');

    const obj = serializeMlsObject(MlsMessageType.Proposal, proposalBytes);
    await moqtSession.sendObject(this.mlsTrackAlias, obj, {
      groupId: this.epoch,
      objectId: this.objectSeq++,
    });
  }

  /**
   * Publish a Commit (committer only). Advances the epoch.
   */
  async publishCommit(moqtSession: MoqtSessionLike, commitBytes: Uint8Array): Promise<void> {
    if (this.mlsTrackAlias === null) throw new Error('MLS session not initialized');
    if (!this.isCommitter) throw new Error('Only committer can publish Commits');

    const obj = serializeMlsObject(MlsMessageType.Commit, commitBytes);
    const newEpoch = this.epoch + 1;
    await moqtSession.sendObject(this.mlsTrackAlias, obj, {
      groupId: newEpoch,
      objectId: 0,
      newGroup: true,
    });

    this.advanceEpoch(newEpoch);
  }

  /**
   * Publish a Welcome message for a new member.
   */
  async publishWelcome(moqtSession: MoqtSessionLike, welcomeBytes: Uint8Array, targetHDevId: string): Promise<void> {
    if (this.mlsTrackAlias === null) throw new Error('MLS session not initialized');

    const obj = serializeMlsObject(MlsMessageType.Welcome, welcomeBytes);
    await moqtSession.sendObject(this.mlsTrackAlias, obj, {
      groupId: this.epoch,
      objectId: this.objectSeq++,
      properties: { targetHDevId },
    });
  }

  /**
   * Derive encryption keys for a specific track.
   */
  async deriveKeyForTrack(applicationSecret: Uint8Array, trackName: string, leafIndex: number): Promise<MlsTrackKey> {
    const { key, nonce } = await deriveTrackKey(applicationSecret, trackName);
    const trackKey: MlsTrackKey = { key, nonce, epoch: this.epoch, leafIndex };
    this.trackKeys.set(`${this.epoch}:${trackName}`, trackKey);
    this.emit('key-update', trackKey);
    return trackKey;
  }

  /**
   * Get cached track key for current or specified epoch.
   */
  getTrackKey(trackName: string, epoch?: number): MlsTrackKey | null {
    return this.trackKeys.get(`${epoch ?? this.epoch}:${trackName}`) ?? null;
  }

  /**
   * Start sending keep-alive messages (committer duty).
   */
  startKeepAlive(moqtSession: MoqtSessionLike, intervalMs?: number): void {
    const interval = intervalMs ?? this.config.keepAliveIntervalMs ?? 5000;
    this.stopKeepAlive();

    this.keepAliveInterval = setInterval(async () => {
      if (this.keepAliveAlias === null || !this.state) return;

      const nonce = crypto.getRandomValues(new Uint8Array(16));
      const timestamp = BigInt(Date.now());
      const mac = await computeKeepAliveMac(
        this.state.confirmationKey,
        this.epoch,
        timestamp,
        nonce,
      );

      const keepAlive: KeepAlive = { epoch: this.epoch, timestamp, nonce, mac };
      const payload = serializeKeepAlive(keepAlive);

      await moqtSession.sendObject(this.keepAliveAlias!, payload, {
        groupId: 0,
        objectId: this.kaObjectSeq++,
      });
    }, interval);
  }

  stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * Apply external MLS state update (from the MLS library callback).
   */
  updateGroupState(state: MlsGroupState): void {
    this.state = state;
    this.epoch = state.epoch;
    this.emit('epoch-advance', { epoch: state.epoch, members: state.members });
  }

  /**
   * Become the committer for this group.
   */
  becomeCommitter(): void {
    if (this.state) {
      this.state.committerId = this.config.participantId;
    }
    this.emit('committer-change', { committerId: this.config.participantId });
  }

  destroy(): void {
    this.stopKeepAlive();
    this.handlers.clear();
    this.trackKeys.clear();
  }

  private advanceEpoch(newEpoch: number): void {
    this.epoch = newEpoch;
    this.objectSeq = 1; // 0 was the commit
    if (this.state) {
      this.state.epoch = newEpoch;
      this.emit('epoch-advance', { epoch: newEpoch, members: this.state.members });
    }
  }

  private handleIncomingPublish(moqtSession: MoqtSessionLike, event: IncomingPublishEvent): void {
    const parsed = MlsNamespace.parseMlsNamespace(event.namespace);
    if (!parsed) return;
    if (parsed.teamId !== this.config.teamId || parsed.channelId !== this.config.channelId) return;
    if (parsed.participantId === this.config.participantId) return;

    moqtSession.setSubscriptionCallback(
      event.subscriptionId,
      (data: Uint8Array, groupId: number, _objectId: number) => {
        this.handleMlsObject(parsed.fn, parsed.participantId, data, groupId);
      },
    );
  }

  private handleMlsObject(_fn: 'mls' | 'keypackage', fromParticipant: string, data: Uint8Array, groupId: number): void {
    try {
      const { type } = deserializeMlsObject(data);

      switch (type) {
        case MlsMessageType.Commit:
          this.advanceEpoch(groupId);
          break;
        case MlsMessageType.KeyPackage:
          if (this.isCommitter) {
            this.emit('member-added', {
              participantId: fromParticipant,
              hDevId: '',
              leafIndex: this.state?.members.length ?? 0,
              joinedEpoch: this.epoch,
            });
          }
          break;
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error('MLS object parse failed'));
    }
  }
}

function serializeKeepAlive(ka: KeepAlive): Uint8Array {
  const buf = new Uint8Array(8 + 8 + 2 + ka.nonce.length + ka.mac.length);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, BigInt(ka.epoch), false);
  view.setBigUint64(8, ka.timestamp, false);
  view.setUint16(16, ka.nonce.length, false);
  buf.set(ka.nonce, 18);
  buf.set(ka.mac, 18 + ka.nonce.length);
  return buf;
}

// Duck-typed MOQT session interface to avoid hard coupling
export interface MoqtSessionLike {
  publish(namespace: string[], trackName: string, opts: { deliveryMode: string }): Promise<bigint>;
  subscribeNamespace(prefix: string[]): Promise<number>;
  sendObject(alias: bigint, data: Uint8Array, opts: { groupId: number; objectId: number; newGroup?: boolean; properties?: Record<string, string> }): Promise<void>;
  setSubscriptionCallback(subscriptionId: number, callback: (data: Uint8Array, groupId: number, objectId: number) => void): void;
  on(event: string, handler: (data: any) => void): () => void;
}

interface IncomingPublishEvent {
  subscriptionId: number;
  namespace: string[];
  trackName: string;
}
