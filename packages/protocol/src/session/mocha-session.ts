// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { MOQTransport } from '@moq-web/core';
import { MOQTSession } from '@moq-web/session';
import type { MochaSessionConfig, MochaSessionState, MochaEvent } from './types.js';
import type { MochaIdentity, DirectoryEntry } from '../types.js';
import { MochaChannel, type ChannelDebugHook } from '../channel/channel.js';
import { MochaNamespace } from '../namespace.js';
import { decode } from '../codec.js';

export class MochaSession {
  private transport: MOQTransport | null = null;
  private session: MOQTSession | null = null;
  private _state: MochaSessionState = 'disconnected';
  private channels = new Map<string, MochaChannel>();
  private handlers = new Map<MochaEvent, Set<(data: unknown) => void>>();
  private readonly config: MochaSessionConfig;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: MochaSessionConfig) {
    this.config = config;
  }

  get state(): MochaSessionState {
    return this._state;
  }

  get identity(): MochaIdentity {
    return this.config.identity;
  }

  get hClientId(): string {
    return this.config.hClientId;
  }

  get hDevId(): string {
    return this.config.hDevId;
  }

  get moqtSession(): MOQTSession | null {
    return this.session;
  }

  async connect(): Promise<void> {
    if (this._state !== 'disconnected') return;
    this.setState('connecting');

    try {
      this.transport = new MOQTransport({
        draft: this.config.draft,
        serverCertificateHashes: this.config.serverCertificateHashes ?? [],
        connectionTimeout: this.config.connectionTimeout ?? 300000,
      });

      await this.transport.connect(this.config.relayUrl);

      this.session = new MOQTSession(this.transport);

      const authMode = this.config.authMode ?? 'cat';
      if (authMode !== 'no_auth') {
        const { channelId } = this.config.namespaceConfig;
        const token = await this.config.tokenProvider.getToken(channelId, 'publisher');
        let tokenType: number;
        if (authMode === 'privacy_pass') {
          tokenType = (this.config.tokenProvider as any).usePbrs === true ? 0xda7a : 0x0002;
        } else {
          tokenType = 0x63346d;
        }
        this.session.setAuthToken(token, tokenType);
      }

      await this.session.setup();
      this.setState('connected');
      this.startTokenRefresh();
    } catch (err) {
      this.setState('error');
      const error = err instanceof Error ? err : new Error(String(err) || 'Connection failed');
      this.emit('error', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    for (const channel of this.channels.values()) {
      await channel.deactivate();
    }
    this.channels.clear();

    if (this.session) {
      await this.session.close();
      this.session = null;
    }
    this.transport = null;
    this.setState('disconnected');
  }

  async joinChannel(channelId?: string, debugHook?: ChannelDebugHook): Promise<MochaChannel> {
    if (!this.session) throw new Error('Not connected');

    const nsConfig = this.config.namespaceConfig;
    const effectiveChannelId = channelId ?? nsConfig.channelId;

    const ch = new MochaChannel(
      this.session,
      { ...nsConfig, channelId: effectiveChannelId },
      this.config.hClientId,
      this.config.hDevId,
      this.config.identity,
      (event, data) => this.emit(event, data),
      debugHook,
    );
    this.channels.set(ch.id, ch);
    await ch.activate();
    return ch;
  }

  async leaveChannel(channelId: string): Promise<void> {
    const ch = this.channels.get(channelId);
    if (!ch) return;
    await ch.deactivate();
    this.channels.delete(channelId);
  }

  getChannel(channelId: string): MochaChannel | undefined {
    return this.channels.get(channelId);
  }

  getChannels(): MochaChannel[] {
    return [...this.channels.values()];
  }

  on(event: MochaEvent, handler: (data: unknown) => void): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => { this.handlers.get(event)?.delete(handler); };
  }

  private emit(event: MochaEvent, data: unknown): void {
    this.handlers.get(event)?.forEach((h) => h(data));
  }

  async subscribeChannelDirectory(): Promise<void> {
    if (!this.session) throw new Error('Not connected');

    const { provider, orgId, teamId } = this.config.namespaceConfig;
    const dir = MochaNamespace.channelInfo(provider, orgId, teamId, this.config.hDevId);
    await this.session.subscribe(
      dir.namespace,
      dir.trackName,
      {},
      (data: Uint8Array) => {
        try {
          const entries = decode<DirectoryEntry[]>(data);
          this.emit('directory-update', entries);
        } catch {
          // skip malformed directory data
        }
      },
    );
  }

  private startTokenRefresh(): void {
    if (this.config.authMode === 'no_auth') return;
    this.refreshInterval = setInterval(async () => {
      try {
        const { channelId } = this.config.namespaceConfig;
        const newToken = await this.config.tokenProvider.refreshIfNeeded(channelId, 'publisher');
        if (newToken && this.session) {
          let tokenType: number;
          if (this.config.authMode === 'privacy_pass') {
            tokenType = (this.config.tokenProvider as any).usePbrs === true ? 0xda7a : 0x0002;
          } else {
            tokenType = 0x63346d;
          }
          this.session.setAuthToken(newToken, tokenType);
        }
      } catch {
        // Token refresh failed — will retry next interval
      }
    }, 30_000);
  }

  private setState(state: MochaSessionState): void {
    this._state = state;
    this.emit('state-change', state);
  }
}
