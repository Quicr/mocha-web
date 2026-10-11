// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import type { TrackType } from './types.js';

export interface TrackRef {
  namespace: string[];
  trackName: string;
}

/**
 * Namespace layout per draft-jennings-moq-mocha-*-00:
 *
 *   ("mocha_v1", <Provider>, <OrgID>, <Function>, <TeamID>, <ChannelID>, <HClientID>)
 *
 * Function discriminators:
 *   "chat"         — chat messages (draft-jennings-moq-mocha-chat-00)
 *   "roster"       — roster/presence
 *   "availability" — presence + typing
 *   "reactions"    — reactions (draft-jennings-moq-mocha-reactions-00)
 *   "media"        — audio/video (draft-jennings-moq-mocha-meetings-00)
 *   "catalog"      — media catalogs
 *   "mls"          — MLS protocol (draft-jennings-moq-mocha-mls-keying-00)
 *   "keypackage"   — MLS key packages
 *   "pab"          — personal address book (draft-jennings-moq-mocha-pab-00)
 *   "channel_info" — channel discovery
 *
 * Track names:
 *   msg_v1_<HDevID>           — chat messages
 *   user_<HDevID>             — roster
 *   availability_v1_<HDevID>  — presence
 *   typing_v1_<HDevID>        — typing indicators
 *   react_v1_<HDevID>         — reactions
 *   audio-<RenditionID>-<HDevID> — audio media
 *   video-<RenditionID>-<HDevID> — video media
 *   catalog-<HDevID>          — media catalog
 *   mls_v1_<HDevID>           — MLS protocol
 *   keypackage_v1_<HDevID>    — MLS key packages
 */

export type NamespaceFunction =
  | 'chat'
  | 'roster'
  | 'availability'
  | 'reactions'
  | 'media'
  | 'catalog'
  | 'mls'
  | 'keypackage'
  | 'pab'
  | 'channel_info';

export interface NamespaceConfig {
  provider: string;
  orgId: string;
  teamId: string;
  channelId: string;
}

export class MochaNamespace {
  static readonly VERSION = 'mocha_v1';

  constructor(
    readonly provider: string,
    readonly orgId: string,
    readonly teamId: string,
    readonly channelId: string,
    readonly hClientId: string,
  ) {}

  static forChannel(config: NamespaceConfig, hClientId: string): MochaNamespace {
    return new MochaNamespace(config.provider, config.orgId, config.teamId, config.channelId, hClientId);
  }

  private nsTuple(fn: NamespaceFunction): string[] {
    return [MochaNamespace.VERSION, this.provider, this.orgId, fn, this.teamId, this.channelId, this.hClientId];
  }

  // --- Chat (draft-jennings-moq-mocha-chat-00) ---

  chatMessage(hDevId: string): TrackRef {
    return { namespace: this.nsTuple('chat'), trackName: `msg_v1_${hDevId}` };
  }

  // --- Roster ---

  roster(hDevId: string): TrackRef {
    return { namespace: this.nsTuple('roster'), trackName: `user_${hDevId}` };
  }

  // --- Availability (presence + typing) ---

  availability(hDevId: string): TrackRef {
    return { namespace: this.nsTuple('availability'), trackName: `availability_v1_${hDevId}` };
  }

  typing(hDevId: string): TrackRef {
    return { namespace: this.nsTuple('availability'), trackName: `typing_v1_${hDevId}` };
  }

  // --- Reactions (draft-jennings-moq-mocha-reactions-00) ---

  reaction(hDevId: string): TrackRef {
    return { namespace: this.nsTuple('reactions'), trackName: `react_v1_${hDevId}` };
  }

  // --- Media (draft-jennings-moq-mocha-meetings-00) ---

  mediaAudio(renditionId: string, hDevId: string, meetingId: string): TrackRef {
    return {
      namespace: [MochaNamespace.VERSION, this.provider, this.orgId, 'media', this.teamId, this.channelId, meetingId, this.hClientId],
      trackName: `audio-${renditionId}-${hDevId}`,
    };
  }

  mediaVideo(renditionId: string, hDevId: string, meetingId: string): TrackRef {
    return {
      namespace: [MochaNamespace.VERSION, this.provider, this.orgId, 'media', this.teamId, this.channelId, meetingId, this.hClientId],
      trackName: `video-${renditionId}-${hDevId}`,
    };
  }

  mediaCatalog(hDevId: string, meetingId: string): TrackRef {
    return {
      namespace: [MochaNamespace.VERSION, this.provider, this.orgId, 'catalog', this.teamId, this.channelId, meetingId, this.hClientId],
      trackName: `catalog-${hDevId}`,
    };
  }

  // --- MLS (draft-jennings-moq-mocha-mls-keying-00) ---

  mls(mlsParticipantId: string, hDevId: string): TrackRef {
    return {
      namespace: [MochaNamespace.VERSION, this.provider, this.orgId, 'mls', this.teamId, this.channelId, mlsParticipantId],
      trackName: `mls_v1_${hDevId}`,
    };
  }

  keyPackage(mlsParticipantId: string, hDevId: string): TrackRef {
    return {
      namespace: [MochaNamespace.VERSION, this.provider, this.orgId, 'keypackage', this.teamId, this.channelId, mlsParticipantId],
      trackName: `keypackage_v1_${hDevId}`,
    };
  }

  // --- Channel Discovery ---

  static channelInfo(provider: string, orgId: string, teamId: string, hDevId: string): TrackRef {
    return {
      namespace: [MochaNamespace.VERSION, provider, orgId, 'channel_info', teamId],
      trackName: `channel_${hDevId}`,
    };
  }

  // --- PAB (draft-jennings-moq-mocha-pab-00) ---

  static pab(provider: string, orgId: string, userId: string, hDevId: string): TrackRef {
    return {
      namespace: [MochaNamespace.VERSION, provider, orgId, 'pab', userId],
      trackName: `msg_${hDevId}`,
    };
  }

  // --- Files ---

  fileNamespace(): string[] {
    return [MochaNamespace.VERSION, this.provider, this.orgId, 'files', this.teamId, this.channelId, this.hClientId];
  }

  // --- Subscription Prefixes ---

  chatPrefix(): string[] {
    return [MochaNamespace.VERSION, this.provider, this.orgId, 'chat', this.teamId, this.channelId];
  }

  rosterPrefix(): string[] {
    return [MochaNamespace.VERSION, this.provider, this.orgId, 'roster', this.teamId, this.channelId];
  }

  availabilityPrefix(): string[] {
    return [MochaNamespace.VERSION, this.provider, this.orgId, 'availability', this.teamId, this.channelId];
  }

  reactionsPrefix(): string[] {
    return [MochaNamespace.VERSION, this.provider, this.orgId, 'reactions', this.teamId, this.channelId];
  }

  mediaPrefix(meetingId: string): string[] {
    return [MochaNamespace.VERSION, this.provider, this.orgId, 'media', this.teamId, this.channelId, meetingId];
  }

  catalogPrefix(meetingId: string): string[] {
    return [MochaNamespace.VERSION, this.provider, this.orgId, 'catalog', this.teamId, this.channelId, meetingId];
  }

  mlsPrefix(): string[] {
    return [MochaNamespace.VERSION, this.provider, this.orgId, 'mls', this.teamId, this.channelId];
  }

  // --- Scope strings for token authorization (C4M/PP) ---

  publishScope(fn: NamespaceFunction, hDevId: string): string {
    return `${MochaNamespace.VERSION}/${this.provider}/${this.orgId}/${fn}/${this.teamId}/${this.channelId}/${this.hClientId}/*_${hDevId}`;
  }

  subscribeScope(fn: NamespaceFunction): string {
    return `${MochaNamespace.VERSION}/${this.provider}/${this.orgId}/${fn}/${this.teamId}/${this.channelId}/*`;
  }

  get id(): string {
    return `${this.teamId}/${this.channelId}`;
  }

  /**
   * Parse a namespace tuple into its components.
   * Layout: [mocha_v1, provider, orgId, function, teamId, channelId, hClientId]
   */
  static parse(namespace: string[]): {
    provider: string;
    orgId: string;
    fn: NamespaceFunction;
    teamId: string;
    channelId: string;
    hClientId: string;
  } | null {
    if (namespace.length < 7 || namespace[0] !== MochaNamespace.VERSION) return null;
    return {
      provider: namespace[1],
      orgId: namespace[2],
      fn: namespace[3] as NamespaceFunction,
      teamId: namespace[4],
      channelId: namespace[5],
      hClientId: namespace[6],
    };
  }

  /**
   * Extract track type from track name pattern.
   */
  static trackType(trackName: string): TrackType | null {
    if (trackName.startsWith('msg_v1_')) return 'messages';
    if (trackName.startsWith('user_')) return 'roster';
    if (trackName.startsWith('availability_v1_')) return 'presence';
    if (trackName.startsWith('typing_v1_')) return 'typing';
    if (trackName.startsWith('react_v1_')) return 'reactions';
    if (trackName.startsWith('audio-')) return 'media';
    if (trackName.startsWith('video-')) return 'media';
    if (trackName.startsWith('catalog-')) return 'meta';
    if (trackName.startsWith('mls_v1_')) return 'mls';
    if (trackName.startsWith('keypackage_v1_')) return 'mls';
    return null;
  }
}
