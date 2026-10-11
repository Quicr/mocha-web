// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { useState } from 'react';
import { useSettingsStore, type Settings, type Theme } from '../../stores/settings-store';

function ComponentCard({ icon, label, version, repo }: { icon: string; label: string; version: string; repo: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/60 dark:bg-gray-800/60 border border-mocha-100 dark:border-gray-700">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-mocha-100 dark:bg-gray-700 text-mocha-600 dark:text-mocha-300 shrink-0">
        <span className="material-symbols-rounded text-lg">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-mocha-800 dark:text-gray-100">{label}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-mocha-100 dark:bg-gray-700 text-mocha-600 dark:text-mocha-300">{version}</span>
        </div>
        {repo && (
          <a href={repo} target="_blank" rel="noopener noreferrer" className="text-[11px] text-mocha-400 dark:text-gray-500 hover:text-mocha-600 dark:hover:text-gray-300 truncate block">
            {repo.replace('https://github.com/', '')}
          </a>
        )}
      </div>
      {repo && (
        <a href={repo} target="_blank" rel="noopener noreferrer" className="text-mocha-300 dark:text-gray-600 hover:text-mocha-500 dark:hover:text-gray-400 shrink-0">
          <span className="material-symbols-rounded text-base">open_in_new</span>
        </a>
      )}
    </div>
  );
}

const THEME_OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'light_mode' },
  { value: 'dark', label: 'Dark', icon: 'dark_mode' },
  { value: 'system', label: 'System', icon: 'desktop_windows' },
];

type Tab = 'settings' | 'about';

export function SettingsPanel() {
  const { settings, visible, toggle, update, reset } = useSettingsStore();
  const [draft, setDraft] = useState<Settings>(settings);
  const [tab, setTab] = useState<Tab>('settings');

  if (!visible) return null;

  const handleSave = () => {
    update(draft);
    toggle();
    window.location.reload();
  };

  const handleReset = () => {
    reset();
    setDraft(useSettingsStore.getState().settings);
  };

  const handleThemeChange = (theme: Theme) => {
    setDraft({ ...draft, theme });
    // Apply theme immediately for instant feedback
    update({ theme });
  };

  const field = (label: string, key: keyof Settings, placeholder: string) => (
    <div className="mb-3">
      <label className="block text-xs font-medium text-mocha-500 dark:text-gray-400 mb-1">{label}</label>
      <input
        type="text"
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-mocha-200 dark:border-gray-600 bg-white/80 dark:bg-gray-800 text-sm font-mono text-mocha-800 dark:text-gray-100 focus:outline-none focus:border-mocha-400 dark:focus:border-gray-500"
      />
    </div>
  );

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium transition-colors ${
      tab === t
        ? 'text-mocha-800 dark:text-gray-100 border-b-2 border-mocha-600 dark:border-mocha-400'
        : 'text-mocha-400 dark:text-gray-500 hover:text-mocha-600 dark:hover:text-gray-300'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={toggle}>
      <div className="glass-card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-mocha-800 dark:text-gray-100">Settings</h2>
          <button onClick={toggle} className="text-mocha-400 dark:text-gray-500 hover:text-mocha-600 dark:hover:text-gray-300">
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>

        <div className="flex border-b border-mocha-200 dark:border-gray-700 mb-4">
          <button className={tabClass('settings')} onClick={() => setTab('settings')}>
            <span className="material-symbols-rounded text-sm align-middle mr-1">tune</span>
            Settings
          </button>
          <button className={tabClass('about')} onClick={() => setTab('about')}>
            <span className="material-symbols-rounded text-sm align-middle mr-1">info</span>
            About
          </button>
        </div>

        {tab === 'settings' && (
          <>
            {/* Theme */}
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-mocha-600 dark:text-gray-400 uppercase tracking-wide mb-2">Appearance</h3>
              <div className="flex gap-1 p-0.5 rounded-lg bg-mocha-50 dark:bg-gray-800 border border-mocha-200 dark:border-gray-700">
                {THEME_OPTIONS.map(({ value, label, icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleThemeChange(value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                      draft.theme === value
                        ? 'bg-white dark:bg-gray-700 text-mocha-800 dark:text-gray-100 shadow-sm'
                        : 'text-mocha-500 dark:text-gray-400 hover:text-mocha-700 dark:hover:text-gray-200'
                    }`}
                  >
                    <span className="material-symbols-rounded text-sm">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <h3 className="text-xs font-semibold text-mocha-600 dark:text-gray-400 uppercase tracking-wide mb-2">Connection</h3>
              {field('Relay URL', 'relayUrl', 'https://relay.mocha-net.dev')}
              {field('Token Service (Moat) URL', 'moatUrl', 'https://api.mocha-net.dev/v1')}
              <div className="mb-3">
                <label className="block text-xs font-medium text-mocha-500 dark:text-gray-400 mb-1">MOQT Draft Version</label>
                <select
                  value={draft.draft}
                  onChange={(e) => setDraft({ ...draft, draft: e.target.value as Settings['draft'] })}
                  className="w-full px-3 py-2 rounded-lg border border-mocha-200 dark:border-gray-600 bg-white/80 dark:bg-gray-800 text-sm font-mono text-mocha-800 dark:text-gray-100 focus:outline-none focus:border-mocha-400 dark:focus:border-gray-500"
                >
                  <option value="draft-16">draft-16 (Cloudflare)</option>
                  <option value="draft-17">draft-17</option>
                  <option value="draft-18">draft-18 (moq-rs)</option>
                  <option value="draft-22">draft-22</option>
                </select>
              </div>
            </div>

            <div className="mb-5">
              <h3 className="text-xs font-semibold text-mocha-600 dark:text-gray-400 uppercase tracking-wide mb-2">Namespace</h3>
              {field('Provider', 'provider', 'mocha-net.dev')}
              {field('Org ID', 'orgId', 'demo-org')}
              {field('Team ID', 'teamId', 'demo-team')}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="flex-1 py-2 rounded-lg bg-mocha-600 dark:bg-mocha-500 text-white text-sm font-medium hover:bg-mocha-700 dark:hover:bg-mocha-600 transition-colors"
              >
                Save & Reload
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-lg border border-mocha-200 dark:border-gray-600 text-mocha-600 dark:text-gray-300 text-sm font-medium hover:bg-mocha-50 dark:hover:bg-gray-800 transition-colors"
              >
                Reset
              </button>
            </div>

            <p className="mt-3 text-[10px] text-mocha-400 dark:text-gray-500 text-center">
              Changes require a page reload to take effect.
            </p>
          </>
        )}

        {tab === 'about' && (
          <div className="space-y-4">
            <div className="text-center py-2">
              <h3 className="text-base font-bold text-mocha-800 dark:text-gray-100 tracking-tight">MOCHA</h3>
              <p className="text-[11px] text-mocha-400 dark:text-gray-500 mt-0.5">MoQ Open Communication & Hosting Architecture</p>
            </div>

            <div className="space-y-2">
              <h4 className="text-[10px] font-semibold text-mocha-400 dark:text-gray-500 uppercase tracking-widest px-1">Components</h4>
              <ComponentCard icon="chat" label="Mocha Chat" version={__APP_VERSION__} repo={__MOCHA_REPO__} />
              <ComponentCard icon="token" label="Moat" version={__MOAT_VERSION__} repo={__MOAT_REPO__} />
              <ComponentCard icon="cell_tower" label="Relay (moq-rs)" version={__RELAY_VERSION__} repo={__RELAY_REPO__} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-white/60 dark:bg-gray-800/60 border border-mocha-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-mocha-100 dark:bg-gray-700 text-mocha-600 dark:text-mocha-300 shrink-0">
                  <span className="material-symbols-rounded text-lg">description</span>
                </div>
                <span className="text-sm font-medium text-mocha-800 dark:text-gray-100">MOQT Draft</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-mocha-600 text-white">{__MOQT_VERSION__}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SettingsButton() {
  const toggle = useSettingsStore((s) => s.toggle);
  return (
    <button
      onClick={toggle}
      className="fixed bottom-3 right-16 z-50 bg-gray-900 text-gray-300 text-xs px-2 py-1 rounded border border-gray-700 hover:bg-gray-800 font-mono"
      title="Settings"
    >
      <span className="material-symbols-rounded text-sm align-middle">settings</span>
    </button>
  );
}
