// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { useState } from 'react';
import { useAuthStore } from '../../stores/auth-store';

const TOKEN_SERVICE_URL = import.meta.env.VITE_TOKEN_SERVICE_URL || '/api';

interface Props {
  roomId: string;
  roomName: string;
}

export function ShareButton({ roomId, roomName }: Props) {
  const { tokenProvider } = useAuthStore();
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleShare = async () => {
    setLoading(true);
    try {
      const sessionToken = tokenProvider.sessionToken;
      const res = await fetch(`${TOKEN_SERVICE_URL}/rooms/${roomId}/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed: ${res.status}`);
      }

      const { url } = await res.json();
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Share failed:', err);
      // Fallback: copy the current page URL
      const fallbackUrl = `${window.location.origin}/join?room=${encodeURIComponent(roomName)}`;
      await navigator.clipboard.writeText(fallbackUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleShare}
      disabled={loading}
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-mocha-600 dark:text-mocha-300 hover:bg-mocha-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
      title="Copy invite link"
    >
      <span className="material-symbols-rounded text-lg">
        {copied ? 'check' : 'link'}
      </span>
      {copied && <span className="text-xs text-green-600 font-medium">Copied!</span>}
    </button>
  );
}
