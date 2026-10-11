// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import type { MlsConfig } from './types.js';

const VERSION = 'mocha_v1';

export interface MlsTrackRef {
  namespace: string[];
  trackName: string;
}

/**
 * MLS namespace layout per draft-jennings-moq-mocha-mls-keying-00:
 *
 * MLS messages:   ("mocha_v1", Provider, OrgID, "mls", TeamID, ChannelID, MLSParticipantID)
 * Key packages:   ("mocha_v1", Provider, OrgID, "keypackage", TeamID, ChannelID, MLSParticipantID)
 */
export class MlsNamespace {
  constructor(private readonly config: MlsConfig) {}

  mlsTrack(): MlsTrackRef {
    return {
      namespace: [VERSION, this.config.provider, this.config.orgId, 'mls', this.config.teamId, this.config.channelId, this.config.participantId],
      trackName: `mls_v1_${this.config.hDevId}`,
    };
  }

  keyPackageTrack(): MlsTrackRef {
    return {
      namespace: [VERSION, this.config.provider, this.config.orgId, 'keypackage', this.config.teamId, this.config.channelId, this.config.participantId],
      trackName: `keypackage_v1_${this.config.hDevId}`,
    };
  }

  keepAliveTrack(): MlsTrackRef {
    return {
      namespace: [VERSION, this.config.provider, this.config.orgId, 'mls', this.config.teamId, this.config.channelId, this.config.participantId],
      trackName: `keepalive_v1_${this.config.hDevId}`,
    };
  }

  syncTrack(): MlsTrackRef {
    return {
      namespace: [VERSION, this.config.provider, this.config.orgId, 'mls', this.config.teamId, this.config.channelId, this.config.participantId],
      trackName: `sync_v1_${this.config.hDevId}`,
    };
  }

  mlsPrefix(): string[] {
    return [VERSION, this.config.provider, this.config.orgId, 'mls', this.config.teamId, this.config.channelId];
  }

  keyPackagePrefix(): string[] {
    return [VERSION, this.config.provider, this.config.orgId, 'keypackage', this.config.teamId, this.config.channelId];
  }

  static parseMlsNamespace(namespace: string[]): {
    provider: string;
    orgId: string;
    fn: 'mls' | 'keypackage';
    teamId: string;
    channelId: string;
    participantId: string;
  } | null {
    if (namespace.length < 7 || namespace[0] !== VERSION) return null;
    const fn = namespace[3];
    if (fn !== 'mls' && fn !== 'keypackage') return null;
    return {
      provider: namespace[1],
      orgId: namespace[2],
      fn,
      teamId: namespace[4],
      channelId: namespace[5],
      participantId: namespace[6],
    };
  }
}
