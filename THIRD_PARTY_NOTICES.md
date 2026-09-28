# Third-party notices

- Tesseract.js 7.0.0 and tesseract.js-core: Apache-2.0. Build preparation copies their full license texts into `public/ocr/LICENSE.tesseract.txt` and `public/ocr/LICENSE.core.txt`, which ship with the static site.
- DoubangoTelecom tesseractMRZ model: BSD-3-Clause. The full copyright/license is retained in `public/ocr/LICENSE.model.txt`; provenance and SHA-256 are recorded in `public/ocr/model.json`.
- `mrz` 5.0.2: MIT; license retained in the installed package.
- PDF.js (`pdfjs-dist`) 6.3.289: Apache-2.0. Worker, CMaps, standard fonts and decoder assets are self-hosted; preparation retains package and asset-specific license files in `public/licenses/pdfjs-*.txt`.
- React/React DOM, Vite, TypeScript, Vitest, Playwright: their package-provided licenses apply. Application runtime dependencies are recorded in the lockfile.
- Manrope and IBM Plex Mono fonts: SIL Open Font License 1.1, supplied by the pinned `@fontsource` packages. Their license files are copied to `public/licenses/` during preparation.

No third-party service processes images or OCR in this app. These notices do not change the original licenses.
