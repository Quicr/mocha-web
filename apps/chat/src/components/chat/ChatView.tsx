// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { useState, useRef, useEffect, useCallback } from 'react';
import type { MochaMessage, Attachment } from '@mocha/protocol';
import { useAuthStore } from '../../stores/auth-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useChannelStore } from '../../stores/channel-store';
import { MessageList } from './MessageList';
import { TypingBar } from './TypingBar';
import { Roster } from './Roster';
import { VideoPanel } from '../media/VideoPanel';
import { CallButton } from '../media/CallButton';
import { IncomingCallOverlay } from '../media/IncomingCallOverlay';
import { ShareButton } from './ShareButton';

export function ChatView() {
  const { identity } = useAuthStore();
  const { disconnect } = useConnectionStore();
  const { activeChannel, activeRoom, leaveChannel, addMessage } = useChannelStore();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [realtime, setRealtime] = useState(false);
  const [replyTo, setReplyTo] = useState<MochaMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<MochaMessage | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const keystrokeThrottle = useRef<ReturnType<typeof setTimeout>>();
  const pendingText = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || !activeChannel) return;

    setSending(true);
    try {
      if (editingMsg) {
        const edited = await activeChannel.editMessage(editingMsg.id, { type: 'text/plain', body: input.trim() });
        addMessage(edited);
        setEditingMsg(null);
      } else {
        const finalAttachments = attachments.map((att) => {
          if (att.url?.startsWith('data:')) {
            const base64 = att.url.split(',')[1];
            const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            return { ...att, url: undefined, data: binary } as Attachment;
          }
          return att;
        });
        const sendOpts = {
          ...(replyTo ? { replyTo: replyTo.id } : {}),
          ...(finalAttachments.length > 0 ? { attachments: finalAttachments } : {}),
        };
        const msg = activeChannel.prepareMessage({ type: 'text/plain', body: input.trim() }, sendOpts);
        addMessage(msg);
        activeChannel.flushMessage(msg);
        setReplyTo(null);
      }
      setInput('');
      setAttachments([]);
    } catch (err) {
      console.error('Send failed:', err);
    } finally {
      setSending(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) return; // 10MB limit
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setAttachments((prev) => [...prev, {
          type: file.type.startsWith('image/') ? 'media' : 'file',
          url: dataUrl,
          mimeType: file.type,
          name: file.name,
          size: file.size,
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const streamKeystroke = useCallback((text: string) => {
    if (!activeChannel || !realtime) return;
    if (keystrokeThrottle.current) {
      pendingText.current = text;
      return;
    }
    activeChannel.streamKeystroke(text);
    keystrokeThrottle.current = setTimeout(() => {
      keystrokeThrottle.current = undefined;
      if (pendingText.current !== null) {
        const latest = pendingText.current;
        pendingText.current = null;
        activeChannel.streamKeystroke(latest);
      }
    }, 50);
  }, [activeChannel, realtime]);

  const lastTypingSent = useRef(0);

  const handleInput = (value: string) => {
    setInput(value);
    if (activeChannel && value.trim()) {
      if (realtime) {
        streamKeystroke(value);
      } else {
        const now = Date.now();
        if (now - lastTypingSent.current >= 1000) {
          lastTypingSent.current = now;
          activeChannel.sendTypingIndicator();
        }
      }
    }
  };

  const handleLeave = async () => {
    await leaveChannel();
    await disconnect();
  };

  useEffect(() => {
    return () => {
      if (keystrokeThrottle.current) clearTimeout(keystrokeThrottle.current);
    };
  }, []);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="glass border-b border-mocha-100/50 dark:border-gray-700/50 px-6 py-3 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <button onClick={handleLeave} className="text-mocha-500 dark:text-gray-400 hover:text-mocha-700 dark:hover:text-gray-200 transition-colors">
            <span className="material-symbols-rounded">arrow_back</span>
          </button>
          <img src="/logo.svg" alt="" className="w-7 h-7" />
          <h1 className="font-semibold text-mocha-800 dark:text-gray-100">
            # {activeRoom?.name}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <ShareButton roomId={activeRoom?.id ?? ''} roomName={activeRoom?.name ?? ''} />
          <CallButton channelName={activeRoom?.name ?? ''} />
          <span className="text-sm text-mocha-600 dark:text-mocha-300">{identity?.displayName}</span>
          <span className="w-2 h-2 rounded-full bg-green-500" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Messages area */}
        <div className="flex-1 flex flex-col">
          <MessageList
            onReply={(msg) => {
              const msgs = useChannelStore.getState().messages;
              let root = msg;
              while (root.replyTo) {
                const parent = msgs.find((m) => m.id.group === root.replyTo!.group && m.id.object === root.replyTo!.object);
                if (!parent) break;
                root = parent;
              }
              setReplyTo(root);
              setEditingMsg(null);
              inputRef.current?.focus();
            }}
            onEdit={(msg) => { setEditingMsg(msg); setReplyTo(null); setInput(msg.content.body); inputRef.current?.focus(); }}
          />
          <TypingBar />

          {/* Input */}
          <div className="p-4 glass border-t border-mocha-100/50 dark:border-gray-700/50">
            {editingMsg && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 border-l-3 border-blue-400">
                <span className="material-symbols-rounded text-sm text-blue-500 dark:text-blue-400">edit</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">Editing message</p>
                  <p className="text-xs text-blue-500 dark:text-blue-300 truncate">{editingMsg.content.body}</p>
                </div>
                <button onClick={() => { setEditingMsg(null); setInput(''); }} className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-300">
                  <span className="material-symbols-rounded text-sm">close</span>
                </button>
              </div>
            )}
            {replyTo && !editingMsg && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-mocha-50 dark:bg-gray-800 border-l-3 border-mocha-400">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-mocha-600 dark:text-mocha-300">{replyTo.sender.displayName}</p>
                  <p className="text-xs text-mocha-500 dark:text-mocha-400 truncate">{replyTo.content.body}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-mocha-400 hover:text-mocha-600 dark:text-gray-500 dark:hover:text-gray-300">
                  <span className="material-symbols-rounded text-sm">close</span>
                </button>
              </div>
            )}
            {attachments.length > 0 && (
              <div className="flex gap-2 mb-2 flex-wrap">
                {attachments.map((att, i) => (
                  <div key={i} className="relative group">
                    {att.mimeType?.startsWith('image/') ? (
                      <img src={att.url} alt={att.name} className="h-16 w-16 object-cover rounded-lg border border-mocha-200 dark:border-gray-600" />
                    ) : (
                      <div className="h-16 px-3 flex items-center gap-2 rounded-lg border border-mocha-200 dark:border-gray-600 bg-mocha-50 dark:bg-gray-800">
                        <span className="material-symbols-rounded text-mocha-400 dark:text-gray-400">description</span>
                        <span className="text-xs text-mocha-600 dark:text-gray-300 max-w-[100px] truncate">{att.name}</span>
                      </div>
                    )}
                    <button
                      onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleSend} className="flex gap-3 items-center">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.md,.json,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-mocha-400 dark:text-gray-500 hover:text-mocha-600 dark:hover:text-gray-300 transition-colors"
              >
                <span className="material-symbols-rounded text-lg">attach_file</span>
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => handleInput(e.target.value)}
                placeholder={replyTo ? 'Reply...' : 'Type a message...'}
                className="glass-input flex-1"
              />
              <label className="flex items-center gap-1 text-xs text-mocha-500 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={realtime}
                  onChange={(e) => setRealtime(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-mocha-600"
                />
                live
              </label>
              <button
                type="submit"
                disabled={!input.trim() && attachments.length === 0 || sending}
                className="glass-button px-5"
              >
                <span className="material-symbols-rounded text-lg">send</span>
              </button>
            </form>
          </div>
        </div>

        {/* Roster */}
        <Roster />
      </div>

      {/* Floating video panel */}
      <VideoPanel />
      <IncomingCallOverlay />
    </div>
  );
}
