// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import type { TokenProvider } from './token-provider.js';
import type { MochaIdentity } from '../types.js';
import { CatTokenDecoder } from '@moq-web/cat';
import type { MoqtScope } from '@moq-web/cat';

export interface CatProviderConfig {
  moatBaseUrl: string;
  audience?: string;
}

interface MoatTokenResponse {
  token: string;
  expires_at: number;
  scopes: MoqtScope[];
}

/**
 * CAT (Common Access Token / C4M) provider.
 * Uses @moq-web/cat for standards-compliant COSE_Sign1/CWT tokens
 * with MoQT namespace-scoped authorization.
 */
export class CatTokenProvider implements TokenProvider {
  private _sessionToken: string | null = null;
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private config: CatProviderConfig;

  constructor(config: CatProviderConfig) {
    this.config = config;
  }

  get sessionToken(): string | null {
    return this._sessionToken;
  }

  async loginGuest(displayName: string): Promise<MochaIdentity> {
    const res = await fetch(`${this.config.moatBaseUrl}/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayName }),
    });
    if (!res.ok) throw new Error(`Guest login failed: ${res.status}`);
    const data = await res.json();
    this._sessionToken = data.session_token;
    return {
      userId: data.user_id,
      displayName: data.display_name || displayName,
    };
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

  async getToken(roomId: string, role: 'publisher' | 'subscriber'): Promise<string> {
    if (this.cachedToken && Date.now() / 1000 < this.tokenExpiresAt - 60) {
      return this.cachedToken;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this._sessionToken) {
      headers['Authorization'] = `Bearer ${this._sessionToken}`;
    }

    const useAnonymous = !this._sessionToken;
    const endpoint = useAnonymous
      ? `${this.config.moatBaseUrl}/token/anonymous`
      : `${this.config.moatBaseUrl}/token`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ room_id: roomId, role, token_type: 0x63346d }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `CAT token mint failed: ${res.status}`);
    }
    const data: MoatTokenResponse = await res.json();
    this.cachedToken = data.token;
    this.tokenExpiresAt = data.expires_at;
    return data.token;
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

  /**
   * Decode a cached token for inspection (e.g., debug panel).
   */
  inspectToken(): { claims: Record<string, unknown>; scopes: MoqtScope[] } | null {
    if (!this.cachedToken) return null;
    try {
      const token = CatTokenDecoder.decodeFromBase64url(this.cachedToken);
      return {
        claims: {
          iss: token.claims.iss,
          sub: token.claims.sub,
          aud: token.claims.aud,
          exp: token.claims.exp,
          iat: token.claims.iat,
        },
        scopes: token.claims.moqt ?? [],
      };
    } catch {
      return null;
    }
  }
}
