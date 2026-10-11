// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { describe, it, expect } from 'vitest';
import { MochaNamespace } from '../src/namespace.js';

const config = {
  provider: 'acme',
  orgId: 'org-1',
  teamId: 'team-1',
  channelId: 'general',
};
const hClientId = 'hclient-abc';
const hDevId = 'hdev-xyz';

describe('MochaNamespace', () => {
  describe('construction', () => {
    it('creates via forChannel', () => {
      const ns = MochaNamespace.forChannel(config, hClientId);
      expect(ns.provider).toBe('acme');
      expect(ns.orgId).toBe('org-1');
      expect(ns.teamId).toBe('team-1');
      expect(ns.channelId).toBe('general');
      expect(ns.hClientId).toBe(hClientId);
    });

    it('returns correct id', () => {
      const ns = MochaNamespace.forChannel(config, hClientId);
      expect(ns.id).toBe('team-1/general');
    });
  });

  describe('track references', () => {
    const ns = MochaNamespace.forChannel(config, hClientId);

    it('chatMessage track ref', () => {
      const ref = ns.chatMessage(hDevId);
      expect(ref.namespace).toEqual(['mocha_v1', 'acme', 'org-1', 'chat', 'team-1', 'general', hClientId]);
      expect(ref.trackName).toBe(`msg_v1_${hDevId}`);
    });

    it('roster track ref', () => {
      const ref = ns.roster(hDevId);
      expect(ref.namespace[3]).toBe('roster');
      expect(ref.trackName).toBe(`user_${hDevId}`);
    });

    it('availability track ref', () => {
      const ref = ns.availability(hDevId);
      expect(ref.namespace[3]).toBe('availability');
      expect(ref.trackName).toBe(`availability_v1_${hDevId}`);
    });

    it('typing track ref', () => {
      const ref = ns.typing(hDevId);
      expect(ref.namespace[3]).toBe('availability');
      expect(ref.trackName).toBe(`typing_v1_${hDevId}`);
    });

    it('reaction track ref', () => {
      const ref = ns.reaction(hDevId);
      expect(ref.namespace[3]).toBe('reactions');
      expect(ref.trackName).toBe(`react_v1_${hDevId}`);
    });

    it('media audio track ref includes meetingId', () => {
      const ref = ns.mediaAudio('low', hDevId, 'meeting-1');
      expect(ref.namespace).toContain('media');
      expect(ref.namespace).toContain('meeting-1');
      expect(ref.trackName).toBe(`audio-low-${hDevId}`);
    });

    it('media video track ref', () => {
      const ref = ns.mediaVideo('hd', hDevId, 'meeting-1');
      expect(ref.trackName).toBe(`video-hd-${hDevId}`);
    });

    it('media catalog track ref', () => {
      const ref = ns.mediaCatalog(hDevId, 'meeting-1');
      expect(ref.namespace[3]).toBe('catalog');
      expect(ref.trackName).toBe(`catalog-${hDevId}`);
    });

    it('MLS track ref includes participantId', () => {
      const ref = ns.mls('participant-1', hDevId);
      expect(ref.namespace[3]).toBe('mls');
      expect(ref.namespace[6]).toBe('participant-1');
      expect(ref.trackName).toBe(`mls_v1_${hDevId}`);
    });

    it('keyPackage track ref', () => {
      const ref = ns.keyPackage('participant-1', hDevId);
      expect(ref.namespace[3]).toBe('keypackage');
      expect(ref.trackName).toBe(`keypackage_v1_${hDevId}`);
    });
  });

  describe('static track references', () => {
    it('channelInfo track ref', () => {
      const ref = MochaNamespace.channelInfo('acme', 'org-1', 'team-1', hDevId);
      expect(ref.namespace[3]).toBe('channel_info');
      expect(ref.trackName).toBe(`channel_${hDevId}`);
    });

    it('PAB track ref', () => {
      const ref = MochaNamespace.pab('acme', 'org-1', 'user-1', hDevId);
      expect(ref.namespace[3]).toBe('pab');
      expect(ref.namespace[4]).toBe('user-1');
      expect(ref.trackName).toBe(`msg_${hDevId}`);
    });
  });

  describe('subscription prefixes', () => {
    const ns = MochaNamespace.forChannel(config, hClientId);

    it('chatPrefix', () => {
      const prefix = ns.chatPrefix();
      expect(prefix).toEqual(['mocha_v1', 'acme', 'org-1', 'chat', 'team-1', 'general']);
    });

    it('rosterPrefix', () => {
      const prefix = ns.rosterPrefix();
      expect(prefix[3]).toBe('roster');
    });

    it('availabilityPrefix', () => {
      const prefix = ns.availabilityPrefix();
      expect(prefix[3]).toBe('availability');
    });

    it('reactionsPrefix', () => {
      const prefix = ns.reactionsPrefix();
      expect(prefix[3]).toBe('reactions');
    });

    it('mediaPrefix includes meetingId', () => {
      const prefix = ns.mediaPrefix('meeting-1');
      expect(prefix).toContain('meeting-1');
    });

    it('mlsPrefix', () => {
      const prefix = ns.mlsPrefix();
      expect(prefix[3]).toBe('mls');
      expect(prefix.length).toBe(6);
    });
  });

  describe('scope strings', () => {
    const ns = MochaNamespace.forChannel(config, hClientId);

    it('publishScope', () => {
      const scope = ns.publishScope('chat', hDevId);
      expect(scope).toBe(`mocha_v1/acme/org-1/chat/team-1/general/${hClientId}/*_${hDevId}`);
    });

    it('subscribeScope', () => {
      const scope = ns.subscribeScope('chat');
      expect(scope).toBe('mocha_v1/acme/org-1/chat/team-1/general/*');
    });
  });

  describe('parse', () => {
    it('parses valid namespace tuple', () => {
      const parsed = MochaNamespace.parse(['mocha_v1', 'acme', 'org-1', 'chat', 'team-1', 'general', 'hclient-1']);
      expect(parsed).not.toBeNull();
      expect(parsed!.provider).toBe('acme');
      expect(parsed!.fn).toBe('chat');
      expect(parsed!.channelId).toBe('general');
    });

    it('returns null for wrong version', () => {
      expect(MochaNamespace.parse(['mocha_v2', 'acme', 'org-1', 'chat', 'team-1', 'general', 'hclient-1'])).toBeNull();
    });

    it('returns null for too-short namespace', () => {
      expect(MochaNamespace.parse(['mocha_v1', 'acme', 'org-1'])).toBeNull();
    });
  });

  describe('trackType', () => {
    it('identifies message tracks', () => {
      expect(MochaNamespace.trackType('msg_v1_hdev-1')).toBe('messages');
    });

    it('identifies roster tracks', () => {
      expect(MochaNamespace.trackType('user_hdev-1')).toBe('roster');
    });

    it('identifies presence tracks', () => {
      expect(MochaNamespace.trackType('availability_v1_hdev-1')).toBe('presence');
    });

    it('identifies typing tracks', () => {
      expect(MochaNamespace.trackType('typing_v1_hdev-1')).toBe('typing');
    });

    it('identifies reaction tracks', () => {
      expect(MochaNamespace.trackType('react_v1_hdev-1')).toBe('reactions');
    });

    it('identifies audio media tracks', () => {
      expect(MochaNamespace.trackType('audio-low-hdev-1')).toBe('media');
    });

    it('identifies video media tracks', () => {
      expect(MochaNamespace.trackType('video-hd-hdev-1')).toBe('media');
    });

    it('identifies catalog tracks', () => {
      expect(MochaNamespace.trackType('catalog-hdev-1')).toBe('meta');
    });

    it('identifies MLS tracks', () => {
      expect(MochaNamespace.trackType('mls_v1_hdev-1')).toBe('mls');
    });

    it('identifies keypackage tracks', () => {
      expect(MochaNamespace.trackType('keypackage_v1_hdev-1')).toBe('mls');
    });

    it('returns null for unknown track names', () => {
      expect(MochaNamespace.trackType('unknown_track')).toBeNull();
    });
  });
});
