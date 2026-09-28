import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createSyntheticMrz, withCnpChecksum } from '../fixtures';

const ready = async (page: Page) => {
  await page.goto('./');
  await expect(page.getByText('Local reader ready', { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as typeof window & { __canvases: HTMLCanvasElement[]; __workers: Array<{ ended: boolean }> };
    state.__canvases = [];
    state.__workers = [];
    const create = Document.prototype.createElement;
    Document.prototype.createElement = function (this: Document, ...args: Parameters<typeof create>) {
      const element = create.apply(this, args);
      if (element instanceof HTMLCanvasElement) state.__canvases.push(element);
      return element;
    } as typeof create;
    const BrowserWorker = window.Worker;
    window.Worker = class extends BrowserWorker {
      marker = { ended: false };
      constructor(...args: ConstructorParameters<typeof BrowserWorker>) { super(...args); state.__workers.push(this.marker); }
      terminate() { this.marker.ended = true; super.terminate(); }
    };
  });
});

test('synthetic TD1 OCR stays offline, clears buffers, and requires fresh review after edits', async ({ page, context }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  const loaded = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
  expect(loaded.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Try a synthetic example', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Find the code rows' })).toBeVisible();
  await page.getByRole('button', { name: 'Read my ID', exact: true }).click();
  await expect(page.locator('[id$="-full-name"]')).toHaveValue('EXEMPLU ANA MARIA');
  await expect(page.locator('[id$="-cnp"]')).toHaveValue(createSyntheticMrz().cnp);
  await expect(page.getByText('Image discarded', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use these details', exact: true })).toBeDisabled();
  const cleared = await page.evaluate(() => {
    const state = window as typeof window & { __canvases: HTMLCanvasElement[]; __workers: Array<{ ended: boolean }> };
    return { cleared: state.__canvases.every((canvas) => canvas.width === 0 && canvas.height === 0), terminated: state.__workers.every((worker) => worker.ended), count: state.__canvases.length };
  });
  expect(cleared.count).toBeGreaterThan(0); expect(cleared.cleared).toBe(true); expect(cleared.terminated).toBe(true);
  await page.getByRole('checkbox', { name: 'I have checked all populated ID details', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Use these details', exact: true })).toBeEnabled();
  await page.locator('[id$="-full-name"]').fill('EXEMPLU ANA-MARIA');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Use these details', exact: true })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Use these details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ready to prefill' })).toBeVisible();
  expect(requests).toEqual([]); expect(errors).toEqual([]);
  const storage = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: await indexedDB.databases(), caches: await caches.keys() }));
  expect(storage).toEqual({ local: 0, session: 0, databases: [], caches: [] });
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Clear details', exact: true }).click();
  await expect(page.locator('[id$="-cnp"]')).toHaveValue('');
  await expect(page.getByText('Local reader ready', { exact: true })).toBeVisible();
});

async function fixturePng(page: Page, lines: string[], fullCard = false) {
  return Buffer.from(await page.evaluate(({ lines, fullCard }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1800; canvas.height = fullCard ? 1000 : lines.length * 85 + 80;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#171936'; context.font = '48px "IBM Plex Mono"';
    const start = fullCard ? 750 : 70;
    lines.forEach((line, index) => context.fillText(line, 45, start + index * 85));
    const encoded = canvas.toDataURL('image/png').split(',')[1];
    canvas.width = 0; canvas.height = 0;
    return encoded;
  }, { lines, fullCard }), 'base64');
}

test('uploaded legacy TD2 image reads offline after decoding and reconstructs CNP with zero processing requests', async ({ page, context }) => {
  await ready(page);
  const fixture = createSyntheticMrz('TD2');
  const buffer = await fixturePng(page, fixture.lines, true);
  const requests: string[] = [];
  page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-card.png', mimeType: 'image/png', buffer });
  await expect(page.getByRole('heading', { name: 'Find the code rows' })).toBeVisible();
  expect(await page.locator('input[type=file]').count()).toBe(0);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Read my ID', exact: true }).click();
  await expect(page.locator('[id$="-full-name"]')).toHaveValue(fixture.fullName);
  await expect(page.locator('[id$="-cnp"]')).toHaveValue(fixture.cnp);
  await page.getByText('View all validation checks', { exact: true }).click();
  await expect(page.getByRole('list', { name: 'Validation results' })).toBeVisible();
  expect(requests).toEqual([]);
});

test('failed MRZ check digit cannot prefill or be confirmed, and image buffers are cleared', async ({ page }) => {
  await ready(page);
  const fixture = createSyntheticMrz();
  const line = fixture.lines[0];
  fixture.lines[0] = line.slice(0, 14) + String((Number(line[14]) + 1) % 10) + line.slice(15);
  const buffer = await fixturePng(page, fixture.lines);
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-invalid.png', mimeType: 'image/png', buffer });
  await page.getByRole('button', { name: 'Read my ID', exact: true }).click();
  await expect(page.getByText('Image discarded', { exact: true })).toBeVisible();
  await expect(page.locator('[id$="-full-name"]')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Use these details', exact: true })).toBeDisabled();
  expect(await page.locator('canvas').count()).toBe(0);
});

test('a CIS-style MRZ without CNP requires an explicit human CNP entry', async ({ page }) => {
  await ready(page);
  const fixture = createSyntheticMrz('TD1', { optional1: '<'.repeat(15) });
  const buffer = await fixturePng(page, fixture.lines);
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-cis.png', mimeType: 'image/png', buffer });
  await page.getByRole('button', { name: 'Read my ID', exact: true }).click();
  await expect(page.locator('[id$="-full-name"]')).toHaveValue(fixture.fullName);
  await expect(page.locator('[id$="-cnp"]')).toHaveValue('');
  await expect(page.getByRole('checkbox')).toBeDisabled();
  await page.locator('[id$="-cnp"]').fill(createSyntheticMrz().cnp);
  await expect(page.getByRole('checkbox')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Use these details', exact: true })).toBeDisabled();
});

test('wrong checksum and valid-but-mismatched edited CNPs block confirmation', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Try a synthetic example', exact: true }).click();
  await page.getByRole('button', { name: 'Read my ID', exact: true }).click();
  await expect(page.locator('[id$="-cnp"]')).toHaveValue(createSyntheticMrz().cnp);
  await page.getByRole('checkbox').check();
  await page.locator('[id$="-cnp"]').fill('2960526400010');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByRole('checkbox')).toBeDisabled();
  await expect(page.locator('[id$="-cnp"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Use these details', exact: true })).toBeDisabled();
  for (const cnp of [withCnpChecksum('296052540001'), withCnpChecksum('196052640001')]) {
    await page.locator('[id$="-cnp"]').fill(cnp);
    await expect(page.locator('[id$="-cnp-issues"]')).toContainText('does not match the birth date or sex in the card code');
    await expect(page.getByRole('checkbox')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Use these details', exact: true })).toBeDisabled();
  }
});

test('discarding a rotated preview clears all image canvases and prepares another reader', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Try a synthetic example', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate right 90°', exact: true }).click();
  await page.getByRole('button', { name: 'Discard image', exact: true }).click();
  await expect(page.getByText('Local reader ready', { exact: true })).toBeVisible();
  const cleared = await page.evaluate(() => (window as typeof window & { __canvases: HTMLCanvasElement[] }).__canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
  expect(cleared).toBe(true);
});

test('unsupported files never reach OCR or leave a selected file reference', async ({ page }) => {
  await ready(page);
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await expect(page.getByRole('alert')).toContainText('HEIC and SVG files are not supported');
  await expect(page.locator('input[type=file]')).toHaveValue('');
  await expect(page.locator('[id$="-cnp"]')).toHaveValue('');
});

test('missing local model shows a recoverable startup error', async ({ page }) => {
  await page.route('**/mrz.traineddata.gz', (route) => route.fulfill({ status: 404, body: 'Not found' }));
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('local reader could not start');
  await expect(page.getByRole('button', { name: 'Choose file', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Retry local reader', exact: true })).toBeVisible();
  await page.unroute('**/mrz.traineddata.gz');
  await page.getByRole('button', { name: 'Retry local reader', exact: true }).click();
  await expect(page.getByText('Local reader ready', { exact: true })).toBeVisible();
});

test('returning from page cache during model loading retires that reader and recovers', async ({ page }) => {
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let requested: (() => void) | undefined;
  const modelRequested = new Promise<void>((resolve) => { requested = resolve; });
  await page.route('**/mrz.traineddata.gz', async (route) => {
    requested?.();
    await held;
    await route.continue();
  }, { times: 1 });
  await page.goto('./');
  await modelRequested;
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  release?.();
  await expect(page.getByText('Local reader ready', { exact: true })).toBeVisible();
  await expect(page.locator('[id$="-cnp"]')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Choose file', exact: true })).toBeEnabled();
});

test('camera refusal gives an image fallback and no active video', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(MediaDevices.prototype, 'getUserMedia', { configurable: true, value: async () => { throw new DOMException('Synthetic refusal', 'NotAllowedError'); } });
  });
  await ready(page);
  await page.getByRole('button', { name: 'Use camera', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Camera permission was not granted');
  await page.getByRole('button', { name: 'Choose an image instead', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Choose file', exact: true })).toBeEnabled();
});

test('a late camera permission result is immediately stopped after cancel', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as typeof window & { __resolveCamera: () => void; __cameraTrack: MediaStreamTrack };
    Object.defineProperty(MediaDevices.prototype, 'getUserMedia', { configurable: true, value: () => new Promise<MediaStream>((resolve) => {
      state.__resolveCamera = () => {
        const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100;
        const stream = canvas.captureStream(); state.__cameraTrack = stream.getTracks()[0];
        resolve(stream); canvas.width = 0; canvas.height = 0;
      };
    }) });
  });
  await ready(page);
  await page.getByRole('button', { name: 'Use camera', exact: true }).click();
  await expect(page.getByText('Waiting for camera access…')).toBeVisible();
  await page.getByRole('button', { name: 'Close camera', exact: true }).click();
  await page.evaluate(() => (window as typeof window & { __resolveCamera: () => void }).__resolveCamera());
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __cameraTrack: MediaStreamTrack }).__cameraTrack.readyState)).toBe('ended');
});

test('camera capture stops its stream and sends only a local canvas through the MRZ flow', async ({ page }) => {
  await page.addInitScript((lines: string[]) => {
    const state = window as typeof window & { __cameraTrack: MediaStreamTrack; __cameraCanvas: HTMLCanvasElement };
    Object.defineProperty(MediaDevices.prototype, 'getUserMedia', { configurable: true, value: async () => {
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 285;
      const drawing = canvas.getContext('2d')!;
      const paint = () => {
        drawing.fillStyle = '#fff'; drawing.fillRect(0, 0, canvas.width, canvas.height);
        drawing.fillStyle = '#171936'; drawing.font = '48px "IBM Plex Mono"';
        lines.forEach((line, index) => drawing.fillText(line, 58, 75 + index * 80));
      };
      paint();
      const stream = canvas.captureStream(5);
      const track = stream.getTracks()[0];
      state.__cameraTrack = track; state.__cameraCanvas = canvas;
      // Canvas capture publishes on paints. Supply live frames after the
      // stream starts, just as a camera does, across browser media pipelines.
      const frames = setInterval(() => {
        if (track.readyState === 'ended') {
          clearInterval(frames); canvas.width = 0; canvas.height = 0;
        } else paint();
      }, 100);
      return stream;
    } });
  }, createSyntheticMrz().lines);
  await ready(page);
  await page.getByRole('button', { name: 'Use camera', exact: true }).click();
  try {
    await expect(page.getByRole('button', { name: 'Capture image', exact: true })).toBeEnabled();
  } catch (failure) {
    // Test diagnostics contain media state only, never image or OCR contents.
    console.error('Synthetic camera readiness', await page.evaluate(() => {
      const video = document.querySelector('video');
      const track = (window as typeof window & { __cameraTrack?: MediaStreamTrack }).__cameraTrack;
      return { width: video?.videoWidth, height: video?.videoHeight, readyState: video?.readyState, paused: video?.paused, error: video?.error?.code, trackState: track?.readyState };
    }));
    throw failure;
  }
  await page.getByRole('button', { name: 'Capture image', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Find the code rows' })).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { __cameraTrack: MediaStreamTrack }).__cameraTrack.readyState)).toBe('ended');
  await page.evaluate(() => {
    const canvas = (window as typeof window & { __cameraCanvas: HTMLCanvasElement }).__cameraCanvas;
    canvas.width = 0; canvas.height = 0;
  });
  await page.getByRole('button', { name: 'Read my ID', exact: true }).click();
  await expect(page.locator('[id$="-full-name"]')).toHaveValue(createSyntheticMrz().fullName);
  await expect(page.locator('[id$="-cnp"]')).toHaveValue(createSyntheticMrz().cnp);
});

test('privacy information and responsive controls remain usable on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'How privacy works', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('The hosting provider may log website visits');
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('static preview rejects any upload request', async ({ request }) => {
  const response = await request.post('./', { data: 'synthetic-placeholder' });
  expect(response.status()).toBe(405);
  expect(response.headers()['content-security-policy']).toContain("connect-src 'self'");
});
