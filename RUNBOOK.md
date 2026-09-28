# Romanian ID prefill runbook

This project is a browser-only Romanian identity-card prefill MVP. All runtime image decoding, OCR, MRZ parsing, and review stay in browser memory.

## Implementation workflow

1. Verify maintained browser-compatible OCR libraries and the actual Romanian MRZ layouts against primary sources. Record choices in `decisions.jsonl` and source links in the README.
2. Scaffold a lightweight TypeScript app. Vendor worker, WASM, language-model, and font assets; never use a CDN in the processing path.
3. Implement deterministic MRZ/CNP validation, uncertainty handling, image lifecycle cleanup, and an explicit review step.
4. Run unit tests, TypeScript checks, production build, and browser tests with synthetic fixtures. Verify network requests and browser storage.
5. Inspect desktop/mobile UI, document limitations and privacy boundaries, and provide a reproducible run procedure.

## Development and verification

From the repository root:

```sh
npm ci
npx playwright install chromium firefox webkit
npm run verify
npm start
```

Preview at `http://127.0.0.1:4173/`. Do browser visual checks there, including a phone viewport, synthetic OCR, crop/rotate, invalid checks, review/edit/clear, and camera fallback. For development use `npm run dev`; its HMR connection is excluded from production privacy claims.

Use synthetic fixtures only; do not commit personal IDs, OCR output, or screenshots containing real personal information. Playwright disables screenshots/traces/video by default. Routine diagnostics go to ignored `test-results/`; set `QA_OUTPUT_DIR` for another temporary location. In the Codex projectless workspace, use `QA_OUTPUT_DIR=../../work/browser-results` to keep diagnostics outside the deliverable directory.

`npm run assets` copies locked local worker/WASM assets and license files and verifies the vendored model checksum. It does not fetch a model. A model change must update provenance/hash/license and pass real browser OCR checks before handoff.

## GitHub source and Pages release

The public repository is `alexcatdad/romanian-id-prefill`. Verify local branch, remote, clean state, and exact commit before publishing source. `main` pushes run verification only.

Website deployment requires the user's explicit acceptance of the MVP. Until then, never dispatch `deploy-pages.yml` or publish an artifact. After acceptance:

1. Verify the accepted source commit and terminal CI result. Resolve any failures first.
2. Dispatch `deploy-pages.yml` on `main` with `accepted=true` using the README command.
3. Inspect the exact run and its commit, wait for the Pages deployment to succeed, then verify the actual HTTPS Pages URL, local assets, MRZ scan/review, CSP, and absence of processing requests.
4. Log the accepted commit, deployment run/URL, and observed verification in `decisions.jsonl`. A commit/build/deployment success does not substitute for browser acceptance.

The Pages action builds/tests with `PAGES_BASE_PATH=/romanian-id-prefill/`. To repeat locally, stop a root-path preview first, then build, start, and test with that environment variable. Return to a root build afterward for the local user preview.

## Vercel release

Only after explicit publication acceptance, use the README Vercel settings. Verify the accepted commit and successful CI first. Importing a repository can immediately deploy it, so do not connect a Vercel project ahead of acceptance. Keep the root base path, all OCR/font assets local, and the supplied response headers. Disable analytics, Speed Insights and Toolbar injection. Verify the exact deployed commit, root asset paths, worker/WASM/model MIME/loading, and no requests during processing. Record the deployment URL and checks in `decisions.jsonl`.

## Browser and language release acceptance

Target Safari 18+ on macOS and iOS/iPadOS 18+, with current stable Chrome/Edge/Firefox compatibility. Run the automated production suite in Chromium, Firefox, desktop WebKit and mobile WebKit for both root and Pages-subpath builds. These engines and viewport emulation do not certify an installed Safari release or physical camera.

Before claiming Safari acceptance, record the exact Safari/OS/device versions and accepted commit, and on a physical Mac plus iPhone or iPad over HTTPS:

1. Start with a clean tab in English, then Romanian. Check complete instructions, labels, privacy text, validation/errors and keyboard/focus behavior; check Romanian diacritics and narrow portrait layout.
2. Run the synthetic MRZ example. Check local assets finish before capture/upload is enabled. Crop/rotate, OCR, review, edit name/CNP, require acknowledgement, confirm and clear in each language.
3. Select a synthetic JPEG/PNG from Photos/Files. Deny camera access and verify upload fallback; then allow camera, capture a synthetic printed MRZ, cancel and background the page. Verify the camera indicator stops on each exit.
4. After image decoding, disconnect the network and complete OCR/review. With Web Inspector, verify no HTTP requests during image handling/OCR/review, no personal-data storage, and no lingering result after leaving/returning.
5. Exercise an invalid checksum and missing CNP. Neither may silently produce a confirmed prefill. Confirm names can be edited with Romanian diacritics.

Use synthetic identities for recorded evidence. Real-photo accuracy remains a separate benchmark; do not save personal IDs, OCR output or screenshots to the repository. Record untested versions/devices as unverified rather than extrapolating from Playwright.

## Published release — 2026-09-28

The user explicitly approved GitHub Pages publication. Accepted/deployed app commit: `d5501fb778b06bb8a4768c3838cf0aa75603c6cf`. [Deployment run](https://github.com/alexcatdad/romanian-id-prefill/actions/runs/36448225554) completed successfully after the production artifact passed its tests. GitHub Pages uses workflow builds with HTTPS enforced at [the live site](https://alexcatdad.github.io/romanian-id-prefill/).

Post-deployment smoke checks passed in Chromium and WebKit against the public HTTPS site: same-origin assets, HTML CSP, actual synthetic MRZ OCR offline, mandatory review, English-to-Romanian switching, zero processing-time HTTP requests, empty browser storage, and clearing/reinitializing the reader. Physical Safari camera acceptance remains pending. The following documentation/audit commit does not change or redeploy the app.

## PDF changes and verification

Use the pinned `pdfjs-dist` version from the lockfile. `npm run assets` copies its legacy worker/decoder modules and packs CMaps, fonts and WASM into `public/pdf/resources.json`; generated assets are ignored, while the network-blocking bootstrap is tracked. Retain the package and asset licenses. The preview server must serve `.mjs` as JavaScript; both deployment targets must load these same-origin modules before file selection.

After changes run `npm run verify` for root and Pages-subpath builds. PDF browser tests generate synthetic documents only. Check multipage navigation, scanned/vector rendering, selection into the crop flow, English/Romanian controls, corrupt/password/page-count/file-size errors, zero processing requests and cleanup on select/discard/pagehide. Do not weaken validation to accommodate OCR failure on a PDF font. Recheck resource-factory and worker compatibility on PDF.js upgrades; never restore fetching during document processing.

## Resume

Read `decisions.jsonl`, then `README.md` and this runbook. Keep source images and OCR text out of logs and persistent storage. A production server must retain the supplied content-security and privacy headers.

## Contract template inspection

Read `docs/CONTRACT_PARTY_FIELDS.md` before expanding extraction. Inspect supplied templates locally using pypdf text/AcroForm/widget inspection and a Poppler-rendered page; compare field names with visible labels and footnotes. Keep source documents and rendered scratch pages outside the repository. Record mapping and scope decisions without assuming every blank is mandatory. For eventual export, use synthetic data to verify field placement, Romanian diacritics, overflow and no processing requests.

## Expanded ID understanding

Preload the printed-text OCR model alongside the MRZ reader before file selection. Verify labeled name/CNP/document/address extraction with synthetic printed CI and CEI/CIS cases. Run actual browser OCR in MRZ-plus-printed and printed-only modes, checking conflicts, missing addresses, edits/review, cancellation, pagehide, zero processing network requests and buffer/worker cleanup. Test English/Romanian and both root and Pages hosting. Contract generation and seller/buyer orchestration are out of scope.

Expanded ID verification uses `tests/browser/printed-id.spec.ts` for actual OCR and lifecycle coverage. Browser plugin is not available in this session; Playwright supplies Chromium, Firefox and desktop/mobile WebKit checks. Clear synthetic typography does not establish accuracy on real security backgrounds, glare or phone photographs. Keep reviewed fields unavailable when labels/components cannot be read. Address-text edits clear its components and component edits clear the full text, preventing contradictory reviewed representations.

## Plain-language reading guidance

Keep the primary flow understandable without knowing MRZ or OCR: show the code-row example, ask whether those rows appear in the photo, and guide selection in English/Romanian. Keep technical check names inside the validation disclosure. Verify both choices, camera/PDF guidance and narrow-screen layout when changing these labels; parsing and check-digit rules must remain unchanged.
