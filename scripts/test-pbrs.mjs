// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { webcrypto } from 'crypto';
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, writable: true, configurable: true });
}

const ppPath = './node_modules/.pnpm/@cloudflare+privacypass-ts@0.9.0/node_modules/@cloudflare/privacypass-ts/lib/src/index.js';
const pp = await import(ppPath);
const { ClientWithMetadata, PartiallyBlindRSAMode } = pp.publicVerif;
const { TokenChallenge, Extensions } = pp;

const MOAT_URL = 'https://api.mocha-net.dev/v1';

function base64UrlDecode(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = Buffer.from(base64 + padding, 'base64');
  return new Uint8Array(binary);
}

function base64UrlEncode(data) {
  return Buffer.from(data).toString('base64url');
}

// Step 1: Get PBRS challenge from moat
console.log('Step 1: Getting PBRS challenge...');
const challengeRes = await fetch(`${MOAT_URL}/auth/privacypass/challenge`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ room_id: 'general', token_type: 0xda7a }),
});
if (!challengeRes.ok) {
  console.error('Challenge failed:', challengeRes.status, await challengeRes.text());
  process.exit(1);
}
const challenge = await challengeRes.json();
console.log('token_type:', `0x${challenge.token_type.toString(16)}`);
console.log('Got extensions:', challenge.extensions ? 'yes' : 'no');

// Step 2: Create PBRS token request with extensions
console.log('\nStep 2: Creating PBRS token request...');
const challengeBytes = base64UrlDecode(challenge.token_challenge);
const issuerKeyBytes = base64UrlDecode(challenge.issuer_key);
const extensionsBytes = base64UrlDecode(challenge.extensions);
const tokenChallenge = TokenChallenge.deserialize(challengeBytes);

console.log('TokenChallenge:', {
  tokenType: `0x${tokenChallenge.tokenType.toString(16)}`,
  issuerName: tokenChallenge.issuerName,
  originInfo: tokenChallenge.originInfo,
});

const extensions = Extensions.deserialize(extensionsBytes);
console.log('Extensions parsed, count:', extensions.extensions.length);
console.log('Extension[0] type:', `0x${extensions.extensions[0].extensionType.toString(16)}`);
console.log('Extension[0] data:', new TextDecoder().decode(extensions.extensions[0].extensionData));

const client = new ClientWithMetadata(PartiallyBlindRSAMode.PSSZero, extensions);
const tokenRequest = await client.createTokenRequest(tokenChallenge, issuerKeyBytes);
const requestBody = tokenRequest.serialize();
console.log('ExtendedTokenRequest serialized, length:', requestBody.length);
console.log('Token type in request:', `0x${((requestBody[0] << 8) | requestBody[1]).toString(16)}`);

// Step 3: Send to moat proxy
console.log('\nStep 3: Sending to issuer via moat proxy...');
const issueRes = await fetch(`${MOAT_URL}/auth/privacypass/token-request`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/private-token-request' },
  body: requestBody,
});
console.log('Issuer response status:', issueRes.status);
if (!issueRes.ok) {
  const body = await issueRes.text();
  console.error('Token issuance failed:', body);
  process.exit(1);
}

const responseBytes = new Uint8Array(await issueRes.arrayBuffer());
console.log('Token response length:', responseBytes.length);

// Step 4: Finalize token
console.log('\nStep 4: Finalizing PBRS token...');
const tokenResponse = client.deserializeTokenResponse(responseBytes);
const token = await client.finalize(tokenResponse);
const tokenBytes = token.serialize();
console.log('Token finalized, length:', tokenBytes.length);

// Step 5: Combine token + extensions for relay
const combined = new Uint8Array(tokenBytes.length + extensionsBytes.length);
combined.set(tokenBytes);
combined.set(extensionsBytes, tokenBytes.length);
console.log('Combined (token+extensions) length:', combined.length);
console.log('Base64url token:', base64UrlEncode(combined).slice(0, 40) + '...');

console.log('\nSUCCESS! PBRS token (0xda7a) with scope obtained end-to-end.');
console.log('Scope:', new TextDecoder().decode(extensions.extensions[0].extensionData));
