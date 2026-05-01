# UI/UX Improvement Ledger

Audit basis: live walkthrough on 2026-04-28 against `ETTm2.csv` at `http://127.0.0.1:3001`.

Additional audit basis: Chrome DevTools walkthrough on 2026-04-30 against `#page=home`, `#page=timeseries`, and `#page=upload` at desktop `1440x960` and mobile `500x844`.

Observed evidence during the walkthrough:

- `Scatter Matrix` is exposed as a sidebar page, but the UI actually renders it as a matrix mode inside the Scatter surface.
- Browser console produced repeated ECharts zero-size warnings during page transitions.
- Browser resource timings showed `GET /api/scatter/correlations/matrix` at roughly `717-768 ms`, repeated `POST /api/scatter/points` calls at roughly `226-251 ms` in the matrix/scatter flow, and correlation suggestion fetches just above `200 ms`.
- Heatmap cell click-through to Scatter worked and confirmed the intended workflow hand-off.
- Chrome DevTools Lighthouse on the Home route scored `83` Accessibility, `100` Best Practices, and `90` SEO on both desktop and mobile.
- Chrome DevTools performance trace on the Home route recorded fast paint (`LCP 159 ms`) but very poor visual stability (`CLS 0.54`), with the worst shift cluster spanning roughly `133-1167 ms` after navigation.
- After the 2026-04-30 bootstrap follow-up, a cold Home reload at mobile width no longer requests `api/metadata`, `api/data`, or `api/database/status` before the user enters an analysis page; the remaining first-load cost is still the shared shell bundle plus the base CSS module set.
- After the 2026-04-30 workflow compaction follow-up, the mobile Home workflow panel height dropped to about `180 px`, but the workflow card grid still begins below the first screen after the hero block.
- On mobile `500x844`, the Timeseries chart did not begin until roughly `y=479`, leaving about `365 px` of visible chart after the workflow panel and stacked toolbars.
- On mobile `500x844`, the Upload panel occupied about `946 px` of height before the preview section completed, pushing the profile preview and status well below the first screen.
- Additional page-by-page probe on 2026-04-30 at a narrow app width of roughly `372 px` showed `Home` at about `1651 px` scroll height with `18` visible controls, `Upload` at about `946 px` with `40` visible controls, and `Timeseries` at about `549 px` with `50` visible controls.
- On the same 2026-04-30 probe, `#page=upload` still issued `GET /api/metadata`, `GET /api/data`, and `GET /api/database/status` before any upload interaction.
- On the same 2026-04-30 probe, `#page=heatmap` fetched `/api/scatter/correlations/matrix` in about `54 ms`, and `#page=scatter` fetched correlation suggestions in about `15 ms` plus `/api/scatter/points` in about `19 ms` with an encoded payload around `175 KB` for the sample dataset.
- In a live browser deep-link check on 2026-04-30, navigating to `#page=drift` left `causal` as the visible page and the active sidebar item because the hash router still rejected `drift` as a valid page.

## 2026-04-30 Page-by-Page Findings

- Home: the route is fast on the sample dataset, but the page still spends its narrow viewport budget on onboarding copy and workflow cards rather than giving repeat users a compact landing mode.
- Upload: the route remains too expensive for a source-first page because it eagerly boots dataset metadata, chart data, and database-status fetches before the user chooses an ingest path.
- Timeseries: the page is still control-heavy at narrow widths, with roughly `50` visible controls competing with the main chart for the first screen.
- Correlations: the current matrix request is fast on the sample dataset, so the main remaining issue is not raw latency but avoiding duplicate matrix work across related analysis surfaces.
- Scatter: runtime performance is acceptable on the sample dataset, but the points payload is already substantial enough that richer point-level overlays should be added carefully.
- FFT: the page has no route-time fetch cost, but the current one-request-per-trace interaction model will scale poorly once users compare many columns.
- Spectrogram: the page stays light until compute, but its chart bootstrap is still sensitive to container readiness and should remain a lifecycle hardening target.
- Causal: the route loads without fetches, but its control surface is dense and would benefit from a job-oriented execution model rather than a page-local blocking workflow.
- Drift: the route currently fails at the navigation layer in the live app, so its analysis surface is effectively unreachable through hash deep links and browser history.

## High Impact

- Impact: High. Effort: Medium. Redesign the primary information architecture around the real workflow. Keep `Upload`, `Timeseries`, `Correlations`, and `Scatter` as the core path, and move `FFT`, `Spectrogram`, `Drift`, and `Causal` into an `Advanced analyses` group so first-time users are not forced to choose among ten top-level destinations before they have even built a first plot.
- Impact: High. Effort: Medium. Reduce the vertical control stack on `Timeseries` so the chart becomes the main element again. Keep series selection, time context, and filter entry points visible; move export, notes, bookmarks, transforms, outlier tools, anomaly configuration, and drawing options into secondary drawers, a tabbed inspector, or a compact overflow menu.
- Impact: High. Effort: Medium. Split `Upload` into source-first views such as `File` and `Database` instead of showing file ingest, partial-load options, database connection, and dataset profile controls in one long mixed surface. This page currently delays the first plot by asking the user to parse too many alternative ingestion paths at once.
- Impact: High. Effort: Low. Delete the illusion that `Scatter Matrix` is a standalone page, or redesign it into an explicit sub-tab inside `Scatter`. The current implementation works, but the navigation model is conceptually inconsistent and adds avoidable cognitive load.
- Impact: High. Effort: Low. Shrink the guided workflow panel into a compact breadcrumb, dismissible assistant, or right-side helper after the first successful dataset load. It currently duplicates navigation on every page and pushes the actual analysis canvas below the fold.
- Impact: High. Effort: Medium. Stabilize Home-route hydration so the page stops shifting after first paint. The current Home trace shows `CLS 0.54` even though `LCP` is only `159 ms`, which means the landing page feels unstable despite being fast; reserve space for late metadata/workflow content or stop injecting layout-affecting styles after initial render.
- Impact: High. Effort: Low. Fix hash routing so `drift` is treated as a valid route everywhere the app already advertises it. The live browser still leaves `causal` visible after a direct `#page=drift` navigation because `frontend/src/utils/router.ts` omits `drift` from `VALID_PAGES`, breaking deep links, browser history, and shortcut-driven navigation for one entire analysis page.
- Impact: High. Effort: Medium. Keep `Upload` source-first by suppressing eager dataset bootstrap when the user lands on `#page=upload`. The current route still fires `/api/metadata`, `/api/data`, and `/api/database/status` before any upload interaction, which wastes startup budget and makes the ingest page do timeseries work preemptively.

## Medium Impact

- Impact: Medium. Effort: Low. Replace terse control labels such as `Win`, `Bin`, and unlabeled abbreviations with tooltips or expandable plain-language labels. Experts can decode them, but the interface should not require pre-existing tribal knowledge to create a plot.
- Impact: Medium. Effort: Medium. Consolidate repeated export button rows into a single export menu pattern shared by Timeseries, Scatter, Heatmap, FFT, Spectrogram, and Drift. Repeating `PNG/SVG/HTML/CSV/JSON/Parquet` on every page consumes space that should belong to the analytic view.
- Impact: Medium. Effort: Medium. Gate advanced pages by prerequisites and expected cost. `FFT`, `Spectrogram`, `Drift`, and `Causal` should explain what time window, column count, or statistical question makes them appropriate before the user commits to computation.
- Impact: Medium. Effort: Medium. Fix the ECharts zero-size initialization path on page switches so charts only initialize after their containers have stable dimensions. The current warnings indicate avoidable rendering instability.
- Impact: Medium. Effort: Medium. Reduce visible control density further on narrow viewports. The 2026-04-30 route probe still measured about `40` visible controls on `Upload` and about `50` on `Timeseries` at roughly `372 px` width, so layout, focus order, and first-interaction cost remain higher than necessary.
- Impact: Medium. Effort: Medium. Promote the correlation matrix to a reusable dataset-revision cache shared by `Correlations` and scatter-matrix exploration instead of recomputing or refetching it at each surface boundary.
- Impact: Medium. Effort: Medium. Batch FFT requests when users compare multiple traces. The current page model still scales linearly with the number of selected columns because each added trace triggers its own fetch and redraw cycle.
- Impact: Medium. Effort: Medium. Move `Spectrogram`, `Causal`, and `Drift` toward cancellable job-style execution with persisted progress and completion state. Those pages are analytically expensive by nature, and a page-local compute state will feel brittle as datasets and run times grow.
- Impact: Medium. Effort: Low. Isolate the remaining browser accessibility warning about unlabeled form fields. A DOM probe did not reproduce visible unlabeled controls, so the issue is likely hidden, late-mounted, or modal-specific and should be fixed before it becomes harder to trace.

## Low Impact

- Impact: Low. Effort: Low. Standardize page subtitles and empty states around one pattern: `What this page is for`, `What input it expects`, and `What happens next`.

## Delete Or Redesign First

- Delete or redesign the standalone `Scatter Matrix` navigation concept because the actual implementation is a Scatter sub-view.
- Delete or redesign the repeated workflow step pills that appear on every page once the user already understands the path.
- Delete or redesign the duplicate export button rows in favor of one compact export affordance per page.
- Redesign the mixed `Upload` page so unused source controls stay hidden until the user explicitly chooses `File` or `Database`.
- Redesign the `Timeseries` toolbar so plot creation stays visible without scrolling past guidance and dense option rows.

