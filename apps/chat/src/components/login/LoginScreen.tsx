// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/auth-store';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (element: HTMLElement, options: { theme: string; size: string; width: number; shape: string }) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export function LoginScreen() {
  const { loginAsGuest, loginWithGoogle, isLoading, error, authMode, setAuthMode } = useAuthStore();
  const [name, setName] = useState('');
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginAsGuest(name || undefined);
  };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleBtnRef.current || authMode === 'no_auth') return;

    const renderButton = () => {
      window.google?.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          loginWithGoogle(response.credential);
        },
      });
      if (googleBtnRef.current) {
        window.google?.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
          shape: 'pill',
        });
      }
    };

    if (window.google) {
      renderButton();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = renderButton;
    document.head.appendChild(script);

    return () => { script.remove(); };
  }, [loginWithGoogle, authMode]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-card p-10 w-full max-w-sm">
        {/* Logo + Brand */}
        <div className="flex items-center gap-4 mb-8">
          <img src="/logo.svg" alt="MOCHA" className="w-14 h-14 drop-shadow-md" />
          <div>
            <h1 className="text-2xl font-bold text-mocha-800 dark:text-mocha-100">MOCHA</h1>
            <p className="text-mocha-500 dark:text-mocha-400 text-xs tracking-wide">Chat over MoQ Transport</p>
          </div>
        </div>

        {/* Auth Mode */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-mocha-500 dark:text-mocha-400 mb-2">Auth Mode</label>
          <div className="flex gap-1 p-0.5 rounded-lg bg-mocha-50 dark:bg-gray-800 border border-mocha-200 dark:border-gray-700">
            {(['cat', 'privacy_pass', 'no_auth'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setAuthMode(mode)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                  authMode === mode
                    ? 'bg-white dark:bg-gray-700 text-mocha-800 dark:text-gray-100 shadow-sm'
                    : 'text-mocha-500 dark:text-gray-400 hover:text-mocha-700 dark:hover:text-gray-200'
                }`}
              >
                {mode === 'cat' ? 'CAT' : mode === 'privacy_pass' ? 'Privacy Pass' : 'No Auth'}
              </button>
            ))}
          </div>
        </div>

        {/* Google Sign-In */}
        {GOOGLE_CLIENT_ID && authMode !== 'no_auth' && (
          <>
            <div ref={googleBtnRef} className="mb-4 flex justify-center" />
            <div className="relative mb-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-mocha-200 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white/70 dark:bg-gray-900/80 px-3 text-mocha-400 dark:text-gray-500">or</span>
              </div>
            </div>
          </>
        )}

        {/* Guest Login */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-mocha-700 dark:text-mocha-300 mb-2">
              Display Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name..."
              className="glass-input w-full"
              autoFocus={!GOOGLE_CLIENT_ID}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="glass-button w-full"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Connecting...
              </span>
            ) : (
              'Join as Guest'
            )}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <p className="mt-6 text-center text-[10px] text-mocha-300 dark:text-gray-600">v{__APP_VERSION__}</p>
      </div>
    </div>
  );
}
