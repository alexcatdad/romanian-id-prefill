import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lib = join(root, 'lib');
const runtime = join(root, 'runtime-assets');
// Generated package artifacts only, never consumer destinations.
await rm(runtime, { recursive: true, force: true });
await mkdir(runtime, { recursive: true });
for (const folder of ['ocr', 'pdf', 'licenses']) await cp(join(root, 'public', folder), join(runtime, folder), { recursive: true });

const fontCss = [];
for (const [family, weights] of [['manrope', [400, 500, 600, 700, 800]], ['ibm-plex-mono', [400]]]) {
  const directory = join(root, 'node_modules/@fontsource', family);
  for (const subset of ['latin', 'latin-ext']) for (const weight of weights) {
    let css = await readFile(join(directory, `${subset}-${weight}.css`), 'utf8');
    const files = [...css.matchAll(/url\(['"]?\.\/files\/([^)'"\s]+)['"]?\)/g)].map(match => match[1]);
    for (const file of files) {
      await mkdir(join(lib, 'fonts'), { recursive: true });
      await cp(join(directory, 'files', file), join(lib, 'fonts', file));
    }
    css = css.replaceAll('./files/', './fonts/');
    fontCss.push(css);
  }
}
await cp(join(lib, 'fonts'), join(runtime, 'fonts'), { recursive: true });
await writeFile(join(lib, 'styles.css'), fontCss.join('\n') + '\n' + await readFile(join(root, 'src/styles.css'), 'utf8'));

async function walk(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) result.push(...await walk(path)); else if (item.isFile()) result.push(path);
  }
  return result;
}
// Explicit .js specifiers make declarations usable with NodeNext as well as Bundler resolution.
for (const path of await walk(lib)) if (path.endsWith('.d.ts')) {
  const source = await readFile(path, 'utf8');
  await writeFile(path, source.replace(/(from\s+['"])(\.\.?\/[^'"]+)(['"])/g, (_, before, specifier, after) => before + (/\.(?:js|json|css)$/.test(specifier) ? specifier : `${specifier}.js`) + after));
}
const files = [];
for (const path of await walk(runtime)) {
  const data = await readFile(path);
  files.push({ path: relative(runtime, path).split('\\').join('/'), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
files.sort((a, b) => a.path.localeCompare(b.path));
await writeFile(join(runtime, 'manifest.json'), JSON.stringify({ version: JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version, files }, null, 2) + '\n');
console.log(`Prepared typed library, scoped CSS, and ${files.length} verified self-hosted assets.`);
