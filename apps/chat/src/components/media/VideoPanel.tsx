// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMediaStore } from '../../stores/media-store';

function LocalVideoPiP({ stream, audioOnly }: { stream: MediaStream | null; audioOnly: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    timerRef.current = setTimeout(() => setVisible(false), 5000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <div
      className={`absolute bottom-2 right-2 z-10 rounded-lg overflow-hidden shadow-lg border border-white/20 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}
      style={{ width: '120px', height: '90px' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => {
        timerRef.current = setTimeout(() => setVisible(false), 3000);
      }}
    >
      {stream && !audioOnly ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-black/60 flex items-center justify-center text-white/50">
          <span className="material-symbols-rounded text-xl">
            {audioOnly ? 'mic' : 'videocam_off'}
          </span>
        </div>
      )}
      <span className="absolute bottom-0.5 left-1 text-[10px] text-white/80 bg-black/40 px-1 rounded">
        You
      </span>
    </div>
  );
}

function RemoteVideoTile({ userId }: { userId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setRemoteCanvas = useMediaStore((s) => s.setRemoteCanvas);

  useEffect(() => {
    if (canvasRef.current) {
      setRemoteCanvas(userId, canvasRef.current);
    }
    return () => {
      setRemoteCanvas(userId, null);
    };
  }, [userId, setRemoteCanvas]);

  return (
    <div className="relative bg-black rounded-lg overflow-hidden w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full object-contain" />
      <span className="absolute bottom-1 left-2 text-xs text-white/80 bg-black/40 px-1.5 py-0.5 rounded">
        {userId.slice(0, 8)}
      </span>
    </div>
  );
}

function ScreenShareTile({ userId, isLocal }: { userId: string; isLocal: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const setRemoteScreenCanvas = useMediaStore((s) => s.setRemoteScreenCanvas);
  const screenStream = useMediaStore((s) => s.screenStream);

  useEffect(() => {
    if (isLocal && videoRef.current && screenStream) {
      videoRef.current.srcObject = screenStream;
    }
  }, [isLocal, screenStream]);

  useEffect(() => {
    if (!isLocal && canvasRef.current) {
      setRemoteScreenCanvas(userId, canvasRef.current);
    }
    return () => {
      if (!isLocal) setRemoteScreenCanvas(userId, null);
    };
  }, [userId, isLocal, setRemoteScreenCanvas]);

  return (
    <div className="relative bg-black/80 rounded-lg overflow-hidden w-full" style={{ paddingBottom: '40%' }}>
      {isLocal ? (
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-contain" />
      ) : (
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain" />
      )}
      <span className="absolute bottom-1 left-2 text-xs text-white/80 bg-black/40 px-1.5 py-0.5 rounded">
        <span className="material-symbols-rounded text-xs mr-0.5">screen_share</span>
        {isLocal ? 'Your screen' : `${userId.slice(0, 8)}'s screen`}
      </span>
    </div>
  );
}

export function VideoPanel() {
  const {
    inCall, callMode, localStream, remoteUserIds, remoteScreenUsers,
    audioEnabled, videoEnabled, screenSharing,
    endCall, toggleAudio, toggleVideo, startScreenShare, stopScreenShare,
  } = useMediaStore();
  const [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [panelWidth, setPanelWidth] = useState(640);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStart = useRef({ x: 0, width: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if ((e.target as HTMLElement).closest('.resize-handle')) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
  }, [position]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    resizeStart.current = { x: e.clientX, width: panelWidth };
  }, [panelWidth]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPosition({ x: dragStart.current.posX + dx, y: dragStart.current.posY + dy });
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = resizeStart.current.x - e.clientX;
      const newWidth = Math.max(320, Math.min(960, resizeStart.current.width + dx));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => setIsResizing(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  if (!inCall) return null;

  if (minimized) {
    return (
      <div
        className="fixed bottom-20 right-4 z-50 bg-amber-900/40 backdrop-blur-md border border-amber-800/30 rounded-full p-3 shadow-xl cursor-pointer hover:bg-amber-800/50 transition-colors"
        onClick={() => setMinimized(false)}
      >
        <span className="material-symbols-rounded text-white">
          {callMode === 'audio' ? 'call' : 'videocam'}
        </span>
        {remoteUserIds.length > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full text-[10px] text-white flex items-center justify-center">
            {remoteUserIds.length}
          </span>
        )}
      </div>
    );
  }

  const audioOnly = callMode === 'audio' && !videoEnabled;

  return (
    <div
      ref={panelRef}
      className="fixed z-50 backdrop-blur-xl rounded-2xl shadow-2xl border border-amber-900/30 overflow-hidden select-none"
      style={{
        width: `${panelWidth}px`,
        bottom: `${80 - position.y}px`,
        right: `${16 - position.x}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
        background: 'rgba(45, 30, 15, 0.55)',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Resize handle */}
      <div
        className="resize-handle absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize z-10"
        onMouseDown={handleResizeStart}
      >
        <svg className="w-3 h-3 m-0.5 text-white/40" viewBox="0 0 10 10">
          <path d="M0 10L10 0M0 10L6 10M0 10L0 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-amber-900/20 border-b border-amber-800/20">
        <span className="text-xs text-white/70 font-medium">
          {callMode === 'audio' ? 'Voice Call' : 'Video Call'} {remoteUserIds.length > 0 ? `(${remoteUserIds.length + 1})` : ''}
        </span>
        <button onClick={() => setMinimized(true)} className="text-white/50 hover:text-white p-0.5">
          <span className="material-symbols-rounded text-sm">minimize</span>
        </button>
      </div>

      {/* Screen share tiles */}
      {(screenSharing || remoteScreenUsers.length > 0) && (
        <div className="px-2 pt-2">
          {screenSharing && <ScreenShareTile userId="self" isLocal />}
          {remoteScreenUsers.map((userId) => (
            <ScreenShareTile key={`screen-${userId}`} userId={userId} isLocal={false} />
          ))}
        </div>
      )}

      {/* Remote video (main area) + local PiP overlay */}
      <div className="relative p-2">
        {remoteUserIds.length > 0 ? (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${remoteUserIds.length > 1 ? 2 : 1}, 1fr)` }}>
            {remoteUserIds.map((userId) => (
              <RemoteVideoTile key={userId} userId={userId} />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-white/40 text-sm">
            Waiting for others to join...
          </div>
        )}
        <LocalVideoPiP stream={localStream} audioOnly={audioOnly} />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 px-3 py-2 bg-amber-900/20 border-t border-amber-800/20">
        <button
          onClick={toggleAudio}
          className={`p-2 rounded-full transition-colors ${audioEnabled ? 'bg-amber-800/30 text-white hover:bg-amber-700/40' : 'bg-red-500/80 text-white'}`}
          title={audioEnabled ? 'Mute' : 'Unmute'}
        >
          <span className="material-symbols-rounded text-sm">
            {audioEnabled ? 'mic' : 'mic_off'}
          </span>
        </button>
        <button
          onClick={toggleVideo}
          className={`p-2 rounded-full transition-colors ${videoEnabled ? 'bg-amber-800/30 text-white hover:bg-amber-700/40' : 'bg-red-500/80 text-white'}`}
          title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          <span className="material-symbols-rounded text-sm">
            {videoEnabled ? 'videocam' : 'videocam_off'}
          </span>
        </button>
        <button
          onClick={screenSharing ? stopScreenShare : startScreenShare}
          className={`p-2 rounded-full transition-colors ${screenSharing ? 'bg-blue-500/80 text-white' : 'bg-amber-800/30 text-white hover:bg-amber-700/40'}`}
          title={screenSharing ? 'Stop sharing' : 'Share screen'}
        >
          <span className="material-symbols-rounded text-sm">
            {screenSharing ? 'stop_screen_share' : 'screen_share'}
          </span>
        </button>
        <button
          onClick={endCall}
          className="p-2 rounded-full bg-red-500/80 text-white hover:bg-red-500 transition-colors"
          title="End call"
        >
          <span className="material-symbols-rounded text-sm">call_end</span>
        </button>
      </div>
    </div>
  );
}
