// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { useEffect, useRef } from 'react';
import { useAuthStore } from './stores/auth-store';
import { useChannelStore } from './stores/channel-store';
import { useConnectionStore } from './stores/connection-store';
import { useSettingsStore } from './stores/settings-store';
import { LoginScreen } from './components/login/LoginScreen';
import { ChatView } from './components/chat/ChatView';
import { ChannelList } from './components/chat/ChannelList';
import { DebugPanel } from './components/debug/DebugPanel';
import { SettingsPanel, SettingsButton } from './components/settings/SettingsPanel';
import type { NamespaceConfig } from '@mocha/protocol';

function getInviteCode(): string | null {
  const match = window.location.pathname.match(/^\/join\/([a-z0-9]+)$/);
  return match ? match[1] : null;
}

export function App() {
  const { identity, tokenProvider } = useAuthStore();
  const { activeChannel, joinChannel, fetchRooms } = useChannelStore();
  const { connect } = useConnectionStore();
  const { settings } = useSettingsStore();
  const redeemingRef = useRef(false);

  useEffect(() => {
    const code = getInviteCode();
    if (!code || !identity || redeemingRef.current) return;
    redeemingRef.current = true;

    (async () => {
      try {
        const sessionToken = tokenProvider.sessionToken;
        const res = await fetch(`${settings.moatUrl}/invites/${code}/redeem`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
          },
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.error('Invite redeem failed:', data.error || res.status);
          window.history.replaceState({}, '', '/');
          return;
        }

        const { room_id, room_name } = await res.json();
        window.history.replaceState({}, '', '/');

        await fetchRooms();
        const nsConfig: NamespaceConfig = { provider: settings.provider, orgId: settings.orgId, teamId: settings.teamId, channelId: room_name };
        const session = await connect(nsConfig, identity, tokenProvider);
        await joinChannel(session, { id: room_id, name: room_name, namespace_prefix: `mocha_v1/${settings.provider}/${settings.orgId}`, visibility: 'public' });
      } catch (err) {
        console.error('Invite auto-join failed:', err);
        window.history.replaceState({}, '', '/');
      }
    })();
  }, [identity, tokenProvider, connect, joinChannel, fetchRooms, settings]);

  return (
    <>
      {!identity ? (
        <LoginScreen />
      ) : !activeChannel ? (
        <ChannelList />
      ) : (
        <ChatView />
      )}
      <SettingsPanel />
      <SettingsButton />
      <DebugPanel />
    </>
  );
}
