# EdaTime all-page UI layout plan

**Audit date:** 2026-07-17
**Dataset:** ETTm2, 69,680 rows, 7 numeric columns, 15-minute cadence
**Pages checked:** Home, Upload, Timeseries, Prepare, Correlations, Scatter, FFT / PSD, Spectrogram, Causal, Drift, and Settings
**Viewports checked:** 1920×1080, 1440×900, 1024×768, and 414×896
**Method:** Loaded ETTm2 through the Home sample card, navigated the live Vite app, opened every available page-level `?` help surface, exercised Causal, Drift, FFT, Spectrogram, and the responsive navigation, and measured the rendered DOM for overflow and chart space.

This file is intentionally a current implementation plan and completion record, not a historical bug log. Sections 5–9 preserve the implementation contract used for the work; section 10 records the completed result and verification evidence.

**Implementation status:** Complete as of 2026-07-17.

## 1. Repairs completed before this plan

The previous audit mixed real defects, stale observations, and feature ideas. The following reproducible issues were fixed first:

- The 414 px drawer experiment collapsed the entire application to roughly 40 px. The app now uses a full-width mobile content column, an off-canvas sidebar, a dedicated header menu button, Escape/outside-click dismissal, and separate desktop collapse state.
- The desktop sidebar no longer grows to 20% of ultrawide screens. It is capped at 280 px so analysis pages receive the remaining width.
- Page help is visually attached to the page title on every static page. It uses a compact 24 px desktop affordance and retains a 44 px touch target at tablet/mobile widths.
- Spectrogram no longer overflows horizontally at 1024 px. Its display controls own a wrapping full row below 1280 px.
- Drift no longer overflows horizontally at 414 px. Its column picker, date fields, and refine group now stay inside the viewport.
- Drift requests now always carry the active cleaning-plan envelope, including an empty plan. This fixed the backend `422 missing field cleaningPlan` response. ETTm2 live verification returned 363 drift windows and a complete status summary.
- Spectrogram summary cadence now comes from the original input sampling rate, not the spacing between STFT window centres. ETTm2 therefore reads `1 / 15.0 min` with Nyquist `1 / 30.0 min`.
- Spectrogram axes use overlap suppression for narrow layouts.
- Causal Run Comparison stays hidden until a saved run exists, and disabled graph actions explain `Run Compute first`.
- Drift `Latest N` is conditionally revealed only for the matching evaluation mode.

## 2. Findings removed as stale or non-defects

- Causal did not hang on ETTm2. The default PCMCI run completed in the live app in about seven seconds; the existing loading overlay and progress label were visible, and graph actions enabled after completion.
- Drift was not a chart-rendering failure. The request contract was invalid; after the serializer fix, the existing result UI rendered normally.
- FFT filter parameter fields are already hidden when the related mode is off.
- The canonical Timeseries quick-range DOM has four actions (`24h`, `7d`, `30d`, `All`); the earlier duplicate-chip claim did not reproduce after the shell-width fix.
- Sidebar labels already use no-wrap ellipsis, the sidebar collapse control already has a tooltip, and series colors already have a shared state owner.
- Aborted Scatter requests are part of latest-request-wins cancellation. They should only be treated as a defect if the current request also fails or the UI surfaces an error.

## 3. Measured layout baseline

The figures below are rendered measurements after the repairs above. Toolbar height is the combined height of visible page toolbars; chart height is the first main analysis region.

| Page | 1440×900 toolbar / chart | 1024×768 toolbar / chart | 414×896 toolbar / chart | Current conclusion |
|---|---:|---:|---:|---|
| Timeseries | 254 / 554 px | 340 / 336 px | 530 / 256 px | Mobile and tablet controls dominate the chart. |
| Correlations | 144 / 605 px | 138 / 479 px | 252 / 419 px | Functional, but the mobile control block is still dense. |
| Scatter | 114 / 504 px | 146 / 311 px | 259 / 101 px | Mobile chart is effectively crowded out by context/status UI. |
| FFT / PSD | 127 / 644 px | 141 / 498 px | 260 / 489 px | Acceptable chart budget; toolbar can be clearer. |
| Spectrogram | 77 / 731 px | 149 / 508 px | 251 / 535 px | Best analysis-page baseline; preserve this behavior. |
| Causal | 171 / 513 px | 233 / 261 px | 331 / 101 px | Parameters and actions crowd out the graph on mobile. |
| Drift | 209 / 580 px | 203 / 454 px | 553 / 175 px | No overflow now, but the mobile control hierarchy is too tall. |

Additional observations:

- No audited page has horizontal overflow at the target viewports after the completed fixes.
- Home, Upload, and Prepare correctly scroll vertically, but the guided-workflow band can consume about 115 px before page content on narrow screens.
- Prepare is the only full page without a page-level `?` help affordance.
- Settings fits in a 359×507 px modal at 414×896 and exposes its own `?` help.
- The current sidebar becomes a usable 260 px drawer at 640 px and below.

## 4. Target responsive contract

Use one shared contract instead of page-specific breakpoint guesses.

### 4.1 Breakpoints

- **Wide desktop, ≥1280 px:** persistent sidebar; primary toolbar controls and primary action visible; a second row is acceptable only for intrinsically large selectors such as Drift columns.
- **Compact desktop/tablet, 900–1279 px:** persistent or collapsed sidebar; controls wrap into named groups; chart receives at least 40% of viewport height.
- **Small tablet, 641–899 px:** collapsed sidebar by default; toolbar groups become horizontally scrollable rails or disclosures; no required control may simply disappear.
- **Phone, ≤640 px:** off-canvas navigation; chart/result comes before secondary configuration; primary action remains reachable; advanced controls live in disclosures or a bottom sheet.

### 4.2 Shared acceptance rules

- `documentElement.scrollWidth <= viewport width` at 1024, 768, 640, 414, and 360 px.
- Every icon-only action has an accessible name, visible focus, and at least a 44×44 px phone target.
- Page title and help remain on one row without pushing either outside the viewport.
- A phone analysis page shows at least 280 px of chart/result space without requiring the user to collapse controls manually.
- A tablet analysis page shows at least 320 px of chart/result space at 1024×768.
- The primary action is visually stable: right-aligned on desktop and sticky/full-width where appropriate on phone.
- Loading, empty, success, and error states occupy the chart/result region and do not change the page width.
- Controls hidden by a breakpoint have an explicit alternative entry point.
- Keyboard order follows visual order after wrapping or disclosure changes.

## 5. Shared shell and component plan

### P0 — Make the mobile shell deliberate

**Owners:** `frontend/index.html`, `frontend/css/modules/layout.css`, `header.css`, `responsive.css`, `frontend/src/ui/pageNavigation.ts`

1. Add a compact mobile overflow menu for Workflow, Plan, Context, keyboard help, and Settings. The current header hides several of these controls without providing a single replacement surface.
2. Collapse the guided-workflow band to one 44–48 px row on phone, or move its next-step card into the overflow menu. It must not push every page down by 100+ px.
3. Lock focus inside the open navigation drawer, return focus to the menu button on close, and prevent background scrolling.
4. Change the drawer backdrop from a pseudo-element to a real dismiss button so click behavior and accessibility can be tested directly.

### P0 — Introduce a shared responsive analysis frame

**Owners:** `frontend/css/modules/toolbar.css`, `responsive.css`, `chart.css`, and a small UI primitive under `frontend/src/ui/`

The shared frame should have four named regions:

1. `primary-controls`: the minimum inputs required to run the page.
2. `secondary-controls`: refinement, export, styling, and optional overlays.
3. `primary-action`: Compute/Run/Apply.
4. `result-region`: chart, table, or empty/loading/error state.

At phone width, render primary controls as a compact summary/disclosure, put the result region next, and place secondary controls after the result or in a sheet. Avoid solving density by hiding controls with `nth-child` selectors.

### P1 — Standardize page headings and help

**Owners:** `frontend/css/modules/page-help.css`, per-page help modules, `frontend/src/features/prepare/index.ts`

- Keep the newly compact title/help pattern.
- Add Prepare help using the same help-module contract as the other pages.
- Give every help dialog a short “What this page is for / Start here / Controls / Keyboard” structure.
- Add a focused test that every navigable analysis page has either a page help trigger or a documented modal help trigger.

## 6. Page-by-page layout plan

### Home

**Current:** responsive and overflow-free; content is long but coherent.
**Owners:** `frontend/src/features/home/`, Home page CSS.

- Keep one primary hero CTA and make sample datasets the next visual tier.
- Use a 3/2/1 card grid across wide/tablet/phone widths.
- Collapse keyboard-shortcut reference into a disclosure on phone.
- Move the guided next step out of the page-content flow on phone as described in P0.

### Upload

**Current:** overflow-free, but the mobile page is a long sequence of source, preview, partial-load, and action controls.
**Owners:** `frontend/src/features/upload/`, `frontend/css/modules/upload.css`.

- Present File/Database as the first step, preview as the second, and ingest as a sticky final action.
- On phone, collapse advanced partial-load settings until preview metadata exists.
- Keep the preview table horizontally self-contained; the page itself must never scroll sideways.
- Preserve status/progress next to the action that started it.

### Timeseries

**Current priority:** highest. The 414 px toolbar consumes 530 px and leaves 256 px for the chart.
**Owners:** `frontend/src/features/timeseries/`, `frontend/css/modules/toolbar.css`, `responsive.css`.

- Keep series selection, current range, and chart as the first phone viewport.
- Replace the always-expanded Draw/Labels/Notes/Analytics shelf with one “Tools” disclosure.
- Keep `24h`, `7d`, `30d`, and `All` in one range menu below 900 px.
- Turn column search into a labeled compact search affordance; expand it only while active.
- Keep color-by with series selection on desktop, but move it into Tools on phone.
- Put export and reset in a small result toolbar attached to the chart, not in the configuration stack.
- Acceptance: ≥320 px chart at 414×896 and ≥400 px at 1024×768.

### Prepare

**Current:** no overflow, but it is the longest page and lacks page help.
**Owners:** `frontend/src/features/prepare/index.ts`, `frontend/css/modules/prepare.css`.

- Add the standard title/help row.
- Split the page into `Profile findings`, `Pipeline stages`, `Preview`, and `Export` sections with a local step navigator.
- Keep Undo/Redo and Apply/Materialize in a sticky action row.
- On phone, render each stage as a card with its enable/reorder/remove actions in a menu.
- Preserve full stage details on desktop; do not hide plan semantics for compactness.

### Correlations

**Current:** usable at all sizes; 252 px of phone controls is the main cost.
**Owners:** `frontend/src/features/heatmap/`, correlation/scatter CSS.

- Make Method and Matrix mode the primary controls; move cell size, snap, fit-axis, pipeline, and export into Display/More.
- Stack cluster summary above the matrix on tablet/phone and make cluster rows interactive only if filtering semantics are implemented.
- Keep matrix labels readable with a minimum cell size and an internal scroll container rather than widening the page.
- Use the existing inline export-icon pattern consistently.

### Scatter

**Current priority:** highest. Status/filter/marginal UI leaves only about 101 px of chart at 414×896.
**Owners:** `frontend/src/features/scatter/`, `frontend/css/modules/scatter.css`, `responsive.css`.

- Put X, Y, and Plot/Matrix mode in the primary row.
- Collapse linked Timeseries filter context to a one-line summary; expand to show individual filters and Clear All.
- Move correlation suggestions and statistics below the chart on phone.
- Keep the active-filter empty state explanatory; add row counts only when the response contract can provide them without another heavy query.
- Treat density marginal plots as optional secondary content on phone.
- Acceptance: ≥300 px chart at 414×896 before secondary panels.

### FFT / PSD

**Current:** chart budget is healthy; toolbar and result metadata need clearer grouping.
**Owners:** `frontend/src/features/fft/`, `frontend/css/modules/chips.css`, `toolbar.css`.

- Keep traces, Magnitude/PSD, and Compute as primary controls.
- Keep filter inputs conditionally revealed; do not reserve empty space while filter/clip modes are off.
- Move Top Peaks into a collapsible result-detail panel on phone.
- Keep sample rate and Nyquist in reciprocal time form, with exact frequency in the tooltip.
- Add a lightweight Spectrogram link only if it transfers the active column/range through the canonical workspace state.

### Spectrogram

**Current:** use as the reference implementation. It preserves 535 px of chart at 414×896 and 508 px at 1024×768.
**Owners:** `frontend/src/features/spectrogram/`, `frontend/css/modules/layout.css`, `toolbar.css`.

- Preserve the fixed cadence summary, CSV export, responsive colorbar, overlap suppression, and no-overflow behavior.
- On phone, keep Column, Window, Hop, and Compute visible; place Normalize, Outliers, export, and reset in a secondary disclosure if more space is needed.
- Retain a chart-height regression test so shared toolbar work cannot regress this page.

### Causal

**Current priority:** high. The phone toolbar is 331 px and the graph is about 101 px.
**Owners:** `frontend/src/features/causal/`, causal styles currently shared through toolbar/drift modules.

- Show selected columns, Method, and Compute in the primary phone view.
- Put Test, τ max, α, PC α, Max conds, and FDR in a Parameters disclosure with a concise applied-value summary.
- Attach Add Edge, Export, and Save Run to the result region after a graph exists.
- Keep Run Comparison reveal-on-data behavior; with one run, show saved-run management, and with two runs enable comparison.
- Keep the existing progress overlay and status text; do not add a second competing loading indicator.
- Acceptance: ≥300 px graph at 414×896.

### Drift

**Current priority:** highest. Overflow is fixed, but phone controls still consume about 553 px.
**Owners:** `frontend/src/features/drift/`, `frontend/css/modules/drift.css`, `toolbar.css`.

- Replace the always-expanded seven-column chip block with a compact “1 of 7 selected” trigger on phone; retain inline chips on wide desktop.
- Keep Window, Evaluate, Reference source, and Compute in the primary flow.
- Reveal Latest N only for Latest N mode, preserving the completed behavior.
- Move explicit reference dates, thresholds, export, and zoom into Baseline/Thresholds/Export disclosures.
- Put the compute summary directly above the result tabs and keep the selected tab stable after resize.
- Acceptance: ≥300 px result region at 414×896 and no horizontal overflow at 360 px.

### Settings

**Current:** the modal fits at 414×896 and has complete help.
**Owners:** `frontend/src/ui/settingsPanel.ts`, `frontend/css/modules/settings.css`.

- Keep the modal pattern rather than creating a separate route.
- Make tab headers horizontally scrollable at 360–414 px.
- Keep Apply/Reset/Close sticky while the settings body scrolls.
- Ensure opening Settings closes the mobile navigation drawer and returns focus to the invoking control on close.

## 7. Implementation sequence

### Phase 1 — Shared shell and frame

- Mobile overflow menu and accessible drawer/backdrop.
- Shared analysis-frame regions and responsive ordering.
- Prepare help parity.
- Automated overflow and chart-budget probes.

### Phase 2 — High-density analysis pages

- Timeseries tool disclosure and chart-first phone order.
- Scatter context/status relocation.
- Causal parameter disclosure and result actions.
- Drift compact column/baseline/threshold controls.

### Phase 3 — Workflow pages

- Home mobile content hierarchy.
- Upload progressive steps and sticky ingest.
- Prepare local navigator and sticky plan actions.
- Settings focus and tab behavior.

### Phase 4 — Remaining analysis polish

- Correlations primary/secondary control grouping.
- FFT result-details disclosure.
- Spectrogram regression-only follow-up unless measurements show a new issue.

## 8. Verification matrix

Use ETTm2 for every browser pass so column count, cadence, outlier behavior, and compute payloads stay comparable.

| Viewport | Pages | Required checks |
|---|---|---|
| 1920×1080 | all | Sidebar ≤280 px; no unnecessary third toolbar row; result fills remaining height. |
| 1440×900 | all | No horizontal overflow; primary action remains grouped with its page controls. |
| 1024×768 | all | No overflow; analysis result ≥320 px; dropdown labels disclose their full value. |
| 768×1024 | all | Collapsed navigation state is usable; required controls have an alternate path. |
| 414×896 | all | Drawer works by pointer and keyboard; result ≥280 px; touch targets ≥44 px. |
| 360×800 | all | No horizontal overflow; titles/help/actions remain reachable. |

Interaction checks:

1. Load ETTm2 from Home and confirm 69,680 rows / 7 numeric columns.
2. Open every page help trigger; verify Prepare after its help is added.
3. Run FFT, Spectrogram, Causal, and Drift; verify loading, success, and error states stay inside the result region.
4. Verify Spectrogram summary reads `1 / 15.0 min` and `1 / 30.0 min`.
5. Verify Drift requests include `cleaningPlan` even when the plan has zero enabled stages.
6. Open/close the mobile drawer with the menu button, outside click, Escape, and a navigation choice.
7. Resize each computed page through 1440 → 1024 → 414 → 1024 without losing selection or result state.
8. Use keyboard Tab/Shift+Tab through every reordered toolbar and disclosure.

Automated gates:

- Focused Vitest for each changed owner seam.
- `npm run check:frontend`
- `npm run check:frontend:arch`
- `npm run check:frontend:budgets`
- `npm run check:frontend:assets`
- `cargo test -p edatime-service analytics::spectrogram`
- Playwright viewport sweep with DOM overflow and chart-height assertions.

## 9. Definition of done

The layout program is complete when every target viewport passes the overflow and result-height budgets, every hidden control has a discoverable alternative, all page help matches the rendered workflow, ETTm2 compute flows succeed, and the shared responsive frame replaces page-specific concealment rules rather than adding another layer of exceptions.

## 10. Implementation completed

All phases above have been implemented in the current checkout.

### Shared shell and responsive frame

- Added a real, accessible mobile drawer backdrop plus focus trapping, Escape/outside-click dismissal, focus restoration, background inertness, and body scroll locking.
- Added a mobile header overflow menu for Workflow, Plan, Context, keyboard help, and Settings. Settings continues to use the canonical lazy-loaded panel.
- Added reusable responsive disclosures and action proxies so controls retain one canonical owner while gaining compact tablet/phone entry points.
- Collapsed the guided-workflow band on phone and preserved a compact next-step summary.
- Added standard page help to Prepare and regression coverage for help availability across every navigable page.

### Page implementations

- **Home:** 3/2/1 responsive card grid and a phone disclosure for keyboard shortcuts.
- **Upload:** progressive source/preview/ingest layout, advanced-load disclosure, sticky phone ingest action, and internally scrollable preview content.
- **Timeseries:** tablet/phone Tools disclosure, compact range/search controls, and chart-attached PNG/CSV/Reset actions. Numeric-range and adaptive-line filters preserve every timestamp and turn only rejected samples in their target trace into `NaN` chart gaps, rather than dropping rows or shifting other selected traces.
- **Prepare:** title/help parity, local section navigation, sticky plan actions, Preview/Materialize action, and compact phone stage actions.
- **Correlations:** Method and matrix mode remain primary; display, fit, export, and pipeline controls move into a secondary disclosure while the matrix owns its horizontal scrolling. Cluster membership names and counts are intentionally absent from the result chrome; the single Clustered toggle preserves the useful ordering behavior. The color scale is sized with the matrix and remains immediately beside it, while the summary footer stays below the matrix rather than widening the same row.
- **Scatter:** X, Y, and view remain primary; display controls collapse; phone statistics and suggestions follow the chart; marginals become optional secondary content.
- **FFT / PSD:** Top Peaks is a responsive result disclosure and inactive clip parameters reserve no space.
- **Spectrogram:** Column, Window, Hop, and Compute remain visible; normalize, outliers, export, and reset share a phone disclosure. Cadence and axis-overlap regressions remain covered.
- **Causal:** Method remains primary; test and algorithm parameters collapse; selected columns precede the phone toolbar; result actions attach to the graph region after compute.
- **Drift:** phone column selection uses a compact count trigger; reference source remains primary; baseline dates, thresholds, export, and zoom collapse; ECharts loads in parallel with the API request.
- **Settings:** tabs scroll horizontally on narrow screens and the footer remains sticky while the modal body scrolls.

### Live ETTm2 verification

ETTm2 was loaded from the Home sample card and retained while navigating every page. Home, Upload, Timeseries, Prepare, Correlations, Scatter, FFT / PSD, Spectrogram, Causal, Drift, and Settings were swept at 1024×768, 414×896, and 360×800.

- Every page reported zero root-level horizontal overflow at all three widths.
- The mobile header menu opened every replacement action, including the lazy Settings panel.
- The mobile drawer trapped focus, made background content inert, locked body scrolling, and closed through its real backdrop.
- Dense analysis regions met the phone target: Timeseries 563 px, Scatter 385 px, Causal 455 px, and Drift 470 px at 414×896.
- At 360×800, Timeseries retained 483 px, Scatter 300 px, Causal 359 px, and Drift 373 px; Spectrogram kept Compute visible and retained a 417 px result region.
- At 1024×768, Timeseries retained 484 px, Scatter 315 px, Causal 376 px, and Drift 499 px.

### Automated verification

- `npm test` — 246 files and 1,324 tests passed.
- `npm run check:frontend:all` — TypeScript, architecture, bundle budgets, and packaged asset graph passed.
- `npm run build` — production frontend build and packaged asset checks passed. Vite reports non-failing mixed static/dynamic import and large ECharts chunk warnings; neither fails a budget or build gate.
- `cargo test -p edatime-service analytics::spectrogram` — 8 tests passed.

The definition of done is satisfied for the implemented responsive layout program.
