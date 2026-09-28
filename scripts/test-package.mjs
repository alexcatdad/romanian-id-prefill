import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, cp, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium, webkit, expect } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(join(tmpdir(), 'romanian-id-consumer-'));
const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
let server;
async function run(command, args, cwd = temp) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
try {
  // Packing, installing and resolving happen outside this checkout. No aliases,
  // source imports, workspace links or unpublished node_modules are available.
  await run('npm', ['pack', '--ignore-scripts', '--silent', '--pack-destination', temp], root);
  const tarball = (await readdir(temp)).find((name) => name.endsWith('.tgz'));
  assert(tarball, 'npm pack must produce an archive');
  await writeFile(join(temp, 'package.json'), JSON.stringify({ name: 'installed-reader-consumer', private: true, type: 'module' }));
  await run('npm', ['install', '--ignore-scripts', '--omit=peer', '--no-audit', '--no-fund', `./${tarball}`]);
  const installed = join(temp, 'node_modules', metadata.name);
  await assert.rejects(access(join(installed, 'src')), 'Package must not depend on shipped source files');
  await assert.rejects(access(join(temp, 'node_modules/react')), 'Core installation must not require React');
  await run(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { validateCnp, assessMrz, parsePrintedId, LocalIdReader, LocalPdfReader } from '${metadata.name}';
    assert.equal(typeof window, 'undefined');
    assert.equal(validateCnp('2960526400010').valid, false);
    assert.equal(assessMrz('not an identity').valid, false);
    assert.equal(typeof parsePrintedId, 'function');
    assert.equal(typeof LocalIdReader, 'function');
    assert.equal(typeof LocalPdfReader, 'function');
  `]);
  const versions = { ...metadata.dependencies, ...metadata.devDependencies };
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...['react', 'react-dom', '@types/react', '@types/react-dom', 'typescript', 'vite'].map((name) => `${name}@${versions[name]}`)]);
  await cp(join(root, 'tests/package'), temp, { recursive: true });
  await run(join(temp, 'node_modules/.bin/romanian-id-assets'), ['--to', 'public/reader-assets']);
  const assets = join(temp, 'public/reader-assets');
  await run(join(temp, 'node_modules/.bin/romanian-id-assets'), ['--to', 'public/reader-assets']);
  await writeFile(join(assets, 'host-owned.txt'), 'Preserve unrelated host assets');
  await writeFile(join(assets, 'ocr/model.json'), 'conflicting asset');
  await assert.rejects(run(join(temp, 'node_modules/.bin/romanian-id-assets'), ['--to', 'public/reader-assets']), 'CLI must refuse differing destination assets');
  assert.equal(await readFile(join(assets, 'ocr/model.json'), 'utf8'), 'conflicting asset');
  await run(join(temp, 'node_modules/.bin/romanian-id-assets'), ['--to', 'public/reader-assets', '--force']);
  assert.equal(await readFile(join(assets, 'host-owned.txt'), 'utf8'), 'Preserve unrelated host assets');
  for (const path of ['ocr/local-worker.js', 'ocr/worker.min.js', 'ocr/mrz.traineddata.gz', 'ocr/eng.traineddata.gz', 'ocr/ron.traineddata.gz', 'pdf/local-worker.mjs', 'pdf/pdf.worker.mjs', 'pdf/resources.json']) await access(join(assets, path));
  const manifest = JSON.parse(await readFile(join(assets, 'ocr/model.json'), 'utf8'));
  assert.equal(createHash('sha256').update(await readFile(join(assets, 'ocr/mrz.traineddata.gz'))).digest('hex'), manifest.sha256);
  const printedModels = JSON.parse(await readFile(join(assets, 'ocr/printed-models.json'), 'utf8'));
  for (const model of printedModels.models) assert.equal(createHash('sha256').update(await readFile(join(assets, `ocr/${model.language}.traineddata.gz`))).digest('hex'), model.sha256);
  assert((await readdir(join(assets, 'fonts'))).some((file) => file.endsWith('.woff2')), 'UI fonts must also be self-hosted');
  await run(join(temp, 'node_modules/.bin/tsc'), ['--pretty', 'false']);
  await run(join(temp, 'node_modules/.bin/vite'), ['build']);
  server = spawn(join(temp, 'node_modules/.bin/vite'), ['preview', '--host', '127.0.0.1', '--port', '4189', '--strictPort'], { cwd: temp, stdio: 'inherit' });
  const origin = 'http://127.0.0.1:4189';
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch { /* server startup */ }
    if (attempt >= 100) throw new Error('Consumer preview failed to start');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const [name, browserType] of [['Chromium', chromium], ['WebKit', webkit]]) {
    const browser = await browserType.launch();
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      const startup = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => startup.push(request.url()));
      await page.goto(origin);
      await expect(page.getByText('Local reader ready', { exact: true })).toBeVisible({ timeout: 60000 });
      assert(startup.filter((url) => /^https?:/.test(url)).every((url) => new URL(url).origin === origin), 'All runtime assets must be same-origin');
      assert(startup.some((url) => url.includes('/reader-assets/ocr/')), 'OCR must use configured nested asset directory');
      assert(startup.some((url) => url.includes('/reader-assets/pdf/')), 'PDF must use configured nested asset directory');
      const fixture = await page.evaluate(async () => {
        const face = new FontFace('FixtureMono', 'url(/reader-assets/fonts/ibm-plex-mono-latin-400-normal.woff2)');
        document.fonts.add(await face.load());
        const digit = (value, weights) => String([...value].reduce((sum, char, i) => sum + (char === '<' ? 0 : /[0-9]/.test(char) ? Number(char) : char.charCodeAt(0) - 55) * weights[i % weights.length], 0) % 10);
        const twelve = '296052640001';
        const remainder = [...twelve].reduce((sum, char, i) => sum + Number(char) * Number('279146358279'[i]), 0) % 11;
        const cnp = twelve + (remainder === 10 ? 1 : remainder);
        const first = 'IDROUAB1234567' + digit('AB1234567', [7, 3, 1]) + cnp + '<<';
        const second = '960526' + digit('960526', [7, 3, 1]) + 'F350101' + digit('350101', [7, 3, 1]) + 'ROU' + '<'.repeat(11);
        const lines = [first, second + digit(first.slice(5) + second.slice(0, 7) + second.slice(8, 15) + second.slice(18), [7, 3, 1]), 'EXEMPLU<<ANA<MARIA'.padEnd(30, '<')];
        const canvas = document.createElement('canvas');
        canvas.width = 1600; canvas.height = 285;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#171936'; ctx.font = '48px FixtureMono';
        lines.forEach((line, i) => ctx.fillText(line, 58, 75 + i * 80));
        return canvas.toDataURL('image/png').split(',')[1];
      });
      const processing = [];
      page.on('request', (request) => { if (/^https?:/.test(request.url())) processing.push(request.url()); });
      await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-id.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
      await expect(page.getByRole('heading', { name: 'Find the code rows' })).toBeVisible();
      await context.setOffline(true);
      await page.getByRole('button', { name: 'Read my ID', exact: true }).click();
      try { await expect(page.locator('input[name=fullName]')).toHaveValue('EXEMPLU ANA MARIA', { timeout: 60000 }); } catch (error) { console.error(await page.locator('body').innerText()); throw error; }
      await expect(page.locator('#result')).toHaveText('');
      await expect(page.getByRole('button', { name: 'Use these details', exact: true })).toBeDisabled();
      await page.getByRole('checkbox', { name: 'I have checked all populated ID details', exact: true }).check();
      await page.getByRole('button', { name: 'Use these details', exact: true }).click();
      await expect(page.locator('#result')).toContainText('EXEMPLU ANA MARIA');
      const result = JSON.parse(await page.locator('#result').textContent());
      assert.equal(result.fullName, 'EXEMPLU ANA MARIA');
      assert.match(result.cnp, /^\d{13}$/);
      assert.equal(result.documentSeries, 'AB');
      assert.deepEqual(processing, [], 'Reading and confirmation must not make network requests');
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: await indexedDB.databases(), caches: await caches.keys() })), { local: 0, session: 0, databases: [], caches: [] });
      await context.setOffline(false);
      await page.evaluate(() => window.prepareCoreReader());
      const coreRequests = [];
      page.on('request', (request) => { if (/^https?:/.test(request.url())) coreRequests.push(request.url()); });
      await context.setOffline(true);
      const headless = await page.evaluate(async (encoded) => {
        const image = new Image();
        image.src = `data:image/png;base64,${encoded}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        canvas.getContext('2d').drawImage(image, 0, 0);
        return window.readCoreCanvas(canvas);
      }, fixture);
      assert.equal(headless.result.assessment.fullName, 'EXEMPLU ANA MARIA');
      assert.equal(headless.result.assessment.valid, true);
      assert.equal(headless.result.reviewRequired, true);
      assert.equal(headless.cleared, true);
      assert.equal(headless.ready, false);
      assert.deepEqual(coreRequests, []);
      await context.setOffline(false);
      await page.evaluate(() => window.preparePdfReader());
      const pdfRequests = [];
      page.on('request', (request) => { if (/^https?:/.test(request.url())) pdfRequests.push(request.url()); });
      assert.equal(await page.evaluate(() => window.openPdf()), 1);
      await context.setOffline(true);
      const pdf = await page.evaluate(() => window.renderPdf());
      assert(pdf.width > 0 && pdf.height > 0);
      assert.deepEqual(pdf.black, [0, 0, 0, 255]);
      assert.deepEqual(pdfRequests, []);
      assert.deepEqual(errors, []);
      console.log(`${name}: installed React/headless OCR, PDF rendering, explicit review, callback, cleanup and offline privacy passed.`);
    } finally { await browser.close(); }
  }
  console.log('Packed package passed core-only Node import, independent TypeScript/build, assets and browser integration.');
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
  await rm(temp, { recursive: true, force: true });
}
