import type { PDFWorker } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { resolveAssetBase, type ReaderOptions } from './assets';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist/types/src/display/api';

export type PdfErrorCode = 'invalid' | 'too-large' | 'too-many-pages' | 'password' | 'render' | 'timeout' | 'cancelled' | 'not-ready';
export class PdfError extends Error {
  constructor(public readonly code: PdfErrorCode) { super(`PDF: ${code}`); this.name = 'PdfError'; }
}
const MAX_BYTES = 15 * 1024 * 1024;
const LIMIT_MS = 45_000;

/** PDF bytes and decoded resources live only in memory. No document URL is accepted. */
export class LocalPdfReader {
  constructor(private options: ReaderOptions = {}) {}
  private api: typeof import('pdfjs-dist/legacy/build/pdf.mjs') | null = null;
  private worker: Worker | null = null;
  private pdfWorker: PDFWorker | null = null;
  private document: PDFDocumentProxy | null = null;
  private loading: PDFDocumentLoadingTask | null = null;
  private rendering: RenderTask | null = null;
  private resources = new Map<string, Uint8Array>();
  private pending: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private generation = 0;
  private cancelOperation: (() => void) | null = null;
  private prepared = false;

  get ready() { return this.prepared; }

  prepare(): Promise<void> {
    if (this.prepared) return Promise.resolve();
    if (this.pending) return this.pending;
    const generation = this.generation;
    const abort = new AbortController();
    this.abort = abort;
    const base = new URL('pdf/', resolveAssetBase(this.options));
    const pending = this.bounded((async () => {
      const api = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (generation !== this.generation) throw new PdfError('cancelled');
      this.api = api;
      const response = await fetch(new URL('resources.json', base), { signal: abort.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new PdfError('not-ready');
      const packed = await response.json() as Record<string, string>;
      const resources = new Map<string, Uint8Array>();
      for (const [key, encoded] of Object.entries(packed)) {
        const binary = atob(encoded);
        resources.set(key, Uint8Array.from(binary, (character) => character.charCodeAt(0)));
      }
      if (generation !== this.generation) throw new PdfError('cancelled');
      this.resources = resources;
      const worker = new Worker(new URL('local-worker.mjs', base), { type: 'module', name: 'local-pdf' });
      this.worker = worker;
      await new Promise<void>((resolve, reject) => {
        worker.addEventListener('message', (event: MessageEvent) => {
          if (event.data?.type === 'local-pdf-ready') resolve();
        });
        worker.addEventListener('error', (event) => { event.preventDefault(); reject(new PdfError('not-ready')); });
      });
      if (generation !== this.generation) throw new PdfError('cancelled');
      const pdfWorker = api.PDFWorker.create({ port: worker, verbosity: 0 });
      this.pdfWorker = pdfWorker;
      await pdfWorker.promise;
      if (generation !== this.generation) throw new PdfError('cancelled');
      this.prepared = true;
    })(), LIMIT_MS).catch(async (error: unknown) => {
      if (generation === this.generation) await this.dispose();
      throw error instanceof PdfError ? error : new PdfError('not-ready');
    }).finally(() => { if (this.pending === pending) this.pending = null; });
    this.pending = pending;
    return pending;
  }

  async open(file: File): Promise<number> {
    if (!this.prepared || !this.pdfWorker) throw new PdfError('not-ready');
    const generation = this.generation;
    try {
      if (file.size > MAX_BYTES) throw new PdfError('too-large');
      if (this.loading || this.document) throw new PdfError('invalid');
      const header = new Uint8Array(await this.bounded(file.slice(0, 5).arrayBuffer(), LIMIT_MS));
      if (String.fromCharCode(...header) !== '%PDF-') throw new PdfError('invalid');
      const data = new Uint8Array(await this.bounded(file.arrayBuffer(), LIMIT_MS));
      if (generation !== this.generation) { data.fill(0); throw new PdfError('cancelled'); }
      const resources = this.resources;
      class MemoryBinaryDataFactory {
        async fetch({ kind, filename }: { kind: string; filename: string }) {
          const bytes = resources.get(`${kind}/${filename}`);
          if (!bytes) throw new PdfError('render');
          return bytes.slice();
        }
      }
      this.loading = this.api!.getDocument({
        data, worker: this.pdfWorker, verbosity: 0,
        BinaryDataFactory: MemoryBinaryDataFactory, useWorkerFetch: false,
        // Fixed same-origin fallback modules were imported before ready. This
        // URL never depends on PDF bytes. All binary resources use the map.
        wasmUrl: new URL('pdf/wasm/', resolveAssetBase(this.options)).href,
        cMapPacked: true, useWasm: true, useSystemFonts: false,
        disableFontFace: true, enableXfa: false, stopAtErrors: true,
        maxImageSize: 40_000_000, canvasMaxAreaInBytes: 40_000_000 * 4,
        isImageDecoderSupported: false,
        disableAutoFetch: true, disableRange: true, disableStream: true,
      });
      const document = await this.bounded(this.loading.promise, LIMIT_MS);
      if (generation !== this.generation) throw new PdfError('cancelled');
      if (document.numPages < 1) throw new PdfError('invalid');
      if (document.numPages > 50) throw new PdfError('too-many-pages');
      this.document = document;
      return document.numPages;
    } catch (error: unknown) {
      if (generation === this.generation) await this.dispose();
      if (error instanceof PdfError) throw error;
      if (error && typeof error === 'object' && 'name' in error && error.name === 'PasswordException') throw new PdfError('password');
      throw new PdfError('invalid');
    }
  }

  async render(pageNumber: number): Promise<HTMLCanvasElement> {
    if (!this.document) throw new PdfError('not-ready');
    if (this.rendering) throw new PdfError('render');
    const generation = this.generation;
    let canvas: HTMLCanvasElement | null = null;
    try {
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.document.numPages) throw new PdfError('render');
      const page = await this.bounded(this.document.getPage(pageNumber), LIMIT_MS);
      if (generation !== this.generation) throw new PdfError('cancelled');
      const original = page.getViewport({ scale: 1 });
      if (!Number.isFinite(original.width) || !Number.isFinite(original.height) || original.width <= 0 || original.height <= 0) throw new PdfError('render');
      const viewport = page.getViewport({ scale: 2600 / Math.max(original.width, original.height) });
      canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.min(2600, Math.ceil(viewport.width)));
      canvas.height = Math.max(1, Math.min(2600, Math.ceil(viewport.height)));
      this.rendering = page.render({ canvas, viewport, annotationMode: this.api!.AnnotationMode.DISABLE, background: 'rgb(255,255,255)' });
      await this.bounded(this.rendering.promise, LIMIT_MS);
      this.rendering = null;
      page.cleanup();
      if (generation !== this.generation) throw new PdfError('cancelled');
      return canvas;
    } catch (error: unknown) {
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      if (generation === this.generation) await this.dispose();
      throw error instanceof PdfError ? error : new PdfError('render');
    }
  }

  private bounded<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
    let cancel: () => void = () => {};
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const interruption = new Promise<never>((_, reject) => {
      cancel = () => reject(new PdfError('cancelled'));
      this.cancelOperation = cancel;
      timeout = globalThis.setTimeout(() => reject(new PdfError('timeout')), milliseconds);
    });
    return Promise.race([operation, interruption]).finally(() => {
      globalThis.clearTimeout(timeout);
      if (this.cancelOperation === cancel) this.cancelOperation = null;
    });
  }

  async dispose(): Promise<void> {
    this.generation += 1;
    this.prepared = false;
    this.abort?.abort(); this.abort = null;
    this.cancelOperation?.(); this.cancelOperation = null;
    this.rendering?.cancel(); this.rendering = null;
    // Let PDF.js clear its page/font/operator caches before terminating the
    // worker. A stuck document gets a short bounded cleanup window. Capture
    // these handles so an overlapping new prepare cannot be terminated here.
    const worker = this.worker;
    const pdfWorker = this.pdfWorker;
    const loading = this.loading;
    this.worker = null; this.pdfWorker = null;
    this.loading = null; this.document = null;
    this.resources.clear(); this.pending = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (loading) await Promise.race([
        loading.destroy().catch(() => {}),
        new Promise<void>((resolve) => { timeout = globalThis.setTimeout(resolve, 500); }),
      ]);
    } finally {
      globalThis.clearTimeout(timeout);
      pdfWorker?.destroy();
      worker?.terminate();
    }
  }
}
