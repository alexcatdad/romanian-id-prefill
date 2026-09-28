import { createRoot } from 'react-dom/client';
import { validateCnp } from 'romanian-id-prefill';
import { IdReader } from 'romanian-id-prefill/react';
import 'romanian-id-prefill/styles.css';

const result = document.querySelector<HTMLOutputElement>('#result')!;
createRoot(document.querySelector('#app')!).render(
  <IdReader assetBaseUrl="/reader-assets/" language="en" onConfirm={(details) => {
    if (!validateCnp(details.cnp).valid) throw new Error('Invalid confirmed CNP');
    result.value = JSON.stringify(details);
  }} />,
);

// This independent host also exercises the headless API without React controls.
import { LocalIdReader, prepareMrzCanvas, type IdScanResult } from 'romanian-id-prefill';
let coreReader: LocalIdReader | undefined;
Object.assign(window, {
  async prepareCoreReader() {
    coreReader = new LocalIdReader(undefined, { assetBaseUrl: '/reader-assets/' });
    await coreReader.prepare();
  },
  async readCoreCanvas(canvas: HTMLCanvasElement): Promise<{ result: IdScanResult; cleared: boolean; ready: boolean }> {
    if (!coreReader) throw new Error('Prepare first');
    const prepared = prepareMrzCanvas(canvas);
    canvas.width = 0; canvas.height = 0;
    const result = await coreReader.read({ mode: 'mrz', mrzCanvas: prepared }, { ownership: 'transfer' });
    return { result, cleared: prepared.width === 0 && prepared.height === 0, ready: coreReader.ready };
  },
});

import { LocalPdfReader, clearCanvas } from 'romanian-id-prefill';
let pdfReader: LocalPdfReader | undefined;
Object.assign(window, {
  async preparePdfReader() {
    pdfReader = new LocalPdfReader({ assetBaseUrl: '/reader-assets/' });
    await pdfReader.prepare();
  },
  async openPdf() {
    if (!pdfReader) throw new Error('Prepare first');
    const stream = '0 0 0 rg 20 20 100 100 re f';
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 1 /Kids [3 0 R] >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [];
    objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 5\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return pdfReader.open(new File([pdf], 'synthetic.pdf', { type: 'application/pdf' }));
  },
  async renderPdf() {
    if (!pdfReader) throw new Error('Prepare first');
    let canvas: HTMLCanvasElement | undefined;
    try {
      canvas = await pdfReader.render(1);
      const ctx = canvas.getContext('2d')!;
      const black = Array.from(ctx.getImageData(Math.round(canvas.width * 0.3), Math.round(canvas.height * 0.7), 1, 1).data);
      return { width: canvas.width, height: canvas.height, black };
    } finally {
      if (canvas) clearCanvas(canvas);
      await pdfReader.dispose();
    }
  },
});
