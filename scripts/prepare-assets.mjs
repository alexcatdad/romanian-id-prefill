import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(root, 'public/ocr');
await mkdir(join(destination, 'core'), { recursive: true });
for (const name of await readdir(join(root, 'node_modules/tesseract.js-core'))) {
  if (/^tesseract-core.*\.wasm(?:\.js)?$/.test(name)) {
    await copyFile(join(root, 'node_modules/tesseract.js-core', name), join(destination, 'core', name));
  }
}
await copyFile(join(root, 'node_modules/tesseract.js/dist/worker.min.js'), join(destination, 'worker.min.js'));
await copyFile(join(root, 'node_modules/tesseract.js/LICENSE.md'), join(destination, 'LICENSE.tesseract.txt'));
await copyFile(join(root, 'node_modules/tesseract.js-core/LICENSE'), join(destination, 'LICENSE.core.txt'));
const licenses = join(root, 'public/licenses');
await mkdir(licenses, { recursive: true });
await copyFile(join(root, 'node_modules/mrz/LICENSE'), join(licenses, 'mrz-MIT.txt'));
await copyFile(join(root, 'node_modules/react/LICENSE'), join(licenses, 'react-MIT.txt'));
await copyFile(join(root, 'node_modules/react-dom/LICENSE'), join(licenses, 'react-dom-MIT.txt'));
for (const font of ['manrope', 'ibm-plex-mono']) {
  await copyFile(join(root, `node_modules/@fontsource/${font}/LICENSE`), join(licenses, `${font}-OFL.txt`));
}
const manifest = JSON.parse(await readFile(join(destination, 'model.json'), 'utf8'));
const model = await readFile(join(destination, 'mrz.traineddata.gz'));
if (createHash('sha256').update(model).digest('hex') !== manifest.sha256) {
  throw new Error('Local MRZ model integrity check failed. Restore the pinned model before continuing.');
}
console.log('Local OCR worker, WASM variants, and verified MRZ model are ready.');
