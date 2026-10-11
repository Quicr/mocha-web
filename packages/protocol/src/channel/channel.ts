// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import type { MOQTSession } from '@moq-web/session';
import type { MochaEvent } from '../session/types.js';
import type { MochaIdentity, MochaMessage, PresenceEntry, PresenceStatus, TypingIndicator, MessageContent, Reaction, MessageId, ReceiptType, RosterEvent, RosterAction, Affiliation, ModerationEvent, ModerationAction } from '../types.js';
import type { SendMessageOptions } from './types.js';
import type { NamespaceConfig } from '../namespace.js';
import { MochaNamespace } from '../namespace.js';
import { encode, decode, type MochaPayload } from '../codec.js';

export type ChannelDebugHook = (event: { direction: string; label: string; detail?: string }) => void;

export class MochaChannel {
  private ns: MochaNamespace;
  private messageTrackAlias: bigint | null = null;
  private availabilityTrackAlias: bigint | null = null;
  private typingTrackAlias: bigint | null = null;
  private rosterTrackAlias: bigint | null = null;
  private reactionTrackAlias: bigint | null = null;
  private namespaceSubIds: number[] = [];
  private currentGroupId = 0;
  private currentObjectId = 0;
  private messageSeq = 0;
  private presenceSeq = 0;
  private typingSeq = 0;
  private rosterSeq = 0;
  private reactionSeq = 0;
  private writeQueue: Promise<void> = Promise.resolve();
  private presenceInterval: ReturnType<typeof setInterval> | null = null;
  private active = false;
  private debugHook: ChannelDebugHook | null = null;
  private cleanupHandlers: Array<() => void> = [];

  readonly id: string;
  readonly hDevId: string;

  constructor(
    private session: MOQTSession,
    nsConfig: NamespaceConfig,
    hClientId: string,
    hDevId: string,
    private identity: MochaIdentity,
    private emitToSession: (event: MochaEvent, data: unknown) => void,
    debugHook?: ChannelDebugHook,
  ) {
    this.ns = MochaNamespace.forChannel(nsConfig, hClientId);
    this.id = this.ns.id;
    this.hDevId = hDevId;
    this.debugHook = debugHook ?? null;
  }

  setDebugHook(hook: ChannelDebugHook): void {
    this.debugHook = hook;
  }

  async activate(): Promise<void> {
    if (this.active) return;
    this.active = true;

    // Set own client ID for self-exclusion (namespace last element = hClientId)
    if ('setOwnClientId' in this.session) {
      (this.session as any).setOwnClientId(this.ns.hClientId);
    }

    // Listen for incoming publishers discovered via SUBSCRIBE_NAMESPACE
    const unsubIncoming = this.session.on('incoming-publish', (event) => {
      this.handleIncomingPublish(event);
    });
    this.cleanupHandlers.push(unsubIncoming);

    // Publish tracks and send initial data BEFORE subscribing to namespaces.
    // This ensures the relay has data flowing (mode set on TrackReader) by the
    // time it notifies other subscribers — the relay's serve loop needs mode()
    // to resolve before it can forward objects.
    const chatMsg = this.ns.chatMessage(this.hDevId);
    const avail = this.ns.availability(this.hDevId);
    const typingRef = this.ns.typing(this.hDevId);
    const rosterRef = this.ns.roster(this.hDevId);
    const reactionRef = this.ns.reaction(this.hDevId);

    this.debugHook?.({ direction: 'send', label: 'PUBLISH', detail: [...chatMsg.namespace, chatMsg.trackName].join('/') });
    this.messageTrackAlias = await this.session.publish(
      chatMsg.namespace,
      chatMsg.trackName,
      { deliveryMode: 'stream' },
    );

    this.debugHook?.({ direction: 'send', label: 'PUBLISH', detail: [...avail.namespace, avail.trackName].join('/') });
    this.availabilityTrackAlias = await this.session.publish(
      avail.namespace,
      avail.trackName,
      { deliveryMode: 'stream' },
    );

    this.debugHook?.({ direction: 'send', label: 'PUBLISH', detail: [...typingRef.namespace, typingRef.trackName].join('/') });
    this.typingTrackAlias = await this.session.publish(
      typingRef.namespace,
      typingRef.trackName,
      { deliveryMode: 'stream' },
    );

    this.debugHook?.({ direction: 'send', label: 'PUBLISH', detail: [...rosterRef.namespace, rosterRef.trackName].join('/') });
    this.rosterTrackAlias = await this.session.publish(
      rosterRef.namespace,
      rosterRef.trackName,
      { deliveryMode: 'stream' },
    );

    this.debugHook?.({ direction: 'send', label: 'PUBLISH', detail: [...reactionRef.namespace, reactionRef.trackName].join('/') });
    this.reactionTrackAlias = await this.session.publish(
      reactionRef.namespace,
      reactionRef.trackName,
      { deliveryMode: 'stream' },
    );

    // Send initial data on published tracks so the relay's TrackReader has its
    // mode set (Subgroups) before other subscribers' serve loops start.
    await this.setPresence('online');
    await this.publishRosterEvent('join', 'member');

    // Now subscribe to namespace prefixes to discover other publishers
    const chatPrefix = this.ns.chatPrefix();
    this.debugHook?.({ direction: 'send', label: 'SUBSCRIBE_NS', detail: chatPrefix.join('/') });
    this.namespaceSubIds.push(await this.session.subscribeNamespace(chatPrefix));

    const rosterPrefix = this.ns.rosterPrefix();
    this.debugHook?.({ direction: 'send', label: 'SUBSCRIBE_NS', detail: rosterPrefix.join('/') });
    this.namespaceSubIds.push(await this.session.subscribeNamespace(rosterPrefix));

    const availPrefix = this.ns.availabilityPrefix();
    this.debugHook?.({ direction: 'send', label: 'SUBSCRIBE_NS', detail: availPrefix.join('/') });
    this.namespaceSubIds.push(await this.session.subscribeNamespace(availPrefix));

    const reactPrefix = this.ns.reactionsPrefix();
    this.debugHook?.({ direction: 'send', label: 'SUBSCRIBE_NS', detail: reactPrefix.join('/') });
    this.namespaceSubIds.push(await this.session.subscribeNamespace(reactPrefix));

    // Start presence heartbeat
    this.presenceInterval = setInterval(() => {
      this.setPresence('online');
    }, 5000);
  }

  async deactivate(): Promise<void> {
    if (!this.active) return;
    this.active = false;

    await this.publishRosterEvent('leave');

    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }
    await this.setPresence('offline');

    for (const cleanup of this.cleanupHandlers) {
      cleanup();
    }
    this.cleanupHandlers = [];

    for (const subId of this.namespaceSubIds) {
      await this.session.unsubscribeNamespace(subId);
    }
    this.namespaceSubIds = [];

    // Send PUBLISH_DONE for all tracks so relay cleans up state
    const aliases = [
      this.messageTrackAlias,
      this.availabilityTrackAlias,
      this.typingTrackAlias,
      this.rosterTrackAlias,
      this.reactionTrackAlias,
    ];
    for (const alias of aliases) {
      if (alias !== null) {
        await this.session.unpublish(alias).catch(() => {});
      }
    }

    this.messageTrackAlias = null;
    this.availabilityTrackAlias = null;
    this.typingTrackAlias = null;
    this.rosterTrackAlias = null;
    this.reactionTrackAlias = null;
  }

  async sendMessage(content: MessageContent, options?: SendMessageOptions): Promise<MochaMessage> {
    const msg = this.prepareMessage(content, options);
    await this.flushMessage(msg);
    return msg;
  }

  prepareMessage(content: MessageContent, options?: SendMessageOptions): MochaMessage {
    if (this.messageTrackAlias === null) throw new Error('Channel not active');

    const groupId = this.getGroupId();
    const isNewGroup = groupId !== this.currentGroupId;
    if (isNewGroup) {
      this.currentGroupId = groupId;
      this.currentObjectId = 0;
    }
    const objectId = this.currentObjectId++;

    return {
      id: { group: groupId, object: objectId },
      sender: { userId: this.identity.userId, displayName: this.identity.displayName },
      timestamp: Date.now(),
      content,
      replyTo: options?.replyTo,
      threadRoot: options?.threadRoot,
      mentions: options?.mentions,
      attachments: options?.attachments,
      draft: false,
    };
  }

  flushMessage(msg: MochaMessage): void {
    if (this.messageTrackAlias === null) return;
    const isNewGroup = msg.id.object === 0;
    this.enqueueWrite(msg, msg.id.group, msg.id.object, isNewGroup);
  }

  async streamKeystroke(text: string): Promise<void> {
    if (this.messageTrackAlias === null) return;

    const groupId = this.getGroupId();
    const isNewGroup = groupId !== this.currentGroupId;
    if (isNewGroup) {
      this.currentGroupId = groupId;
      this.currentObjectId = 0;
    }
    const objectId = this.currentObjectId++;

    const draft: MochaMessage = {
      id: { group: groupId, object: objectId },
      sender: { userId: this.identity.userId, displayName: this.identity.displayName },
      timestamp: Date.now(),
      content: { type: 'text/plain', body: text },
      draft: true,
    };

    await this.enqueueWrite(draft, groupId, objectId, isNewGroup);
  }

  private enqueueWrite(msg: MochaMessage, _groupId: number, _objectId: number, _newGroup: boolean): Promise<void> {
    const wireGroupId = this.messageSeq++;
    this.writeQueue = this.writeQueue.then(() =>
      this.session.sendObject(this.messageTrackAlias!, encode(msg), {
        groupId: wireGroupId,
        objectId: 0,
      })
    ).catch(() => {});
    return this.writeQueue;
  }

  async setPresence(status: PresenceStatus, statusMessage?: string): Promise<void> {
    if (this.availabilityTrackAlias === null) return;

    const entry: PresenceEntry = {
      userId: this.identity.userId,
      displayName: this.identity.displayName,
      status,
      statusMessage,
      lastSeen: Date.now(),
    };

    const seq = this.presenceSeq++;
    await this.session.sendObject(this.availabilityTrackAlias, encode(entry), {
      groupId: seq,
      objectId: 0,
    });
  }

  async sendTypingIndicator(): Promise<void> {
    if (this.typingTrackAlias === null) return;

    const indicator: TypingIndicator = {
      userId: this.identity.userId,
      displayName: this.identity.displayName,
      timestamp: Date.now(),
    };

    const seq = this.typingSeq++;
    await this.session.sendObject(this.typingTrackAlias, encode(indicator), {
      groupId: seq,
      objectId: 0,
    });
  }

  async markRead(_messageId: MessageId, _type: ReceiptType = 'read'): Promise<void> {
    // TODO: implement receipts on a dedicated track; sending on the message track creates a feedback loop
  }

  async editMessage(originalId: MessageId, newContent: MessageContent): Promise<MochaMessage> {
    if (this.messageTrackAlias === null) throw new Error('Channel not active');

    const groupId = this.getGroupId();
    const isNewGroup = groupId !== this.currentGroupId;
    if (isNewGroup) {
      this.currentGroupId = groupId;
      this.currentObjectId = 0;
    }
    const objectId = this.currentObjectId++;

    const msg: MochaMessage = {
      id: { group: groupId, object: objectId },
      sender: { userId: this.identity.userId, displayName: this.identity.displayName },
      timestamp: Date.now(),
      content: newContent,
      edited: Date.now(),
      replyTo: originalId,
      extensions: { editOf: originalId },
      draft: false,
    };

    await this.enqueueWrite(msg, groupId, objectId, isNewGroup);
    return msg;
  }

  async deleteMessage(messageId: MessageId): Promise<MochaMessage> {
    if (this.messageTrackAlias === null) throw new Error('Channel not active');

    const groupId = this.getGroupId();
    const isNewGroup = groupId !== this.currentGroupId;
    if (isNewGroup) {
      this.currentGroupId = groupId;
      this.currentObjectId = 0;
    }
    const objectId = this.currentObjectId++;

    const msg: MochaMessage = {
      id: { group: groupId, object: objectId },
      sender: { userId: this.identity.userId, displayName: this.identity.displayName },
      timestamp: Date.now(),
      content: { type: 'application/x-mocha-deleted', body: '' },
      extensions: { deleteOf: messageId },
      draft: false,
    };

    await this.enqueueWrite(msg, groupId, objectId, isNewGroup);
    return msg;
  }

  async sendReaction(messageId: MessageId, emoji: string): Promise<void> {
    if (this.reactionTrackAlias === null) return;

    const reaction: Reaction = {
      userId: this.identity.userId,
      displayName: this.identity.displayName,
      messageId,
      emoji,
      timestamp: Date.now(),
    };

    const seq = this.reactionSeq++;
    await this.session.sendObject(this.reactionTrackAlias, encode(reaction as MochaPayload), {
      groupId: seq,
      objectId: 0,
    });
  }

  async publishRosterEvent(action: RosterAction, role?: Affiliation): Promise<void> {
    if (this.rosterTrackAlias === null) return;

    const event: RosterEvent = {
      userId: this.identity.userId,
      displayName: this.identity.displayName,
      action,
      role,
      timestamp: Date.now(),
    };

    const seq = this.rosterSeq++;
    await this.session.sendObject(this.rosterTrackAlias, encode(event), {
      groupId: seq,
      objectId: 0,
    });
  }

  async moderate(action: ModerationAction, targetUserId: string, reason?: string, duration?: number): Promise<void> {
    if (this.rosterTrackAlias === null) return;

    const event: ModerationEvent = {
      action,
      targetUserId,
      issuedBy: this.identity.userId,
      reason,
      duration,
      timestamp: Date.now(),
    };

    const seq = this.rosterSeq++;
    await this.session.sendObject(this.rosterTrackAlias, encode(event), {
      groupId: seq,
      objectId: 0,
    });
  }

  async publishFile(fileId: string, data: Uint8Array, onProgress?: (sent: number, total: number) => void): Promise<string[]> {
    const fileTrackName = `file_v1_${fileId}`;
    const fileNs = this.ns.fileNamespace();
    this.debugHook?.({ direction: 'send', label: 'PUBLISH', detail: [...fileNs, fileTrackName].join('/') });
    const alias = await this.session.publish(fileNs, fileTrackName, { deliveryMode: 'stream' });

    const CHUNK_SIZE = 64 * 1024;
    const total = data.byteLength;
    let sent = 0;
    let objectId = 0;

    while (sent < total) {
      const end = Math.min(sent + CHUNK_SIZE, total);
      const chunk = data.slice(sent, end);
      await this.session.sendObject(alias, chunk, {
        groupId: 0,
        objectId: objectId++,
        newGroup: sent === 0,
      });
      sent = end;
      onProgress?.(sent, total);
    }

    return [...fileNs, fileTrackName];
  }

  async fetchFile(namespace: string[], trackName: string, onProgress?: (received: number) => void): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      let totalReceived = 0;
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (chunks.length > 0) {
            resolve(this.concatChunks(chunks));
          } else {
            reject(new Error('File fetch timeout'));
          }
        }
      }, 15000);

      let lastChunkTime = Date.now();
      const settleTimer = setInterval(() => {
        if (chunks.length > 0 && Date.now() - lastChunkTime > 500) {
          clearInterval(settleTimer);
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            resolve(this.concatChunks(chunks));
          }
        }
      }, 200);

      this.session.subscribe(namespace, trackName, { filterType: 'absolute', startGroup: 0, startObject: 0 }, (data: Uint8Array) => {
        lastChunkTime = Date.now();
        chunks.push(data);
        totalReceived += data.byteLength;
        onProgress?.(totalReceived);
      }).catch((err) => {
        clearInterval(settleTimer);
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });
    });
  }

  private concatChunks(chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }

  async fetchHistory(startGroup: number, _endGroup?: number): Promise<number> {
    const chatMsg = this.ns.chatMessage(this.hDevId);
    const subId = await this.session.subscribe(
      chatMsg.namespace,
      chatMsg.trackName,
      { filterType: 'absolute', startGroup, startObject: 0 },
      (data: Uint8Array, groupId: number, objectId: number) => {
        this.handleMessage(data, groupId, objectId);
      },
    );
    this.debugHook?.({ direction: 'send', label: 'FETCH_HISTORY', detail: `from group ${startGroup}` });
    return subId;
  }

  private handleIncomingPublish(event: {
    subscriptionId: number;
    namespace: string[];
    trackName: string;
  }): void {
    const parsed = MochaNamespace.parse(event.namespace);
    if (!parsed) return;

    if (parsed.teamId !== this.ns.teamId || parsed.channelId !== this.ns.channelId) return;
    if (parsed.hClientId === this.ns.hClientId) return;

    const trackType = MochaNamespace.trackType(event.trackName);
    this.debugHook?.({
      direction: 'recv',
      label: 'PUBLISH (remote)',
      detail: `${parsed.fn}/${trackType}/${parsed.hClientId}/${event.trackName}`,
    });

    switch (parsed.fn) {
      case 'chat':
        this.session.setSubscriptionCallback(
          event.subscriptionId,
          (data: Uint8Array, groupId: number, objectId: number) => {
            this.handleMessage(data, groupId, objectId);
          },
        );
        break;
      case 'roster':
        this.session.setSubscriptionCallback(
          event.subscriptionId,
          (data: Uint8Array) => {
            this.handleRoster(data);
          },
        );
        break;
      case 'availability':
        if (event.trackName.startsWith('typing_v1_')) {
          this.session.setSubscriptionCallback(
            event.subscriptionId,
            (data: Uint8Array) => { this.handleTyping(data); },
          );
        } else {
          this.session.setSubscriptionCallback(
            event.subscriptionId,
            (data: Uint8Array) => {
              this.handlePresence(data);
            },
          );
        }
        break;
      case 'reactions':
        this.session.setSubscriptionCallback(
          event.subscriptionId,
          (data: Uint8Array) => { this.handleReaction(data); },
        );
        break;
    }
  }

  /**
   * GroupId = NTP time in minutes per draft-jennings-moq-mocha-chat-00:
   * group_id = floor(ntp_timestamp_seconds / 60)
   */
  private getGroupId(): number {
    return Math.floor(Date.now() / 60000) & 0xFFFFFFFF;
  }

  private handleMessage(data: Uint8Array, groupId: number, objectId: number): void {
    try {
      const msg = decode<MochaMessage>(data);
      if (msg.sender?.userId === this.identity.userId) return;
      if (!msg.id) {
        msg.id = { group: groupId, object: objectId };
      }
      this.emitToSession('message', msg);
    } catch {
      // malformed message, skip
    }
  }

  private handlePresence(data: Uint8Array): void {
    try {
      const entry = decode<PresenceEntry>(data);
      if (entry.userId === this.identity.userId) return;
      this.emitToSession('presence-update', entry);
    } catch {
      // skip
    }
  }

  private handleTyping(data: Uint8Array): void {
    try {
      const indicator = decode<TypingIndicator>(data);
      if (indicator.userId === this.identity.userId) return;
      this.emitToSession('typing-update', indicator);
    } catch {
      // skip
    }
  }

  private handleReaction(data: Uint8Array): void {
    try {
      const reaction = decode<Reaction>(data);
      if (reaction.userId === this.identity.userId) return;
      this.emitToSession('reaction', reaction);
    } catch {
      // skip
    }
  }

  private handleRoster(data: Uint8Array): void {
    try {
      const event = decode<RosterEvent>(data);
      if (event.userId === this.identity.userId) return;
      this.emitToSession('roster-update', event);
    } catch {
      // skip
    }
  }
}
