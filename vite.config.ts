import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  base: process.env.PAGES_BASE_PATH || '/',
  plugins: [react(), {
    name: 'development-csp',
    transformIndexHtml(html) {
      if (mode !== 'development') return html;
      return html
        .replace("script-src 'self' 'wasm-unsafe-eval'", "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'")
        .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:5173");
    },
  }],
  build: { sourcemap: false, target: ['safari18', 'ios18', 'chrome111', 'edge111', 'firefox114'] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
  // Development HMR needs its own local socket; the production HTML is stricter.
  define: { __DEVELOPMENT__: mode === 'development' },
}));
