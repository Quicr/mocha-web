// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { describe, it, expect } from 'vitest';
import { MlsNamespace, type MlsConfig } from '../src/index.js';

const config: MlsConfig = {
  provider: 'example.com',
  orgId: 'acme',
  teamId: 'engineering',
  channelId: 'general',
  participantId: 'alice-mls-id',
  hDevId: 'device-a3f2',
  hClientId: 'client-xyz',
};

describe('MlsNamespace', () => {
  const ns = new MlsNamespace(config);

  it('constructs MLS track reference', () => {
    const ref = ns.mlsTrack();
    expect(ref.namespace).toEqual([
      'mocha_v1', 'example.com', 'acme', 'mls', 'engineering', 'general', 'alice-mls-id',
    ]);
    expect(ref.trackName).toBe('mls_v1_device-a3f2');
  });

  it('constructs KeyPackage track reference', () => {
    const ref = ns.keyPackageTrack();
    expect(ref.namespace).toEqual([
      'mocha_v1', 'example.com', 'acme', 'keypackage', 'engineering', 'general', 'alice-mls-id',
    ]);
    expect(ref.trackName).toBe('keypackage_v1_device-a3f2');
  });

  it('constructs keep-alive track reference', () => {
    const ref = ns.keepAliveTrack();
    expect(ref.namespace).toEqual([
      'mocha_v1', 'example.com', 'acme', 'mls', 'engineering', 'general', 'alice-mls-id',
    ]);
    expect(ref.trackName).toBe('keepalive_v1_device-a3f2');
  });

  it('constructs sync track reference', () => {
    const ref = ns.syncTrack();
    expect(ref.trackName).toBe('sync_v1_device-a3f2');
  });

  it('constructs MLS namespace prefix', () => {
    expect(ns.mlsPrefix()).toEqual([
      'mocha_v1', 'example.com', 'acme', 'mls', 'engineering', 'general',
    ]);
  });

  it('constructs keypackage namespace prefix', () => {
    expect(ns.keyPackagePrefix()).toEqual([
      'mocha_v1', 'example.com', 'acme', 'keypackage', 'engineering', 'general',
    ]);
  });
});

describe('MlsNamespace.parseMlsNamespace', () => {
  it('parses a valid MLS namespace', () => {
    const ns = ['mocha_v1', 'example.com', 'acme', 'mls', 'eng', 'general', 'alice-id'];
    const result = MlsNamespace.parseMlsNamespace(ns);
    expect(result).toEqual({
      provider: 'example.com',
      orgId: 'acme',
      fn: 'mls',
      teamId: 'eng',
      channelId: 'general',
      participantId: 'alice-id',
    });
  });

  it('parses a valid keypackage namespace', () => {
    const ns = ['mocha_v1', 'example.com', 'acme', 'keypackage', 'eng', 'general', 'bob-id'];
    const result = MlsNamespace.parseMlsNamespace(ns);
    expect(result).toEqual({
      provider: 'example.com',
      orgId: 'acme',
      fn: 'keypackage',
      teamId: 'eng',
      channelId: 'general',
      participantId: 'bob-id',
    });
  });

  it('returns null for wrong version', () => {
    const ns = ['mocha_v2', 'example.com', 'acme', 'mls', 'eng', 'general', 'alice'];
    expect(MlsNamespace.parseMlsNamespace(ns)).toBeNull();
  });

  it('returns null for non-MLS function', () => {
    const ns = ['mocha_v1', 'example.com', 'acme', 'chat', 'eng', 'general', 'alice'];
    expect(MlsNamespace.parseMlsNamespace(ns)).toBeNull();
  });

  it('returns null for too-short namespace', () => {
    const ns = ['mocha_v1', 'example.com', 'acme', 'mls', 'eng'];
    expect(MlsNamespace.parseMlsNamespace(ns)).toBeNull();
  });
});
