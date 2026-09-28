import { assertCanvas } from './canvas';
import type { ReaderOptions } from './assets';
import { LocalMrzReader, type ReaderProgress, type ScanResult } from './ocr';
import { LocalPrintedReader } from './printed-ocr';
import { assessMrz } from './mrz';
import { clearCanvas } from './image';

export type IdReadInput =
  | { mode: 'mrz'; mrzCanvas: HTMLCanvasElement; printedCanvas?: HTMLCanvasElement }
  | { mode: 'printed'; printedCanvas: HTMLCanvasElement };
export interface IdReadOptions {
  /** Transfer clears accepted canvases, including on OCR failure. Invalid inputs or competing calls are rejected before ownership transfers. Borrow leaves cleanup to the caller. */
  ownership: 'transfer' | 'borrow';
}
export type IdScanResult = ScanResult & { reviewRequired: true };

/** One document side per read. Never merges fields from different images or identities.
 * Call prepare before accepting private input, then read once. Workers are disposed
 * after every read. MRZ input must already be selected/preprocessed by the caller.
 * PDF callers use LocalPdfReader to explicitly choose and render a page first.
 */
export class LocalIdReader {
  private mrz: LocalMrzReader;
  private printed: LocalPrintedReader;
  private reading = false;
  private generation = 0;
  constructor(onProgress: (value: ReaderProgress) => void = () => {}, options: ReaderOptions = {}) {
    this.mrz = new LocalMrzReader(onProgress, options);
    this.printed = new LocalPrintedReader(onProgress, options);
  }
  get ready() { return !this.reading && this.mrz.ready && this.printed.ready; }
  async prepare(): Promise<void> {
    if (this.reading) throw new Error('A read is already in progress.');
    const generation = this.generation;
    const results = await Promise.allSettled([this.mrz.prepare(), this.printed.prepare()]);
    if (generation !== this.generation) throw new Error('Preparation cancelled.');
    if (results.some(result => result.status === 'rejected')) {
      await this.dispose();
      throw new Error('The local readers could not prepare.');
    }
  }
  async read(input: IdReadInput, options: IdReadOptions): Promise<IdScanResult> {
    // Reject competing calls before taking ownership of their buffers.
    if (this.reading) throw new Error('A read is already in progress.');
    if (!options || !['transfer', 'borrow'].includes(options.ownership)) throw new Error('Choose canvas ownership explicitly.');
    if (!input || !['mrz', 'printed'].includes(input.mode)) throw new Error('Choose mrz or printed mode.');
    if (input.mode === 'mrz') assertCanvas(input.mrzCanvas);
    if (input.mode === 'printed' || input.printedCanvas !== undefined) assertCanvas(input.printedCanvas);
    this.reading = true;
    const generation = this.generation;
    const canvases = new Set<HTMLCanvasElement>();
    if (input.mode === 'mrz') canvases.add(input.mrzCanvas);
    if (input.printedCanvas) canvases.add(input.printedCanvas);
    try {
      if (!this.mrz.ready || !this.printed.ready) throw new Error('Prepare the local readers before reading.');
      const [mrz, printed] = await Promise.allSettled([
        input.mode === 'mrz' ? this.mrz.read(input.mrzCanvas) : Promise.resolve({ assessment: assessMrz(''), confidence: 0 }),
        input.printedCanvas ? this.printed.read(input.printedCanvas) : Promise.resolve(undefined),
      ]);
      if (generation !== this.generation) throw new Error('Reading cancelled.');
      if (mrz.status === 'rejected') throw new Error('The code rows could not be read.');
      if (input.mode === 'printed' && printed.status === 'rejected') throw new Error('The printed details could not be read.');
      return {
        ...mrz.value,
        mode: input.mode,
        ...(printed.status === 'fulfilled' && printed.value ? { printed: printed.value } : {}),
        ...(printed.status === 'rejected' ? { printedError: true } : {}),
        reviewRequired: true,
      };
    } finally {
      await Promise.all([this.mrz.dispose(), this.printed.dispose()]);
      if (options.ownership === 'transfer') for (const canvas of canvases) clearCanvas(canvas);
      this.reading = false;
    }
  }
  async dispose(): Promise<void> {
    this.generation++;
    await Promise.all([this.mrz.dispose(), this.printed.dispose()]);
  }
  /** Cancels active OCR; transferred canvases are cleared when read settles. */
  cancel(): Promise<void> { return this.dispose(); }
}
