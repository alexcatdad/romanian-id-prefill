import { readFile, mkdir, lstat, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';


export const ocrAssetDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../runtime-assets');
export async function copyAssets({destination, force = false, extraSources = []}) {
 destination = resolve(destination);
 const sources = [ocrAssetDirectory, ...extraSources].map(source => resolve(source));

const hash = data => createHash('sha256').update(data).digest('hex');
// Validate everything before copying. Refuse symlinks in the destination path.
async function refuseSymlinks(path) {
  let current = resolve(path);
  while (true) {
    const stats = await lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (stats?.isSymbolicLink()) throw new Error('Asset destination must not contain symbolic links.');
    const parent = dirname(current); if (parent === current) break; current = parent;
  }
}
await refuseSymlinks(destination);
const copies = [];
let count = 0;
for (const source of sources) {
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
count += manifest.files.length;
for (const entry of manifest.files) {
  const from = resolve(source, entry.path), to = resolve(destination, entry.path);
  if (!from.startsWith(source + sep) || !to.startsWith(destination + sep)) throw new Error('Invalid asset manifest path.');
  const bytes = await readFile(from);
  if (hash(bytes) !== entry.sha256 || bytes.length !== entry.bytes) throw new Error(`Packaged asset failed integrity check: ${entry.path}`);
  await refuseSymlinks(to);
  const existing = await readFile(to).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing && hash(existing) !== entry.sha256 && !force) throw new Error(`Existing file differs: ${relative(process.cwd(), to)}. Choose another destination or use --force to replace packaged asset paths.`);
  if (!existing || hash(existing) !== entry.sha256) copies.push({ from, to });
}
}
for (const {from, to} of copies) { await mkdir(dirname(to), { recursive: true }); await copyFile(from, to); }
console.log(`Ready: ${count} assets (${copies.length} copied) in ${destination}`);

}
