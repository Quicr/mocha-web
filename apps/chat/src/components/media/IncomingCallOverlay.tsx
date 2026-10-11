// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { useMediaStore } from '../../stores/media-store';

export function IncomingCallOverlay() {
  const { incomingCall, acceptCall, rejectCall } = useMediaStore();

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-rounded text-3xl text-green-600">
            {incomingCall.mode === 'video' ? 'videocam' : 'call'}
          </span>
        </div>
        <h3 className="text-lg font-semibold text-mocha-800 dark:text-gray-100 mb-1">
          Incoming {incomingCall.mode === 'video' ? 'Video' : 'Voice'} Call
        </h3>
        <p className="text-sm text-mocha-500 dark:text-gray-400 mb-6">
          {incomingCall.displayName} is calling in #{incomingCall.channelName}
        </p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={rejectCall}
            className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
          >
            <span className="material-symbols-rounded text-2xl">call_end</span>
          </button>
          <button
            onClick={acceptCall}
            className="w-14 h-14 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600 transition-colors shadow-lg"
          >
            <span className="material-symbols-rounded text-2xl">call</span>
          </button>
        </div>
      </div>
    </div>
  );
}
