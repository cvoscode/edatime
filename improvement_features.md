# UI/UX Improvement Ledger

Audit basis: live walkthrough on 2026-04-28 against `ETTm2.csv` at `http://127.0.0.1:3001`.

Observed evidence during the walkthrough:

- `Scatter Matrix` is exposed as a sidebar page, but the UI actually renders it as a matrix mode inside the Scatter surface.
- Browser console produced repeated ECharts zero-size warnings during page transitions.
- Browser resource timings showed `GET /api/scatter/correlations/matrix` at roughly `717-768 ms`, repeated `POST /api/scatter/points` calls at roughly `226-251 ms` in the matrix/scatter flow, and correlation suggestion fetches just above `200 ms`.
- Heatmap cell click-through to Scatter worked and confirmed the intended workflow hand-off.

## High Impact

- Impact: High. Effort: Medium. Redesign the primary information architecture around the real workflow. Keep `Upload`, `Timeseries`, `Correlations`, and `Scatter` as the core path, and move `FFT`, `Spectrogram`, `Drift`, and `Causal` into an `Advanced analyses` group so first-time users are not forced to choose among ten top-level destinations before they have even built a first plot.
- Impact: High. Effort: Medium. Reduce the vertical control stack on `Timeseries` so the chart becomes the main element again. Keep series selection, time context, and filter entry points visible; move export, notes, bookmarks, transforms, outlier tools, anomaly configuration, and drawing options into secondary drawers, a tabbed inspector, or a compact overflow menu.
- Impact: High. Effort: Medium. Split `Upload` into source-first views such as `File` and `Database` instead of showing file ingest, partial-load options, database connection, and dataset profile controls in one long mixed surface. This page currently delays the first plot by asking the user to parse too many alternative ingestion paths at once.
- Impact: High. Effort: Low. Delete the illusion that `Scatter Matrix` is a standalone page, or redesign it into an explicit sub-tab inside `Scatter`. The current implementation works, but the navigation model is conceptually inconsistent and adds avoidable cognitive load.
- Impact: High. Effort: Medium. Make correlation screening progressive. Load the strongest pairs first, defer matrix cell rendering outside the viewport, and delay the matrix FFT side panel until the matrix itself is stable. The slowest observed UI path was the correlation matrix and matrix-related fetch sequence.
- Impact: High. Effort: Low. Shrink the guided workflow panel into a compact breadcrumb, dismissible assistant, or right-side helper after the first successful dataset load. It currently duplicates navigation on every page and pushes the actual analysis canvas below the fold.

## Medium Impact

- Impact: Medium. Effort: Low. Replace terse control labels such as `Win`, `Bin`, and unlabeled abbreviations with tooltips or expandable plain-language labels. Experts can decode them, but the interface should not require pre-existing tribal knowledge to create a plot.
- Impact: Medium. Effort: Medium. Consolidate repeated export button rows into a single export menu pattern shared by Timeseries, Scatter, Heatmap, FFT, Spectrogram, and Drift. Repeating `PNG/SVG/HTML/CSV/JSON/Parquet` on every page consumes space that should belong to the analytic view.
- Impact: Medium. Effort: Medium. Gate advanced pages by prerequisites and expected cost. `FFT`, `Spectrogram`, `Drift`, and `Causal` should explain what time window, column count, or statistical question makes them appropriate before the user commits to computation.
- Impact: Medium. Effort: Medium. Fix the ECharts zero-size initialization path on page switches so charts only initialize after their containers have stable dimensions. The current warnings indicate avoidable rendering instability.

## Low Impact

- Impact: Low. Effort: Low. Persist the hidden or collapsed state of the workflow guide across pages and sessions so repeat users can stay in analysis mode.
- Impact: Low. Effort: Medium. Rework the Home page from feature marketing into a workflow map that emphasizes `what question this page answers next` rather than only listing capabilities.
- Impact: Low. Effort: Low. Standardize page subtitles and empty states around one pattern: `What this page is for`, `What input it expects`, and `What happens next`.

## Delete Or Redesign First

- Delete or redesign the standalone `Scatter Matrix` navigation concept because the actual implementation is a Scatter sub-view.
- Delete or redesign the repeated workflow step pills that appear on every page once the user already understands the path.
- Delete or redesign the duplicate export button rows in favor of one compact export affordance per page.
- Redesign the mixed `Upload` page so unused source controls stay hidden until the user explicitly chooses `File` or `Database`.
- Redesign the `Timeseries` toolbar so plot creation stays visible without scrolling past guidance and dense option rows.

## Completed

- 2026-04-28. Reworked the primary workflow IA in the frontend so `Upload`, `Timeseries`, `Correlations`, and `Scatter` read as the core path, while advanced analyses are visually separated on the Home page and in sidebar grouping.
- 2026-04-28. Removed the standalone `Scatter Matrix` navigation illusion and exposed matrix exploration as an explicit `Plot` / `Matrix` sub-view inside `Scatter`, matching the actual implementation model.
- 2026-04-28. Split `Upload` into explicit `File` and `Database` source modes so unused ingest controls stay hidden until the user selects that path.
- 2026-04-28. Compacted the guided workflow panel so it consumes less vertical space and better supports an analysis-first layout.
- 2026-04-28. Reduced toolbar density on `Timeseries` and `Scatter` by moving secondary actions into disclosure menus while preserving existing controls and IDs.
- 2026-04-28. Reworded the `Upload` profile status so dataset previews describe the time column and selected analysis columns instead of implying an error-state `X/Y columns selected` counter.
- 2026-04-28. Moved the primary scatter pair context and `Open in Causal` action into the stable stats bar and retired the in-plot correlation CTA overlay.
- 2026-04-28. Added a tunable scatter suggestion threshold and explicit `Inspecting X vs Y` context so the suggestions row stays relevant after a pair has already been promoted into detailed scatter analysis.
- 2026-04-28. Added `Drift Analysis` to the Home page cards so the landing page now explains when that workflow fits into the broader analysis path.
- 2026-04-29. Replaced terse toolbar labels (`Win`, `Bin`, `Lo Hz`, `Hi Hz`) with plain-language labels (`Window`, `Bins`, `Low Hz`, `High Hz`) across Timeseries Analytics, Density Scatter, and FFT toolbars.
- 2026-04-29. Consolidated repeated export button rows on FFT, Heatmap, Spectrogram, and Drift pages into single toolbar disclosure menus, freeing vertical space for the analytic canvas.
- 2026-04-29. Added prerequisite and cost guidance blocks (`Best for`, `Needs`, `Cost`) on FFT, Spectrogram, Causal, and Drift pages so users understand when each advanced analysis is appropriate before committing to computation.
- 2026-04-29. Fixed ECharts zero-size initialization warnings on hidden pages by gating chart creation on page visibility in `causalPage.ts` and `driftPage.ts`; charts now initialize only after the `edatime:page-change` event confirms the page is visible.
