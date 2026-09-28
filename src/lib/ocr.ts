import { createWorker, OEM, PSM } from 'tesseract.js';
import type { Line, Worker } from 'tesseract.js';
import { assessMrz } from './mrz';
import type { MrzAssessment } from './mrz';
import type { PrintedIdFields } from './printed-id';

export interface ScanResult { assessment: MrzAssessment; confidence: number; printed?: { fields: PrintedIdFields; confidence: number }; mode?: 'mrz' | 'printed'; printedError?: boolean; }
export type ReaderProgress = { stage: 'preparing' | 'reading'; progress: number };

export class LocalMrzReader {
  private worker: Worker | null = null;
  private pending: Promise<void> | null = null;
  private generation = 0;
  private cancelRead: (() => void) | null = null;
  private onProgress: (value: ReaderProgress) => void;
  constructor(onProgress: (value: ReaderProgress) => void) { this.onProgress = onProgress; }

  get ready() { return this.worker !== null; }

  prepare(): Promise<void> {
    if (this.worker) return Promise.resolve();
    if (this.pending) return this.pending;
    const generation = this.generation;
    const originBase = new URL(import.meta.env.BASE_URL, window.location.origin);
    this.pending = (async () => {
      let candidate: Worker | null = null;
      let failInitialization: (() => void) | undefined;
      const initializationFailure = new Promise<never>((_, reject) => {
        failInitialization = () => reject(new Error('The local reader could not initialize.'));
      });
      try {
        candidate = await Promise.race([createWorker('mrz', OEM.LSTM_ONLY, {
          workerPath: new URL('ocr/local-worker.js', originBase).href,
          corePath: new URL('ocr/core', originBase).href,
          langPath: new URL('ocr', originBase).href,
          cacheMethod: 'none',
          workerBlobURL: false,
          gzip: true,
          legacyCore: false,
          legacyLang: false,
          logger: ({ status, progress }) => {
            if (generation === this.generation) this.onProgress({ stage: status === 'recognizing text' ? 'reading' : 'preparing', progress });
          },
          // The library otherwise writes errors to the console; input-derived
          // errors must stay out of persistent logs and telemetry.
          errorHandler: () => {
            // Tesseract 7 can otherwise leave a language/init failure pending.
            // Reject the safe outer initialization/read promise as well.
            failInitialization?.();
          },
        }, {
          load_system_dawg: '0', load_freq_dawg: '0', load_punc_dawg: '0',
          load_number_dawg: '0', load_unambig_dawg: '0', load_bigram_dawg: '0',
        }), initializationFailure]);
        await candidate.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
          preserve_interword_spaces: '1',
          user_defined_dpi: '300',
        });
        if (generation !== this.generation) { await candidate.terminate(); return; }
        this.worker = candidate;
      } catch {
        await candidate?.terminate().catch(() => {});
        throw new Error('The local reader could not start. Reload this page and check that its local OCR assets are available.');
      } finally { this.pending = null; }
    })();
    return this.pending;
  }

  async read(canvas: HTMLCanvasElement): Promise<ScanResult> {
    const worker = this.worker;
    if (!worker) throw new Error('Wait for the local reader before choosing an image.');
    let encodedImage: string | null = null;
    try {
      // Avoid the library's canvas -> Blob -> FileReader path, which can fail
      // and leave a promise pending in offline WebKit. The library converts
      // this in-memory PNG data string directly to bytes without fetching it.
      // Callers can pass only canvases, never URLs or file paths.
      encodedImage = canvas.toDataURL('image/png');
      const cancelled = new Promise<never>((_, reject) => {
        this.cancelRead = () => reject(new Error('Reading cancelled.'));
      });
      const result = await Promise.race([worker.recognize(encodedImage, { rotateAuto: false }, { text: true, blocks: true }), cancelled]);
      let text = result.data.text;
      const lines = result.data.blocks?.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)) ?? [];
      const readRows = text.trim().split(/\r?\n/).map((line) => line.trim());
      const format = readRows.length === 3 && readRows.every((row) => row.length === 30) ? 'TD1'
        : readRows.length === 2 && readRows.every((row) => row.length === 36) ? 'TD2' : null;
      let countryReread = false;
      if (format) {
        // ICAO country fields contain letters only. Re-read their pixels with
        // that alphabet when necessary; never substitute characters in text.
        const fields = [{ row: 0, start: 2 }, { row: 1, start: format === 'TD1' ? 15 : 10 }];
        for (const field of fields) {
          const row = readRows[field.row];
          if (row.slice(field.start, field.start + 3) === 'ROU') continue;
          const line = lines.find((candidate) => candidate.text.trim() === row);
          if (!line) continue;
          const rectangle = countryRectangle(line, field.start, canvas);
          if (!rectangle) continue;
          const reread = await Promise.race([worker.recognize(encodedImage, {
            rectangle, tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            tessedit_pageseg_mode: PSM.SINGLE_WORD,
          } as Parameters<Worker['recognize']>[1], { text: true, blocks: false }), cancelled]);
          const country = reread.data.text.trim();
          reread.data.text = '';
          if (/^[A-Z]{3}$/.test(country)) {
            readRows[field.row] = row.slice(0, field.start) + country + row.slice(field.start + 3);
            countryReread = true;
          }
        }
        text = readRows.join('\n');
      }
      const assessment = assessMrz(text);
      if (countryReread) assessment.warnings.push('Country fields were separately re-read with letter-only OCR. Numeric fields and check digits were not altered.');
      // Keep just the parsed review data; discard raw OCR text immediately.
      result.data.text = '';
      result.data.blocks = null;
      return { assessment: { ...assessment, rawLines: [] }, confidence: Math.max(0, Math.min(100, Math.round(result.data.confidence))) };
    } catch {
      throw new Error('We could not read the code rows. Try a sharper, straight photo with every row visible.');
    } finally {
      encodedImage = null;
      // Tesseract holds image buffers in its WASM memory until termination.
      if (this.worker === worker) this.worker = null;
      this.cancelRead = null;
      await worker.terminate().catch(() => {});
    }
  }

  async dispose() {
    this.generation += 1;
    this.cancelRead?.();
    this.cancelRead = null;
    const worker = this.worker;
    this.worker = null;
    await worker?.terminate().catch(() => {});
    await this.pending?.catch(() => {});
  }
}

function countryRectangle(line: Line, start: number, canvas: HTMLCanvasElement) {
  const symbols = line.words.flatMap((word) => word.symbols ?? []);
  const selected = symbols.slice(start, start + 3);
  if (selected.length !== 3) return null;
  const left = Math.max(0, Math.min(...selected.map((symbol) => symbol.bbox.x0)) - 2);
  const top = Math.max(0, Math.min(...selected.map((symbol) => symbol.bbox.y0)) - 5);
  const right = Math.min(canvas.width, Math.max(...selected.map((symbol) => symbol.bbox.x1)) + 2);
  const bottom = Math.min(canvas.height, Math.max(...selected.map((symbol) => symbol.bbox.y1)) + 5);
  return { left, top, width: right - left, height: bottom - top };
}
