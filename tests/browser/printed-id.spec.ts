import { expect, test, type Page } from '@playwright/test';
import { createSyntheticMrz, withCnpChecksum } from '../fixtures';

// Invented data arranged around the printed labels on the legacy CI specimen.
// This exercises OCR on clear typography, not real-photo recognition accuracy.
const validCnp = withCnpChecksum('296052640001');
type Resources = { __printedCanvases: HTMLCanvasElement[]; __printedWorkers: Array<{ ended: boolean }> };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as typeof window & Resources;
    state.__printedCanvases = []; state.__printedWorkers = [];
    const create = Document.prototype.createElement;
    Document.prototype.createElement = function (this: Document, ...args: Parameters<typeof create>) {
      const element = create.apply(this, args);
      if (element instanceof HTMLCanvasElement) state.__printedCanvases.push(element);
      return element;
    } as typeof create;
    const BrowserWorker = window.Worker;
    window.Worker = class extends BrowserWorker {
      marker = { ended: false };
      constructor(...args: ConstructorParameters<typeof BrowserWorker>) { super(...args); state.__printedWorkers.push(this.marker); }
      terminate() { this.marker.ended = true; super.terminate(); }
    };
  });
});

async function ready(page: Page) {
  await page.goto('./');
  await expect(page.getByText('Local reader ready', { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function card(page: Page, cnp = validCnp, includeMrz = false, variant: 'ci' | 'cei' | 'conflict' = 'ci') {
  return Buffer.from(await page.evaluate(({ cnp, mrz, variant }) => {
    const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 1100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111'; ctx.font = '38px Arial';
    const lines = [
      variant === 'cei' ? 'CARTE ELECTRONICA DE IDENTITATE' : 'CARTE DE IDENTITATE', variant === 'conflict' ? 'SERIA CD NR 654321' : 'SERIA AB NR 123456', `CNP ${cnp}`,
      'Nume / Surname', 'EXEMPLU', 'Prenume / Given name', 'ANA MARIA',
      ...(variant === 'cei' ? [] : ['Domiciliu / Address', 'Jud. CLUJ Mun. CLUJ-NAPOCA',
      'Str. EXEMPLULUI NR. 12 BL. B SC. A ET. 2 AP. 8']),
    ];
    lines.forEach((line, index) => ctx.fillText(line, 60, 65 + index * 65));
    ctx.font = '48px "IBM Plex Mono"';
    mrz.forEach((line, index) => ctx.fillText(line, 45, 865 + index * 85));
    const data = canvas.toDataURL('image/png').split(',')[1];
    canvas.width = 0; canvas.height = 0; return data;
  }, { cnp, variant, mrz: includeMrz ? createSyntheticMrz('TD2', { cnp }).lines : [] }), 'base64');
}
async function upload(page: Page, buffer: Buffer) {
  await page.locator('input[type=file]').setInputFiles({ name: 'invented-printed-card.png', mimeType: 'image/png', buffer });
}
async function assertCleanup(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const state = window as typeof window & Resources;
    return state.__printedCanvases.every(canvas => canvas.width === 0 && canvas.height === 0) &&
      state.__printedWorkers.every(worker => worker.ended);
  })).toBe(true);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: await indexedDB.databases(), caches: await caches.keys() }))).toEqual({ local: 0, session: 0, databases: [], caches: [] });
}

test('printed CI fields use actual local OCR, require review and release all image resources', async ({ page, context }) => {
  await ready(page);
  const buffer = await card(page);
  const requests: string[] = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await upload(page, buffer);
  await page.getByRole('radio', { name: 'No, read the other printed details', exact: true }).check();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Read printed details', exact: true }).click();
  await expect(page.locator('[id$="-full-name"]')).toHaveValue('EXEMPLU ANA MARIA');
  await expect(page.locator('[id$="-cnp"]')).toHaveValue(validCnp);
  await expect(page.getByLabel('Document series', { exact: true })).toHaveValue('AB');
  await expect(page.getByLabel('Document number', { exact: true })).toHaveValue('123456');
  await page.getByText('Address components', { exact: true }).click();
  await expect(page.locator('[id$="-address-county"]')).toHaveValue('CLUJ');
  await expect(page.locator('[id$="-address-locality"]')).toHaveValue('CLUJ-NAPOCA');
  await expect(page.locator('[id$="-address-street"]')).toHaveValue('EXEMPLULUI');
  await expect(page.locator('[id$="-address-number"]')).toHaveValue('12');
  await expect(page.getByRole('button', { name: 'Use these details', exact: true })).toBeDisabled();
  await assertCleanup(page);
  expect(requests).toEqual([]);
  await page.getByRole('checkbox').check();
  await page.locator('[id$="-address-number"]').fill('13');
  await expect(page.locator('[id$="-address-raw"]')).toHaveValue('');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('checkbox').check();
  await page.locator('[id$="-address-raw"]').fill('Jud. IAȘI Mun. IAȘI Str. NOUĂ Nr. 5');
  await expect(page.locator('[id$="-address-county"]')).toHaveValue('');
  await expect(page.locator('[id$="-address-street"]')).toHaveValue('');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
});

test('a printed CNP with a bad checksum stays blocked after review', async ({ page }) => {
  await ready(page);
  const invalid = validCnp.slice(0, 12) + String((Number(validCnp[12]) + 1) % 10);
  await upload(page, await card(page, invalid));
  await page.getByRole('radio', { name: 'No, read the other printed details', exact: true }).check();
  await page.getByRole('button', { name: 'Read printed details', exact: true }).click();
  await expect(page.locator('[id$="-cnp"]')).toHaveValue(invalid);
  await expect(page.getByRole('checkbox')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Use these details', exact: true })).toBeDisabled();
  await assertCleanup(page);
});

test('MRZ mode also reads printed address on the same card without network requests', async ({ page }) => {
  await ready(page);
  const buffer = await card(page, validCnp, true);
  const requests: string[] = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await upload(page, buffer);
  await page.getByRole('button', { name: 'Read my ID', exact: true }).click();
  await expect(page.locator('[id$="-cnp"]')).toHaveValue(validCnp);
  await expect(page.locator('[id$="-full-name"]')).toHaveValue('EXEMPLU ANA MARIA');
  await expect(page.getByLabel('Document number', { exact: true })).toHaveValue('123456');
  await page.getByText('Address components', { exact: true }).click();
  await expect(page.locator('[id$="-address-street"]')).toHaveValue('EXEMPLULUI');
  await assertCleanup(page);
  expect(requests).toEqual([]);
});


test('missing CEI address remains unknown and language changes preserve reviewed candidates', async ({ page }) => {
  await ready(page);
  await upload(page, await card(page, validCnp, false, 'cei'));
  await page.getByRole('radio', { name: 'No, read the other printed details', exact: true }).check();
  await page.getByRole('button', { name: 'Read printed details', exact: true }).click();
  await expect(page.locator('[id$="-cnp"]')).toHaveValue(validCnp);
  await expect(page.locator('[id$="-address-raw"]')).toHaveValue('');
  await page.getByRole('button', { name: 'Română', exact: true }).click();
  await expect(page.locator('[id$="-full-name"]')).toHaveValue('EXEMPLU ANA MARIA');
  await expect(page.locator('[id$="-cnp"]')).toHaveValue(validCnp);
  await expect(page.locator('[id$="-address-raw"]')).toHaveValue('');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('checkbox').check();
  await page.getByLabel('Document number', { exact: true }).fill('123457');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Use these details', exact: true })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Use these details', exact: true }).click();
  await page.getByRole('button', { name: 'Clear details', exact: true }).click();
  await expect(page.getByText('Local reader ready', { exact: true })).toBeVisible();
  await expect(page.locator('[id$="-cnp"]')).toHaveValue('');
});

test('conflicting printed document number is shown alongside the checked MRZ value', async ({ page }) => {
  await ready(page);
  await upload(page, await card(page, validCnp, true, 'conflict'));
  await page.getByRole('button', { name: 'Read my ID', exact: true }).click();
  await expect(page.getByLabel('Document number', { exact: true })).toHaveValue('123456');
  await expect(page.getByText('Different readings — compare both with your card before confirming.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Document number: Code rows 123456; Printed text 654321/)).toBeVisible();
  await assertCleanup(page);
});
