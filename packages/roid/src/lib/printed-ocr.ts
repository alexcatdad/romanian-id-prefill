import { assertCanvas, LocalOcrReader, PSM, type OcrResult, type ReaderOptions, type ReaderProgress } from '@alexcatdad/browser-ocr';
import { parsePrintedId } from './printed-id';
import type { PrintedIdFields } from './printed-id';
export interface PrintedScanResult { fields: PrintedIdFields; confidence: number; }
/** The Romanian field parser is intentionally outside the generic OCR engine. */
export class LocalPrintedReader {
  private reading = false;
  private engine: LocalOcrReader;
  constructor(onProgress: (value: ReaderProgress) => void = () => {}, options: ReaderOptions = {}) {
    this.engine = new LocalOcrReader(onProgress, { ...options, languages: 'ron+eng', pageSegmentation: PSM.AUTO });
  }
  get ready() { return !this.reading && this.engine.ready; }
  prepare() { return this.engine.prepare(); }
  async read(canvas: HTMLCanvasElement): Promise<PrintedScanResult> {
    if (this.reading) throw new Error('A read is already in progress.');
    assertCanvas(canvas);
    if (!this.engine.ready) throw new Error('Prepare the reader before reading.');
    this.reading = true;
    let result: OcrResult | undefined;
    try {
      result = await this.engine.read(canvas, { includeLines: false });
      return { fields: parsePrintedId(result.text), confidence: result.confidence };
    } catch { throw new Error('The printed details could not be read.'); }
    finally { if (result) { result.text = ''; result.lines.length = 0; } await this.engine.dispose(); this.reading = false; }
  }
  dispose() { return this.engine.dispose(); }
}
