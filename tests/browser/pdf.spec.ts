import { expect, test, type Page } from '@playwright/test';
import { createScannedPdf, createSyntheticPdf } from '../pdf-fixtures';
import { createSyntheticMrz } from '../fixtures';

type Resources = { __pdfCanvases: HTMLCanvasElement[]; __pdfWorkers: Array<{ url: string; ended: boolean }> };

async function ready(page: Page) {
  await page.goto('./');
  await expect(page.getByText('Local reader ready', { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function upload(page: Page, buffer = createSyntheticPdf()) {
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-document.pdf', mimeType: 'application/pdf', buffer });
}
async function resources(page: Page) {
  return page.evaluate(() => {
    const state = window as typeof window & Resources;
    return {
      activePdfWorkers: state.__pdfWorkers.filter((worker) => /pdf/i.test(worker.url) && !worker.ended).length,
      activeCanvases: state.__pdfCanvases.filter((canvas) => canvas.width !== 0 || canvas.height !== 0).length,
      allWorkersEnded: state.__pdfWorkers.every((worker) => worker.ended),
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as typeof window & Resources;
    state.__pdfCanvases = []; state.__pdfWorkers = [];
    const create = Document.prototype.createElement;
    Document.prototype.createElement = function (this: Document, ...args: Parameters<typeof create>) {
      const element = create.apply(this, args);
      if (element instanceof HTMLCanvasElement) state.__pdfCanvases.push(element);
      return element;
    } as typeof create;
    const BrowserWorker = window.Worker;
    window.Worker = class extends BrowserWorker {
      marker: { url: string; ended: boolean };
      constructor(...args: ConstructorParameters<typeof BrowserWorker>) {
        super(...args); this.marker = { url: String(args[0]), ended: false }; state.__pdfWorkers.push(this.marker);
      }
      terminate() { this.marker.ended = true; super.terminate(); }
    };
  });
});

test('PDF page selection and OCR stay local, preserve mandatory review, and destroy PDF resources', async ({ page, context }) => {
  await ready(page);
  const fixture = createSyntheticMrz('TD2');
  const requests: string[] = [];
  page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await upload(page, createSyntheticPdf({ pageLines: [createSyntheticMrz('TD2', { name: 'EXEMPLU<<ALTA<PAGINA' }).lines, fixture.lines] }));
  await expect(page.getByRole('heading', { name: 'Choose a PDF page', exact: true })).toBeVisible();
  await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Use this page', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Find the code rows', exact: true })).toBeVisible();
  await expect.poll(async () => (await resources(page)).activePdfWorkers).toBe(0);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Read my ID', exact: true }).click();
  await expect(page.locator('#full-name')).toHaveValue(fixture.fullName);
  await expect(page.locator('#cnp')).toHaveValue(fixture.cnp);
  await expect(page.getByRole('button', { name: 'Use these details', exact: true })).toBeDisabled();
  await expect.poll(async () => resources(page)).toEqual({ activePdfWorkers: 0, activeCanvases: 0, allWorkersEnded: true });
  expect(requests).toEqual([]);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: await indexedDB.databases(), caches: await caches.keys() }))).toEqual({ local: 0, session: 0, databases: [], caches: [] });
});

test('discarding a PDF clears page canvases and closes its worker', async ({ page }) => {
  await ready(page);
  await upload(page);
  await expect(page.getByRole('button', { name: 'Use this page', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
  const workersBeforeDiscard = await page.evaluate(() => (window as typeof window & Resources).__pdfWorkers.length);
  await page.getByRole('button', { name: 'Discard PDF', exact: true }).click();
  await expect(page.getByText('Local reader ready', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate((count) => (window as typeof window & Resources).__pdfWorkers.slice(0, count).every((worker) => worker.ended), workersBeforeDiscard)).toBe(true);
  expect((await resources(page)).activeCanvases).toBe(0);
  expect(await page.locator('input[type=file]').inputValue()).toBe('');
});

test('pagehide destroys a PDF preview without retaining its pixels', async ({ page }) => {
  await ready(page); await upload(page);
  await expect(page.getByRole('button', { name: 'Use this page', exact: true })).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect.poll(async () => resources(page)).toEqual({ activePdfWorkers: 0, activeCanvases: 0, allWorkersEnded: true });
  await expect(page.getByRole('heading', { name: 'Choose a PDF page', exact: true })).toHaveCount(0);
});

for (const invalid of [
  { label: 'corrupt', message: 'This PDF could not be opened. Choose another PDF or an image.', buffer: () => Buffer.from('%PDF-1.7\nThis is an intentionally corrupt synthetic fixture.\n') },
  { label: 'password-protected', message: 'Password-protected PDFs are not supported. Choose an unlocked copy or an image.', buffer: () => createSyntheticPdf({ encrypted: true }) },
  { label: 'more than 50 pages', message: 'This PDF has more than 50 pages. Choose a smaller document.', buffer: () => createSyntheticPdf({ pages: 51 }) },
  { label: 'over 15 MB', message: 'Choose a PDF smaller than 15 MB.', buffer: () => Buffer.concat([createSyntheticPdf(), Buffer.alloc(16 * 1024 * 1024)]) },
]) {
  test(`rejects ${invalid.label} PDF safely`, async ({ page }) => {
    await ready(page); await upload(page, invalid.buffer());
    await expect(page.getByRole('alert')).toContainText(invalid.message);
    await expect(page.getByRole('heading', { name: 'Choose a PDF page', exact: true })).toHaveCount(0);
    await expect(page.locator('#cnp')).toHaveValue('');
    await expect.poll(async () => (await resources(page)).activePdfWorkers).toBe(0);
    expect((await resources(page)).activeCanvases).toBe(0);
    expect(await page.locator('input[type=file]').inputValue()).toBe('');
  });
}


test('scanned PDF pages use the same local image OCR pipeline', async ({ page }) => {
  await ready(page);
  const fixture = createSyntheticMrz('TD2');
  const jpeg = Buffer.from(await page.evaluate((lines) => {
    const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 1000;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff'; context.fillRect(0, 0, 1800, 1000);
    context.fillStyle = '#171936'; context.font = '48px "IBM Plex Mono"';
    lines.forEach((line, index) => context.fillText(line, 45, 750 + index * 85));
    const encoded = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
    canvas.width = 0; canvas.height = 0; return encoded;
  }, fixture.lines), 'base64');
  const requests: string[] = [];
  page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await upload(page, createScannedPdf(jpeg, 1800, 1000));
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use this page', exact: true }).click();
  await page.getByRole('button', { name: 'Read my ID', exact: true }).click();
  await expect(page.locator('#cnp')).toHaveValue(fixture.cnp);
  await expect(page.locator('#full-name')).toHaveValue(fixture.fullName);
  expect(requests).toEqual([]);
});

test('Romanian PDF page selection keeps document state and makes no language-switch requests', async ({ page }) => {
  await ready(page); await upload(page);
  await expect(page.getByRole('button', { name: 'Use this page', exact: true })).toBeEnabled();
  const requests: string[] = [];
  page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.getByRole('button', { name: 'Română', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alege o pagină din PDF', exact: true })).toBeVisible();
  await expect(page.getByText('Pagina 1 din 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pagina următoare', exact: true }).click();
  await expect(page.getByText('Pagina 2 din 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Folosește această pagină', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Citește actul', exact: true })).toBeEnabled();
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
