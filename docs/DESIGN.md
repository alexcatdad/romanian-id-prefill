# Local ID design specification

Primary concept: `design-concept.png` (1536 × 1024). This is an internally selected implementation reference for the requested tool, not user acceptance of deployment.

The screen's job is to add an ID image, read its MRZ locally, then review editable name/CNP fields. The signature is a scanner-corners icon; there is no personal document illustration or decorative hero imagery.

## Tokens and composition

- Page: cool pale lavender `#f4f5fb`; panels true white `#ffffff`; text deep ink `#171936`; muted text `#656a86`; borders `#dedfeb`; accent purple `#6558c8`; success `#087f68`.
- Manrope for content and controls, IBM Plex Mono for MRZ/data. Both are bundled local fonts. Heading 56–60px on desktop, panel headings 30–32px, body 16–18px, control text 16px, helper text 14–16px.
- Header and footer align to a centered 1392px maximum container. Hero is centered. A three-step strip describes the actual workflow. Main columns have a 3:2 ratio and 20px gap; panels have one fine border, 12px radius, and 28px inset. The drop zone has a dashed border and no nested cards.
- Outline scanner, shield, upload, camera, lock, arrow, check, and alert icons use consistent 1.7–2px strokes.
- Mobile stacks upload/crop before review. Controls wrap as needed; no horizontal scroll. Focus rings and reduced motion are mandatory.

## Copy lock and functional states

The concept's initial visible copy is preserved: Local ID; Only on this device; Your details. Your device.; Read your Romanian ID and prefill a form, without uploading it.; Add your ID; Read locally; Review details; Add your identity card; Front of older cards, back of newer cards. Keep the MRZ visible.; Drop an image here; JPG, PNG or WebP · up to 15 MB; Choose image; Use camera; or choose a clear photo of just the MRZ; Try a synthetic example; Review your details; Your fields will appear here after reading.; Full name; Appears after reading; CNP; 13-digit personal code; Always compare these details with your card.; I have checked the name and CNP; Use these details; The image is discarded after reading. Nothing is saved.; How privacy works.

Required extensions in the same design system: OCR readiness/error/progress status; a temporary canvas preview with rotation/crop controls; camera permission and capture dialog; validation summary with uncalibrated OCR confidence; explicit name-truncation/diacritic warnings; human-edit labels; acknowledgement checkbox; confirmed local-only form; clear/retry actions; privacy dialog. These are necessary for the user's requested workflow and intentionally extend the empty-screen concept.

## Visual comparison

Inspected the concept and production screenshot at 1536 × 1024, the live synthetic OCR/review/confirm flow, and the 390 × 844 phone layout on 2026-09-28.

- Composition: retained the centered hero, three steps, 3:2 panels, and aligned header/footer; panel top differs from the reference by about 7px.
- Typography: retained the reference's large ink heading, 32px panel headings, and lighter explanatory text, using local Manrope and IBM Plex Mono.
- Palette: retained the pale lavender page, white panels, purple controls, and green privacy shield; the CSS uses the specified muted purple rather than the generated image's more saturated variation.
- Controls: retained the dashed upload area, scanner corners, upload/camera pair, and outlined secondary action; added the reader-ready marker required by the privacy lifecycle.
- Copy: all copy-lock strings above match. Readiness, crop, validation, edit, and confirmation copy are the documented functional additions; the initial screen has no unapproved text removals.
- Mobile: stacks upload before review, keeps both image/camera actions visible, and has no horizontal overflow at 390px. Native focus outlines, keyboard crop controls, and the privacy dialog were checked.

The long original-reading check list is available in a native disclosure. MRZ/CNP summaries and confidence remain visible beside the editable review fields. This is an intentional functional-state extension to the initial concept.

## ID understanding extension

The review now includes document series/number, explicit card-type uncertainty and printed domicile candidates. The address text is multiline; detailed components sit in an expandable section. The confirmation checkbox covers every populated field. A second read mode supports a printed side without MRZ, with clear absence-of-MRZ validation messaging. Existing visual language, English/Romanian controls and phone layout remain; no seller/buyer or contract workspace is introduced.

## Plain-language guidance

The primary flow now says “code rows”, shows a small illustrative letter/number/`<` block, and asks whether those rows are visible. The main action is “Read my ID”. Camera, PDF, upload and review text use the same English/Romanian guidance. Technical MRZ terminology and original parser findings remain available in the detailed validation disclosure. The phone layout was visually checked at 390 × 844 and the desktop at 1440 × 1000, including switching to printed-only reading.
