// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { webcrypto } from 'crypto';
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, writable: true, configurable: true });
}

const ppPath = './node_modules/.pnpm/@cloudflare+privacypass-ts@0.9.0/node_modules/@cloudflare/privacypass-ts/lib/src/index.js';
const pp = await import(ppPath);
const { Client, BlindRSAMode } = pp.publicVerif;
const { TokenChallenge } = pp;

const MOAT_URL = 'https://api.mocha-net.dev/v1';

function base64UrlDecode(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = Buffer.from(base64 + padding, 'base64');
  return new Uint8Array(binary);
}

// Step 1: Get challenge from moat
console.log('Step 1: Getting challenge...');
const challengeRes = await fetch(`${MOAT_URL}/auth/privacypass/challenge`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ room_id: 'test' }),
});
if (!challengeRes.ok) {
  console.error('Challenge failed:', challengeRes.status, await challengeRes.text());
  process.exit(1);
}
const challenge = await challengeRes.json();
console.log('Got challenge, token_challenge length:', challenge.token_challenge.length);
console.log('Got issuer_key length:', challenge.issuer_key.length);

// Step 2: Decode and create token request
console.log('\nStep 2: Creating token request...');
const challengeBytes = base64UrlDecode(challenge.token_challenge);
const issuerKeyBytes = base64UrlDecode(challenge.issuer_key);
console.log('Challenge bytes length:', challengeBytes.length);
console.log('Issuer key bytes length:', issuerKeyBytes.length);

const tokenChallenge = TokenChallenge.deserialize(challengeBytes);
console.log('TokenChallenge parsed:', {
  tokenType: tokenChallenge.tokenType,
  issuerName: tokenChallenge.issuerName,
  redemptionContextLen: tokenChallenge.redemptionContext?.length,
  originInfo: tokenChallenge.originInfo,
});

const client = new Client(BlindRSAMode.PSSZero);
console.log('Client mode: PSSZero');

const tokenRequest = await client.createTokenRequest(tokenChallenge, issuerKeyBytes);
const requestBody = tokenRequest.serialize();
console.log('Token request serialized, length:', requestBody.length);
console.log('Token type in request:', (requestBody[0] << 8) | requestBody[1], '(expect 2)');
console.log('Truncated key ID:', requestBody[2]);

// Step 3: Send to moat proxy  
console.log('\nStep 3: Sending token request to moat proxy...');
const issueRes = await fetch(`${MOAT_URL}/auth/privacypass/token-request`, {
  method: 'POST',
  headers: { 'Content-Type': 'message/token-request' },
  body: requestBody,
});
console.log('Issuer response status:', issueRes.status);
if (!issueRes.ok) {
  const body = await issueRes.text();
  console.error('Token issuance failed:', body);
  
  // Also try directly to issuer to rule out proxy issues
  console.log('\nStep 3b: Trying directly to issuer...');
  const directRes = await fetch('https://demo-pat.issuer.cloudflare.com/token-request', {
    method: 'POST',
    headers: { 'Content-Type': 'message/token-request' },
    body: requestBody,
  });
  console.log('Direct issuer response status:', directRes.status);
  if (!directRes.ok) {
    const directBody = await directRes.text();
    console.error('Direct issuance also failed:', directBody);
  } else {
    console.log('Direct issuance SUCCEEDED! Proxy issue.');
    const respBytes = new Uint8Array(await directRes.arrayBuffer());
    console.log('Response length:', respBytes.length);
  }
  process.exit(1);
}

const responseBytes = new Uint8Array(await issueRes.arrayBuffer());
console.log('Token response length:', responseBytes.length);

// Step 4: Finalize
console.log('\nStep 4: Finalizing token...');
const tokenResponse = client.deserializeTokenResponse(responseBytes);
const token = await client.finalize(tokenResponse);
const tokenBytes = token.serialize();
console.log('SUCCESS! Token length:', tokenBytes.length);
