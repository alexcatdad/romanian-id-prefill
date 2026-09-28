import { copyAssets } from '@alexcatdad/browser-ocr/assets';
import { fileURLToPath } from 'node:url';

// public/ocr and public/pdf are generated from the pinned, installed OCR package.
// The package verifies all hashes before copying. Never fetch models at runtime.
await copyAssets({ destination: fileURLToPath(new URL('../public/', import.meta.url)), force: true });
