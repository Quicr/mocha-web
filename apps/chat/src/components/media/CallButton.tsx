// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { useState, useRef, useEffect } from 'react';
import { useMediaStore } from '../../stores/media-store';

export function CallButton({ channelName }: { channelName: string }) {
  const { inCall, startCall, endCall, signalCall } = useMediaStore();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showMenu]);

  if (inCall) {
    return (
      <button
        onClick={endCall}
        className="p-1.5 rounded-full transition-colors bg-red-500 text-white hover:bg-red-600"
        title="End call"
      >
        <span className="material-symbols-rounded text-lg">call_end</span>
      </button>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="p-1.5 rounded-full transition-colors text-mocha-500 dark:text-gray-400 hover:text-mocha-700 dark:hover:text-gray-200 hover:bg-mocha-100 dark:hover:bg-gray-700"
        title="Start call"
      >
        <span className="material-symbols-rounded text-lg">call</span>
      </button>
      {showMenu && (
        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-mocha-200 dark:border-gray-600 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
          <button
            onClick={() => { setShowMenu(false); signalCall(channelName, 'video'); }}
            className="w-full px-3 py-2 text-left text-sm text-mocha-700 dark:text-gray-300 hover:bg-mocha-50 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <span className="material-symbols-rounded text-base">videocam</span>
            Video call
          </button>
          <button
            onClick={() => { setShowMenu(false); signalCall(channelName, 'audio'); }}
            className="w-full px-3 py-2 text-left text-sm text-mocha-700 dark:text-gray-300 hover:bg-mocha-50 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <span className="material-symbols-rounded text-base">call</span>
            Voice call
          </button>
          <button
            onClick={() => { setShowMenu(false); startCall(channelName, 'video'); }}
            className="w-full px-3 py-2 text-left text-sm text-mocha-500 dark:text-gray-400 hover:bg-mocha-50 dark:hover:bg-gray-700 flex items-center gap-2 border-t border-mocha-100 dark:border-gray-700"
          >
            <span className="material-symbols-rounded text-base">group</span>
            Join silently
          </button>
        </div>
      )}
    </div>
  );
}
