import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

// The actual imported renderer is exercised by browser tests. This executes the
// production boundary after its fixed static modules have loaded.
const guard = readFileSync(new URL('../assets/pdf/local-worker.mjs', import.meta.url), 'utf8').replace(/^import .*;$/gm, '');
function bootstrap() {
  const transport = vi.fn();
  const diagnostic = vi.fn();
  const ready = vi.fn();
  const context = createContext({ fetch: transport, XMLHttpRequest: transport, console: Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(key => [key, diagnostic])), postMessage: ready });
  context.self = context;
  runInContext(guard, context);
  return { context, transport, diagnostic, ready };
}

describe('PDF worker transport boundary', () => {
  it('blocks immutable network and nested-worker APIs before announcing readiness', () => {
    const { context, transport, ready } = bootstrap();
    expect(ready).toHaveBeenCalledWith({ type: 'local-pdf-ready' });
    for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'RTCPeerConnection', 'Worker', 'SharedWorker', 'importScripts', 'eval']) {
      expect(() => context[api]('https://external.test/synthetic')).toThrow('PDF network access is disabled.');
      expect(Object.getOwnPropertyDescriptor(context, api)).toMatchObject({ configurable: false, writable: false });
    }
    expect(transport).not.toHaveBeenCalled();
  });
  it('suppresses document-derived diagnostics', () => {
    const { context, diagnostic } = bootstrap();
    for (const api of ['log', 'info', 'warn', 'error', 'debug']) context.console[api]('synthetic document diagnostic');
    expect(diagnostic).not.toHaveBeenCalled();
  });
});
