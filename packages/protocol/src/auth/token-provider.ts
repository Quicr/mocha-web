// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import type { MochaIdentity } from '../types.js';

export interface TokenProvider {
  getToken(roomId: string, role: 'publisher' | 'subscriber'): Promise<string>;
  refreshIfNeeded(roomId: string, role: 'publisher' | 'subscriber'): Promise<string | null>;
  getExpiresIn(): number;
  clearCachedToken(): void;
  readonly sessionToken?: string | null;
}

/** @deprecated Use CatTokenProvider instead */
export class MoatTokenProvider implements TokenProvider {
  private _sessionToken: string | null = null;
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private isGuest = false;

  constructor(private baseUrl: string) {}

  get sessionToken(): string | null {
    return this._sessionToken;
  }

  async loginGuest(displayName: string): Promise<MochaIdentity> {
    const res = await fetch(`${this.baseUrl}/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayName }),
    });
    if (!res.ok) throw new Error(`Guest login failed: ${res.status}`);
    const data = await res.json();
    this._sessionToken = data.session_token;
    this.isGuest = true;
    return {
      userId: data.user_id,
      displayName: data.display_name || displayName,
    };
  }

  async loginGoogle(idToken: string): Promise<MochaIdentity> {
    const res = await fetch(`${this.baseUrl}/auth/google`, {
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

    const useAnonymous = !this._sessionToken || this.isGuest;
    const endpoint = useAnonymous
      ? `${this.baseUrl}/token/anonymous`
      : `${this.baseUrl}/token`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ room_id: roomId, role }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Token mint failed: ${res.status}`);
    }
    const data = await res.json();
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
}
