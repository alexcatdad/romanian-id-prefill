import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const bootstrap = readFileSync(new URL('../public/ocr/local-worker.js', import.meta.url), 'utf8');

function loadGuard() {
  const listeners = new Map<string, (event: { data: { action: string } }) => void>();
  const nativeFetch = vi.fn().mockResolvedValue(undefined);
  const nativeOpen = vi.fn();
  const nativeSend = vi.fn();
  const nativeImport = vi.fn();
  const nativeTransport = vi.fn();
  class Xhr {
    open(...args: unknown[]) { nativeOpen(...args); }
    send(...args: unknown[]) { nativeSend(...args); }
  }
  class Transport { constructor() { nativeTransport(); } }
  const context = createContext({
    URL,
    location: { href: 'https://app.test/ocr/local-worker.js', origin: 'https://app.test' },
    fetch: nativeFetch, XMLHttpRequest: Xhr, importScripts: nativeImport,
    WebSocket: Transport, EventSource: Transport, WebTransport: Transport,
    RTCPeerConnection: Transport, Worker: Transport, SharedWorker: Transport,
    postMessage: vi.fn(), close: vi.fn(), setTimeout: vi.fn(), clearTimeout: vi.fn(),
    addEventListener: (type: string, listener: (event: { data: { action: string } }) => void) => listeners.set(type, listener),
  });
  context.self = context;
  runInContext(bootstrap, context);
  return { context, nativeFetch, nativeOpen, nativeSend, nativeImport, nativeTransport,
    receiveImage: () => listeners.get('message')!({ data: { action: 'recognize' } }) };
}

describe('production OCR worker transport boundary', () => {
  it('allows preparation assets from this origin and rejects external loaders', async () => {
    const guard = loadGuard();
    await guard.context.fetch('https://app.test/ocr/mrz.traineddata.gz');
    await expect(guard.context.fetch('https://external.test/model')).rejects.toThrow();
    const xhr = new guard.context.XMLHttpRequest();
    xhr.open('GET', '/ocr/core/model.wasm'); xhr.send();
    expect(() => xhr.open('GET', 'https://external.test/model')).toThrow();
    expect(() => guard.context.importScripts('https://external.test/worker.js')).toThrow();
    expect(guard.nativeFetch).toHaveBeenCalledTimes(1);
    expect(guard.nativeOpen).toHaveBeenCalledTimes(1);
    expect(guard.nativeSend).toHaveBeenCalledTimes(1);
    expect(guard.nativeImport).toHaveBeenCalledTimes(1); // Bootstrap's local engine only.
  });

  it('blocks every loader after an image, including an XHR opened before it', async () => {
    const guard = loadGuard();
    const xhr = new guard.context.XMLHttpRequest();
    xhr.open('GET', '/ocr/core/model.wasm');
    guard.receiveImage();
    await expect(guard.context.fetch('/ocr/model')).rejects.toThrow();
    expect(() => xhr.send()).toThrow();
    expect(() => xhr.open('POST', '/')).toThrow();
    expect(() => guard.context.importScripts('/ocr/another-script.js')).toThrow();
    expect(guard.nativeFetch).not.toHaveBeenCalled();
    expect(guard.nativeSend).not.toHaveBeenCalled();
    expect(guard.nativeOpen).toHaveBeenCalledTimes(1);
    expect(guard.nativeImport).toHaveBeenCalledTimes(1);
  });

  it('disables streaming transports and nested workers throughout the lifecycle', () => {
    const guard = loadGuard();
    for (const name of ['WebSocket', 'EventSource', 'WebTransport', 'RTCPeerConnection', 'Worker', 'SharedWorker']) {
      expect(() => new guard.context[name]('https://app.test/')).toThrow();
    }
    guard.receiveImage();
    expect(() => new guard.context.Worker('/another-worker.js')).toThrow();
    expect(guard.nativeTransport).not.toHaveBeenCalled();
  });
});
