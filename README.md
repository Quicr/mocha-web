<p align="center">
  <img src="apps/chat/public/logo.svg" width="80" height="80" alt="MOCHA">
</p>

<h1 align="center">MOCHA</h1>

<p align="center">
  <strong>MoQ Open Communication & Hosting Architecture</strong>
</p>

<p align="center">
  <a href="https://github.com/Quicr/mocha-web/actions/workflows/ci.yml">
    <img src="https://github.com/Quicr/mocha-web/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <img src="https://img.shields.io/badge/protocol-MOQT-7e57c2" alt="MOQT">
  <img src="https://img.shields.io/badge/license-BSD--2--Clause-blue" alt="License">
</p>

---

Real-time communication over [MoQ Transport](https://datatracker.ietf.org/doc/draft-ietf-moq-transport/) — messaging, presence, media, and more.

## Packages

| Package | Path | Description |
|---------|------|-------------|
| [`@mocha/chat`](apps/chat) | `apps/chat` | Chat web application (React + Zustand) |
| [`@mocha/protocol`](packages/protocol) | `packages/protocol` | Protocol library — sessions, channels, auth |
| [`@mocha/mls`](packages/mls) | `packages/mls` | MLS group key management (E2EE) over MoQ |

### Built on moq-web

MOCHA is built on [`moq-web`](https://www.npmjs.com/search?q=%40moq-web), a suite of npm packages that provide abstractions for MoQ Transport over WebTransport — including multi-version MOQT protocol support, pub/sub session management, media capture/playback, CAT token authorization, and crypto via secure objects. `@mocha/protocol` builds directly on these abstractions.

| npm Package | Used By | Purpose |
|-------------|---------|---------|
| [`@moq-web/core`](https://www.npmjs.com/package/@moq-web/core) | `@mocha/protocol` | MOQTransport — WebTransport connection + multi-version MOQT wire format |
| [`@moq-web/session`](https://www.npmjs.com/package/@moq-web/session) | `@mocha/protocol`, `@mocha/mls`, `@mocha/chat` | MOQTSession — publish/subscribe, track management, auth tokens |
| [`@moq-web/cat`](https://www.npmjs.com/package/@moq-web/cat) | `@mocha/protocol` | COSE_Sign1/CWT token decoding for CAT (Common Access Token) auth |
| [`@moq-web/media`](https://www.npmjs.com/package/@moq-web/media) | `@mocha/chat` | Audio/video capture and playback over MoQ tracks |
| [`@moq-web/secure-objects`](https://www.npmjs.com/package/@moq-web/secure-objects) | `@moq-web/media` | Crypto primitives for secure object packaging |

## Quick Start

```bash
pnpm install
pnpm dev:chat
```

Open the chat app at `https://localhost:5173` (self-signed cert for WebTransport).

## Scripts

```bash
pnpm dev:chat      # run chat app locally
pnpm build         # build all packages
pnpm test          # run all unit tests
pnpm bench         # run performance benchmarks
pnpm lint          # lint all packages
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  apps/chat (React + Zustand)                                    │
│       │                                                         │
│       ▼                                                         │
│  @mocha/protocol ── MochaSession → MochaChannel                 │
│       │                 │                                       │
│       │            @mocha/mls (E2EE)                            │
│       ▼                                                         │
│  moq-web (npm)                                                  │
│    @moq-web/core     ── multi-version MOQT transport            │
│    @moq-web/session  ── pub/sub, track mgmt, auth               │
│    @moq-web/media    ── audio/video capture & playback          │
│    @moq-web/cat      ── CAT token authorization                 │
│    @moq-web/secure-objects ── crypto for secure packaging       │
│       │                                                         │
│       │ WebTransport (QUIC)                                     │
└───────┼─────────────────────────────────────────────────────────┘
        │
        ▼
   MoQ Relay ── fan-out pub/sub, track routing, auth validation
        │
        ▼
   Moat (github.com/Quicr/moat) ── token minting (CAT), user auth, channel mgmt
```

## API Docs

```bash
cd docs/api
./serve.sh    # serves on http://localhost:4000
```

## License

BSD-2-Clause — see [LICENSE](LICENSE).
