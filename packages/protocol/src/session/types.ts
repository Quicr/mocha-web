// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import type { DraftVersion } from '@moq-web/core';
import type { MochaIdentity } from '../types.js';
import type { TokenProvider } from '../auth/token-provider.js';
import type { NamespaceConfig } from '../namespace.js';

export type AuthMode = 'no_auth' | 'cat' | 'privacy_pass';

export interface MochaSessionConfig {
  relayUrl: string;
  tokenProvider: TokenProvider;
  identity: MochaIdentity;
  namespaceConfig: NamespaceConfig;
  hClientId: string;
  hDevId: string;
  authMode?: AuthMode;
  /** MOQT draft version (default: library default, currently draft-18) */
  draft?: DraftVersion;
  serverCertificateHashes?: ArrayBuffer[];
  connectionTimeout?: number;
  /** @deprecated Use namespaceConfig instead */
  realm?: string;
}

export type MochaSessionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type MochaEvent =
  | 'state-change'
  | 'error'
  | 'message'
  | 'presence-update'
  | 'typing-update'
  | 'receipt'
  | 'reaction'
  | 'roster-update'
  | 'moderation-action'
  | 'directory-update'
  | 'media-track'
  | 'file-data';
