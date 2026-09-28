import { assertCanvas } from './canvas';
import { resolveAssetBase, type ReaderOptions } from './assets';
import { createWorker, OEM, PSM } from 'tesseract.js';
import type { Worker } from 'tesseract.js';
import { parsePrintedId } from './printed-id';
import type { PrintedIdFields } from './printed-id';
import type { ReaderProgress } from './ocr';
export interface PrintedScanResult { fields: PrintedIdFields; confidence: number; }
/** Separate model/worker so the MRZ's restricted alphabet remains unchanged. */
export class LocalPrintedReader {
  private reading = false;
  private worker: Worker | null = null;
  private pending: Promise<void> | null = null;
  private generation = 0;
  private cancelRead: (() => void) | null = null;
  constructor(private onProgress: (value: ReaderProgress) => void = () => {}, private options: ReaderOptions = {}) {}
  get ready() { return !this.reading && this.worker !== null; }
  prepare(): Promise<void> {
    if (this.reading) return Promise.reject(new Error('A read is already in progress.'));
    if (this.worker) return Promise.resolve();
    if (this.pending) return this.pending;
    const generation = this.generation;
    const base = resolveAssetBase(this.options);
    const pending = (async () => {
      let candidate: Worker | null = null;
      let fail: (() => void) | undefined;
      const failed = new Promise<never>((_, reject) => { fail = () => reject(new Error('Local reader unavailable.')); });
      try {
        candidate = await Promise.race([createWorker('ron+eng', OEM.LSTM_ONLY, {
          workerPath: new URL('ocr/local-worker.js', base).href,
          corePath: new URL('ocr/core', base).href, langPath: new URL('ocr', base).href,
          cacheMethod: 'none', workerBlobURL: false, gzip: true, legacyCore: false, legacyLang: false,
          logger: ({ status, progress }) => {
            if (generation === this.generation) this.onProgress({ stage: status === 'recognizing text' ? 'reading' : 'preparing', progress });
          },
          errorHandler: () => { fail?.(); if (generation === this.generation) this.cancelRead?.(); },
        }), failed]);
        await candidate.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1', user_defined_dpi: '300' });
        if (generation !== this.generation) throw new Error('Preparation cancelled.');
        this.worker = candidate;
      } catch {
        await candidate?.terminate().catch(() => {});
        throw new Error('The local printed-text reader could not start.');
      } finally { if (generation === this.generation) this.pending = null; }
    })();
    this.pending = pending;
    return pending;
  }
  async read(canvas: HTMLCanvasElement): Promise<PrintedScanResult> {
    if (this.reading) throw new Error('A read is already in progress.');
    assertCanvas(canvas);
    const worker = this.worker;
    if (!worker) throw new Error('Wait for the local reader.');
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
      const result = await Promise.race([worker.recognize(encoded, { rotateAuto: false }, { text: true, blocks: false }), cancelled]);
      const fields = parsePrintedId(result.data.text);
      result.data.text = ''; result.data.blocks = null;
      return { fields, confidence: Math.max(0, Math.min(100, Math.round(result.data.confidence))) };
    } catch { throw new Error('The printed details could not be read.'); }
    finally {
      clearTimeout(timer); encoded = null;
      if (this.cancelRead === cancel) this.cancelRead = null;
      if (this.worker === worker) this.worker = null;
      await worker.terminate().catch(() => {});
      this.reading = false;
    }
  }
  async dispose() {
    this.generation++; this.cancelRead?.(); this.cancelRead = null;
    const worker = this.worker; this.worker = null;
    const pending = this.pending;
    this.pending = null;
    await worker?.terminate().catch(() => {});
    await pending?.catch(() => {});
  }
}
