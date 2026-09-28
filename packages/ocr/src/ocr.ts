import { createWorker, OEM } from 'tesseract.js';
import type { Worker, WorkerParams } from 'tesseract.js';
import { assertCanvas } from './canvas';
import { resolveAssetBase, type ReaderOptions } from './assets';
/** Public browser-only segmentation constants, independent of engine declarations. */
export const PSM = {
  OSD_ONLY: '0', AUTO_OSD: '1', AUTO_ONLY: '2', AUTO: '3', SINGLE_COLUMN: '4',
  SINGLE_BLOCK_VERT_TEXT: '5', SINGLE_BLOCK: '6', SINGLE_LINE: '7', SINGLE_WORD: '8',
  CIRCLE_WORD: '9', SINGLE_CHAR: '10', SPARSE_TEXT: '11', SPARSE_TEXT_OSD: '12', RAW_LINE: '13',
} as const;
export type PageSegmentation = typeof PSM[keyof typeof PSM];
export interface OcrRectangle { left: number; top: number; width: number; height: number; }
export type ReaderProgress = { stage: 'preparing' | 'reading'; progress: number };
export interface OcrReaderOptions extends ReaderOptions {
  /** Model names already hosted in the local ocr/ directory, joined by +. */
  languages?: string;
  pageSegmentation?: PageSegmentation;
  whitelist?: string;
  initParameters?: Record<string, string>;
  parameters?: Record<string, string | number>;
}
export interface OcrReadOptions { rectangle?: OcrRectangle; whitelist?: string; pageSegmentation?: PageSegmentation; includeLines?: boolean; }
export interface OcrSymbol { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number }; }
export interface OcrLine { text: string; confidence: number; symbols: OcrSymbol[]; }
/** Raw OCR belongs to the caller. Do not log/persist it; release it after use. */
export interface OcrResult { text: string; confidence: number; lines: OcrLine[]; }

/** A sequential OCR session. Canvases are borrowed; dispose releases worker image buffers. */
export class LocalOcrReader {
  private worker: Worker | null = null;
  private pending: Promise<void> | null = null;
  private generation = 0;
  private reading = false;
  private cancelRead: (() => void) | null = null;
  constructor(private onProgress: (value: ReaderProgress) => void = () => {}, private options: OcrReaderOptions = {}) {}
  get ready() { return !this.reading && this.worker !== null; }
  prepare(): Promise<void> {
    if (this.reading) return Promise.reject(new Error('A read is already in progress.'));
    if (this.worker) return Promise.resolve();
    if (this.pending) return this.pending;
    const generation = this.generation;
    const base = resolveAssetBase(this.options);
    const languages = this.options.languages ?? 'eng';
    if (!/^[A-Za-z0-9_-]+(?:\+[A-Za-z0-9_-]+)*$/.test(languages)) return Promise.reject(new Error('Supply local OCR model names.'));
    const pending = (async () => {
      let candidate: Worker | null = null;
      let failed = false;
      let fail!: () => void;
      const failure = new Promise<never>((_, reject) => { fail = () => { failed = true; reject(new Error('Local OCR initialization failed.')); }; });
      try {
        const created = createWorker(languages, OEM.LSTM_ONLY, {
          workerPath: new URL('ocr/local-worker.js', base).href,
          corePath: new URL('ocr/core', base).href, langPath: new URL('ocr', base).href,
          cacheMethod: 'none', workerBlobURL: false, gzip: true, legacyCore: false, legacyLang: false,
          logger: ({ status, progress }) => { if (generation === this.generation) this.onProgress({ stage: status === 'recognizing text' ? 'reading' : 'preparing', progress }); },
          // Never expose input-derived worker errors to the console or telemetry.
          errorHandler: () => { fail(); if (generation === this.generation) this.cancelRead?.(); },
        }, this.options.initParameters);
        // A worker that arrives after initialization rejection must also be released.
        void created.then(worker => { if (failed) void worker.terminate().catch(() => {}); }, () => {});
        candidate = await Promise.race([created, failure]);
        await candidate.setParameters({
          preserve_interword_spaces: '1', user_defined_dpi: '300', ...this.options.parameters,
          tessedit_pageseg_mode: (this.options.pageSegmentation ?? PSM.AUTO) as WorkerParams['tessedit_pageseg_mode'],
          tessedit_char_whitelist: this.options.whitelist ?? '',
        });
        if (generation !== this.generation) throw new Error('Preparation cancelled.');
        this.worker = candidate;
      } catch {
        await candidate?.terminate().catch(() => {});
        throw new Error('The local OCR reader could not start. Check its self-hosted assets.');
      } finally { if (generation === this.generation) this.pending = null; }
    })();
    this.pending = pending;
    return pending;
  }
  async read(canvas: HTMLCanvasElement, options: OcrReadOptions = {}): Promise<OcrResult> {
    if (this.reading) throw new Error('A read is already in progress.');
    assertCanvas(canvas);
    const worker = this.worker;
    if (!worker) throw new Error('Prepare the local OCR reader before reading.');
    this.reading = true;
    let encoded: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: (() => void) | null = null;
    try {
      encoded = canvas.toDataURL('image/png');
      const cancelled = new Promise<never>((_, reject) => {
        cancel = () => reject(new Error('Reading cancelled.'));
        this.cancelRead = cancel;
        timer = setTimeout(cancel, 60000);
      });
      const result = await Promise.race([worker.recognize(encoded, {
        rotateAuto: false, ...(options.rectangle ? { rectangle: options.rectangle } : {}),
        tessedit_char_whitelist: options.whitelist ?? this.options.whitelist ?? '',
        tessedit_pageseg_mode: options.pageSegmentation ?? this.options.pageSegmentation ?? PSM.AUTO,
      } as Parameters<Worker['recognize']>[1], { text: true, blocks: options.includeLines !== false }), cancelled]);
      try {
        return {
          text: result.data.text,
          confidence: Math.max(0, Math.min(100, Math.round(result.data.confidence))),
          lines: result.data.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.map(line => ({
            text: line.text, confidence: line.confidence,
            symbols: line.words.flatMap(word => (word.symbols ?? []).map(symbol => ({ text: symbol.text, confidence: symbol.confidence, bbox: { ...symbol.bbox } }))),
          })))) ?? [],
        };
      } finally { result.data.text = ''; result.data.blocks = null; }
    } catch {
      if (this.worker === worker) this.worker = null;
      await worker.terminate().catch(() => {});
      throw new Error('The local OCR read failed or was cancelled.');
    } finally { clearTimeout(timer); encoded = null; if (this.cancelRead === cancel) this.cancelRead = null; this.reading = false; }
  }
  async dispose() {
    this.generation++; this.cancelRead?.(); this.cancelRead = null;
    const worker = this.worker; this.worker = null;
    const pending = this.pending; this.pending = null;
    await worker?.terminate().catch(() => {});
    await pending?.catch(() => {});
  }
  cancel() { return this.dispose(); }
}
