// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { useRef, useEffect, useState } from 'react';
import { useDebugStore, type DebugEvent } from '../../stores/debug-store';
import { useConnectionStore } from '../../stores/connection-store';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 1 });
}

const sourceColors: Record<string, string> = {
  moat: 'text-blue-400',
  relay: 'text-green-400',
  protocol: 'text-purple-400',
};

const dirIcons: Record<string, string> = {
  send: '→',
  recv: '←',
  info: '•',
};

function EventRow({ event }: { event: DebugEvent }) {
  return (
    <div className="flex gap-2 text-[11px] leading-tight font-mono py-0.5 border-b border-gray-800/50">
      <span className="text-gray-500 w-[72px] shrink-0">{formatTime(event.timestamp)}</span>
      <span className="w-3 shrink-0">{dirIcons[event.direction]}</span>
      <span className={`w-[52px] shrink-0 ${sourceColors[event.source] || 'text-gray-400'}`}>
        {event.source}
      </span>
      <span className="text-gray-200 truncate flex-1">
        {event.label}
        {event.count && event.count > 1 && (
          <span className="ml-1 text-amber-400/80">({event.count})</span>
        )}
      </span>
      {event.detail && (
        <span className="text-gray-500 truncate max-w-[200px]">{event.detail}</span>
      )}
    </div>
  );
}

export function DebugPanel() {
  const { visible, toggle, events, tokenSnippet, publishedTracks, subscribedTracks, namespaces, relayUrl, setRelayUrl } = useDebugStore();
  const clearToken = useConnectionStore((s) => s.clearToken);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState(relayUrl);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={toggle}
        className="fixed bottom-3 right-3 z-50 bg-gray-900 text-gray-300 text-xs px-2 py-1 rounded border border-gray-700 hover:bg-gray-800 font-mono"
      >
        {visible ? 'Hide' : 'Debug'}
      </button>

      {/* Panel */}
      {visible && (
        <div className="fixed bottom-10 right-3 z-50 w-[600px] max-h-[420px] bg-gray-950/95 border border-gray-700 rounded-lg shadow-2xl flex flex-col overflow-hidden backdrop-blur-sm">
          {/* Header */}
          <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-300">Protocol Debug</span>
            <div className="flex gap-2">
              <button onClick={clearToken} className="text-[10px] text-amber-500 hover:text-amber-300">
                flush token
              </button>
              <button onClick={() => useDebugStore.getState().clear()} className="text-[10px] text-gray-500 hover:text-gray-300">
                clear
              </button>
            </div>
          </div>

          {/* Relay URL */}
          <div className="px-3 py-1.5 border-b border-gray-800 flex items-center gap-2 text-[10px] font-mono">
            <span className="text-gray-500 shrink-0">relay:</span>
            {editingUrl ? (
              <form className="flex-1 flex gap-1" onSubmit={(e) => { e.preventDefault(); setRelayUrl(urlDraft); setEditingUrl(false); }}>
                <input
                  className="flex-1 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 text-[10px] font-mono"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="text-green-400 hover:text-green-300">save</button>
                <button type="button" onClick={() => { setEditingUrl(false); setUrlDraft(relayUrl); }} className="text-gray-500 hover:text-gray-300">cancel</button>
              </form>
            ) : (
              <>
                <span className="text-cyan-400 truncate flex-1">{relayUrl}</span>
                <button onClick={() => setEditingUrl(true)} className="text-gray-500 hover:text-gray-300">edit</button>
              </>
            )}
          </div>

          {/* Summary row */}
          <div className="px-3 py-1.5 border-b border-gray-800 text-[10px] font-mono text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
            {tokenSnippet && (
              <span>token: <span className="text-amber-400">{tokenSnippet}</span></span>
            )}
            {namespaces.length > 0 && (
              <span>ns: <span className="text-cyan-400">{namespaces.length}</span></span>
            )}
            {publishedTracks.length > 0 && (
              <span>pub: <span className="text-green-400">{publishedTracks.length}</span></span>
            )}
            {subscribedTracks.length > 0 && (
              <span>sub: <span className="text-blue-400">{subscribedTracks.length}</span></span>
            )}
          </div>

          {/* Track details (collapsible section) */}
          {(publishedTracks.length > 0 || subscribedTracks.length > 0) && (
            <details className="border-b border-gray-800">
              <summary className="px-3 py-1 text-[10px] text-gray-500 cursor-pointer hover:text-gray-300">
                Tracks ({publishedTracks.length} pub, {subscribedTracks.length} sub)
              </summary>
              <div className="px-3 pb-2 text-[10px] font-mono max-h-[80px] overflow-y-auto">
                {publishedTracks.map((t) => (
                  <div key={`p-${t}`} className="text-green-500">{'↑'} {t}</div>
                ))}
                {subscribedTracks.map((t) => (
                  <div key={`s-${t}`} className="text-blue-500">{'↓'} {t}</div>
                ))}
              </div>
            </details>
          )}

          {/* Events log */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-1 min-h-[120px]">
            {events.length === 0 && (
              <div className="text-[11px] text-gray-600 py-4 text-center">No events yet</div>
            )}
            {events.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
