# Frontend review

Reviewed 2026-09-24 at `a0a08387`. Scope: Overview, Data source, Signals, Preparation, Correlation matrix, and Pair plot, including their shared state, API adapters, profile grid, navigation, and chart lifecycle. The requested filename `frontent_issues.md` is preserved.

The review follows `.github/UI.md`: trustworthy analytical context, explicit and reversible cleaning, visible errors/stale state, complete keyboard operation, and intentional rendering/computation costs. **P1** means a core correctness/workflow problem; **P2** means a significant reliability, analytical-context, or accessibility issue; **P3** means a smaller correction. Static findings and measurement-dependent opportunities are identified. Backend root causes are detailed separately in `backend_issues.md`.

## Findings, ordered by priority

### F01 — P1: Signals applies saved filters again after the backend has executed the pipeline

**Locations:** `frontend/src/platform/planFilterSync.ts:18`, `frontend/src/features/timeseries/timeseriesRenderModel.ts:53`, `frontend/src/services/timeseries/filtering.ts:150`.

Saved Signals range/adaptive stages are mirrored into workspace filters. The backend executes those stages in canonical order, but the render model then reapplies the workspace filters to the transformed response. A later fill, resample, or derived replacement can change a value so that this second application changes the plan's meaning.

**Reproduced at the render-model boundary:** A plan keeps `x` in `[0,5]`, then replaces it with `x*10`. Valid returned values `[20,30]` are both hidden by the frontend, which reports “No points match current filters.” This is not the canonical pipeline result. Pair plot's request builder already avoids appending identical saved filters, so pages can disagree.

**Correction:** Distinguish pending local filter previews from stages already represented by the response's plan identity. Render a current backend result without re-executing its saved filters. Test range→derived replacement, range→fill, and adaptive filter→resample across Signals, Preparation, and Pair plot.

### F02 — P1: A newly selected file can be ingested with the previous file's preview settings

**Locations:** `frontend/src/features/upload/panel.ts:110`, `frontend/src/features/upload/panel.ts:149`, `frontend/src/features/upload/preview.ts:65`, `frontend/src/features/upload/fileSource.ts:85`, `frontend/src/features/upload/fileSource.ts:128`.

Selecting a file immediately enables Upload based only on file size. It resets the time selection but leaves previous preview metadata and selected columns available while the new preview loads or fails. Submission reads those shared values without verifying which file produced them.

**Browser reproduction, with ingest intercepted:** Preview A (`date,x`), select C (`date,z`), delay C's preview, and click Upload while “Profiling file…” is displayed. The request contains file C and `columns=["date","x"]`. A schema overlap can silently omit new columns; incompatible schemas can fail for reasons unrelated to what the user selected.

**Correction:** Associate preview metadata, selections, status, and ingest parameters with one file-generation token. Clear incompatible state on selection and enable ingestion only after its required schema/time configuration is valid for that file. Preserve a failed file's own input for retry. Add delayed-response, failed-preview, and rapid replacement tests.

### F03 — P2: The visible Pair plot correlation table uses the wrong metric and misses late updates

**Locations:** `frontend/src/features/scatter/chartLifecycle.ts:21`, `frontend/src/features/scatter/chartLifecycle.ts:52`, `frontend/src/features/scatter/correlationsPanel.ts:274`, `frontend/src/features/scatter/correlationsPanel.ts:295`.

The chart summary table always reads `pearsonRaw`/`spearmanRaw` and hides the correlation pills. The secondary metric request updates the hidden pills/state but does not refresh the visible table. First-difference mode populates the difference fields instead, leaving both visible raw rows blank.

**Browser reproductions:** Delaying Spearman leaves `Spearman ρ —` visible even after state contains `0.896164…`. Reloading Pair plot with first differences selected shows both coefficients as `—`, while state contains Pearson `0.833104…` and Spearman `0.828000…`.

**Correction:** Give the visible summary an update path owned by current pair/source/plan/metric state. Select and label the active metric family, and refresh it when either response arrives without rerendering the chart. Test delayed secondary responses, pair changes, and first-difference settings.

### F04 — P2: Signals request failures leave old data visible without an error state

**Locations:** `frontend/src/features/timeseries/controller.ts:193`, `frontend/src/features/timeseries/controller.ts:241`, `frontend/src/features/timeseries/timeseriesRenderModel.ts:51`.

**Static finding:** The request task's error handler only calls `console.error`. The awaiting-data render path returns without clearing or marking the existing chart. After a plan/window change and failed request, the loading indicator disappears while the previous rendered data can remain under the current controls.

**Impact:** Users can interpret stale values as the result of a new transformation. Backend B02 provides a concrete request failure reachable from an ordinary Preparation sort.

**Correction:** Model loading, current, stale, empty, and failed responses explicitly. Show an accessible error and Retry action tied to the request identity; either clear obsolete data or visibly retain it as the previous result. Add a successful-load→plan-change→HTTP-failure regression, not just a first-load failure test.

### F05 — P2: Signals can label approximate envelope points “Exact”

**Location:** `frontend/src/features/timeseries/samplingIndicator.ts:38`.

The sampling classifier treats `downsampled=false` as exact and does not account for the backend's approximation/envelope metadata. The backend can currently return `approximate=1`, `downsampled=0`, and only four rows from 1,000 observations; see B06 for the executed route reproduction.

**Correction:** Carry the whole sampling contract into the render model and distinguish original observations, envelope/aggregation, and final reduction. Show returned versus eligible counts and the algorithm where useful. Fix both ends of the contract so a contradictory response cannot silently produce “Exact.”

### F06 — P2: Matrix coefficients and their embedded plots use different data scopes

**Locations:** `frontend/src/services/api/scatter-matrix.ts:8`, `frontend/src/features/heatmap/scatterMatrix.ts:384`, `frontend/src/features/heatmap/scatterMatrix.ts:411`, `frontend/src/features/heatmap/page.ts:368`.

**Static request-flow finding:** Coefficients are requested from the canonical cleaning plan alone. Embedded pair previews additionally use current workspace filters and the linked time window. The preview controller reacts to workspace changes, while the coefficient request does not share that context. The cell therefore combines a coefficient over one population with a plot over another; opening Pair plot can yield a different coefficient for the selected window.

The tooltip discloses sampling and mentions linked filters for previews, but does not clearly identify the coefficient as a different population. Sampling and differing metric families are legitimate; a silently different time/filter population needs separate treatment.

**Correction:** Build both requests from one immutable analysis-context snapshot, or explicitly expose the two scopes and their observation counts if the distinction is intentional. Test a linked subrange whose relationship differs from the full source and inspect both payloads, thumbnail, coefficient, and Pair plot handoff.

### F07 — P2: Overview does not recover the active dataset on a fresh visit

**Locations:** `frontend/src/utils/pageBootstrap.ts:8`, `frontend/src/ui/pageNavigation.ts:133`, `frontend/src/features/home/workspaceSummary.ts:67`.

Overview decides whether a dataset exists solely from workspace metadata, but initial navigation to Overview does not bootstrap it. This also affects the context used by sample replacement controls.

**Browser reproduction:** A fresh context at `#page=home` shows the load-dataset onboarding, opens sample choices, and hides the active-dataset summary even though the server has 69,680 rows. Visiting an analysis page supplies the missing metadata.

**Correction:** Recover lightweight source identity/metadata independently of chart initialization and expensive profiling. Represent loading and metadata failure separately from “no dataset.” Test fresh load and reload with an existing server source, plus genuine empty-server behavior.

### F08 — P2: Direct Data source navigation leaves a misleading, incomplete current profile

**Locations:** `frontend/src/features/upload/panel.ts:215`, `frontend/src/features/upload/panel.ts:224`, `frontend/src/features/timeseries/module.ts:171`, `frontend/src/features/upload/currentProfile.ts`.

The direct-load fallback fetches immediate metadata and renders column stubs, but does not perform the normal active-profile recovery or update the surrounding status/range state. The more complete profile loader is reached through Signals initialization.

**Browser reproduction:** Fresh navigation to Data source with the existing source displays pending column statistics and “No active dataset. Select a file…” despite successfully listing its columns. Preparation can recover the source profile in the same application.

**Correction:** Reuse a lightweight, source-keyed current-profile bootstrap that updates status, range, and cached report together. Recover already available reports and offer an explicit build action when absent; do not require eager full profiling just to fix the page. Test direct load/reload and navigation from both Signals and Preparation.

### F09 — P2: Changing the time column after drag-and-drop can preview a different file

**Locations:** `frontend/src/features/upload/panel.ts:170`, `frontend/src/features/upload/preview.ts:165`.

Drop handling stores the chosen file in the panel's `selectedFile`, but the time-column change handler reads `fileInput.files[0]`. A dropped file does not update that input. The handler therefore uses a previously browsed file, or does nothing if the user has only dragged files.

**Browser reproduction:** Browse A, drop B, select B's `other_time` column. Captured preview requests are A, B, then **A with `time_column=other_time`**. Backend B09 can disguise this mismatch by falling back successfully.

**Correction:** Make the preview controller obtain its file from the same owner used for ingest; do not reconstruct file ownership from DOM input state. Test drop-only and browse→drop sequences.

### F10 — P2: Successful upload clears the visible file but retains a resubmittable File

**Locations:** `frontend/src/features/upload/fileSource.ts:153`, `frontend/src/features/upload/panel.ts:110`, `frontend/src/features/upload/panel.ts:266`, `frontend/src/features/upload/fileSource.ts:182`.

The submission helper clears the native input and displayed name, but cannot clear the panel closure's `selectedFile`. Completion re-enables the button, so the invisible file can be uploaded again.

**Browser reproduction, with ingest intercepted:** After success, the filename is empty and the input has zero files, but Upload remains enabled. Clicking it sends a second upload request.

**Correction:** Return an explicit success result or callback to the file owner, clear its selection and preview state, then derive button state from that owner. Keep the file on recoverable failure. Test the UI and actual outgoing request count, not only the cleared text.

### F11 — P2: Preparation can immediately commit invalid fill-order dependencies

**Locations:** `frontend/src/features/prepare/index.ts:238`, `frontend/src/features/prepare/index.ts:979`, `frontend/src/features/prepare/index.ts:988`, `frontend/src/features/prepare/index.ts:1014`.

Toggle, reorder, and remove actions guard resample ordering but not ordered-null-fill prerequisites. Starting from a valid sort→fill plan, disabling/removing the sort or moving the fill above it is committed to the shared plan even though the backend rejects it. Other pages immediately start using that invalid plan.

**Correction:** Validate all affected stage dependencies before publishing a plan, including fill order and referenced columns. Alternatively keep an invalid edit as an explicitly invalid draft while preserving the last valid executed plan. Preserve Undo. Add tests for changing/removing a prerequisite, not only creating a valid stage.

### F12 — P2: Quality-report requests lack immediate pending state and actionable failure feedback

**Locations:** `frontend/src/features/prepare/index.ts:279`, `frontend/src/features/prepare/index.ts:1223`, `frontend/src/features/prepare/index.ts:1236`.

**Static finding:** Starting a report does not set/render queued state before awaiting the POST. Buttons remain available during that interval. A second click aborts the client request without proving the first server job was cancelled. Failed starts set `profileStatus='failed'`, but the report renderer has no failed-state message and discards the error cause, returning to generic build instructions.

**Correction:** Enter a pending state synchronously, disable/coalesce duplicate starts, and retain the error/retry action in an accessible status region. Keep any completed report visible during retry/cancellation. Test a slow start response, rejected start, failed poll, and cancelled job; preserve the existing source-identity guards.

### F13 — P2: Correlation matrix keyboard operation and grid semantics are incomplete

**Locations:** `frontend/src/features/heatmap/page.ts:329`, `frontend/src/features/heatmap/page.ts:342`, `frontend/src/features/heatmap/page.ts:370`, `frontend/src/features/heatmap/page.ts:413`.

Headers support pointer drag reordering without a keyboard equivalent. Every interactive off-diagonal cell is a tab stop, and the keyboard handler supports activation only, so a wide matrix requires hundreds/thousands of Tab presses. Cells/headers sit directly under `role=grid` without semantic row containers; header indices start at 1 while data-cell indices include the corner/header offset.

**Correction:** Add arrow-key navigation with a roving tab stop and a keyboard reorder action. Use a semantic table or complete grid/row/cell hierarchy with consistent indices and announced position. Retain Enter/Space activation. Verify keyboard-only use and a screen reader on a wide matrix; this review did not run a screen-reader session.

### F14 — P3: The profile grid's “Numeric” filter also includes text and boolean columns

**Location:** `frontend/src/ui/profileGrid.ts:173`.

The predicate is `!isTemporalDtype(dtype)`, which classifies every non-temporal type as numeric. It affects both Data source and Preparation because they share the grid.

**Correction:** Use the shared explicit numeric dtype predicate, with an intentional policy for booleans and unsupported types. Verify a mixed string/bool/integer/float/date schema.

### F15 — P3: Numeric profile sorting treats unknown extrema as zero

**Location:** `frontend/src/ui/profileGrid.ts:153`.

`Number(null)` is zero, so missing/pending minima or maxima participate in numeric sorting as real zeros. The subsequent finite-value check does not catch this. A user sorting to inspect extrema gets a misleading order.

**Correction:** Handle null/undefined/pending values before conversion and consistently place them after known numeric values in either direction. Verify negative values, actual zeros, positive values, and all-null columns.

### F16 — P3: Overview sample-size claims do not match the generated data

**Locations:** `frontend/index.html:1751`, `frontend/index.html:1781`, `frontend/src/features/home/sampleDatasets.ts:84`.

The sinusoidal card advertises 10K rows, but its seven-day, 15-minute generator creates **672**. Weather advertises 50K rows and six columns, but its seven-day, 10-minute generator creates **1,008 rows and five columns**, including time.

**Correction:** Drive labels and generation from the same sample metadata, using a consistent definition of column count. A fixed seed would also make generated examples and analytical comparisons reproducible, although randomness itself is not the count defect.

## Improvement opportunities

### F17 — P2: Show the value/schema changes already available in Preparation preview

**Locations:** `frontend/src/features/prepare/preview.ts:62`, `frontend/src/features/prepare/index.ts:670`, `frontend/src/features/prepare/index.ts:962`; backend response at `crates/edatime-service/src/handlers/routes/cleaning.rs:754`.

The main page shows total row/column changes, per-stage row impacts, and warnings. It does not render the returned raw/working examples or source/result column lists. Fill and derived-value operations can therefore look unchanged because their row counts are unchanged.

**Proposal:** Add a compact before/after example and schema diff beside preview approval, clearly identifying source and working data. For fills/masks, extend impact data to include affected-value counts where practical. Preserve stage counts already present; they are useful and are not missing. This directly supports `.github/UI.md:120` before materialization.

### F18 — P2: Surface completed quality findings that the shared grid currently discards

**Location:** `frontend/src/ui/profileGrid.ts:70`; consumers in `frontend/src/features/upload/profile.ts` and `frontend/src/features/prepare/index.ts:264`.

The backend reports finite/non-finite counts, zeros, distinct/constant information, quantiles, zero runs, and time quality. The row adapter reduces this to null/non-null counts, extrema, and histogram counts. A column of NaNs/infinities can look populated under “Non-null” without a visible invalid-value count.

**Proposal:** Keep the primary table compact but expose invalid counts and quality badges with an accessible details view for remaining findings, including time ordering/gaps. Clearly distinguish unavailable, sampled, and exact statistics. Verify a fixture containing nulls, infinities, a constant column, and duplicate/out-of-order timestamps.

### F19 — P2: Give Pair plot summary numbers one explicit population and cache their calculation

**Location:** `frontend/src/features/scatter/chartLifecycle.ts:30`.

The visible table computes mean, median, standard deviation, and count from returned scatter points, while its correlations can be computed over the complete eligible working data. It sets `missingCount: 0` after the backend has already excluded incomplete pairs. Without a table-level population label, these numbers invite a source-wide interpretation they do not support.

The same routine allocates/copies/sorts both axes whenever the chart summary is rebuilt, including redraws that do not change points. This is avoidable main-thread work at large scatter limits; no frame-time benchmark was run.

**Proposal:** Label statistics as returned-sample or complete-population results and distinguish excluded/ineligible observations from missing values within the plotted points. Cache summaries by data/context identity, updating coefficients independently as in F03. Measure redraw time before introducing workers or changing algorithms.

### F20 — P2: Avoid rebuilding all of Preparation for unrelated state changes

**Locations:** `frontend/src/features/prepare/index.ts:399`, `frontend/src/features/prepare/index.ts:1113`, `frontend/src/features/prepare/index.ts:1286`.

The broad workspace subscription rerenders the entire page. Rendering disposes/recreates help, section navigation, the profile grid, and stage controls, then restores captured view/input state. Profile progress and changes to unrelated workspace fields can trigger this path. Focus restoration reduces symptoms, but does not remove DOM construction/layout cost or listener complexity.

**Proposal:** Subscribe to the dataset/plan/profile slices the page actually uses, then update the affected section. Split cohesive quality-report, preview, stage-editor, and source-identity behavior as needed; avoid a framework rewrite. Measure DOM work and input/focus continuity while profiling and changing viewport state.

## Coverage and validation

| Page | Main reviewed concerns |
| --- | --- |
| Overview | Fresh-load source recovery, active-source summary, sample generation and replacement context |
| Data source | File ownership, preview races, submit lifecycle, time selection, partial-load parameters, current profiles, shared grid |
| Signals | Canonical plan versus local filters, response identity, stale/error/empty states, viewport data and sampling metadata |
| Preparation | Ordered/reversible stages, dependency edits, preview/materialization gate, source/profile recovery and cancellation, rendering cost |
| Correlation matrix | Metric requests, linked-filter scope, sampled previews, Pair plot handoff, keyboard/grid behavior |
| Pair plot | Request/metric state, visible statistics, secondary-response timing, chart lifecycle and summary computation |

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` passed with native Linux Node.
- Focused Vitest run over `features/home`, `features/upload`, `features/prepare`, `features/timeseries`, `features/heatmap`, `features/scatter`, and `cleaning`: **86 files, 682 tests passed**. The log contains happy-dom request-abort/socket teardown noise; no test failed.
- Headless Chrome loaded all six routes against the local application, inspected visible DOM state, and captured screenshots. The smoke pages reported no JavaScript `pageerror` events. This is not a complete visual/accessibility certification.
- Targeted browser probes confirmed stale-file ingest parameters, wrong-file time previews, duplicate upload after visible reset, late Pair plot statistics, and incorrect first-difference summary fields. Ingest requests were intercepted; the active dataset was not replaced.
- A browser-loaded module probe confirmed the double-filter result in F01. Read-only API and current-code Rust probes substantiated the backend failures referenced above.
- Reviewed existing source-aware profile recovery and stale-response guards; those protections are present and are not reported as missing.
- Not run: the complete Playwright suite, mobile/touch regressions, a screen-reader audit, a real database connection, or large-data rendering benchmarks. Captured screenshots could not be inspected through the local image viewer because its sandbox helper failed; findings rely on code, DOM, request payloads, and numerical results rather than inferred visual appearance.

Suggested repair order: F01–F06 together with B01–B06, then source/preview ownership F07–F12, keyboard/table correctness F13–F16, and the measured improvements F17–F20. Add regression tests at the request/response and cross-page boundaries where the current passing tests missed these cases.
