// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import type { TokenProvider } from './token-provider.js';
import type { MochaIdentity } from '../types.js';

export interface PrivacyPassConfig {
  moatBaseUrl: string;
  issuerUrl: string;
  /** Use PBRS (0xda7a) with scoped extensions. Default: false (use Blind RSA 0x0002) */
  usePbrs?: boolean;
}

interface ChallengeResponse {
  token_type: number;
  token_challenge: string;
  issuer_key: string;
  extensions?: string;
}

/**
 * Privacy Pass token provider supporting both:
 * - Blind RSA (0x0002) — anonymous, unlinkable
 * - Partially Blind RSA (0xda7a) — carries namespace scope in extensions
 *
 * Per draft-jennings-moq-mocha-identity-00, PBRS tokens encode namespace
 * permissions without breaking unlinkability.
 */
export class PrivacyPassTokenProvider implements TokenProvider {
  private _sessionToken: string | null = null;
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private config: PrivacyPassConfig;

  constructor(config: PrivacyPassConfig) {
    this.config = config;
  }

  get sessionToken(): string | null {
    return this._sessionToken;
  }

  get usePbrs(): boolean {
    return this.config.usePbrs === true;
  }

  async loginGoogle(idToken: string): Promise<MochaIdentity> {
    const res = await fetch(`${this.config.moatBaseUrl}/auth/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
    });
    if (!res.ok) throw new Error(`Google login failed: ${res.status}`);
    const data = await res.json();
    this._sessionToken = data.session_token;
    return {
      userId: data.user_id,
      displayName: data.display_name || data.email,
    };
  }

  async getToken(roomId: string, _role: 'publisher' | 'subscriber'): Promise<string> {
    if (this.cachedToken && Date.now() / 1000 < this.tokenExpiresAt - 60) {
      return this.cachedToken;
    }

    const tokenType = this.usePbrs ? 0xda7a : 0x0002;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this._sessionToken) {
      headers['Authorization'] = `Bearer ${this._sessionToken}`;
    }

    // Step 1: Get challenge + issuer key from moat
    const challengeRes = await fetch(`${this.config.moatBaseUrl}/auth/privacypass/challenge`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ room_id: roomId, token_type: tokenType }),
    });
    if (!challengeRes.ok) throw new Error(`PP challenge failed: ${challengeRes.status}`);
    const challenge: ChallengeResponse = await challengeRes.json();

    const { publicVerif, TokenChallenge, Extensions } = await import('@cloudflare/privacypass-ts');

    const challengeBytes = base64UrlDecode(challenge.token_challenge);
    const issuerKeyBytes = base64UrlDecode(challenge.issuer_key);
    const tokenChallenge = TokenChallenge.deserialize(challengeBytes);

    let requestBody: ArrayBuffer;
    let client: any;

    if (this.usePbrs && challenge.extensions) {
      // PBRS flow with scoped extensions
      const extensionsBytes = base64UrlDecode(challenge.extensions);
      const extensions = Extensions.deserialize(extensionsBytes);

      const { ClientWithMetadata, PartiallyBlindRSAMode } = publicVerif;
      client = new ClientWithMetadata(PartiallyBlindRSAMode.PSSZero, extensions);
      const tokenRequest = await client.createTokenRequest(tokenChallenge, issuerKeyBytes);
      requestBody = tokenRequest.serialize();

      // Step 2: Send to moat proxy for issuance
      const issueRes = await fetch(`${this.config.moatBaseUrl}/auth/privacypass/token-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/private-token-request' },
        body: new Uint8Array(requestBody).buffer as ArrayBuffer,
      });
      if (!issueRes.ok) throw new Error(`PBRS token issuance failed: ${issueRes.status}`);
      const responseBytes = new Uint8Array(await issueRes.arrayBuffer());

      // Step 3: Finalize and combine token + extensions
      const tokenResponse = client.deserializeTokenResponse(responseBytes);
      const token = await client.finalize(tokenResponse);
      const tokenBytes = token.serialize();

      const combined = new Uint8Array(tokenBytes.length + extensionsBytes.length);
      combined.set(tokenBytes);
      combined.set(extensionsBytes, tokenBytes.length);

      this.cachedToken = base64UrlEncode(combined);
    } else {
      // Standard Blind RSA flow
      const { Client, BlindRSAMode } = publicVerif;
      client = new Client(BlindRSAMode.PSSZero);
      const tokenRequest = await client.createTokenRequest(tokenChallenge, issuerKeyBytes);
      requestBody = tokenRequest.serialize();

      const issueRes = await fetch(`${this.config.moatBaseUrl}/auth/privacypass/token-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/private-token-request' },
        body: new Uint8Array(requestBody).buffer as ArrayBuffer,
      });
      if (!issueRes.ok) throw new Error(`PP token issuance failed: ${issueRes.status}`);
      const responseBytes = new Uint8Array(await issueRes.arrayBuffer());

      const tokenResponse = client.deserializeTokenResponse(responseBytes);
      const token = await client.finalize(tokenResponse);
      const tokenBytes = token.serialize();

      this.cachedToken = base64UrlEncode(tokenBytes);
    }

    this.tokenExpiresAt = Date.now() / 1000 + 300;
    return this.cachedToken;
  }

  async refreshIfNeeded(roomId: string, role: 'publisher' | 'subscriber'): Promise<string | null> {
    if (!this.cachedToken) return null;
    if (Date.now() / 1000 > this.tokenExpiresAt - 60) {
      this.cachedToken = null;
      return this.getToken(roomId, role);
    }
    return null;
  }

  getExpiresIn(): number {
    return Math.max(0, this.tokenExpiresAt - Date.now() / 1000);
  }

  clearCachedToken(): void {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function base64UrlEncode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
