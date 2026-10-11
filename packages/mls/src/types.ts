// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

/**
 * MLS message type prefixes per draft-jennings-moq-mocha-mls-keying-00.
 * Each MOQT object carries a 1-byte type prefix followed by raw MLS message bytes.
 */
export const enum MlsMessageType {
  Proposal = 0x01,
  Commit = 0x02,
  Welcome = 0x03,
  KeyPackage = 0x04,
}

/**
 * Key ID encoding per draft: KID = (epoch << 24) | leaf_index
 * 40 bits for epoch, 24 bits for leaf_index (up to 16,777,215 members).
 */
export interface KeyId {
  epoch: number;
  leafIndex: number;
}

export interface MlsParticipant {
  participantId: string;
  hDevId: string;
  leafIndex: number;
  joinedEpoch: number;
}

export interface MlsGroupState {
  groupId: Uint8Array;
  epoch: number;
  members: MlsParticipant[];
  committerId: string | null;
  confirmationKey: Uint8Array;
}

export interface MlsTrackKey {
  key: Uint8Array;
  nonce: Uint8Array;
  epoch: number;
  leafIndex: number;
}

export interface KeepAlive {
  epoch: number;
  timestamp: bigint;
  nonce: Uint8Array;
  mac: Uint8Array;
}

export interface MlsConfig {
  provider: string;
  orgId: string;
  teamId: string;
  channelId: string;
  participantId: string;
  hDevId: string;
  hClientId: string;
  cipherSuite?: CipherSuite;
  keepAliveIntervalMs?: number;
}

export const enum CipherSuite {
  MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519 = 0x0001,
  MLS_128_DHKEMP256_AES128GCM_SHA256_P256 = 0x0002,
  MLS_256_DHKEMX448_AES256GCM_SHA512_Ed448 = 0x0003,
  MLS_256_DHKEMP384_AES256GCM_SHA384_P384 = 0x0007,
}

export interface MlsSessionEvents {
  'epoch-advance': { epoch: number; members: MlsParticipant[] };
  'member-added': MlsParticipant;
  'member-removed': { participantId: string; epoch: number };
  'key-update': MlsTrackKey;
  'committer-change': { committerId: string };
  'error': Error;
}
