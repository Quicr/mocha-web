# @mocha/chat

Real-time chat application built on [MoQ Transport](https://datatracker.ietf.org/doc/draft-ietf-moq-transport/).

## Stack

- **React 18** + **Zustand** for UI and state management
- **Tailwind CSS** for styling
- **Vite** for dev server and builds
- **[moq-web](https://www.npmjs.com/search?q=%40moq-web)** for MoQ Transport over WebTransport — multi-version MOQT, pub/sub sessions, media, CAT auth, secure objects
- **@mocha/protocol** for MoQ session and channel management (built on moq-web)
- **@mocha/mls** for end-to-end encryption (MLS key groups)
- **[Moat](https://github.com/Quicr/moat)** as the token service (CAT auth, user login, channel management)

## Development

```bash
# from repo root
pnpm install
pnpm dev:chat

# or from this directory
pnpm dev
```

Opens at `https://localhost:5173` (self-signed cert required for WebTransport).

## Building

```bash
pnpm build     # outputs to dist/
pnpm preview   # preview production build
```

## Testing

```bash
pnpm test          # run tests once
pnpm test:watch    # watch mode
```

## Architecture

```
src/
  App.tsx                  # root app component
  components/
    chat/                  # message list, input, channel UI
    login/                 # auth (Google OAuth, guest)
    media/                 # audio/video controls
    settings/              # user preferences
    debug/                 # debug panel
  stores/
    auth-store.ts          # authentication state
    channel-store.ts       # channel/room management
    connection-store.ts    # MoQ relay connection
    media-store.ts         # audio/video state
    settings-store.ts      # user settings
    debug-store.ts         # debug info
```

## Environment

Configuration via `.env` (committed) or `.env.local` (gitignored):

```
VITE_TOKEN_SERVICE_URL=https://api.mocha-net.dev/v1
VITE_RELAY_URL=https://relay.mocha-net.dev
VITE_GOOGLE_CLIENT_ID=<google-oauth-client-id>
```
