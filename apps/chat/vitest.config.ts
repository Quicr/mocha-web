// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['tests/setup.ts'],
  },
  define: {
    __MOQT_VERSION__: JSON.stringify('draft-18'),
    __APP_VERSION__: JSON.stringify('test'),
    __MOAT_VERSION__: JSON.stringify('test'),
    __RELAY_VERSION__: JSON.stringify('test'),
  },
});
