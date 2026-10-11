// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

export interface MessageId {
  group: number;
  object: number;
}

export interface MessageSender {
  userId: string;
  displayName: string;
}

export type ContentType = 'text/plain' | 'text/markdown' | 'application/json' | 'application/x-mocha-deleted' | 'application/x-mocha-call-signal' | 'application/x-mocha-media-signal';

export interface MessageContent {
  type: ContentType;
  body: string;
}

export interface MochaMessage {
  id: MessageId;
  sender: MessageSender;
  timestamp: number;
  content: MessageContent;
  replyTo?: MessageId;
  threadRoot?: MessageId;
  edited?: number;
  reactions?: Record<string, string[]>;
  mentions?: string[];
  attachments?: Attachment[];
  extensions?: Record<string, unknown>;
  /** true = in-progress keystroke stream, false/undefined = committed message */
  draft?: boolean;
}

export interface Attachment {
  type: 'media' | 'file' | 'link';
  url?: string;
  mimeType?: string;
  name?: string;
  size?: number;
  trackNamespace?: string;
  data?: Uint8Array;
}

export type PresenceStatus = 'online' | 'away' | 'dnd' | 'invisible' | 'offline';

export interface PresenceEntry {
  userId: string;
  displayName: string;
  status: PresenceStatus;
  statusMessage?: string;
  lastSeen: number;
}

export interface TypingIndicator {
  userId: string;
  displayName: string;
  timestamp: number;
}

export type ReceiptType = 'delivered' | 'displayed' | 'read';

export interface Receipt {
  userId: string;
  messageId: MessageId;
  type: ReceiptType;
  timestamp: number;
}

export interface Reaction {
  userId: string;
  displayName: string;
  messageId: MessageId;
  emoji: string;
  timestamp: number;
}

export type Affiliation = 'owner' | 'admin' | 'member' | 'guest' | 'banned';

export type ModerationAction = 'mute' | 'unmute' | 'kick' | 'ban' | 'unban';

export interface ModerationEvent {
  action: ModerationAction;
  targetUserId: string;
  issuedBy: string;
  reason?: string;
  duration?: number;
  timestamp: number;
}

export type RosterAction = 'join' | 'leave' | 'role-change' | 'kick' | 'ban';

export interface RosterEvent {
  userId: string;
  displayName: string;
  action: RosterAction;
  role?: Affiliation;
  timestamp: number;
}

export interface ChannelMeta {
  name: string;
  description?: string;
  createdAt: number;
  createdBy: string;
  isPublic: boolean;
}

export type TrackType =
  | 'messages'
  | 'history'
  | 'meta'
  | 'roster'
  | 'threads'
  | 'presence'
  | 'typing'
  | 'receipts'
  | 'reactions'
  | 'mls'
  | 'moderation'
  | 'blocks'
  | 'media';

export interface DirectoryEntry {
  name: string;
  description?: string;
  visibility: 'public' | 'authenticated' | 'private';
  memberCount?: number;
  createdAt?: number;
}

export interface MochaIdentity {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}
