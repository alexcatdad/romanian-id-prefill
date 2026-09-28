import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
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

// PDF.js is fully self-hosted. One in-memory pack avoids runtime font/CMap/WASM
// downloads and the startup overhead of hundreds of individual requests.
const pdfSource = join(root, 'node_modules/pdfjs-dist');
const pdfDestination = join(root, 'public/pdf');
await mkdir(join(pdfDestination, 'wasm'), { recursive: true });
await copyFile(join(pdfSource, 'legacy/build/pdf.worker.mjs'), join(pdfDestination, 'pdf.worker.mjs'));
const packedResources = {};
for (const [directory, kind] of [['cmaps', 'cMapUrl'], ['standard_fonts', 'standardFontDataUrl'], ['wasm', 'wasmUrl']]) {
  for (const name of await readdir(join(pdfSource, directory))) {
    if (directory === 'wasm' && !['openjpeg.wasm', 'jbig2.wasm', 'qcms_bg.wasm'].includes(name)) continue;
    if (!/\.(bcmap|pfb|ttf|wasm)$/.test(name)) continue;
    packedResources[`${kind}/${name}`] = (await readFile(join(pdfSource, directory, name))).toString('base64');
  }
}
await writeFile(join(pdfDestination, 'resources.json'), JSON.stringify(packedResources));
for (const name of ['openjpeg_nowasm_fallback.js', 'jbig2_nowasm_fallback.js']) {
  await copyFile(join(pdfSource, 'wasm', name), join(pdfDestination, 'wasm', name));
}
await copyFile(join(pdfSource, 'LICENSE'), join(licenses, 'pdfjs-Apache-2.0.txt'));
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  for (const name of await readdir(join(pdfSource, directory))) {
    if (name.startsWith('LICENSE')) await copyFile(join(pdfSource, directory, name), join(licenses, `pdfjs-${directory}-${name}.txt`));
  }
}
console.log('Local PDF worker, decoder modules, and in-memory resource pack are ready.');
