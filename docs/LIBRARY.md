# Install in another app

The repository builds two independently versioned ESM TypeScript packages: `@alexcatdad/browser-ocr` 0.1.0 and `@alexcatdad/roid` 0.3.0. They are supplied as local npm archives; neither is published to the npm registry. ROID depends on OCR; OCR has no dependency on ROID or React. The private root website consumes these packages as a demo. Use Node 22.13+ for tooling. The runtime is browser-only, with Safari/iOS 18+ as its baseline. Importing the core in Node is supported; OCR/canvas/PDF operations require a browser.

```sh
npm install /absolute/path/to/alexcatdad-browser-ocr-0.1.0.tgz /absolute/path/to/alexcatdad-roid-0.3.0.tgz
npx roid-assets --to public/reader-assets
```

Install both archives in the same command so npm can satisfy the unpublished OCR dependency locally. `roid-assets` composes the installed OCR package’s models, workers and PDF resources with ROID’s fonts/licenses, without duplicating engine assets in the ROID archive or downloading anything. Identical files are skipped; conflicting files are refused unless `--force` is supplied. Unrelated destination files are retained. Re-run it after upgrading. Include the copied assets in your deployment. The models/resources are substantial; do not embed them in your JS bundle.

## Use OCR independently

Install only the OCR archive when you do not need Romanian ID interpretation:

```sh
npm install /absolute/path/to/alexcatdad-browser-ocr-0.1.0.tgz
npx browser-ocr-assets --to public/reader-assets
```

```ts
import { LocalOcrReader, PSM, clearCanvas } from '@alexcatdad/browser-ocr';

const reader = new LocalOcrReader(progress => {
  // Update progress; never log document data.
}, {
  assetBaseUrl: '/reader-assets/',
  languages: 'eng+ron',
  pageSegmentation: PSM.AUTO,
});
await reader.prepare(); // Fetch public software assets before accepting input.
try {
  const result = await reader.read(canvas);
  // result.text, result.confidence, result.lines are raw OCR, not validated fields.
  // Use them locally and release them as soon as they are no longer needed.
} finally {
  clearCanvas(canvas);
  await reader.dispose();
}
```

`languages` selects locally hosted model names joined with `+` (default `eng`). Options also include `whitelist`, `parameters`, and `initParameters`. Per-read options include `rectangle`, `whitelist`, `pageSegmentation` and `includeLines`. Inspect the exported TypeScript types for their exact shapes. The packaged models include English, Romanian and the specialized MRZ model; additional languages require compatible self-hosted model assets.

A successful generic OCR read retains its worker for further **sequential** reads. Concurrent reads are rejected. Unlike the ROID coordinator, it borrows canvases and returns raw text, confidence and line/symbol data: the caller owns those results and all canvas cleanup. Call `dispose()` when the session ends, on failure, or on page hide; `cancel()` disposes the session. A worker may retain recognition buffers until disposal. Confidence is an uncalibrated engine score, not a validation or authenticity claim.

`LocalPdfReader`, `decodeImage`, `prepareTextCanvas` and `clearCanvas` also belong to OCR. It contains no CNP, MRZ identity interpretation, address extraction or review UI. This separation lets OCR lifecycle, recognition and PDF improvements ship independently from Romanian document rules.

## React integration

Install React and React DOM 19 if your app does not already use them. They are optional peers: core-only users need neither. Import the CSS once (Vite apps should include `vite/client` in their TypeScript types).

```tsx
import { IdReader, type ReviewedDetails } from '@alexcatdad/roid/react';
import '@alexcatdad/roid/styles.css';

export function PartyReader() {
  const accept = (details: ReviewedDetails) => {
    // Store in your form's in-memory state after the user's explicit review.
    // Do not log identity data.
  };
  return <IdReader
    assetBaseUrl={`${import.meta.env.BASE_URL}reader-assets/`}
    language="ro"
    onConfirm={accept}
    onClear={() => { /* Clear the host's party draft if appropriate. */ }}
  />;
}
```

`assetBaseUrl` must resolve to your application's own HTTP(S) origin. On GitHub Pages it may be `/your-repository/reader-assets/`; on a root deployment `/reader-assets/`. It is the parent directory containing `ocr/` and `pdf/`, not the model directory. Changing it remounts the reader and clears its state.

The widget includes upload/capture, PDF page selection, crop selection, reading progress, editable candidates, validation and explicit review. Render it outside any existing `<form>` because it contains its own review form. Optional `showHeader` enables the header; `onLanguageChange` reports the English/Romanian selection. Each instance has separate state. `demoSource` is intended only for a host-provided synthetic demonstration; production consumers can omit it.

`onConfirm` receives `fullName`, `cnp`, optional `documentSeries`, `documentNumber`, `cardType`, `address`, and `provenance`. Missing optional fields remain missing. A reading score is not a probability of correctness; checksum validation does not authenticate an ID. The user must inspect every field. This package does not determine whether a contract has all required information.

`onClear` lets the host discard its draft when the reader is reset. The host owns anything it retains from callbacks and must implement its own cleanup, consent, persistence and submission rules. Unmounting the widget cannot erase copies already retained by the host.

## Framework-independent API

```ts
import { LocalIdReader } from '@alexcatdad/roid';

const reader = new LocalIdReader(progress => {
  // Display progress without logging document data.
}, { assetBaseUrl: '/reader-assets/' });
await reader.prepare(); // Download static software assets BEFORE accepting an ID.

// Obtain user-selected/preprocessed canvases from your own browser UI.
const result = await reader.read(
  { mode: 'mrz', mrzCanvas, printedCanvas },
  { ownership: 'transfer' },
);
// result.reviewRequired is always true. Present candidates and validation;
// do not populate a finalized contract automatically.
await reader.dispose();
```

`mrzCanvas` must contain the selected/preprocessed code rows. Optional `printedCanvas` should be the same document side. For printed-only reading use `{ mode: 'printed', printedCanvas }`; it provides candidates without claiming MRZ validation. The coordinator does not detect/crop a card automatically or merge identities. `prepare()` is required again before the next read; workers are disposed after each read.

Choose ownership explicitly. `transfer` clears accepted input canvases after success, failure or cancellation; malformed/competing calls reject before taking ownership. `borrow` leaves canvas cleanup to the caller. In both modes the caller must release original Files, object URLs and any other image copies. `cancel()` stops active work; await the pending read settling before reusing the reader. The readers discard raw OCR text and return parsed candidates. Do not log those candidates or retain them unnecessarily.

For custom pipelines, root exports include `LocalMrzReader`, `LocalPrintedReader`, `LocalPdfReader`, `assessMrz`, `validateCnp`, `parsePrintedId`, `decodeImage`, `prepareMrzCanvas`, and `clearCanvas`, with their TypeScript types. The lower-level OCR constructors take `(onProgress?, { assetBaseUrl }?)`; the PDF constructor takes `({ assetBaseUrl }?)`. Lower-level readers do not implement human review or clear caller-owned canvases. Dispose them on cancellation and clear those canvases yourself.

PDF input is explicit: construct `LocalPdfReader({ assetBaseUrl })`, await `prepare()` before file selection, call `open(file)` for the page count, let the user choose a page, then `render(pageNumber)` (one-based) to obtain a canvas. Each rendered canvas belongs to the caller; disposing the PDF reader does not clear returned canvases. Dispose the PDF reader after transferring the selected page to the OCR/crop flow, and clear every rendered canvas when done. Do not read every page and silently choose a person.

## Privacy boundary

The supplied readers process source images/PDFs and OCR results locally and do not persist them. Static worker/model/font downloads happen during preparation. Core assets must be same-origin. The demo's production build applies restrictive CSP and uses no analytics or upload endpoint. Do not equate these guarantees with the behavior of arbitrary consuming applications.

The host must self-host assets, avoid analytics/session recording on this flow, prevent personal data in logs/storage, release retained buffers, and apply appropriate CSP/headers. Host JavaScript shares access to its own page and can observe callback data. Once `onConfirm` delivers reviewed fields, any storage or transmission is the host's responsibility. Include the third-party notices/licenses with copied assets. Refer to the repository's CSP and static server configuration when integrating; test your final production deployment offline after preparation.

## Package verification

`npm run test:package` builds and packs both packages, installs them in an independent temporary consumer, verifies React-free Node import, strict TypeScript, asset copy conflict handling, and real browser OCR/review without processing-time requests. The demo also imports public package exports. Automated WebKit is a regression proxy; physical Safari/camera and real-world photo accuracy still need acceptance testing.

Both packages declare `UNLICENSED`; no new public reuse license or registry publication is implied by this extraction.

## Development and versioning

The packages share one npm workspace repository, with separate manifests, exports and version numbers. `npm run build:ocr` and `npm run test:ocr` target the generic layer. `npm run build:roid` and `npm run test:roid` target the ID layer; build OCR first after changes to its API. `npm run build:lib` builds both in dependency order. `npm run pack:libs` produces both archives for distribution, while the private root app remains a demo.

ROID declares the OCR version it supports. An OCR release does not automatically change ROID's dependency: update it deliberately, rebuild and run the consumer tests. Separate registry publication or repository extraction is not part of this split.
