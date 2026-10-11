// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { useEffect, useRef, useState, useCallback } from 'react';
import type { MochaMessage, MessageId, Attachment } from '@mocha/protocol';
import { useChannelStore } from '../../stores/channel-store';
import { useAuthStore } from '../../stores/auth-store';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🙏', '🔥'];

function FileAttachment({ att, isOwn }: { att: Attachment; isOwn: boolean }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (att.data) {
      const blob = new Blob([new Uint8Array(att.data)], { type: att.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [att.data, att.mimeType]);

  const handleDownload = useCallback(() => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = att.name || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [blobUrl, att.name]);

  if (!blobUrl) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${isOwn ? 'border-mocha-400/50 text-mocha-100' : 'border-mocha-200 dark:border-gray-600 text-mocha-600 dark:text-gray-300'}`}>
        <span className="material-symbols-rounded text-base">description</span>
        <span className="text-xs truncate max-w-[120px]">{att.name || 'File'}</span>
        {att.size && <span className="text-[10px] opacity-60">{(att.size / 1024).toFixed(0)}KB</span>}
      </div>
    );
  }

  if (att.mimeType?.startsWith('image/')) {
    return <img src={blobUrl} alt={att.name} className="max-w-[240px] max-h-[180px] rounded-lg object-cover cursor-pointer" onClick={() => window.open(blobUrl, '_blank')} />;
  }

  return (
    <button onClick={handleDownload} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${isOwn ? 'border-mocha-400/50 text-mocha-100 hover:bg-mocha-500/30' : 'border-mocha-200 dark:border-gray-600 text-mocha-600 dark:text-gray-300 hover:bg-mocha-50 dark:hover:bg-gray-700'}`}>
      <span className="material-symbols-rounded text-base">download</span>
      <span className="text-xs truncate max-w-[120px]">{att.name}</span>
      {att.size && <span className="text-[10px] opacity-60">{(att.size / 1024).toFixed(0)}KB</span>}
    </button>
  );
}

function ReadIndicator({ msgKey, isOwn }: { msgKey: string; isOwn: boolean }) {
  const { receipts } = useChannelStore();
  if (!isOwn) return null;

  const msgReceipts = receipts.get(msgKey) || [];
  const hasRead = msgReceipts.some((r) => r.type === 'read');
  const hasDelivered = msgReceipts.some((r) => r.type === 'delivered');

  if (hasRead) {
    return <span className="material-symbols-rounded text-[11px] text-blue-300" title="Read">done_all</span>;
  }
  if (hasDelivered) {
    return <span className="material-symbols-rounded text-[11px] text-mocha-300 dark:text-gray-500" title="Delivered">done_all</span>;
  }
  return <span className="material-symbols-rounded text-[11px] text-mocha-300 dark:text-gray-500" title="Sent">check</span>;
}

function ReactionBar({ msgKey, messageId }: { msgKey: string; messageId: MessageId }) {
  const { reactions, sendReaction } = useChannelStore();
  const [showPicker, setShowPicker] = useState(false);
  const msgReactions = reactions.get(msgKey) || [];

  // Group by emoji
  const grouped = msgReactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex items-center gap-1 mt-1 flex-wrap relative">
      {Object.entries(grouped).map(([emoji, count]) => (
        <button
          key={emoji}
          onClick={() => sendReaction(messageId, emoji)}
          className="px-1.5 py-0.5 rounded-full bg-mocha-50 dark:bg-gray-800 border border-mocha-200 dark:border-gray-600 text-xs hover:bg-mocha-100 dark:hover:bg-gray-700 transition-colors"
        >
          {emoji} {count > 1 && <span className="text-mocha-500 dark:text-gray-400">{count}</span>}
        </button>
      ))}
      <button
        onClick={() => setShowPicker(!showPicker)}
        className="px-1 py-0.5 rounded-full text-mocha-300 dark:text-gray-600 hover:text-mocha-500 dark:hover:text-gray-400 hover:bg-mocha-50 dark:hover:bg-gray-800 text-xs transition-colors"
      >
        <span className="material-symbols-rounded text-sm">add_reaction</span>
      </button>
      {showPicker && (
        <div className="absolute bottom-full mb-1 left-0 flex gap-1 p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-mocha-200 dark:border-gray-600 shadow-lg z-10">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => { sendReaction(messageId, emoji); setShowPicker(false); }}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-mocha-50 dark:hover:bg-gray-700 text-base"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  onReply?: (msg: MochaMessage) => void;
  onEdit?: (msg: MochaMessage) => void;
}

export function MessageList({ onReply, onEdit }: Props) {
  const { messages, markRead, activeChannel } = useChannelStore();
  const { identity } = useAuthStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastReadRef = useRef<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.sender.userId === identity?.userId) return;
    if (lastMsg.draft) return;

    const key = `${lastMsg.id.group}:${lastMsg.id.object}`;
    if (key === lastReadRef.current) return;
    lastReadRef.current = key;
    markRead(lastMsg.id);
  }, [messages, identity, markRead]);


  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(new Set());

  // Build thread map: parentKey -> replies
  const threadMap = new Map<string, MochaMessage[]>();
  const replyKeys = new Set<string>();
  for (const msg of messages) {
    if (msg.replyTo) {
      const parentKey = `${msg.replyTo.group}:${msg.replyTo.object}`;
      const replies = threadMap.get(parentKey) || [];
      replies.push(msg);
      threadMap.set(parentKey, replies);
      replyKeys.add(`${msg.id.group}:${msg.id.object}`);
    }
  }

  const toggleCollapse = (key: string) => {
    setCollapsedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-mocha-300 dark:text-gray-600 gap-2">
        <span className="material-symbols-rounded text-5xl">chat_bubble_outline</span>
        <p className="text-sm">No messages yet. Say something!</p>
      </div>
    );
  }

  const renderBubble = (msg: MochaMessage, i: number, indent: boolean) => {
    const isOwn = msg.sender.userId === identity?.userId;
    const isDraft = msg.draft;
    const msgKey = `${msg.id.group}:${msg.id.object}`;

    const bubbleContent = (
      <div className="relative group">
        <div className={`rounded-2xl px-4 py-2 shadow-sm ${
          isDraft
            ? 'bg-white/50 dark:bg-gray-800/50 border border-dashed border-mocha-200 dark:border-gray-600 text-mocha-500 dark:text-gray-400'
            : isOwn
              ? indent
                ? 'bg-mocha-500/90 text-white'
                : 'bg-gradient-to-br from-mocha-600 to-mocha-700 text-white'
              : 'bg-white/80 dark:bg-gray-800/80 border border-mocha-100 dark:border-gray-700 text-mocha-800 dark:text-gray-100'
        }`}>
          {(!isOwn || indent) && (
            <p className={`text-xs font-semibold mb-0.5 ${isOwn ? 'text-white/70' : 'text-mocha-500 dark:text-mocha-400'}`}>
              {msg.sender.displayName}
            </p>
          )}
          {msg.content.body && <p className={`text-sm whitespace-pre-wrap leading-relaxed ${isDraft ? 'italic' : ''}`}>{msg.content.body}</p>}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1.5">
              {msg.attachments.map((att, ai) => (
                att.data ? (
                  <FileAttachment key={ai} att={att} isOwn={isOwn} />
                ) : att.mimeType?.startsWith('image/') && att.url ? (
                  <img key={ai} src={att.url} alt={att.name} className="max-w-[240px] max-h-[180px] rounded-lg object-cover cursor-pointer" onClick={() => att.url && window.open(att.url, '_blank')} />
                ) : att.url ? (
                  <a key={ai} href={att.url} download={att.name} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${isOwn ? 'border-mocha-400/50 text-mocha-100 hover:bg-mocha-500/30' : 'border-mocha-200 dark:border-gray-600 text-mocha-600 dark:text-gray-300 hover:bg-mocha-50 dark:hover:bg-gray-700'}`}>
                    <span className="material-symbols-rounded text-base">description</span>
                    <span className="text-xs truncate max-w-[120px]">{att.name}</span>
                    {att.size && <span className="text-[10px] opacity-60">{(att.size / 1024).toFixed(0)}KB</span>}
                  </a>
                ) : (
                  <div key={ai} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${isOwn ? 'border-mocha-400/50 text-mocha-100' : 'border-mocha-200 dark:border-gray-600 text-mocha-600 dark:text-gray-300'}`}>
                    <span className="material-symbols-rounded text-base">description</span>
                    <span className="text-xs truncate max-w-[120px]">{att.name || 'File'}</span>
                    {att.size && <span className="text-[10px] opacity-60">{(att.size / 1024).toFixed(0)}KB</span>}
                  </div>
                )
              ))}
            </div>
          )}
          {!isDraft && (
            <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : ''}`}>
              <span className={`text-[10px] ${isOwn ? 'text-mocha-200' : 'text-mocha-400 dark:text-gray-500'}`}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {msg.edited && (
                <span className={`text-[9px] italic ${isOwn ? 'text-mocha-300' : 'text-mocha-400 dark:text-gray-500'}`}>edited</span>
              )}
              <ReadIndicator msgKey={msgKey} isOwn={isOwn} />
            </div>
          )}
        </div>
        {!isDraft && <ReactionBar msgKey={msgKey} messageId={msg.id} />}
        {!isDraft && (
          <div className={`absolute opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 z-10 ${
            indent ? '-top-3 right-0' : isOwn ? '-left-16 top-1' : '-right-16 top-1'
          }`}>
            {onReply && (
              <button
                onClick={() => onReply(msg)}
                className="p-1 rounded-full bg-white/90 dark:bg-gray-800 border border-mocha-200 dark:border-gray-600 shadow-sm hover:bg-mocha-50 dark:hover:bg-gray-700"
                title="Reply"
              >
                <span className="material-symbols-rounded text-sm text-mocha-500 dark:text-gray-400">reply</span>
              </button>
            )}
            {isOwn && onEdit && (
              <button
                onClick={() => onEdit(msg)}
                className="p-1 rounded-full bg-white/90 dark:bg-gray-800 border border-mocha-200 dark:border-gray-600 shadow-sm hover:bg-mocha-50 dark:hover:bg-gray-700"
                title="Edit"
              >
                <span className="material-symbols-rounded text-sm text-mocha-500 dark:text-gray-400">edit</span>
              </button>
            )}
            {isOwn && activeChannel && (
              <button
                onClick={async () => {
                  const deleted = await activeChannel.deleteMessage(msg.id);
                  useChannelStore.getState().addMessage(deleted);
                }}
                className="p-1 rounded-full bg-white/90 dark:bg-gray-800 border border-mocha-200 dark:border-gray-600 shadow-sm hover:bg-red-50 dark:hover:bg-red-900/30"
                title="Delete"
              >
                <span className="material-symbols-rounded text-sm text-red-400">delete</span>
              </button>
            )}
          </div>
        )}
      </div>
    );

    if (indent) {
      return bubbleContent;
    }

    return (
      <div key={`${msgKey}-${i}`} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[70%]">
          {bubbleContent}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {messages.map((msg, i) => {
        const msgKey = `${msg.id.group}:${msg.id.object}`;

        // Skip replies — they render under their parent
        if (replyKeys.has(msgKey)) return null;

        const replies = threadMap.get(msgKey);

        if (replies && replies.length > 0) {
          const collapsed = collapsedThreads.has(msgKey);
          return (
            <div key={`thread-${msgKey}-${i}`} className="space-y-1">
              {renderBubble(msg, i, false)}
              {(() => {
                const parentIsOwn = msg.sender.userId === identity?.userId;
                return (
                  <div className={`${parentIsOwn ? 'flex flex-col items-end' : 'ml-6'}`}>
                    <button
                      onClick={() => toggleCollapse(msgKey)}
                      className="inline-flex items-center gap-1.5 text-[11px] text-mocha-500 dark:text-gray-400 hover:text-mocha-700 dark:hover:text-gray-200 px-2 py-0.5 rounded hover:bg-mocha-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <span className="material-symbols-rounded text-[13px]">
                        {collapsed ? 'expand_more' : 'expand_less'}
                      </span>
                      {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                    </button>
                    {!collapsed && (
                      <div className={`mt-1 space-y-1.5 overflow-visible ${parentIsOwn ? 'border-r-2 border-mocha-300 dark:border-gray-600 pr-3' : 'border-l-2 border-mocha-300 dark:border-gray-600 pl-3'}`}>
                        {replies.map((reply, ri) => (
                          <div key={`${reply.id.group}:${reply.id.object}-${ri}`} className="overflow-visible">
                            {renderBubble(reply, i + 1000 + ri, true)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        }

        return renderBubble(msg, i, false);
      })}
      <div ref={bottomRef} />
    </div>
  );
}
