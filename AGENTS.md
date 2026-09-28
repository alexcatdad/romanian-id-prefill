# Project instructions

Keep this browser-only: no upload endpoint, remote OCR/LLM, analytics, persistent personal data, or runtime CDN assets.

Read `README.md`, `RUNBOOK.md`, and `decisions.jsonl` before changes. Log important decisions in `decisions.jsonl` and update the runbook when multi-command operations change. Synthetic fixtures only; never commit a real ID image, filename, raw OCR output, or personal-data screenshot.

The user requested public GitHub setup and GitHub Pages deployment **after acceptance**. Source/CI work is authorized; website publication remains gated until the user explicitly accepts this MVP. Keep deployment manual and do not dispatch its workflow just because CI passes.

Use exact locked packages and local OCR assets. Parser autocorrection stays disabled. Any recognition strategy must preserve check-digit/identity constraints and disclose uncertainty. Name review is mandatory. Clean up worker, canvas, URL, and camera resources on every path.

Verification: `npm run verify` (unit tests, production build/type checks, and Chromium/Firefox/desktop and mobile WebKit browser tests). Use the production preview for network/privacy evidence. Validate a Pages-subpath build before a release. User-approved parallel agents may work on disjoint files and should finish/close after their assignments.

Deployment compatibility: static GitHub Pages subpath and Vercel root. Safari 18+ / iOS and iPadOS 18+ are primary targets; WebKit automation is a proxy and physical Safari acceptance must be recorded separately. Keep English/Romanian UI and accessibility text complete. Publication to either host still requires the user’s acceptance.
