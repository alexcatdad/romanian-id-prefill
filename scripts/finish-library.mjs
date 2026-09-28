import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = join(root, 'packages/roid');
const lib = join(packageRoot, 'lib');
const runtime = join(packageRoot, 'runtime-assets');
// Generated package artifacts only, never consumer destinations.
await rm(runtime, { recursive: true, force: true });
await mkdir(runtime, { recursive: true });
{
 const licenses = join(root, 'public/licenses');
 await mkdir(licenses, { recursive: true });
 await mkdir(join(runtime, 'licenses'), {recursive:true});
 for (const [source, target] of [['mrz/LICENSE', 'mrz-MIT.txt'], ['react/LICENSE', 'react-MIT.txt'], ['react-dom/LICENSE', 'react-dom-MIT.txt'], ['@fontsource/manrope/LICENSE', 'manrope-OFL.txt'], ['@fontsource/ibm-plex-mono/LICENSE', 'ibm-plex-mono-OFL.txt']]) {
  await cp(join(root, 'node_modules', source), join(licenses, target));
  await cp(join(licenses, target), join(runtime, 'licenses', target));
 }

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
await writeFile(join(lib, 'styles.css'), fontCss.join('\n') + '\n' + await readFile(join(packageRoot, 'src/styles.css'), 'utf8'));
}

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
await writeFile(join(runtime, 'manifest.json'), JSON.stringify({ version: JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')).version, files }, null, 2) + '\n');
console.log(`Prepared ROID package and ${files.length} verified self-hosted assets.`);
