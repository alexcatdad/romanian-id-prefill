import { assertCanvas, LocalOcrReader, PSM, type OcrLine, type OcrResult, type ReaderOptions } from '@alexcatdad/browser-ocr';
import { assessMrz } from './mrz';
import type { MrzAssessment } from './mrz';
import type { PrintedIdFields } from './printed-id';
export type { ReaderProgress } from '@alexcatdad/browser-ocr';
import type { ReaderProgress } from '@alexcatdad/browser-ocr';
export interface ScanResult { assessment: MrzAssessment; confidence: number; printed?: { fields: PrintedIdFields; confidence: number }; mode?: 'mrz' | 'printed'; printedError?: boolean; }
export class LocalMrzReader {
  private reading = false;
  private engine: LocalOcrReader;
  constructor(onProgress: (value: ReaderProgress) => void = () => {}, options: ReaderOptions = {}) {
    this.engine = new LocalOcrReader(onProgress, { ...options, languages: 'mrz', pageSegmentation: PSM.SINGLE_BLOCK,
      whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
      initParameters: { load_system_dawg: '0', load_freq_dawg: '0', load_punc_dawg: '0', load_number_dawg: '0', load_unambig_dawg: '0', load_bigram_dawg: '0' },
    });
  }
  get ready() { return !this.reading && this.engine.ready; }
  prepare() { return this.engine.prepare(); }
  async read(canvas: HTMLCanvasElement): Promise<ScanResult> {
    if (this.reading) throw new Error('A read is already in progress.');
    assertCanvas(canvas);
    if (!this.engine.ready) throw new Error('Prepare the reader before reading.');
    this.reading = true;
    let result: OcrResult | undefined;
    try {
      result = await this.engine.read(canvas);
      let text = result.text;
      const lines = result.lines;
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
          const reread = await this.engine.read(canvas, {
            rectangle, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            pageSegmentation: PSM.SINGLE_WORD,
          includeLines: false });
          const country = reread.text.trim();
          reread.text = '';
          if (/^[A-Z]{3}$/.test(country)) {
            readRows[field.row] = row.slice(0, field.start) + country + row.slice(field.start + 3);
            countryReread = true;
          }
        }
        text = readRows.join('\n');
      }
      const assessment = assessMrz(text);
      if (countryReread) assessment.warnings.push('Country fields were separately re-read with letter-only OCR. Numeric fields and check digits were not altered.');
      return { assessment: { ...assessment, rawLines: [] }, confidence: result.confidence };
    } catch { throw new Error('We could not read the code rows. Try a sharper, straight photo with every row visible.'); }
    finally { if (result) { result.text = ''; result.lines.length = 0; } await this.engine.dispose(); this.reading = false; }
  }
  dispose() { return this.engine.dispose(); }
}
function countryRectangle(line: OcrLine, start: number, canvas: HTMLCanvasElement) {
  const symbols = line.symbols;
  const selected = symbols.slice(start, start + 3);
  if (selected.length !== 3) return null;
  const left = Math.max(0, Math.min(...selected.map((symbol) => symbol.bbox.x0)) - 2);
  const top = Math.max(0, Math.min(...selected.map((symbol) => symbol.bbox.y0)) - 5);
  const right = Math.min(canvas.width, Math.max(...selected.map((symbol) => symbol.bbox.x1)) + 2);
  const bottom = Math.min(canvas.height, Math.max(...selected.map((symbol) => symbol.bbox.y1)) + 5);
  return { left, top, width: right - left, height: bottom - top };
}
