// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import type { MochaMessage, PresenceEntry, TypingIndicator, Receipt, MochaIdentity, MessageId, Attachment } from '../types.js';

export interface SendMessageOptions {
  replyTo?: MessageId;
  threadRoot?: MessageId;
  mentions?: string[];
  attachments?: Attachment[];
}

export interface ChannelEvents {
  message: MochaMessage;
  'presence-update': PresenceEntry;
  'typing-update': TypingIndicator;
  receipt: Receipt;
}

export type ChannelEventType = keyof ChannelEvents;

export interface ChannelConfig {
  identity: MochaIdentity;
  deliveryMode?: 'stream' | 'datagram';
}
