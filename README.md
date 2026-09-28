# Local ID — Romanian identity-card reader library and demo

A TypeScript browser app that reads a Romanian identity card’s machine-readable zone (MRZ), extracts name, CNP, document series/number and printed domicile candidates when available, validates the encoded identity fields, and displays reviewed ID details **only after human review**. The source PDF/image and all rendering/OCR processing stay in the browser. There is no backend, upload, account, analytics, or saved history.

[Public repository](https://github.com/alexcatdad/romanian-id-prefill). GitHub Pages is the primary deployment target; Vercel is a supported static alternative. **[Live app](https://alexcatdad.github.io/romanian-id-prefill/)** — first published with user approval on 2026-09-28. Deployments remain manual; pushing source or passing CI does not publish changes.

## Use in your contract app

The reader is now an installable TypeScript library with a framework-independent core and optional React 19 upload/review UI. The website is its demo. Install the supplied `romanian-id-prefill-0.2.0.tgz` archive, copy the self-hosted runtime assets, and handle the widget's `onConfirm` callback. The package is not published on npm.

See [the integration guide](docs/LIBRARY.md) for installation, React/core examples, asset paths, cleanup and the consuming app's privacy responsibilities. The library supplies reviewed ID details; contract workflows and document generation belong to the future app.

## Deployment, browser, and language targets

| Target | Contract |
| --- | --- |
| GitHub Pages | Static `dist/` at `/romanian-id-prefill/`; local assets use the configured base path |
| Vercel | The same static app at `/`; `vercel.json` sets Vite, `npm run build`, `dist/`, and restrictive response headers; no Functions or server |
| Primary browser | Safari 18+ on macOS and Safari on iOS/iPadOS 18+; release acceptance checks the current stable Safari on a Mac and an iPhone/iPad |
| Other browsers | Current stable Chrome, Edge, and Firefox; Chromium and Firefox automation provide engine coverage |
| Languages | English and Romanian interface, including instructions, validation, errors, and accessibility labels; MRZ recognition stays ICAO Latin letters/digits/`<` |

Safari is the compatibility priority. The JavaScript build explicitly targets Safari/iOS 18 and modern Chromium/Firefox. [Vite documents browser-specific build targets](https://vite.dev/guide/build); [Safari 18 is a published stable baseline](https://developer.apple.com/documentation/safari-release-notes/safari-18-release-notes). Transpilation cannot supply missing browser APIs. Automated desktop/mobile WebKit tests are a regression proxy, **not certification of shipping Safari or a physical camera**: [Playwright uses its own WebKit build](https://playwright.dev/docs/browsers#webkit). See the physical Safari acceptance checklist in `RUNBOOK.md`.

Use the **English / Română** switch in the header. The initial language follows the browser’s primary language (Romanian or English fallback); the selection stays in memory and resets on reload. Switching languages preserves entered details and makes no requests. Romanian UI and editable names support diacritics. MRZ names normally omit them; the reviewer can restore the spelling from the card. A separate pinned Romanian/English OCR model reads explicitly labelled printed ID fields. It is not a general document-understanding service.

## Run

Use Node.js 24 (or a supported version ≥22.13) and npm.

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

1. Wait for **Local reader ready**. PDF/OCR reader, decoder, model and font loading finishes before file selection is enabled.
2. Choose a JPEG, PNG, WebP or PDF file, drag one onto the page, or use the in-browser camera. For PDFs, choose the page containing the ID and select **Use this page** before cropping. For MRZ use the front of a legacy CI and the back of a newer CEI/CIS; for printed details you can read a side without MRZ separately. For a safe first run, choose **Try a synthetic example**; it runs actual local OCR.
3. Select all MRZ rows with the crop edges or keyboard-accessible sliders. Rotate a sideways photo if necessary. An image of just the MRZ can use the whole-image selection.
4. For a side with MRZ, choose **Read my ID**: the selected zone uses the MRZ model while a temporary copy of the full rotated image uses printed-text OCR. For a side without MRZ, choose **No, read the other printed details**, then **Read printed details**. All source/crop canvases and both OCR workers are cleared after processing, including errors.
5. Compare every populated field against your physical card, including document number and address. Expand the address breakdown to check each component. Conflicting MRZ/printed readings are disclosed; missing values stay blank. Compare the editable full name and CNP against your physical card. MRZ names omit diacritics and can be truncated. A valid checksum does not validate the name or prove that an ID is authentic.
6. Correct the fields if necessary, explicitly acknowledge your review, then choose **Use these details**. The example form is filled in this tab; nothing is submitted, copied, downloaded, or persisted. Any edit clears the acknowledgement. Use **Clear details** to forget the result.

Camera capture requires HTTPS or localhost. Tracks stop on capture, cancel, unmount, page hide, and permission failure, including a late permission result after cancellation. File selection remains available when a camera cannot start.

## PDF support

Single- and multipage PDFs are rendered locally with pinned **[Mozilla PDF.js](https://mozilla.github.io/pdf.js/) 6.3.289**, using its legacy build for the Safari baseline. [Mozilla documents Safari 18+ compatibility](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions). The worker, CMaps, standard fonts, WASM and fallback decoder modules are self-hosted and prepared before file selection; binary resources are served from memory during rendering. The PDF worker blocks network APIs before receiving document bytes. No PDF URL is accepted and no full viewer, links, scripts, attachments, XFA or interactive annotations are opened.

Select a page, then crop its MRZ and run the same OCR/review flow as an image. Both scanned pages and rendered text/vector pages are supported; this does not extract hidden PDF text or bypass MRZ validation. Rendering cannot improve a poor underlying scan, and arbitrary PDF fonts may be less reliable for the MRZ OCR model.

Limits: 15 MB, 50 pages, 40 megapixels per embedded image, and a rendered page no larger than 2600 pixels on either side. Loading/rendering has a 45-second timeout. Password-required, damaged or unsupported documents show a local error and can be discarded. The PDF document, reader and caches are released on page selection, discard, failure or page hide; the selected page canvas survives only through the crop/OCR flow. Memory cleanup is not forensic erasure.

## ID understanding scope

This project reads **one uploaded card side at a time**. It does not associate seller/buyer records, assemble a contract, collect phone/email/fiscal addresses, or generate a contract PDF. Those workflows belong in the separate application. Reset clears the previous result; front/back scans are not silently merged.

Two modes share the same review form:

- **Yes, these rows are visible:** checked MRZ identity and document series/number plus printed fields from the full image. MRZ failures still block confirmation. A printed CNP used when the MRZ omits it must agree with its birth date and sex.
- **Printed side without MRZ:** candidates from explicit name, CNP, document and domicile labels. CNP checksum/date checks still apply, but no MRZ validation is claimed. Blank fields require manual completion if needed; all populated fields require review.

Printed extraction uses **official Tesseract tessdata_fast Romanian (`ron`) and English (`eng`) models**, pinned to commit `87416418657359cb625c412a48b6e1d6d41c29bd`. Compressed model hashes and upstream URLs are in `public/ocr/printed-models.json`; the build verifies them. Both models and their Apache-2.0 license are local assets. The models add about 3.05 MB compressed before file selection. See [official tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast). Separate workers keep the MRZ alphabet and checks unchanged.

Address extraction keeps the explicitly labelled domicile section and splits marked county, locality, village, sector, street, number, block, staircase, floor and apartment. Missing or ambiguous components remain blank. Birthplace, issuing authority and CNP allocation code are never used to infer domicile. Generic card titles do not prove CEI versus CIS. Names, addresses and card type have no checksum; OCR scores are uncalibrated estimates. Manual edits reset review.

**Current CEI cards do not print domicile.** A photo cannot supply chip-only data; address remains unavailable unless entered manually. [Official CEI explanation](https://carteadeidentitate.gov.ro/utile/), questions 6–7. No NFC or external address lookup is implemented.

Tests use clear invented printed cards and MRZ fixtures. Glare, blur, security backgrounds, unusual label placement and damaged scans can prevent recognition. The parser deliberately does not guess absent labels or replace OCR characters to force validity. Real-photo accuracy and physical Safari acceptance remain unbenchmarked.

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

After `npm ci`, `npm run assets` copies the pinned package’s worker and all WASM variants into `public/ocr/`. The model is already vendored; neither build nor runtime fetches it from a CDN. The build verifies its compressed SHA-256. Fonts are bundled from npm, with no Google Fonts requests. Models and workers remain independently replaceable.

## What is validated

- Exact line lengths/count, MRZ character set, supported document layout, issuer, nationality, and calendar-shaped date fields.
- All applicable ICAO document-number, DOB, expiry, and composite check digits, using the library’s field details. Standards: [ICAO Doc 9303 Part 5 (TD1)](https://www.icao.int/sites/default/files/publications/DocSeries/9303_p5_cons_en.pdf), [Part 6 (TD2)](https://www.icao.int/sites/default/files/publications/DocSeries/9303_p6_cons_en.pdf).
- CNP: exactly 13 digits, encoded sex/century, actual date including leap years and future-date rejection, allocation code, serial `001–999`, and the `279146358279` weighted modulo-11 checksum (`10 → 1`). See the [Romanian CNP norms](https://legislatie.just.ro/public/DetaliiDocument/280598) and [FCA-hosted ESMA checksum reference](https://api-handbook.fca.org.uk/files/L3G/MIFID/esma70-1861941480-56_qas_mifir_data_reporting.pdf).
- Modern nationwide allocation **70**, confirmed by [MAI](https://www.mai.gov.ro/5-085-de-coduri-numerice-personale-cnp-uri-generate-prin-sistemul-informatic-integrat-pentru-emiterea-actelor-de-stare-civila-siieasc/). Historical 47/48 acceptance is a documented compatibility choice. Codes 7/8/9 do not determine a century; the app flags ambiguity and blocks confirmed prefill instead of guessing a birth year.
- CNP/MRZ DOB and sex agreement, including manually edited values.

The MRZ OCR pass remains restricted to MRZ text; the separate printed-text pass produces unverified candidates. If a country code is uncertain, its actual symbol-bounded pixels are separately re-read with a letter-only alphabet. This is disclosed in review; it is not a text substitution. Numeric fields and check digits are never corrected to manufacture validity. The displayed OCR score is an uncalibrated engine estimate, not an identity-verification probability. Names have no MRZ check digit, so review is always required.

## Privacy guarantees and boundaries

| Stage | Network | Data lifetime |
| --- | --- | --- |
| Open / prepare | Same-origin static app, worker, WASM, model, and fonts | Public software assets only |
| Choose / capture / PDF page selection / crop | None | File decoded into temporary bounded canvases; file input cleared immediately; object URLs revoked |
| OCR / parse / validate | None | Each OCR worker restricts asset loading to this origin and locks fetch/XHR/script loading before receiving its first image; streaming transports and nested workers are disabled |
| Review / confirm | None | Structured ID candidates, reviewed values and validation details in this tab’s memory only |
| Clear / leave | New reader assets may load after clearing for another scan | Canvases reset, worker terminated, fields forgotten; page-hide clears the current result |

No PDF, image, crop, filename, EXIF metadata, OCR text, or result is sent to a server. The app does not write personal data to localStorage, sessionStorage, IndexedDB, cookies, Cache Storage, the clipboard, downloads, URLs, logs, or analytics. Tesseract’s model cache is disabled. Raw OCR text and bounding-box output are dropped after parsing; only fields and validation state needed for review remain, including the domicile section text needed to check address splitting. No service worker is installed.

After the reader is ready and an image has been decoded into the crop preview, OCR and review can finish without an internet connection. Browser file-decoding behavior is a separate limit: WebKit's automated offline mode can refuse local-file reads, so an offline upload from every browser is not promised. Online decoding still makes no HTTP request and keeps the file local. A fresh worker is created for each new scan; a new scan after reset/reload needs asset access again. This is not an installable offline PWA.

Production HTML puts a restrictive CSP before scripts: same-origin scripts/assets, no external connections, no form submissions, no inline scripts or styles, no objects or document-base injection. The supplied local static server adds HTTP CSP, frame restrictions, no-referrer, camera-only permissions, `nosniff`, and no-store headers; it rejects non-GET/HEAD requests. GitHub Pages does not provide arbitrary custom response headers, so the Pages build retains the HTML CSP and worker restrictions, but cannot claim the local server’s header-only frame protection. Vercel uses the equivalent response headers in `vercel.json`; keep Web Analytics, Speed Insights, Toolbar injection, and third-party integrations disabled. Hosting providers may log ordinary asset requests and IP addresses. GitHub may log ordinary site visits/IP addresses; [GitHub documents this](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). These visits contain no ID/OCR payload.

Browser extensions, OS/browser memory handling, and a compromised host are outside this application’s guarantee. Clearing canvases/references and terminating the worker is resource cleanup, not guaranteed forensic erasure of all memory copies.

## Test

```sh
npm test
npm run typecheck
npx playwright install chromium firefox webkit
npm run verify
```

Unit tests cover both Romanian MRZ encodings, CIS without CNP, all ICAO check-digit failures, invalid names/layouts/countries, multiple candidates including damaged second cards, CNP date/leap/checksum/remainder-10 cases, modern code 70, ambiguity, and official-specimen regressions. Worker-boundary tests exercise the actual bootstrap against external and processing-time transports. Browser tests use synthetic identities only and run actual WASM OCR in Chromium, Firefox, and desktop/mobile WebKit. They cover offline scan/review, absence of processing-time requests, blank storage, canvas/worker cleanup, review and edit gates (including a valid CNP for a different DOB/sex), invalid reads, missing-model retry, page-cache startup recovery, camera capture/stream cleanup/cancellation/refusal, and a phone viewport. PDF tests also cover vector and scanned pages, multipage selection, locked/corrupt/oversized documents, language switching, zero processing requests and PDF-worker/canvas cleanup. Hardware camera quality and real ID-photo accuracy are not yet accepted/benchmarked.

## GitHub Pages — after acceptance

The verification workflow runs on pushes/PRs and verifies both root hosting and the Pages subpath. `deploy-pages.yml` runs **only manually**, from `main`, with the explicit `accepted=true` input. It re-tests and builds the exact artifact under the repository subpath, then configures and publishes Pages through official GitHub actions. No server or credentials are embedded in the app.

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

## Vercel — after acceptance

[Vercel supports Vite static builds](https://vercel.com/docs/frameworks/frontend/vite) and [configuration/response headers in `vercel.json`](https://vercel.com/docs/project-configuration/vercel-json). No Vercel project is created or deployed by these source changes.

After publication is accepted, import this repository into Vercel with repository root as Root Directory, Node.js 24, install command `npm ci`, build command `npm run build`, output `dist`, and **no `PAGES_BASE_PATH` environment variable**. The checked-in configuration supplies the build/output settings. Do not enable analytics, Speed Insights, Toolbar injection, or external runtime scripts. Keep automatic deployments disabled unless separately authorized; importing a Git project can immediately publish a deployment. Verify the resulting HTTPS site, headers, assets, and Safari checklist before declaring it accepted. The static app has one page and needs no catch-all rewrite.

## MVP limits / resuming work

Use sharp, reasonably straight photos with all MRZ rows visible. This version provides rotation/cropping/contrast normalization; it does not automatically find card corners, correct perspective, reconstruct unreadable fields, read the chip/NFC, prove document authenticity, or check a population registry. HEIC, password-protected PDFs, SVG, passport MRZs, indefinite filler-only expiry, unverified document-number layouts, and CNP century ambiguity are unsupported. File limit: 15 MB and 40 megapixels; processing canvases are bounded.

See `RUNBOOK.md` for development/release steps, `decisions.jsonl` for choices and authority, and `docs/DESIGN.md` for the UI reference. Preserve the acceptance gate and never commit real identity images, OCR logs, or personal-data screenshots. Third-party notices are in `THIRD_PARTY_NOTICES.md` and the vendored asset/license files.
