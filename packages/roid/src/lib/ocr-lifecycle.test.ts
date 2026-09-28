import { afterEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ createWorker: vi.fn() }));
vi.mock('tesseract.js', () => ({ createWorker: mock.createWorker, OEM: { LSTM_ONLY: 1 }, PSM: { SINGLE_BLOCK: 6, AUTO: 3, SINGLE_WORD: 8 } }));
import { LocalMrzReader } from './ocr';
import { LocalPrintedReader } from './printed-ocr';
afterEach(() => { vi.unstubAllGlobals(); mock.createWorker.mockReset(); });
describe.each([LocalMrzReader, LocalPrintedReader])('reader initialization lifecycle', Reader => {
  it('rejects a cancelled preparation without wiping its replacement', async () => {
    vi.stubGlobal('location', { origin: 'https://example.test' });
    let finish!: (worker: unknown) => void;
    const oldWorker = { setParameters: vi.fn(async () => {}), terminate: vi.fn(async () => {}) };
    const newWorker = { setParameters: vi.fn(async () => {}), terminate: vi.fn(async () => {}) };
    mock.createWorker.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(newWorker);
    const reader = new Reader(); const initial = reader.prepare(); const rejected = expect(initial).rejects.toThrow();
    const disposed = reader.dispose();
    await reader.prepare(); expect(reader.ready).toBe(true);
    finish(oldWorker); await rejected; await disposed;
    expect(reader.ready).toBe(true); expect(oldWorker.terminate).toHaveBeenCalled(); expect(newWorker.terminate).not.toHaveBeenCalled();
    await reader.dispose(); expect(reader.ready).toBe(false);
  });
  it('rejects malformed inputs without consuming a prepared worker', async () => {
    vi.stubGlobal('location', { origin: 'https://example.test' });
    mock.createWorker.mockResolvedValue({ setParameters: vi.fn(async () => {}), terminate: vi.fn(async () => {}) });
    const reader = new Reader(); await reader.prepare();
    await expect(reader.read('https://example.test/private' as never)).rejects.toThrow('canvas');
    expect(reader.ready).toBe(true); await reader.dispose();
  });
});
