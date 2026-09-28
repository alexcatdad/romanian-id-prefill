// Load the renderer and the only two optional decoder fallback modules before
// declaring readiness. Dynamic imports of these exact URLs then use the module
// map, including when the device is offline.
import './pdf.worker.mjs';
import './wasm/openjpeg_nowasm_fallback.js';
import './wasm/jbig2_nowasm_fallback.js';

const blocked = () => { throw new Error('PDF network access is disabled.'); };
for (const key of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'RTCPeerConnection', 'Worker', 'SharedWorker', 'importScripts', 'eval']) {
  Object.defineProperty(globalThis, key, { value: blocked, configurable: false, writable: false });
}
// Library diagnostics can include document-derived text. Never expose it.
for (const key of ['log', 'info', 'warn', 'error', 'debug']) console[key] = () => {};
self.postMessage({ type: 'local-pdf-ready' });
