// SPDX-FileCopyrightText: Copyright (c) 2025 Cisco
// SPDX-License-Identifier: BSD-2-Clause

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { execSync } from 'child_process';
import { resolve } from 'path';

const moqtVersion = process.env.MOQT_VERSION || 'draft-16';

function gitInfo(dir: string): { hash: string; repo: string } {
  try {
    const hash = execSync('git rev-parse --short HEAD', { cwd: dir }).toString().trim();
    const repo = execSync('git remote get-url origin', { cwd: dir }).toString().trim()
      .replace(/^git@github\.com:/, 'https://github.com/')
      .replace(/\.git$/, '');
    return { hash, repo };
  } catch {
    return { hash: 'unknown', repo: '' };
  }
}

const rootDir = resolve(__dirname, '../../..');
const mocha = gitInfo(resolve(rootDir, 'mocha'));
const moat = gitInfo(resolve(rootDir, 'moat'));
const relay = gitInfo(resolve(rootDir, 'moq-rs'));

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), basicSsl()],
  define: {
    __MOQT_VERSION__: JSON.stringify(moqtVersion),
    __APP_VERSION__: JSON.stringify(mocha.hash),
    __MOAT_VERSION__: JSON.stringify(moat.hash),
    __MOAT_REPO__: JSON.stringify(moat.repo || 'https://github.com/Quicr/moat'),
    __RELAY_VERSION__: JSON.stringify(relay.hash),
    __RELAY_REPO__: JSON.stringify(relay.repo || 'https://github.com/cloudflare/moq-rs'),
    __MOCHA_REPO__: JSON.stringify(mocha.repo || 'https://github.com/ArcasHH/mocha'),
  },
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://snk-dev-1.m10x.org:3200',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/v1'),
      },
    },
  },
});
