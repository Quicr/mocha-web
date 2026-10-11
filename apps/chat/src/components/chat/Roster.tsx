// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { useState, useRef, useEffect } from 'react';
import { useChannelStore } from '../../stores/channel-store';

interface MenuState {
  userId: string;
  displayName: string;
  x: number;
  y: number;
}

export function Roster() {
  const { roster, activeChannel } = useChannelStore();
  const entries = [...roster.values()];
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const openMenu = (e: React.MouseEvent, entry: { userId: string; displayName: string }) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ userId: entry.userId, displayName: entry.displayName, x: e.clientX, y: e.clientY });
  };

  const handleAction = (action: 'mute' | 'kick' | 'ban') => {
    if (!menu || !activeChannel) return;
    activeChannel.moderate(action, menu.userId);
    setMenu(null);
  };

  return (
    <aside className="w-56 glass border-l border-mocha-100/50 dark:border-gray-700/50 p-4 overflow-y-auto hidden md:block">
      <h2 className="text-xs font-semibold text-mocha-500 dark:text-gray-400 uppercase tracking-wider mb-4">
        Online &middot; {entries.length}
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-mocha-300 dark:text-gray-600 text-center mt-8">No one else here yet</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <li
              key={entry.userId}
              className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-mocha-50 dark:hover:bg-gray-800 transition-colors"
              onContextMenu={(e) => openMenu(e, entry)}
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                entry.status === 'online' ? 'bg-green-500' :
                entry.status === 'away' ? 'bg-amber-500' :
                entry.status === 'dnd' ? 'bg-red-500' :
                'bg-gray-400'
              }`} />
              <span className="text-sm text-mocha-700 dark:text-gray-300 truncate flex-1">
                {entry.displayName}
              </span>
              <button
                onClick={(e) => openMenu(e, entry)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-mocha-400 dark:text-gray-500 hover:text-mocha-600 dark:hover:text-gray-300 hover:bg-mocha-100 dark:hover:bg-gray-700 transition-opacity"
              >
                <span className="material-symbols-rounded text-sm">more_vert</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {menu && (
        <div
          ref={menuRef}
          className="fixed bg-white dark:bg-gray-800 border border-mocha-200 dark:border-gray-600 rounded-lg shadow-lg py-1 z-[100] min-w-[140px]"
          style={{ left: menu.x, top: menu.y }}
        >
          <div className="px-3 py-1.5 text-xs text-mocha-500 dark:text-gray-400 border-b border-mocha-100 dark:border-gray-700 truncate">
            {menu.displayName}
          </div>
          <button
            onClick={() => handleAction('mute')}
            className="w-full px-3 py-2 text-left text-sm text-mocha-700 dark:text-gray-300 hover:bg-mocha-50 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <span className="material-symbols-rounded text-base text-mocha-400 dark:text-gray-500">volume_off</span>
            Mute
          </button>
          <button
            onClick={() => handleAction('kick')}
            className="w-full px-3 py-2 text-left text-sm text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center gap-2"
          >
            <span className="material-symbols-rounded text-base text-amber-500 dark:text-amber-400">logout</span>
            Kick
          </button>
          <button
            onClick={() => handleAction('ban')}
            className="w-full px-3 py-2 text-left text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
          >
            <span className="material-symbols-rounded text-base text-red-500 dark:text-red-400">block</span>
            Ban
          </button>
        </div>
      )}
    </aside>
  );
}
