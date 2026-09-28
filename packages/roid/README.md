# @alexcatdad/roid

Romanian identity-card interpretation and explicit user review, powered by `@alexcatdad/browser-ocr`. Version 0.3.1 is available as a local archive; it is not published on npm. OCR is maintained in the separate [browser-ocr repository](https://github.com/alexcatdad/browser-ocr), pinned to an immutable Git commit. Install with Node 22.13+ and Git:

```sh
npm install /absolute/path/to/alexcatdad-roid-0.3.1.tgz
npx roid-assets --to public/reader-assets
```

Installation fetches public software dependencies and runs the pinned OCR package’s preparation build; keep npm installation scripts enabled. No identity data is involved. The asset command composes the installed OCR package's engine/model/PDF assets with ROID fonts/licenses. The ROID archive does not duplicate the OCR engine assets. All assets must be hosted on your app's own HTTP(S) origin.

Optional React 19 integration:

```tsx
import { IdReader } from '@alexcatdad/roid/react';
import '@alexcatdad/roid/styles.css';

<IdReader
  assetBaseUrl="/reader-assets/"
  language="ro"
  onConfirm={details => { /* Update your in-memory form after user review. */ }}
  onClear={() => { /* Clear any host-owned draft as appropriate. */ }}
/>
```

React/React DOM are optional peers; framework-independent users need neither. The widget provides image/camera/PDF input, cropping, candidate editing, validation and review in English or Romanian. Render outside another form. Use a repository-prefixed asset path for GitHub Pages. The host owns copies retained from callbacks; unmounting cannot erase those copies.

Core exports include `LocalIdReader`, `LocalMrzReader`, `LocalPrintedReader`, `assessMrz`, `validateCnp` and `parsePrintedId`. The coordinator requires preparation before each read, disposes workers after processing, and returns `reviewRequired: true`. Explicit `ownership: 'transfer'` clears accepted canvases; `'borrow'` makes cleanup the caller's responsibility. Source files/object URLs and host copies remain the caller's responsibility in either mode.

MRZ checks and CNP date/checksum validation do not authenticate a card or validate names/addresses. Missing/ambiguous fields stay unconfirmed; no silent front/back or identity merging occurs. CEI domicile cannot be recovered from a photo when it is not printed. Real-photo accuracy and physical Safari/camera acceptance remain unbenchmarked. This package does not assemble contracts or determine their completeness.

Reads stay local and personal data is not persisted by the package. Self-hosted asset preparation precedes processing. Consuming apps must control their own analytics, storage, callbacks, cleanup and security policy.

Develop from this repository root with `npm ci`, `npm run build:roid` and `npm run test:roid`. OCR development, builds and tests happen in its separate repository. ROID versions independently and pins its compatible OCR dependency. The private root site is a demo, not a third distributable package.

[Full integration guide](https://github.com/alexcatdad/romanian-id-prefill/blob/main/docs/LIBRARY.md). License: `UNLICENSED`; include packaged third-party notices and licenses. No registry publication or public reuse license is implied.
