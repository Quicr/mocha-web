# Contributing to MOCHA

Thank you for your interest in contributing to MOCHA! This guide will help you get started.

## License

By contributing, you agree that your contributions will be licensed under the [BSD-2-Clause License](LICENSE).

All source files must include the SPDX header:

```
// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause
```

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 10+ (`corepack enable` to use the version pinned in `package.json`)
- For the Rust CLI: Rust toolchain 1.75+

### Getting Started

```bash
# Clone the repository
git clone https://github.com/ArckyPN/mocha.git
cd mocha

# Install dependencies
pnpm install

# Start the chat app in dev mode
pnpm dev:chat
```

### Repository Structure

```
mocha/
├── packages/
│   ├── protocol/    # @mocha/protocol — session, channels, auth, codec
│   └── mls/         # @mocha/mls — MLS group key management
├── apps/
│   └── chat/        # @mocha/chat — React web app
├── docs/            # Architecture docs, API specs
└── scripts/         # Build and test utilities
```

### Key Commands

```bash
pnpm install          # Install all dependencies
pnpm dev:chat         # Start chat app (https://localhost:5175)
pnpm build            # Build all packages
pnpm test             # Run all unit tests
pnpm bench            # Run performance benchmarks
pnpm lint             # Type-check all packages
```

### Running Tests

Tests use [Vitest](https://vitest.dev/). Each package has its own test suite:

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @mocha/protocol test
pnpm --filter @mocha/mls test
pnpm --filter @mocha/chat test

# Watch mode
pnpm --filter @mocha/protocol test:watch

# Benchmarks
pnpm bench
```

## Making Changes

### Branching

- Create a feature branch from `main`: `git checkout -b feature/my-change`
- Keep commits focused and atomic

### Code Style

- TypeScript strict mode is enforced
- No `any` types in `@mocha/protocol` or `@mocha/mls`
- Run `pnpm lint` before submitting

### Testing

- Add tests for new functionality in the relevant `tests/` directory
- Protocol/MLS tests: `packages/{protocol,mls}/tests/*.test.ts`
- Chat app store tests: `apps/chat/tests/*.test.ts`
- Benchmark new performance-sensitive code: `tests/*.bench.ts`

### Pull Requests

1. Ensure `pnpm lint` and `pnpm test` pass
2. Write a clear PR description explaining what and why
3. Link any related issues
4. Keep PRs focused — one logical change per PR

## Architecture Overview

```
apps/chat → @mocha/protocol → @moq-web/session → MoQ Relay
```

- **`@mocha/protocol`** wraps `@moq-web/session` with MOCHA-specific namespace routing, CBOR encoding, and channel lifecycle
- **`@mocha/mls`** provides MLS group keying for end-to-end encryption
- **`apps/chat`** is a React app using Zustand stores that consume `@mocha/protocol`

See `docs/mocha-platform-architecture.md` for the full platform design.

## Reporting Issues

- Use [GitHub Issues](https://github.com/ArckyPN/mocha/issues) for bugs and feature requests
- Include steps to reproduce for bugs
- Check existing issues before opening a new one
