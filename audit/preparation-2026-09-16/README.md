# Preparation improvements — implementation verification

Verified on 2026-09-16 against the current checkout with a separate local API
and Vite instance on ports 3005 and 5175, using the ETTm2 sample dataset.

## Changes

1. **Preview before creation.** Preview is the primary action. Creating a prepared
   dataset requires a successful preview of the exact current plan and dataset.
   Edits, reorders, undo/redo, imports, and dataset switches invalidate approval.
   Late responses are ignored, old preview requests are aborted, failed previews
   never unlock creation, and repeated clicks cannot create duplicate requests.
2. **Quality first.** Page order is source identity, source quality, pipeline
   preview, ordered stages, exports, and insight recording.
3. **Progressive quality details.** Category counts lead to expandable missing
   values, time-axis, constant-column, zero-run, distribution, and column-table
   details. Clean columns have no policy action. Sample percentages use the
   sample size; numeric statistics and intervals use readable precision and units.
4. **Persistent working-plan status.** The sticky toolbar states that enabled
   stages affect plots while the source stays unchanged, shows preview freshness,
   and provides Undo and Redo.
5. **Responsive navigation.** Desktop links track the current section. A labeled
   mobile selector exposes every section without horizontal navigation overflow.
6. **Accessible editing.** Controls have visible labels and separate descriptions.
   Composer choice, drafts, text selection, disclosures, and focus survive page
   refreshes. Newly added stages receive focus; stage controls retain focus after
   updates. Inputs now use the application control styling.
7. **Stage management.** Numbered stages show exact row impacts from the current
   preview. Move up/down and a direct Position selector preserve ordering checks;
   invalid moves explain the problem beside the stage list.

Verification also found and fixed direct-page startup races and mounted the
previously empty Record an insight section. Initial navigation now completes
after descriptor registration, and invalidated lazy initialization retries.

## Screenshots

- [Desktop quality overview](desktop.png) — 1440 × 1000.
- [Preview and numbered stages](stages.png) — 1440 × 1000.
- [Mobile navigation and labeled composer](mobile.png) — 390 × 844.
- [Mobile exact quality details](mobile-quality.png) — 390 × 844.

All four captures were visually inspected. Mobile controls fit the page without
horizontal overflow; the toolbar remains visible when navigating between sections.

## Verification

- **78 unit/integration tests passed** across Preparation, preview lifecycle,
  cleaning store, derived columns, exports, feature registry, page descriptors,
  and app bootstrap.
- **3 Chrome browser flows passed** in `tests/e2e_audit_tests.ts`, under
  `Preparation review improvements`. These cover desktop keyboard editing,
  sampled profile updates during input, exact previews, invalidation, direct
  reordering, undo, responsive navigation, labels, exact quality reports, and
  actual creation of a new prepared version followed by approval reset.
- The desktop browser flow reported no JavaScript exceptions or failed API responses.
- TypeScript (`tsc --noEmit -p tsconfig.json`) passed.
- Production build, asset graph, architecture, and bundle-budget checks passed.
- `git diff --check` passed.

The production build still reports existing mixed static/dynamic import and
large-chunk warnings; the configured budgets pass. This is focused Chromium
verification, not a full screen-reader or cross-browser accessibility audit.

## Reproducing

Use a native Linux Node runtime in WSL. Start `make dev` and point Playwright's
`EDATIME_E2E_BASE_URL` at that server, or use the packaged application managed by
the repository's Playwright configuration. Run the tests selected by
`--grep 'Preparation review improvements'`. The suite uploads ETTm2 and creates
a prepared version, so use a disposable local server for this verification.
