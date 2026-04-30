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

## High Impact

- Impact: High. Effort: Medium. Redesign the primary information architecture around the real workflow. Keep `Upload`, `Timeseries`, `Correlations`, and `Scatter` as the core path, and move `FFT`, `Spectrogram`, `Drift`, and `Causal` into an `Advanced analyses` group so first-time users are not forced to choose among ten top-level destinations before they have even built a first plot.
- Impact: High. Effort: Medium. Reduce the vertical control stack on `Timeseries` so the chart becomes the main element again. Keep series selection, time context, and filter entry points visible; move export, notes, bookmarks, transforms, outlier tools, anomaly configuration, and drawing options into secondary drawers, a tabbed inspector, or a compact overflow menu.
- Impact: High. Effort: Medium. Split `Upload` into source-first views such as `File` and `Database` instead of showing file ingest, partial-load options, database connection, and dataset profile controls in one long mixed surface. This page currently delays the first plot by asking the user to parse too many alternative ingestion paths at once.
- Impact: High. Effort: Low. Delete the illusion that `Scatter Matrix` is a standalone page, or redesign it into an explicit sub-tab inside `Scatter`. The current implementation works, but the navigation model is conceptually inconsistent and adds avoidable cognitive load.
- Impact: High. Effort: Low. Shrink the guided workflow panel into a compact breadcrumb, dismissible assistant, or right-side helper after the first successful dataset load. It currently duplicates navigation on every page and pushes the actual analysis canvas below the fold.
- Impact: High. Effort: Medium. Stabilize Home-route hydration so the page stops shifting after first paint. The current Home trace shows `CLS 0.54` even though `LCP` is only `159 ms`, which means the landing page feels unstable despite being fast; reserve space for late metadata/workflow content or stop injecting layout-affecting styles after initial render.

## Medium Impact

- Impact: Medium. Effort: Low. Replace terse control labels such as `Win`, `Bin`, and unlabeled abbreviations with tooltips or expandable plain-language labels. Experts can decode them, but the interface should not require pre-existing tribal knowledge to create a plot.
- Impact: Medium. Effort: Medium. Consolidate repeated export button rows into a single export menu pattern shared by Timeseries, Scatter, Heatmap, FFT, Spectrogram, and Drift. Repeating `PNG/SVG/HTML/CSV/JSON/Parquet` on every page consumes space that should belong to the analytic view.
- Impact: Medium. Effort: Medium. Gate advanced pages by prerequisites and expected cost. `FFT`, `Spectrogram`, `Drift`, and `Causal` should explain what time window, column count, or statistical question makes them appropriate before the user commits to computation.
- Impact: Medium. Effort: Medium. Fix the ECharts zero-size initialization path on page switches so charts only initialize after their containers have stable dimensions. The current warnings indicate avoidable rendering instability.

## Low Impact

- Impact: Low. Effort: Low. Standardize page subtitles and empty states around one pattern: `What this page is for`, `What input it expects`, and `What happens next`.

## Delete Or Redesign First

- Delete or redesign the standalone `Scatter Matrix` navigation concept because the actual implementation is a Scatter sub-view.
- Delete or redesign the repeated workflow step pills that appear on every page once the user already understands the path.
- Delete or redesign the duplicate export button rows in favor of one compact export affordance per page.
- Redesign the mixed `Upload` page so unused source controls stay hidden until the user explicitly chooses `File` or `Database`.
- Redesign the `Timeseries` toolbar so plot creation stays visible without scrolling past guidance and dense option rows.

## Completed

- 2026-04-30. Removed the stale mobile Scatter chart reservation that still subtracted `220px/160px` for a retired overlay stack. Live mobile audit at `500px` viewport now gives the plot `388px` of usable width instead of collapsing it into the left half beside empty space.
- 2026-04-30. Made Scatter mobile toolbars wrap as full-width rows and anchored disclosure menus back inside the viewport, fixing the phone-width overflow where analytics controls and export/color menus opened partially off-screen.
- 2026-04-30. Collapsed Upload into a true single-column mobile layout for the file ingest and preview header controls. Live mobile audit at `500px` viewport now keeps partial-load controls, preview filtering, and status text inside the viewport instead of retaining the desktop three-column/header row layout.
- 2026-04-30. Stopped direct Scatter startup from eagerly booting Timeseries. Fresh `v=138` startup requests now go to scatter correlation/point endpoints without the previous duplicate `/api/data` pair before Scatter renders.
- 2026-04-30. Made Scatter matrix loading progressive. Matrix cells now fetch with bounded concurrency, prioritize the active pair and suggested columns first, and start the FFT side panel only after the matrix render pass has been scheduled.
- 2026-04-30. Deferred Home-route dataset bootstrap until the user enters an analysis page. Hard reloads on `#page=home` no longer request `api/metadata`, `api/data`, or `api/database/status`, and the header now stays on placeholder stats until a workflow is chosen.
- 2026-04-30. Folded workflow-panel styling into the always-loaded toolbar CSS and tightened the mobile crumb row into a non-wrapping scroller. On the follow-up mobile audit, the Home workflow panel measured about `180 px` tall instead of the previous `~212 px`.
- 2026-04-30. Normalized always-mounted form controls with fallback `name` and `aria-label` attributes and fixed the command palette search field to carry explicit `id` and `name`. Follow-up DOM inspection found no remaining nameless or unlabeled `input`, `select`, or `textarea` elements.
- 2026-04-30. Reduced first-load CSS fan-out by removing `home.css` and `drift.css` from the main stylesheet entry and deferring `workflow.css`; non-core page styles now load on demand instead of being imported into every route upfront.
- 2026-04-30. Verified that workflow-guide visibility already persists in local storage and removed that ledger item as stale; repeat users keep their guide preference across page changes and sessions.
- 2026-04-30. Removed the stale Home-page workflow-map item; the landing page already presents the core workflow and advanced analyses as a question-driven map rather than a flat feature list.
- 2026-04-30. Suppressed the false Scatter empty-state during in-flight point fetches by tracking request loading explicitly; fresh scatter loads now transition directly into the plot instead of flashing `No scatter points found` while the query is still running.
- 2026-04-30. Added an inline favicon in the served HTML, removing the repeated `/favicon.ico` 404 from the app-load server log.
- 2026-04-30. Installed a Windows-specific `navigator.gpu.requestAdapter` shim at frontend bootstrap so ignored `powerPreference` hints are stripped before WebGPU probes; fresh `v=137` audit pages no longer emit the repeated Chromium warning in the integrated browser.
- 2026-04-29. Repaired the Scatter `Plot` / `Matrix` toggle wiring so the matrix button now switches panels, updates pressed state, and renders matrix cells again in the live UI.
- 2026-04-29. Re-hardened ECharts initialization on `Causal`, `Drift`, and `Spectrogram` by waiting for visible non-zero containers and giving Spectrogram a concrete chart height fallback; the renewed zero-size warnings from the audit are no longer reproduced.
- 2026-04-29. Updated README and the user manual to match the current information architecture: `Correlations` is the heatmap page, `Scatter` owns the Plot/Matrix workflow and distribution controls, and local startup uses `cargo run --release --bin edatime`.
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
