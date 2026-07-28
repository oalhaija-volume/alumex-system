# Intake Redesign Design QA

- Source visual truth path: Product Design option 2 generated and displayed in
  the current conversation.
- Implementation screenshot paths:
  - `test-results/intake-redesign-desktop.png`
  - `test-results/intake-redesign-mobile.png`
  - `test-results/intake-redesign-desktop-confirm.png`
  - `test-results/intake-redesign-mobile-confirm.png`
- Viewports: desktop 1440 × 1024 CSS pixels; mobile 390 × 844 CSS pixels.
- Source pixels: 1488 × 1058 as displayed in the conversation.
- Implementation pixels: 1440 × 1024 and 390 × 844 at device scale factor 1.
- Density normalization: both implementation captures used CSS-pixel density 1.
  The source was assessed for layout and hierarchy rather than pixel overlay
  because its displayed frame is slightly larger than the target viewport.
- States: Customer (step 1 of 3) and Confirm (step 3 of 3).

## Full-view comparison evidence

The desktop implementation preserves the selected concept's guided question,
two-way customer selector, large customer search, narrow progress rail, restrained
Alumex styling, whitespace, and specific primary action. The mobile composition
reflows to one column without horizontal overflow.

## Focused region comparison evidence

The customer selector, 44-pixel controls, progress rail, search field, fixed
mobile action footer, review rows, and bottom navigation were inspected in the
browser captures. No focused crop was required because these regions are legible
at the captured pixel sizes.

## Required fidelity surfaces

- Fonts and typography: existing Alumex/Geist typography and hierarchy match the
  established application and selected concept.
- Spacing and layout rhythm: desktop two-pane proportions and mobile single-column
  rhythm are consistent. The action footer remains visible at both viewports.
- Colors and visual tokens: existing Alumex blue, pale active state, neutral
  surfaces, dividers, and semantic green autosave state are preserved.
- Image quality and assets: the existing Alumex logo assets are reused at native
  quality; no generated or placeholder visual assets were introduced.
- Copy and content: the three stages, contextual questions, autosave language, and
  specific actions match the selected direction.

## Interaction and console evidence

- Tested path: Customer → New client → required customer fields → Opportunity →
  required project fields → Confirm.
- Both desktop and mobile reached steps 2 and 3 successfully.
- Body width equaled viewport width at both sizes; no horizontal overflow.
- Initial static visual captures produced no console errors.
- Hydrated interaction captures logged two expected 401 resource responses because
  the Playwright harness intentionally bypassed the authentication redirect and
  did not contain account credentials. No React, Next.js, hydration, or page
  exceptions occurred.
- The Outdoor Sales authenticated map state and live database conflict response
  remain covered by code, unit tests, server validation, and the migration rather
  than an authenticated browser account.

## Findings

No actionable P0, P1, or P2 visual findings remain.

## Comparison history

- Initial pass: mobile primary action began below the progress rail.
- Fix: changed the mobile action footer to remain fixed above bottom navigation.
- Post-fix evidence: `intake-redesign-mobile.png` shows the Back and Continue
  actions visible at the initial 390 × 844 viewport; bounding-box verification
  placed the primary action fully inside the viewport.

## Follow-up polish

- P3: an authenticated Outdoor Sales account can provide an additional browser
  capture of the mandatory 200 m map state after deployment.

## Final result

final result: passed
