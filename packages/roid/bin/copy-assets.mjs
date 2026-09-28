#!/usr/bin/env node
import { copyAssets } from '@alexcatdad/browser-ocr/assets';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
if (args.includes('--help') || args.length === 0) {
  console.log('Usage: roid-assets --to public/reader-assets [--force]\nCopies packaged, hash-verified runtime assets locally. Existing differing files require --force. No downloads.');
  process.exit(args.length ? 0 : 1);
}
const targetIndex = args.indexOf('--to');
if (targetIndex < 0 || !args[targetIndex + 1] || args[targetIndex + 1].startsWith('--') || args.some((arg, index) => index !== targetIndex && index !== targetIndex + 1 && arg !== '--force')) throw new Error('Use --to <directory> and optional --force.');
await copyAssets({destination:args[targetIndex+1],force:args.includes('--force'), extraSources: [fileURLToPath(new URL('../runtime-assets/', import.meta.url))]});
