# Local ID — Romanian identity-card prefill

A TypeScript browser app that reads a Romanian identity card’s machine-readable zone (MRZ), extracts a name and CNP when available, validates them, and fills a local example form **only after human review**. The source image and OCR processing stay in the browser. There is no backend, upload, account, analytics, or saved history.

[Public repository](https://github.com/alexcatdad/romanian-id-prefill). GitHub Pages is the deployment target. **Publication is manual and awaits the user’s acceptance of this MVP.** Pushing source or passing CI does not deploy a site.

## Run

Use Node.js 24 (or a supported version ≥22.12) and npm.

```sh
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:4173/`. This serves the production build with restrictive privacy/security headers and accepts only static GET/HEAD requests. It has no upload endpoint. Installation downloads software packages; installation never handles an ID image. All runtime OCR assets and fonts are served from this same local host.

For development:

```sh
npm run dev
```

Open `http://127.0.0.1:5173/`. Vite development mode permits its local hot-reload connection and injected development scripts/styles. **Use the production preview for privacy/network verification**, not the development server.

## Use

1. Wait for **Local reader ready**. Reader/model/font loading finishes before image selection is enabled.
2. Choose a JPEG, PNG, or WebP image, drag one onto the page, or use the in-browser camera. Use the front of a legacy CI and the back of a newer CEI/CIS. For a safe first run, choose **Try a synthetic example**; it runs actual local OCR.
3. Select all MRZ rows with the crop edges or keyboard-accessible sliders. Rotate a sideways photo if necessary. An image of just the MRZ can use the whole-image selection.
4. Choose **Read selected MRZ**. The full source image is released when the crop is made; the crop and OCR worker are cleared after processing, including errors.
5. Compare the editable full name and CNP against your physical card. MRZ names omit diacritics and can be truncated. A valid checksum does not validate the name or prove that an ID is authentic.
6. Correct the fields if necessary, explicitly acknowledge your review, then choose **Use these details**. The example form is filled in this tab; nothing is submitted, copied, downloaded, or persisted. Any edit clears the acknowledgement. Use **Clear details** to forget the result.

Camera capture requires HTTPS or localhost. Tracks stop on capture, cancel, unmount, page hide, and permission failure, including a late permission result after cancellation. File selection remains available when a camera cannot start.

## Supported Romanian MRZ layouts

| Card | MRZ | Name | CNP |
| --- | --- | --- | --- |
| Legacy CI | TD2: 2 × 36 characters, front | First row | Reconstructed from `S` + six MRZ DOB digits + the remaining `JJNNNC` optional-data digits |
| Verified CEI layout | TD1: 3 × 30 characters, back | Third row | 13 digits directly in first-row optional data, followed by `<<` |
| CIS / simple identity card | TD1: 3 × 30 characters, back | Third row | The official specimen omits it; enter the CNP from the front manually |

The app accepts the verified `IDROU` layouts, Romanian issuer/nationality, known document-number layouts, and one complete MRZ at a time. Unsupported or malformed layouts do not produce a guessed prefill. CIS-style missing CNP is an explicit manual-entry state. A manually entered CNP must still agree with the MRZ birth date and sex.

The TD2 encoding is specified by [HG 295/2021, Annex 2, point 5(c)](https://legislatie.just.ro/Public/DetaliiDocument/240116) and visible in the [PRADO CI specimen](https://www.consilium.europa.eu/prado/en/ROU-BO-04001/image-341419.html). Current layouts are checked against the [government CEI information and specimen](https://carteadeidentitate.gov.ro/despre/) and [PRADO CIS specimen](https://www.consilium.europa.eu/prado/en/ROU-BO-06001/image-385251.html). Specimen CNPs are not assumed to be valid: the official CEI example has an invalid CNP checksum and is covered by a rejection regression test.

## Stack choice and verification

Verified on 2026-09-28:

- **React 19.3 + Vite 8.3 + TypeScript**, compiled to static assets. No application server is required.
- **[Tesseract.js 7.0.0](https://github.com/naptha/tesseract.js)** is the maintained browser-compatible WebWorker/WebAssembly engine. Its release was published 2025-12-15. The library documents [custom worker/core/language paths](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md) and [disabling IndexedDB model caching](https://github.com/naptha/tesseract.js/blob/master/docs/api.md).
- **[Doubango’s MRZ fast LSTM model](https://github.com/DoubangoTelecom/tesseractMRZ)** targets machine-readable text rather than general prose. Its repository is archived; it is a frozen BSD-3-Clause model asset, not a claim of a maintained SDK. The exact commit, upstream source, size, raw/gzip SHA-256, and license are in `public/ocr/model.json` and `public/ocr/LICENSE.model.txt`. Browser compatibility and actual OCR are exercised in Chromium and WebKit tests. This is an MVP model, not a real-world accuracy guarantee.
- **[mrz 5.0.2](https://github.com/cheminfo/mrz)** is a maintained TypeScript parser, released 2026-03-11. It handles TD1/TD2 and supplies field/check-digit details. `autocorrect: false` is explicit.

`npm ci` and `npm run assets` copy the pinned package’s worker and all WASM variants into `public/ocr/`. The model is already vendored; neither build nor runtime fetches it from a CDN. The build verifies its compressed SHA-256. Fonts are bundled from npm, with no Google Fonts requests. Models and workers remain independently replaceable.

## What is validated

- Exact line lengths/count, MRZ character set, supported document layout, issuer, nationality, and calendar-shaped date fields.
- All applicable ICAO document-number, DOB, expiry, and composite check digits, using the library’s field details. Standards: [ICAO Doc 9303 Part 5 (TD1)](https://www.icao.int/sites/default/files/publications/DocSeries/9303_p5_cons_en.pdf), [Part 6 (TD2)](https://www.icao.int/sites/default/files/publications/DocSeries/9303_p6_cons_en.pdf).
- CNP: exactly 13 digits, encoded sex/century, actual date including leap years and future-date rejection, allocation code, serial `001–999`, and the `279146358279` weighted modulo-11 checksum (`10 → 1`). See the [Romanian CNP norms](https://legislatie.just.ro/public/DetaliiDocument/280598) and [FCA-hosted ESMA checksum reference](https://api-handbook.fca.org.uk/files/L3G/MIFID/esma70-1861941480-56_qas_mifir_data_reporting.pdf).
- Modern nationwide allocation **70**, confirmed by [MAI](https://www.mai.gov.ro/5-085-de-coduri-numerice-personale-cnp-uri-generate-prin-sistemul-informatic-integrat-pentru-emiterea-actelor-de-stare-civila-siieasc/). Historical 47/48 acceptance is a documented compatibility choice. Codes 7/8/9 do not determine a century; the app flags ambiguity and blocks confirmed prefill instead of guessing a birth year.
- CNP/MRZ DOB and sex agreement, including manually edited values.

OCR is restricted to MRZ text. If a country code is uncertain, its actual symbol-bounded pixels are separately re-read with a letter-only alphabet. This is disclosed in review; it is not a text substitution. Numeric fields and check digits are never corrected to manufacture validity. The displayed OCR score is an uncalibrated engine estimate, not an identity-verification probability. Names have no MRZ check digit, so review is always required.

## Privacy guarantees and boundaries

| Stage | Network | Data lifetime |
| --- | --- | --- |
| Open / prepare | Same-origin static app, worker, WASM, model, and fonts | Public software assets only |
| Choose / capture / crop | None | File decoded into temporary bounded canvases; file input cleared immediately; object URLs revoked |
| OCR / parse / validate | None | Worker restricts asset loading to this origin and locks fetch/XHR/script loading before receiving its first image; streaming transports and nested workers are disabled |
| Review / confirm | None | Name/CNP and validation details in this tab’s memory only |
| Clear / leave | New reader assets may load after clearing for another scan | Canvases reset, worker terminated, fields forgotten; page-hide clears the current result |

No image, crop, filename, EXIF metadata, OCR text, or result is sent to a server. The app does not write personal data to localStorage, sessionStorage, IndexedDB, cookies, Cache Storage, the clipboard, downloads, URLs, logs, or analytics. Tesseract’s model cache is disabled. Raw OCR text and bounding-box output are dropped after parsing; only fields and validation state needed for review remain. No service worker is installed.

After the reader is ready and an image has been decoded into the crop preview, OCR and review can finish without an internet connection. Browser file-decoding behavior is a separate limit: WebKit's automated offline mode can refuse local-file reads, so an offline upload from every browser is not promised. Online decoding still makes no HTTP request and keeps the file local. A fresh worker is created for each new scan; a new scan after reset/reload needs asset access again. This is not an installable offline PWA.

Production HTML puts a restrictive CSP before scripts: same-origin scripts/assets, no external connections, no form submissions, no inline scripts or styles, no objects or document-base injection. The supplied local static server adds HTTP CSP, frame restrictions, no-referrer, camera-only permissions, `nosniff`, and no-store headers; it rejects non-GET/HEAD requests. GitHub Pages does not provide arbitrary custom response headers, so the Pages build retains the HTML CSP and worker restrictions, but cannot claim the local server’s header-only frame protection. GitHub may log ordinary site visits/IP addresses; [GitHub documents this](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). These visits contain no ID/OCR payload.

Browser extensions, OS/browser memory handling, and a compromised host are outside this application’s guarantee. Clearing canvases/references and terminating the worker is resource cleanup, not guaranteed forensic erasure of all memory copies.

## Test

```sh
npm test
npm run typecheck
npx playwright install chromium webkit
npm run verify
```

Unit tests cover both Romanian MRZ encodings, CIS without CNP, all ICAO check-digit failures, invalid names/layouts/countries, multiple candidates including damaged second cards, CNP date/leap/checksum/remainder-10 cases, modern code 70, ambiguity, and official-specimen regressions. Worker-boundary tests exercise the actual bootstrap against external and processing-time transports. Browser tests use synthetic identities only and run actual WASM OCR in Chromium and WebKit. They cover offline scan/review, absence of processing-time requests, blank storage, canvas/worker cleanup, review and edit gates (including a valid CNP for a different DOB/sex), invalid reads, missing-model retry, page-cache startup recovery, camera capture/stream cleanup/cancellation/refusal, and a phone viewport. Hardware camera quality and real ID-photo accuracy are not yet accepted/benchmarked.

## GitHub Pages — after acceptance

The verification workflow runs on pushes/PRs. `deploy-pages.yml` runs **only manually**, from `main`, with the explicit `accepted=true` input. It re-tests and builds the exact artifact under the repository subpath, then configures and publishes Pages through official GitHub actions. No server or credentials are embedded in the app.

After the user accepts this MVP for publication:

```sh
gh workflow run deploy-pages.yml --repo alexcatdad/romanian-id-prefill --ref main -f accepted=true
gh run list --repo alexcatdad/romanian-id-prefill --workflow deploy-pages.yml
```

Then inspect the exact deployment run, wait for success, and verify the published site at `https://alexcatdad.github.io/romanian-id-prefill/`. Do not equate a pushed commit or successful build with deployment. The Pages URL is a target, not proof of publication.

To reproduce that build locally:

```sh
PAGES_BASE_PATH=/romanian-id-prefill/ npm run build
PAGES_BASE_PATH=/romanian-id-prefill/ npm start
```

Open `http://127.0.0.1:4173/romanian-id-prefill/`.

## MVP limits / resuming work

Use sharp, reasonably straight photos with all MRZ rows visible. This version provides rotation/cropping/contrast normalization; it does not automatically find card corners, correct perspective, reconstruct unreadable fields, read the chip/NFC, prove document authenticity, or check a population registry. HEIC, PDF, SVG, passport MRZs, indefinite filler-only expiry, unverified document-number layouts, and CNP century ambiguity are unsupported. File limit: 15 MB and 40 megapixels; processing canvases are bounded.

See `RUNBOOK.md` for development/release steps, `decisions.jsonl` for choices and authority, and `docs/DESIGN.md` for the UI reference. Preserve the acceptance gate and never commit real identity images, OCR logs, or personal-data screenshots. Third-party notices are in `THIRD_PARTY_NOTICES.md` and the vendored asset/license files.
