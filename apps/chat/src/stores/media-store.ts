// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { create } from 'zustand';
import { MediaSession } from '@moq-web/media';
import { useAuthStore } from './auth-store';
import { useDebugStore } from './debug-store';
import { useSettingsStore } from './settings-store';

export type CallMode = 'video' | 'audio';

export interface IncomingCall {
  from: string;
  displayName: string;
  channelName: string;
  mode: CallMode;
  timestamp: number;
}

interface MediaState {
  inCall: boolean;
  callMode: CallMode;
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  screenSharing: boolean;
  screenTrackAlias: bigint | null;
  remoteUserIds: string[];
  remoteScreenUsers: string[];
  audioEnabled: boolean;
  videoEnabled: boolean;
  mediaSession: MediaSession | null;
  audioContext: AudioContext | null;
  remoteCanvases: Map<string, HTMLCanvasElement>;
  remoteScreenCanvases: Map<string, HTMLCanvasElement>;
  videoSubToUser: Map<number, string>;
  screenSubToUser: Map<number, string>;
  incomingCall: IncomingCall | null;
  channelName: string | null;

  startCall: (channelName: string, mode?: CallMode) => Promise<void>;
  endCall: () => Promise<void>;
  toggleAudio: () => void;
  toggleVideo: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  signalCall: (channelName: string, mode: CallMode) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  setRemoteCanvas: (userId: string, canvas: HTMLCanvasElement | null) => void;
  setRemoteScreenCanvas: (userId: string, canvas: HTMLCanvasElement | null) => void;
}

export const useMediaStore = create<MediaState>((set, get) => ({
  inCall: false,
  callMode: 'video' as CallMode,
  localStream: null,
  screenStream: null,
  screenSharing: false,
  screenTrackAlias: null,
  remoteUserIds: [],
  remoteScreenUsers: [],
  audioEnabled: true,
  videoEnabled: true,
  mediaSession: null,
  audioContext: null,
  remoteCanvases: new Map(),
  remoteScreenCanvases: new Map(),
  videoSubToUser: new Map(),
  screenSubToUser: new Map(),
  incomingCall: null,
  channelName: null,

  startCall: async (channelName: string, mode: CallMode = 'video') => {
    const debug = useDebugStore.getState();
    const { identity } = useAuthStore.getState();
    if (!identity) return;

    try {
      const wantVideo = mode === 'video';
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: wantVideo ? { width: 640, height: 480, frameRate: 30 } : false,
      });
      set({ localStream, inCall: true, callMode: mode, channelName, videoEnabled: wantVideo });
      debug.addEvent({ source: 'media', direction: 'info', label: `Got local media (${mode})` });

      // Create a dedicated MediaSession with its own WebTransport connection
      // via worker mode — keeps media streams separate from the chat session.
      const transportWorker = new Worker(
        new URL('@moq-web/session/worker', import.meta.url),
        { type: 'module' },
      );
      const encodeWorker = new Worker(
        new URL('@moq-web/media/codec-encode-worker', import.meta.url),
        { type: 'module' },
      );
      const decodeWorker = new Worker(
        new URL('@moq-web/media/codec-decode-worker', import.meta.url),
        { type: 'module' },
      );

      const mediaSession = new MediaSession({
        workers: { transportWorker, encodeWorker, decodeWorker },
      });

      const relayUrl = useSettingsStore.getState().settings.relayUrl;
      await mediaSession.connect(relayUrl);
      await mediaSession.setup();
      set({ mediaSession });
      debug.addEvent({ source: 'media', direction: 'info', label: 'Media session connected (worker mode)' });

      const mediaNamespace = ['mocha', 'default', channelName, 'media', identity.userId];
      mediaSession.setOwnNamespacePrefix(mediaNamespace.join('/'));

      if (wantVideo) {
        const videoStream = new MediaStream(localStream.getVideoTracks());
        await mediaSession.publish(mediaNamespace, 'video', videoStream, {
          videoBitrate: 1_000_000,
          audioBitrate: 64_000,
          videoResolution: '480p' as const,
          deliveryMode: 'stream' as const,
          keyframeInterval: 2,
          maxCacheDuration: 5000,
          videoEnabled: true,
          audioEnabled: false,
        });
      }

      const audioStream = new MediaStream(localStream.getAudioTracks());
      await mediaSession.publish(mediaNamespace, 'audio', audioStream, {
        videoBitrate: 1_000_000,
        audioBitrate: 64_000,
        videoResolution: '480p' as const,
        deliveryMode: 'stream' as const,
        audioDeliveryMode: 'datagram' as const,
        maxCacheDuration: 5000,
        videoEnabled: false,
        audioEnabled: true,
      });
      debug.addEvent({ source: 'media', direction: 'send', label: `Publishing ${wantVideo ? 'video + ' : ''}audio tracks` });

      const lastFrameTime = new Map<string, number>();

      function addRemoteUser(userId: string, isScreen: boolean) {
        const state = useMediaStore.getState();
        if (isScreen && !state.remoteScreenUsers.includes(userId)) {
          useMediaStore.setState({ remoteScreenUsers: [...state.remoteScreenUsers, userId] });
        } else if (!isScreen && !state.remoteUserIds.includes(userId)) {
          useMediaStore.setState({ remoteUserIds: [...state.remoteUserIds, userId] });
        }
      }

      // Register all event handlers BEFORE subscribing so we don't miss
      // incoming-publish events that fire as soon as the relay responds.
      mediaSession.on('incoming-publish', (event) => {
        console.log('[MEDIA-DIAG] MediaSession incoming-publish:', {
          namespace: event.namespace?.join('/'),
          trackName: event.trackName,
          subscriptionId: event.subscriptionId,
        });
        const ns = event.namespace;
        if (ns.length < 5 || ns[3] !== 'media') return;
        if (ns[2] !== channelName) return;

        const remoteUserId = ns[4];
        if (remoteUserId === identity.userId) return;

        const trackName = event.trackName.toLowerCase();
        debug.addEvent({ source: 'media', direction: 'recv', label: `Remote: ${remoteUserId}/${event.trackName}` });

        const current = useMediaStore.getState();
        if (!current.inCall) return;

        if (trackName === 'screen-video') {
          const screenSubToUser = new Map(current.screenSubToUser);
          for (const [subId, uid] of screenSubToUser) {
            if (uid === remoteUserId && subId !== event.subscriptionId) screenSubToUser.delete(subId);
          }
          screenSubToUser.set(event.subscriptionId, remoteUserId);
          useMediaStore.setState({ screenSubToUser });
          addRemoteUser(remoteUserId, true);
        } else if (trackName.includes('video')) {
          const videoSubToUser = new Map(current.videoSubToUser);
          for (const [subId, uid] of videoSubToUser) {
            if (uid === remoteUserId && subId !== event.subscriptionId) videoSubToUser.delete(subId);
          }
          videoSubToUser.set(event.subscriptionId, remoteUserId);
          useMediaStore.setState({ videoSubToUser });
          addRemoteUser(remoteUserId, false);
          lastFrameTime.set(remoteUserId, Date.now());
        }
      });

      let videoFrameCount = 0;
      mediaSession.on('video-frame', ({ subscriptionId, frame }) => {
        videoFrameCount++;
        if (videoFrameCount <= 5 || videoFrameCount % 30 === 0) {
          const state = useMediaStore.getState();
          console.log('[MEDIA-DIAG] video-frame received', {
            count: videoFrameCount,
            subscriptionId,
            width: frame.displayWidth,
            height: frame.displayHeight,
            videoSubToUser: Object.fromEntries(state.videoSubToUser),
            screenSubToUser: Object.fromEntries(state.screenSubToUser),
          });
        }

        const state = useMediaStore.getState();
        const screenUserId = state.screenSubToUser.get(subscriptionId);
        if (screenUserId) {
          lastFrameTime.set(screenUserId, Date.now());
          addRemoteUser(screenUserId, true);
          const canvas = state.remoteScreenCanvases.get(screenUserId);
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              canvas.width = frame.displayWidth;
              canvas.height = frame.displayHeight;
              ctx.drawImage(frame, 0, 0);
            }
          }
          frame.close();
          return;
        }

        const userId = state.videoSubToUser.get(subscriptionId);
        if (userId) {
          lastFrameTime.set(userId, Date.now());
          addRemoteUser(userId, false);
          const canvas = state.remoteCanvases.get(userId);
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              canvas.width = frame.displayWidth;
              canvas.height = frame.displayHeight;
              ctx.drawImage(frame, 0, 0);
            }
          }
        } else if (videoFrameCount <= 10) {
          console.warn('[MEDIA-DIAG] video-frame has no userId mapping', { subscriptionId });
        }
        frame.close();
      });

      // Audio playback via Web Audio API — schedule back-to-back to avoid crackling
      const audioCtx = new AudioContext();
      set({ audioContext: audioCtx });
      let nextPlayTime = 0;
      mediaSession.on('audio-data', ({ audioData }: { subscriptionId: number; audioData: AudioData }) => {
        try {
          const numChannels = audioData.numberOfChannels;
          const numFrames = audioData.numberOfFrames;
          const sampleRate = audioData.sampleRate;
          const buffer = audioCtx.createBuffer(numChannels, numFrames, sampleRate);
          for (let ch = 0; ch < numChannels; ch++) {
            const dest = buffer.getChannelData(ch);
            audioData.copyTo(dest, { planeIndex: ch, format: 'f32-planar' });
          }
          const source = audioCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(audioCtx.destination);
          const now = audioCtx.currentTime;
          if (nextPlayTime < now) {
            nextPlayTime = now;
          }
          source.start(nextPlayTime);
          nextPlayTime += buffer.duration;
          audioData.close();
        } catch {
          // skip malformed audio
        }
      });

      // Now subscribe — handlers above are already registered so we won't miss events
      const channelMediaPrefix = ['mocha', 'default', channelName, 'media'];
      console.log('[MEDIA-DIAG] Subscribing to media namespace:', channelMediaPrefix.join('/'));
      const subConfig = {
        videoBitrate: 1_000_000,
        audioBitrate: 64_000,
        videoResolution: '480p' as const,
        jitterBufferDelay: 50,
        policyType: 'live' as const,
      };
      const nsSubId = await mediaSession.subscribeNamespace(channelMediaPrefix, subConfig);
      console.log('[MEDIA-DIAG] subscribeNamespace returned ID:', nsSubId);
      debug.addEvent({ source: 'media', direction: 'recv', label: `Subscribed to media namespace (subId=${nsSubId})` });

      // Poll for stale participants — only remove after prolonged silence,
      // and keep subscription mappings so frames can resume rendering.
      const staleCheckInterval = setInterval(() => {
        const state = useMediaStore.getState();
        if (!state.inCall) {
          clearInterval(staleCheckInterval);
          return;
        }
        const now = Date.now();
        const staleTimeout = 15_000;
        const staleUsers = state.remoteUserIds.filter((uid) => {
          const last = lastFrameTime.get(uid);
          return last && (now - last > staleTimeout);
        });
        if (staleUsers.length > 0) {
          const remaining = state.remoteUserIds.filter((uid) => !staleUsers.includes(uid));
          for (const uid of staleUsers) lastFrameTime.delete(uid);
          const remoteScreenUsers = state.remoteScreenUsers.filter((uid) => !staleUsers.includes(uid));
          useMediaStore.setState({ remoteUserIds: remaining, remoteScreenUsers });
        }
      }, 5000);

    } catch (err) {
      debug.addEvent({ source: 'media', direction: 'info', label: `Call failed: ${(err as Error).message}` });
      console.error('startCall failed:', err);
      get().endCall();
    }
  },

  endCall: async () => {
    const { localStream, screenStream, mediaSession, audioContext } = get();

    if (mediaSession) {
      try {
        await mediaSession.close();
      } catch (err) {
        console.warn('mediaSession.close error (ignored):', err);
      }
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
    }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
    }

    set({
      inCall: false,
      callMode: 'video',
      localStream: null,
      screenStream: null,
      screenSharing: false,
      screenTrackAlias: null,
      remoteUserIds: [],
      remoteScreenUsers: [],
      audioEnabled: true,
      videoEnabled: true,
      mediaSession: null,
      audioContext: null,
      remoteCanvases: new Map(),
      remoteScreenCanvases: new Map(),
      videoSubToUser: new Map(),
      screenSubToUser: new Map(),
      channelName: null,
    });
  },

  toggleAudio: () => {
    const { localStream, audioEnabled } = get();
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => { t.enabled = !audioEnabled; });
      set({ audioEnabled: !audioEnabled });
    }
  },

  toggleVideo: () => {
    const { localStream, videoEnabled, callMode, mediaSession, channelName } = get();
    if (!localStream) return;

    if (callMode === 'audio' && !videoEnabled) {
      // Upgrade: acquire video track and publish it
      const { identity } = useAuthStore.getState();
      if (!identity || !mediaSession || !channelName) return;
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30 } }).then(async (vs) => {
        const videoTrack = vs.getVideoTracks()[0];
        localStream.addTrack(videoTrack);
        const mediaNamespace = ['mocha', 'default', channelName, 'media', identity.userId];
        await mediaSession.publish(mediaNamespace, 'video', new MediaStream([videoTrack]), {
          videoBitrate: 1_000_000,
          audioBitrate: 64_000,
          videoResolution: '480p' as const,
          deliveryMode: 'stream' as const,
          keyframeInterval: 2,
          maxCacheDuration: 5000,
          videoEnabled: true,
          audioEnabled: false,
        });
        set({ videoEnabled: true, callMode: 'video' });
      }).catch(() => {});
    } else {
      localStream.getVideoTracks().forEach((t) => { t.enabled = !videoEnabled; });
      set({ videoEnabled: !videoEnabled });
    }
  },

  startScreenShare: async () => {
    const { mediaSession, channelName, screenSharing } = get();
    const { identity } = useAuthStore.getState();
    if (!mediaSession || !channelName || !identity || screenSharing) return;

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      });
      set({ screenStream, screenSharing: true });

      const mediaNamespace = ['mocha', 'default', channelName, 'media', identity.userId];
      const screenAlias = await mediaSession.publish(mediaNamespace, 'screen-video', screenStream, {
        videoBitrate: 2_000_000,
        audioBitrate: 64_000,
        videoResolution: '480p' as const,
        deliveryMode: 'stream' as const,
        keyframeInterval: 2,
        maxCacheDuration: 5000,
        videoEnabled: true,
        audioEnabled: false,
      });
      set({ screenTrackAlias: screenAlias });

      // Stop sharing when user clicks browser's "Stop sharing" button
      screenStream.getVideoTracks()[0].onended = () => {
        get().stopScreenShare();
      };
    } catch {
      // User cancelled the picker
    }
  },

  stopScreenShare: async () => {
    const { screenStream, mediaSession, screenTrackAlias } = get();

    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
    }

    // Unpublish the screen track from the media session
    if (mediaSession && screenTrackAlias !== null) {
      await mediaSession.unpublish(screenTrackAlias).catch(() => {});
    }

    // Notify remote peers via channel message
    const { useChannelStore } = await import('./channel-store');
    const activeChannel = useChannelStore.getState().activeChannel;
    if (activeChannel) {
      await activeChannel.sendMessage(
        { type: 'application/x-mocha-media-signal', body: JSON.stringify({ action: 'screen-share-stop' }) },
      );
    }

    set({ screenStream: null, screenSharing: false, screenTrackAlias: null });
  },

  signalCall: async (channelName: string, mode: CallMode) => {
    const { identity } = useAuthStore.getState();
    if (!identity) return;

    const activeChannel = (await import('./channel-store')).useChannelStore.getState().activeChannel;
    if (!activeChannel) return;

    // Publish a call signal as a special message
    await activeChannel.sendMessage(
      { type: 'application/x-mocha-call-signal', body: JSON.stringify({ action: 'ring', mode }) },
    );

    // Start our own call
    await get().startCall(channelName, mode);
  },

  acceptCall: async () => {
    const { incomingCall } = get();
    if (!incomingCall) return;
    set({ incomingCall: null });
    await get().startCall(incomingCall.channelName, incomingCall.mode);
  },

  rejectCall: () => {
    set({ incomingCall: null });
  },

  setRemoteCanvas: (userId: string, canvas: HTMLCanvasElement | null) => {
    set((s) => {
      const remoteCanvases = new Map(s.remoteCanvases);
      if (canvas) {
        remoteCanvases.set(userId, canvas);
      } else {
        remoteCanvases.delete(userId);
      }
      return { remoteCanvases };
    });
  },

  setRemoteScreenCanvas: (userId: string, canvas: HTMLCanvasElement | null) => {
    set((s) => {
      const remoteScreenCanvases = new Map(s.remoteScreenCanvases);
      if (canvas) {
        remoteScreenCanvases.set(userId, canvas);
      } else {
        remoteScreenCanvases.delete(userId);
      }
      return { remoteScreenCanvases };
    });
  },
}));

// Listen for incoming call signals
useMediaStore.subscribe((state) => {
  // This is handled in channel-store via message events
  void state;
});
