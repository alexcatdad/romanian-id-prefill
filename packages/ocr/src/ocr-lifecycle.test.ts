import { afterEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ createWorker: vi.fn() }));
vi.mock('tesseract.js', () => ({ createWorker: mock.createWorker, OEM: { LSTM_ONLY: 1 }, PSM: { SINGLE_BLOCK: 6, AUTO: 3, SINGLE_WORD: 8 } }));
import { LocalOcrReader } from './ocr';
afterEach(() => { vi.unstubAllGlobals(); mock.createWorker.mockReset(); });
describe.each([LocalOcrReader])('reader initialization lifecycle', Reader => {
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

describe('generic OCR session', () => {
  const canvas = () => ({ width: 100, height: 50, toDataURL: () => 'data:image/png;base64,AA==', getContext: () => ({}) }) as unknown as HTMLCanvasElement;
  it('supports repeated recognition and returns caller-owned text without Romanian rules', async () => {
    vi.stubGlobal('location', { origin: 'https://example.test' });
    const raw = () => ({ data: { text: 'INVOICE total 123', confidence: 91.6, blocks: null } });
    const first = raw(); const second = raw();
    const worker = { setParameters: vi.fn(async () => {}), terminate: vi.fn(async () => {}), recognize: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) };
    mock.createWorker.mockResolvedValue(worker);
    const reader = new LocalOcrReader(() => {}, { languages: 'eng', whitelist: 'ABC' });
    await reader.prepare();
    const result = await reader.read(canvas(), { whitelist: '123' });
    expect(result).toEqual({ text: 'INVOICE total 123', confidence: 92, lines: [] });
    expect(first.data.text).toBe(''); expect(reader.ready).toBe(true);
    await reader.read(canvas()); expect(worker.recognize).toHaveBeenCalledTimes(2);
    expect(worker.terminate).not.toHaveBeenCalled();
    await reader.dispose(); expect(worker.terminate).toHaveBeenCalled();
  });
  it('rejects concurrent reads without cancelling the active read', async () => {
    vi.stubGlobal('location', { origin: 'https://example.test' });
    let finish!: (value: unknown) => void;
    const worker = { setParameters: vi.fn(async () => {}), terminate: vi.fn(async () => {}), recognize: vi.fn(() => new Promise(resolve => { finish = resolve; })) };
    mock.createWorker.mockResolvedValue(worker);
    const reader = new LocalOcrReader(); await reader.prepare();
    const active = reader.read(canvas()); await expect(reader.read(canvas())).rejects.toThrow('already');
    finish({ data: { text: 'hello', confidence: 80, blocks: null } });
    await expect(active).resolves.toMatchObject({ text: 'hello' }); await reader.dispose();
  });
  it('cancels a pending recognition without waiting for the worker response', async () => {
    vi.stubGlobal('location', { origin: 'https://example.test' });
    const worker = { setParameters: vi.fn(async () => {}), terminate: vi.fn(async () => {}), recognize: vi.fn(() => new Promise(() => {})) };
    mock.createWorker.mockResolvedValue(worker);
    const reader = new LocalOcrReader(); await reader.prepare();
    const active = reader.read(canvas()); const rejected = expect(active).rejects.toThrow('cancelled');
    await reader.cancel(); await rejected; expect(reader.ready).toBe(false);
  });
});

describe('OCR boundaries', () => {
  it('rejects model paths and URLs before starting any worker', async () => {
    vi.stubGlobal('location', { origin: 'https://example.test' });
    await expect(new LocalOcrReader(() => {}, { languages: 'https://remote.test/model' }).prepare()).rejects.toThrow('model names');
    expect(mock.createWorker).not.toHaveBeenCalled();
  });
  it('returns flat copied line and symbol geometry and clears Tesseract output', async () => {
    vi.stubGlobal('location', { origin: 'https://example.test' });
    const bbox = { x0: 1, y0: 2, x1: 3, y1: 4 };
    const response = { data: { text: 'A', confidence: 99, blocks: [{ paragraphs: [{ lines: [{ text: 'A', confidence: 98, words: [{ symbols: [{ text: 'A', confidence: 97, bbox }] }] }] }] }] } };
    const worker = { setParameters: vi.fn(async () => {}), terminate: vi.fn(async () => {}), recognize: vi.fn(async () => response) };
    mock.createWorker.mockResolvedValue(worker);
    const reader = new LocalOcrReader(); await reader.prepare();
    const result = await reader.read({ width: 10, height: 10, getContext: () => ({}), toDataURL: () => 'data:image/png;base64,AA==' } as unknown as HTMLCanvasElement);
    expect(result.lines).toEqual([{ text: 'A', confidence: 98, symbols: [{ text: 'A', confidence: 97, bbox }] }]);
    expect(result.lines[0].symbols[0].bbox).not.toBe(bbox);
    expect(response.data.text).toBe(''); expect(response.data.blocks).toBeNull();
    await reader.dispose();
  });
});
