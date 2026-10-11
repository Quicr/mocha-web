// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

export { MochaSession } from './session/mocha-session.js';
export { MochaChannel, type ChannelDebugHook } from './channel/channel.js';
export { MochaNamespace } from './namespace.js';
export { encode, decode } from './codec.js';
export { MoatTokenProvider } from './auth/token-provider.js';
export { CatTokenProvider, type CatProviderConfig } from './auth/cat-provider.js';
export { PrivacyPassTokenProvider, type PrivacyPassConfig } from './auth/privacypass-provider.js';

export type { DraftVersion } from '@moq-web/core';
export type { MochaSessionConfig, MochaSessionState, MochaEvent, AuthMode } from './session/types.js';
export type { TokenProvider } from './auth/token-provider.js';
export type { SendMessageOptions, ChannelConfig } from './channel/types.js';
export type { TrackRef, NamespaceConfig, NamespaceFunction } from './namespace.js';
export type {
  MochaIdentity,
  MochaMessage,
  MessageId,
  MessageSender,
  MessageContent,
  ContentType,
  Attachment,
  PresenceStatus,
  PresenceEntry,
  TypingIndicator,
  Receipt,
  ReceiptType,
  Reaction,
  RosterEvent,
  RosterAction,
  ModerationEvent,
  ModerationAction,
  DirectoryEntry,
  Affiliation,
  ChannelMeta,
  TrackType,
} from './types.js';
