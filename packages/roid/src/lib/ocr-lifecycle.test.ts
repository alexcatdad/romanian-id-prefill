import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyntheticMrz } from '../../tests/fixtures';

const mock = vi.hoisted(() => ({
  engine: { ready: true, prepare: vi.fn(), read: vi.fn(), dispose: vi.fn() },
}));
// ROID tests its public OCR dependency boundary, not Tesseract internals.
// Engine initialization/cancellation is covered in the independent OCR repo.
vi.mock('@alexcatdad/browser-ocr', async (original) => ({
  ...await original<typeof import('@alexcatdad/browser-ocr')>(),
  LocalOcrReader: class { constructor() { return mock.engine; } },
}));
import { LocalMrzReader } from './ocr';
import { LocalPrintedReader } from './printed-ocr';
const canvas = () => ({ width: 100, height: 50, toDataURL: () => '', getContext: () => ({}) }) as unknown as HTMLCanvasElement;
beforeEach(() => {
  vi.resetAllMocks();
  mock.engine.ready = true;
  mock.engine.prepare.mockResolvedValue(undefined);
  mock.engine.dispose.mockResolvedValue(undefined);
});
describe.each([LocalMrzReader, LocalPrintedReader])('ROID reader dependency lifecycle', Reader => {
  it('rejects malformed input before consuming the prepared engine', async () => {
    const reader = new Reader(); await reader.prepare();
    await expect(reader.read('https://example.test/private' as never)).rejects.toThrow('canvas');
    expect(mock.engine.read).not.toHaveBeenCalled();
    expect(mock.engine.dispose).not.toHaveBeenCalled();
    expect(reader.ready).toBe(true);
    await reader.dispose();
  });
  it('disposes the engine after a failed read and exposes only its safe error', async () => {
    mock.engine.read.mockRejectedValue(new Error('synthetic private engine diagnostic'));
    const reader = new Reader(); await reader.prepare();
    await expect(reader.read(canvas())).rejects.toThrow(Reader === LocalMrzReader ? 'code rows' : 'printed details');
    expect(mock.engine.dispose).toHaveBeenCalledOnce();
  });
});
it('parses MRZ output then discards raw text/geometry and disposes the engine', async () => {
  const fixture = createSyntheticMrz();
  const raw = { text: fixture.lines.join('\n'), confidence: 95, lines: [] };
  mock.engine.read.mockResolvedValue(raw);
  const reader = new LocalMrzReader(); await reader.prepare();
  const result = await reader.read(canvas());
  expect(result.assessment).toMatchObject({ valid: true, fullName: fixture.fullName, cnp: fixture.cnp, rawLines: [] });
  expect(raw.text).toBe(''); expect(raw.lines).toEqual([]);
  expect(mock.engine.dispose).toHaveBeenCalledOnce();
});
it('parses printed output then discards raw text/geometry and disposes the engine', async () => {
  const raw = { text: 'Nume / Surname\nEXEMPLU\nPrenume / Given names\nANA MARIA', confidence: 95, lines: [] };
  mock.engine.read.mockResolvedValue(raw);
  const reader = new LocalPrintedReader(); await reader.prepare();
  const result = await reader.read(canvas());
  expect(result.fields.fullName).toBe('EXEMPLU ANA MARIA');
  expect(raw.text).toBe(''); expect(raw.lines).toEqual([]);
  expect(mock.engine.dispose).toHaveBeenCalledOnce();
});
