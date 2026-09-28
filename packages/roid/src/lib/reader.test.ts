import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ mrz: [] as any[], printed: [] as any[] }));
vi.mock('./ocr', () => ({ LocalMrzReader: class {
  ready = false;
  prepare = vi.fn(async () => { this.ready = true; });
  read = vi.fn(async () => ({ assessment: { status: 'invalid', rawLines: [] }, confidence: 80 }));
  dispose = vi.fn(async () => { this.ready = false; });
  constructor() { state.mrz.push(this); }
} }));
vi.mock('./printed-ocr', () => ({ LocalPrintedReader: class {
  ready = false;
  prepare = vi.fn(async () => { this.ready = true; });
  read = vi.fn(async () => ({ fields: { cardType: 'unknown' }, confidence: 70 }));
  dispose = vi.fn(async () => { this.ready = false; });
  constructor() { state.printed.push(this); }
} }));
import { LocalIdReader } from './reader';
const canvas = () => ({ width: 100, height: 60, toDataURL: () => "", getContext: () => null }) as unknown as HTMLCanvasElement;
beforeEach(() => { state.mrz.length = 0; state.printed.length = 0; });
describe('LocalIdReader ownership and lifecycle', () => {
  it.each([null, {}, {mode:'unknown'}, {mode:'mrz'}, {mode:'printed', printedCanvas:'https://example.test/private'}])('rejects malformed input without poisoning subsequent use', async input => {
    const reader = new LocalIdReader(); await reader.prepare();
    await expect(reader.read(input as never, { ownership: 'transfer' })).rejects.toThrow();
    expect(reader.ready).toBe(true);
    await reader.read({mode:'printed', printedCanvas:canvas()}, {ownership:'transfer'});
  });
  it('returns separate evidence requiring review and clears transferred canvases', async () => {
    const reader = new LocalIdReader(); await reader.prepare();
    const mrzCanvas = canvas(), printedCanvas = canvas();
    const result = await reader.read({ mode: 'mrz', mrzCanvas, printedCanvas }, { ownership: 'transfer' });
    expect(result.reviewRequired).toBe(true); expect(result.confidence).toBe(80); expect(result.printed?.confidence).toBe(70);
    expect(mrzCanvas.width).toBe(0); expect(printedCanvas.width).toBe(0); expect(reader.ready).toBe(false);
    expect(state.mrz[0].dispose).toHaveBeenCalled(); expect(state.printed[0].dispose).toHaveBeenCalled();
  });
  it('preserves borrowed pixels while always releasing workers', async () => {
    const reader = new LocalIdReader(); await reader.prepare(); const source = canvas();
    await reader.read({ mode: 'printed', printedCanvas: source }, { ownership: 'borrow' });
    expect(source.width).toBe(100); expect(state.mrz[0].read).not.toHaveBeenCalled(); expect(reader.ready).toBe(false);
  });
  it('discloses printed read failure without discarding MRZ evidence', async () => {
    const reader = new LocalIdReader(); await reader.prepare(); state.printed[0].read.mockRejectedValue(new Error('synthetic'));
    const result = await reader.read({ mode: 'mrz', mrzCanvas: canvas(), printedCanvas: canvas() }, { ownership: 'transfer' });
    expect(result.printedError).toBe(true); expect(result.printed).toBeUndefined(); expect(result.reviewRequired).toBe(true);
  });
  it('clears transferred pixels on read failure and can prepare again', async () => {
    const reader = new LocalIdReader(); await reader.prepare(); state.mrz[0].read.mockRejectedValue(new Error('synthetic'));
    const source = canvas(); await expect(reader.read({ mode: 'mrz', mrzCanvas: source }, { ownership: 'transfer' })).rejects.toThrow();
    expect(source.width).toBe(0); await reader.prepare(); expect(reader.ready).toBe(true);
  });
  it('does not return stale data after cancellation', async () => {
    const reader = new LocalIdReader(); await reader.prepare();
    let finish!: (value: unknown) => void;
    state.printed[0].read.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const source = canvas(); const pending = reader.read({ mode: 'printed', printedCanvas: source }, { ownership: 'transfer' });
    await reader.cancel(); finish({ fields: { cardType: 'unknown' }, confidence: 70 });
    await expect(pending).rejects.toThrow('cancelled'); expect(source.width).toBe(0);
  });
});
