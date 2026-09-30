# EdaTime UI/UX Issues — page-by-page review

**Reviewer:** UI/UX expert review (data-scientist workflows)
**Dataset:** ETTm2 (69,680 rows, 7 numeric columns + date, 15-minute cadence)
**Viewports reviewed live:** desktop 1440×900 (primary); 1024 / 800 / 1920 spot-checks via the previous pass
**Method:** Loaded ETTm2 via the Home sample card, applied `HULL [5.00, 12.00]` column-range filter and a 24h quick range from Signals, navigated every page in the live Vite app, opened every page-level `?` help, the Analysis Context drawer, the Settings modal, the Pipeline Workbench, the Keyboard Shortcuts dialog, and exercised each analysis compute (Causality PCMCI, Spectrum FFT, Drift Daily) end-to-end.

This file reflects a single consolidated review pass that resolves the items confirmed fixed in the previous `issues.md` and `review_gcp.md`, tightens the wording of items that are still outstanding, and surfaces a small set of new issues observed in the current build. Severity is updated to the current state of the live app, not the state when the issue was first filed.

Severity legend:
- **P0** — visible defect that affects first impressions, comprehension, or trust on the happy path.
- **P1** — visible defect that hurts the workflow but is recoverable.
- **P2** — polish / consistency / hierarchy issue that does not block the task.

---

## 1. Overview (Home)

The Overview page now adapts to workspace state, has a `Continue to <last page>` action, a structured Active-workspace card with row / column / span / preparation counts, and sample datasets collapsed into a `Replace with sample data` disclosure. All four P0s in this section are resolved.

**Resolved (removed from this file):**
- "Overview never reflects workspace state" → solved by `initHomeWorkspaceSummary` ([frontend/src/features/home/workspaceSummary.ts](frontend/src/features/home/workspaceSummary.ts)) and the new Active-workspace card.
- "Load a dataset button stays primary" → now reads `Change dataset` when a dataset is loaded.
- "Sample-data cards never become secondary" → collapsed into a `<details>` disclosure with the label `Replace with sample data`.
- "Continue to &lt;last page&gt; mis-targets first visit" → button now defaults to `Explore signals` when no last-page is recorded; only writes after `onNavigationChange`.
- "Recommended-workflow and Advanced-analyses grids identical" → cards now carry `Core path` / `Advanced` chips with distinct accent colors (cyan vs green).
- "Keyboard-shortcuts block dominates Overview" → block is wrapped in a `<details>` disclosure; opens on demand.

**Still outstanding:**

- **P2 — Guided-workflow banner overlap with page header.** When the first-time guided-workflow banner is open on a non-Overview page, the banner sits between the top bar and the page header and obscures the `Focus view` / `Help` row until the user dismisses it. Verified live on Signals after loading ETTm2: the banner reads `Guided workflow · 2/5 · Inspect the selected signals` and sits directly above the page header.
  - **Acceptance criteria**: Either the banner renders below the page header (between header and toolbar) or it docks as a sidebar rail that does not cover the `Focus view` / `Help` controls. The page header remains reachable without dismissing the banner.

- **P2 — "Continue to &lt;last page&gt;" does not appear after using one non-Overview page.** Verified live on a fresh ETTm2 load: after the dataset switch the homepage jumps straight to Signals via the guided-workflow banner, and `Continue to <last page>` is never shown on the Overview after the user has visited one page. Users who finish an analysis and want to return home still have no breadcrumb affordance other than clicking `Overview` in the sidebar.
  - **Acceptance criteria**: A small `Resume from <page>` link appears on the Active-workspace card whenever a non-Overview page was visited in the current session.

---

## 2. Data source (Upload)

This page was not exercised end-to-end in this pass because no new upload was needed (ETTm2 is already loaded from the previous session). Items listed here are carried over from the previous review and were not re-verified in the live build.

**Still outstanding (carried, not re-verified):**

- **P1 — Column-selection in the preview is row-checkbox driven but the checkbox column is very narrow, with no select-all / invert-selection affordance.** Users with many columns have to scroll a long list to manage the subset.
  - **Acceptance criteria**: A header checkbox toggles all rows; an `Invert` button is reachable next to the Selection counter; the checkbox column widens so the cursor has a clear target.

- **P1 — The numeric-type filter pills ("All / Numeric / Datetime") sit to the right of "Selection (All / None)" with no grouping label** tying them to the preview table.
  - **Acceptance criteria**: Pills are grouped under a `Type` label and a `Show` label, with a divider between them and the Selection control.

- **P1 — The Database connection form has placeholder text like `postgres://user:pass@host/db` as the only example.** No in-form explanation of SSL, schema permissions, or time-column expectations.
  - **Acceptance criteria**: An `Examples` link opens a tooltip / disclosure explaining SSL modes, required grants, and how the time column is detected.

- **P2 — Empty-state "Showing current dataset profile." copy is shown when no file has been dropped.** The wording implies a file is loaded when it isn't.
  - **Acceptance criteria**: Copy is replaced with `Drop a file or click Browse to preview columns before loading.` when no preview is active.

---

## 3. Signals (Timeseries)

The Series chip rail, Chart-tools disclosure, Range menu, and Quick-range buttons have all been reworked since the previous pass: chips collapse into a `<details>` summary at narrow widths, Chart-tools defaults closed, the filter band has a text label at the upper edge of the band, and 3-series is the default visible state. The remaining issues are listed below.

**Resolved (removed from this file):**
- "Filter band / y-axis tick overlap" (S-SIG-07 from `review_gcp.md`) → label moved to the upper edge of the band, no longer collides with the `-0.11` tick.
- "Signals chart canvas extends below the visible plot area" (NEW-31) → solved.
- "Series chips wrap into 2 rows at 1024 px" (NEW-33) → collapsed disclosure at narrow widths.
- "Chart tools disclosure default inconsistent" (NEW-34) → closed by default at every width.
- "Filter dialog Apply disabled at data boundary" (NEW-35) → bounds hint label now reads `filter (5.00 → 12.00)` after applying, and the dialog accepts the displayed max.
- "Filter dialog rejects the displayed source-profile max" (NEW-38) → fixed; the dialog accepts `36.44` for HULL on re-open.
- "Filter dialog initial fields marked aria-invalid" (NEW-38) → no longer `aria-invalid` when the displayed value is in-bounds.
- "Chart tools disclosure summary was static" → now reads `Drawing, labels, analytics, zoom, range, export (1 active)` once any group has user-applied state.

**Still outstanding:**

- **P0 — Y-axis title `HUFL, HULL, OT (source units not provided)` is a vertical, fully-spelled column list with an apologetic parenthetical.** Verified live at 1440×900 with HUFL/HULL/OT selected. The axis title reads `HUFL, HULL, OT (source units not provided)` rotated 90° — a column list that does not match the convention of any axis label the user has seen before. The `(source units not provided)` parenthetical is rendered as part of the same vertical string and reads as if the dataset is broken.
  - **Acceptance criteria**: The y-axis title uses the unit when the column has one (e.g. `HULL (°C)`) or `HULL value` when not. The parenthetical is removed, or moved to a separate "Units" legend entry next to the trace legend.

- **P1 — X-axis title `Time (Europe/Berlin)` overlaps the bottom-center tick `29.06.2017`.** Verified live at 1440×900 in both unfiltered and HULL-filtered views. The axis title and the tick sit on the same horizontal pixel line in the chart bottom margin.
  - **Acceptance criteria**: Either the x-axis title moves above the bottom tick row (mirrors the y-axis title position), or the bottom tick row is padded by ≥ 16 px so the title and the tick cannot collide. The title and any tick must not share a pixel of horizontal space.

- **P1 — Series chips for unselected traces (MUFL, MULL, LUFL, LULL) read as text-with-dot in flat pills identical in shape to selected chips.** The only difference between selected and unselected is the chip's color saturation and a thin border. Verified live at 1440×900.
  - **Acceptance criteria**: Selected chips use a solid background tint (e.g. cyan with low opacity) and a border in the trace color. Unselected chips use a neutral surface with a faint outline. The contrast between selected and unselected is legible without color alone — the chip surface also differs.

- **P1 — "Color by" dropdown sits at the right edge of the chip row, separated by ~24 px of empty space and a thin border.** On a wide screen it reads as a disconnected widget, not a Series control.
  - **Acceptance criteria**: Color-by is grouped under the same `Series` label as the chip rail. Visual weight matches the chips. The dropdown caret matches the chip button affordance.

- **P2 — Chart-tools disclosure summary lists 5 group labels but does not name which group is active.** When the only active group is `Range` (after a column-range filter), the summary still reads `(1 active)` and the user has to know which of the 5 groups is `Range`.
  - **Acceptance criteria**: Disclosure summary appends the active group name(s) — e.g. `(Range active)` or `(Range, Annotations active)`. Hovering the disclosure tooltip lists each active group with a one-line description.

- **P2 — "Adaptive clear filters" button only appears once an adaptive filter exists.** First-time users have no idea the feature is available.
  - **Acceptance criteria**: A disabled placeholder reads `No adaptive filters — Ctrl+click a series to start` so the slot is never empty.

- **P2 — Trace legend on the chart (HUFL / HULL / OT) uses plain text buttons with a colored bar but no visible pressed/active affordance.** Verified live at 1440×900: all three legend buttons look identical aside from the color bar fill.
  - **Acceptance criteria**: Pressed legend buttons show a colored background tint matching the bar; unpressed buttons show a neutral surface. The pressed state is also announced via `aria-pressed` (already present) and the visual difference.

---

## 4. Preparation

The preparation page has been worked over: the `Source / Revision / Active stages / Plan status` strip is now a labeled definition list, the page has both a `Preview / Materialize` button and a separate `Open workbench` button, the Ordered-stages list has working `Disable / Up / Down / Remove` buttons with confirmations and tooltips, and the `Preview caption` correctly pluralises (verified live: `After 1 stage: …` and `After 5 stages: …`). The remaining issues are below.

**Resolved (removed from this file):**
- "Pipeline graph cards text-join bug" (P-PREP-01) → spaces between adjacent words in card text.
- "Stage card action row is fragmented" (P-PREP-05) → `Disable / Up / Down / Remove` per stage with confirmations.
- "Use original dataset semantics" (P-PREP-11) → confirmation text uses interpolated count and correct singular/plural.
- "Loading chart toast still fires" (P-PREP-12) → screen-reader-only; no visible toast on Preparation.
- "Section navigation links do not update URL hash" → moved into a labeled `nav` element and the page help explains the in-page anchors.

**Still outstanding:**

- **P1 — The page exposes both an in-page `Open workbench` button and a top-bar `Workbench` button, and the page-level button is the duplicate that the design guide flagged.** Users still have two equally-capable pipeline surfaces (page + modal).
  - **Acceptance criteria**: The page-level `Open workbench` button is removed (the top-bar button is the single entry point to the modal). The Ordered-stages section gains the same preview / materialization controls the workbench has, so users who stay on the page never need to open the modal.

- **P1 — The Ordered-stages `Undo` / `Redo` controls are equal weight with the `Preview / Materialize` action.** A user who is mid-edit (Undo is enabled, Redo is disabled) has no visual cue that one of those is the destructive action.
  - **Acceptance criteria**: `Preview / Materialize` uses the primary button style; `Undo` / `Redo` are ghost buttons; the destructive option (`Remove` on a stage) is colored differently from reorder and edit.

- **P2 — "Graph history" lists only the source baseline.** No way to compare revisions or to delete a specific revision. Users will accumulate history with no cleanup affordance.
  - **Acceptance criteria**: Each revision row has a `Restore` (only if not current) and `Delete` action. A `Compare with current` link opens a diff of the materialized schemas / row counts.

---

## 5. Correlation matrix

The matrix now loads all 7 rows by default, the toolbar is collapsed into a `⋯ More` disclosure at narrow widths, the metric dropdown no longer overlaps the `Matrix` label, the cell-size slider has a numeric tooltip with units, and the `Snap to panel` toggle no longer clips rows. The remaining issues are below.

**Resolved (removed from this file):**
- "Metric dropdown text/label overlap" (CM-CORR-01) → 0 px overlap.
- "Snap to panel / Fit color axis buttons" (CM-CORR-02) → reachable from `⋯ More` disclosure.
- "Cell click opens pair-detail modal" (CM-CORR-03) → `<dialog>` modal with `Close` and `Open in Pair plot`; matrix stays mounted behind.
- "Keep matrix columns pipeline integration" (CM-CORR-07) → reachable from the disclosure.
- "Snap to panel overshoots the viewport" (NEW-32) → all 7 rows visible at every tested width.
- "Visible focus ring on heatmap gridcells" (NEW-26) → white outline + blue box-shadow on keyboard focus.
- "Y / X axis label renders on three lines" → corner cell now reads `Y / X` on a single line via `.heatmap-corner__axis` ([heatmap/page.ts:308](frontend/src/features/heatmap/page.ts#L308)).

**Still outstanding:**

- **P1 — The legend / color scale `+1.0` to `-1.0` sits inside the chart at the top-right and visually overlaps the column label of the rightmost column.** Verified live at 1440×900 with the default clustered order (OT is rightmost): the scale gradient sits directly above the `OT` column label.
  - **Acceptance criteria**: The color scale is moved outside the matrix grid (above or below), with at least 8 px of clearance from the top-row labels. When the scale is below, the matrix height is reduced proportionally so the page does not scroll.

- **P1 — Pair-plot suggestion chips overlap horizontally.** Verified live at 1440×900 after applying the `HULL [5.00, 12.00]` filter: the chip row reads `HULL ↔ LUFL |corr| 0.67ULL ↔ MUFL |corr| -0.61UFL ↔ MULL |corr| 0.58ULL ↔ MUFL |corr| 0.5MULL ↔ OT |corr|` — every chip is glued to the next, with no gap or wrapping. Several chips share horizontal pixels.
  - **Acceptance criteria**: Each chip is a separate rounded pill, separated by ≥ 8 px of horizontal whitespace. When the row would overflow, chips wrap to a second row.

- **P2 — Cells with very negative correlation (e.g. `−0.1441`, `−0.0697`) use pale backgrounds that make the bold numeric label difficult to read.** The label color does not invert on darker cell backgrounds.
  - **Acceptance criteria**: Numeric label color is computed per-cell so it stays WCAG-AA contrast on both pale-blue and deep-red cell backgrounds.

- **P2 — Cells still do not visibly show which cell was clicked from the Pair plot.** After the user navigates Correlation → Pair plot → back, the previously-clicked cell has the `selected` style, but on the *first* cell click the new modal opens and the clicked cell's pressed state is not visible while the modal is open.
  - **Acceptance criteria**: The clicked cell keeps a visible accent (border or persistent highlight) while the pair-detail modal is open, so the user knows which pair they are inspecting.

- **P2 — The histogram on the diagonal renders inside a sub-cell of the matrix.** The bars are so small (≈ 60 px tall, 130 px wide) that the distribution shape is unreadable, especially with the `+1.0000` numeric label inside the same cell.
  - **Acceptance criteria**: Either diagonal cells are exempt from the numeric label, or the histogram bars span the full cell height (the numeric label is moved out of the cell to a corner badge).

---

## 6. Pair plot (Scatter)

The Pair plot now opens as a paired view next to the correlation matrix, the X/Y selectors are explicit, the filter banner names the carried column filter (`HULL [5.00, 12.00]`), suggestion chips render on a single horizontal row, and chip |corr| values match the scatter's Pearson value. The remaining issues are below.

**Resolved (removed from this file):**
- "Back to matrix broken" (NEW-30) → navigates to Correlation matrix.
- "Plot/Matrix toggle persistence" (NEW-29) → persists across navigation and reload.
- "Color column dropdown" (CM-PAIR-02) → reachable from `⋯ More` disclosure in Scatter mode.
- "Suggestion chips and sort toggle" (CM-PAIR-03) → ordered by |r|, with `Sort: |r| desc` toggle.
- "Column dropdown searchbox UX" (CM-PAIR-07) → no visible searchbox at 7 columns.
- "Carry-over banner states a count, not what is carried" (NEW-36) → reads `HULL [5.00, 12.00]`.
- "Suggestion chips vs scatter agree on |r|" (NEW-37) → chips now match the filtered Pearson value.
- "Suggestion chips wrap inconsistently in fallback" (NEW-41) → summary on its own row, chips on one horizontal row.

**Still outstanding:**

- **P1 — The Pair plot's `Pearson r: 0.4843` and `Spearman ρ: 0.6043` pills now appear in two places at once: in the `Correlations` panel and as rows in the `Statistical summary for Scatter chart` table.** Verified live at 1440×900 with a HULL filter: the chart's `Correlations` panel reads `Pearson r: 0.4843` / `Spearman ρ: 0.6043`, and the `Data summary for Scatter chart` table shows the same numbers as separate `Pearson r` / `Spearman ρ` rows. Two renderings of the same data, in two visual treatments.
  - **Acceptance criteria**: When the `Statistical summary for Scatter chart` table is rendered, the chart's `Correlations` pills are hidden. The two views share one source of truth and one presentation.

- **P1 — "Render / Marginal / Selection" controls are reachable only from a `⋯ More` disclosure.** A user who does not know that disclosure exists cannot switch from Density to Scatter, or change the marginal from Histogram to KDE.
  - **Acceptance criteria**: The most-common controls (Render mode, Marginal mode, Link range) are exposed on the main toolbar in Scatter mode. Color column and Outliers remain in the disclosure.

- **P2 — The "Suggestions" panel and the scatter chart can disagree about which columns are being inspected.** When the user picks `X = HUFL, Y = OT` from the dropdowns, the suggestions list continues to show `HULL ↔ MULL |corr| 0.51` etc., but the user may have wanted suggestions about the current scatter pair. The chip `HULL ↔ MULL` does not match the scatter's `HUFL × OT`.
  - **Acceptance criteria**: Either the suggestions are clearly labelled `Other pairs in the dataset` when the X/Y pair is not from the suggestion list, or the suggestions list re-ranks to surface the current scatter pair.

---

## 7. Spectrum (FFT / PSD)

The Spectrum page now has a clean toolbar (Display / Filter / Export / Compute spectrum), a downsampling indicator with a tooltip explaining anti-aliased block-mean sampling, a data summary table, and Top peaks with tooltip on the trend bin. The remaining issues are below.

**Resolved (removed from this file):**
- "Two Compute spectrum buttons" → only one `Compute spectrum` button is reachable; the empty-state copy is text-only.
- "Downsampled to 65,536 of 69,680 points" status has the tooltip `Anti-aliased block-mean sampling bounded this analysis to 65,536 points; this is not zero padding.`
- "Top peaks row 1 was the DC offset" → row 1 is now labelled `Trend` with a tooltip `Record-length trend bin · 0.00 cycles/day · 682.7 days · power 6.85e+0; do not interpret as a stable periodic cycle without detrending.`
- "High Hz spinbutton has no max / min" → `highEl.max = String(nyquistHz)` set on every render in [frontend/src/features/fft/page.ts:657](frontend/src/features/fft/page.ts#L657); `validateFftFilterCutoffs` rejects out-of-range values; tests in [fftControls.test.ts](frontend/src/features/fft/fftControls.test.ts) cover `Cutoff at or above Nyquist — the filter will pass everything`.
- "Data summary table did not show log10 values" → caption now reads `Statistical summary for FFT chart (log10 magnitude)` and Min/Max/Mean match the chart's y-axis.
- "Frequency axis did not show µHz" → x-axis title now reads `Frequency (cycles/day, µHz)`.

**Still outstanding:**

- **P1 — Data summary table `Std` and `Median` columns display `—` em-dashes for every trace.** Verified live at 1440×900 after Compute spectrum: rows read `HUFL 32,769 -4.6308 0.418 -2.1456 — — 0.00%` and `HULL 32,769 -4.5705 0.4659 -2.4217 — — 0.00%`. Std and Median are missing for every trace in the FFT result.
  - **Acceptance criteria**: Std and Median are computed for the log10 magnitude series and rendered with the same precision as Min/Max/Mean. When they are intentionally omitted, the column header reads `Std — not shown for log10` (or similar) so the absence is not read as a bug.

- **P1 — Switching Filter Type back to `Off` does not clear the `lowpass preview active` indicator or revert the chart to the unfiltered spectrum.** Verified live: the indicator persists and the Spectrum chart still shows the filtered magnitudes. Only re-clicking `Preview filter on Signals` clears it.
  - **Acceptance criteria**: When Filter Type = `Off`, the indicator hides, the chart reverts to the unfiltered spectrum, and the Timeseries preview reverts to the source signal. The two pieces of UI agree on whether the filter is applied.

- **P2 — Color-swatch buttons for each trace sit on their own row below the toolbar** with only the trace name and the swatch. There is no inline legend with the chart itself, so the user has to look in two places to know which color is which trace.
  - **Acceptance criteria**: Either the trace swatches appear inline with the chart legend, or the chart legend lists each trace with its color.

---

## 8. Time-frequency (Spectrogram)

The Spectrogram page is the most polished analysis page; the issues below are smaller.

**Resolved (removed from this file):**
- "The bottom legend shows Z-SCORE → [0,1]" → legend now shows the actual scale name from the global color-scale setting.

**Still outstanding:**

- **P1 — Window and Hop dropdowns show truncated text** like `96 (1 day @ …)` / `50% (50% o…)`. Verified live at 1440×900: dropdown summary cuts off with an ellipsis.
  - **Acceptance criteria**: Dropdown summaries render in full (the column can widen, or the truncation threshold increases), or a hover tooltip shows the complete text.

- **P1 — The summary callout (`Sample rate / Nyquist / Time points / Freq bins`) sits inside the chart area at the top-right**, overlapping the actual data. Verified live at 1440×900.
  - **Acceptance criteria**: The summary callout moves outside the chart canvas (above or below), with at least 8 px of clearance from the heatmap.

- **P2 — The sample-rate / Nyquist callout and the High colorbar label both compete for the top-right corner of the chart.** One of them has to be moved or stacked.
  - **Acceptance criteria**: Sample-rate / Nyquist callout is positioned outside the chart canvas; the colorbar remains the only chrome in the top-right.

- **P2 — `Reset` button next to `PNG / SVG / CSV / HTML` is unlabeled about what it resets.** Zoom? Window? Column? Hover shows a tooltip but the iconography is ambiguous.
  - **Acceptance criteria**: Button label is `Reset zoom` (matching the chart-adapter contract) or the icon is replaced with a clear glyph + tooltip.

---

## 9. Causality

The Causality page now renders the discovered graph correctly (verified live with PCMCI on a 7-trace dataset), the chip panel has explicit `aria-pressed` toggles, and `+ Edge / Export / Save Run` correctly toggle disabled / enabled when a result is available.

**Resolved (removed from this file):**
- "Empty state is an enormous dark canvas" → solved.
- "Causality page renders an empty main canvas after a successful run" (NEW-39) → confirmed rendered (verified by reading non-transparent pixel count on the `<canvas>`).
- "Graph node-pair X links ↪ τ… labels overlap" (NEW-47) → labels are now placed at the geometric midpoint with reduced overlap, but see NEW-52 below.
- "Parameters disclosure summary hardcoded HTML" → summary is now method-aware; test in [causal/page.test.ts:131-141](frontend/src/features/causal/page.test.ts#L131-L141) asserts FullCI drops the `PC alpha 0.2 · max conds auto` tokens: `ParCorr · tau 3 · alpha 0.05 · no FDR`.

**Still outstanding:**

- **P1 — The PCMCI `Run discovery` produced `3 nodes and 24 links` for a triangle of HUFL/HULL/OT.** Verified live at 1440×900. A 3-node triangle with τ_max = 3 can produce at most ~18 directed edges (3 pairs × 2 directions × 3 lags). 24 edges is inconsistent with the algorithm and suggests either an off-by-one in link counting or double-counting per direction. The success toast reads `PCMCI: graph updated with 3 nodes and 24 links` regardless.
  - **Acceptance criteria**: The link-count in the toast matches the count of unique `(source, target, lag)` triples returned by the backend. A test asserts `edges.length === unique edges by (source, target, lag).length`.

- **P1 — The rendered causal graph is centered in the canvas but occupies ~30% of the area.** Verified live at 1440×900 with the FullCI default 7-node, 23-link graph. Massive empty space around a small triangle. The graph and its legend sit at the center; the chart is not laid out as the dominant visual element.
  - **Acceptance criteria**: The graph layout fills ≥ 70% of the canvas width and height. Nodes are sized relative to the canvas, not to a fixed pixel size, so the graph is the dominant visual element on every viewport.

- **P1 — Two notifications overlap after a successful run.** Verified live at 1440×900 after `Run discovery`: the `ℹ PCMCI: running causal discovery…` toast stays visible behind the `✔ PCMCI: graph updated with 3 nodes and 24 links` toast for several seconds. Both are in the top-right corner and the success toast covers the info toast's text.
  - **Acceptance criteria**: When a result toast appears, the corresponding info toast is dismissed automatically. Only one causal notification is visible at any time.

- **P2 — Causal-node edit modal `Close` button is intercepted by `.causal-edit-header`** (NEW-49). Verified live at 1440×900 with Playwright: the `<div class="causal-edit-header">` overlays the `Close` click target.
  - **Acceptance criteria**: Mouse click on `Close` dismisses the modal. The header div does not overlap the Close button's hit area.

- **P2 — Run Comparison `✕` delete button is intercepted by `.causal-run-item`** (NEW-50). Same pattern as the edit-modal Close.
  - **Acceptance criteria**: Mouse click on `✕` removes the run from the list (with a confirm if no other path).

- **P2 — Pair-edge detail panel has no close button** (NEW-51). The user can switch panels by clicking another edge but cannot dismiss the panel.
  - **Acceptance criteria**: Panel can be dismissed by close button, backdrop click, or `Escape`. When dismissed, the graph is fully visible.

- **P2 — Trace-legend chip click silently deselects the trace from the discovery** (NEW-48). Verified live at 1440×900 with HUFL pressed: clicking HUFL in the chip rail toggles it off, and a subsequent Run discovery excludes HUFL. No tooltip, no confirmation.
  - **Acceptance criteria**: Hovering a chip shows a tooltip like `Include HUFL in causal discovery`. Clicking when fewer than 2 traces would remain selected prompts a confirmation or is refused.

- **P2 — Parameters disclosure is expanded by default and shows both the summary line (`ParCorr · tau 3 · alpha 0.05 · PC alpha 0.2 · max conds auto · no FDR`) and the underlying controls (`Test / τ max / α / PC α / Max conds / FDR`).** Verified live at 1440×900. The summary line is redundant with the visible controls.
  - **Acceptance criteria**: When expanded, the summary line is hidden. When collapsed, only the summary is shown. The chevron reflects the current state without showing both views at once.

---

## 10. Drift

Drift now has the right tab structure (Timeline plots / Overview / Segments / Quality / Relationships), the Overview tab renders all 7 traces in Top features / Change points / Method reliability (NEW-40 closed), and the `Method reliability warning` banner shows reference-vs-window imbalance messaging. The remaining issues are below.

**Resolved (removed from this file):**
- "Drift Overview panels truncate to 5" (NEW-40) → 7 of 7 cards in every panel on the Overview tab.
- "Method reliability cards truncate to 5" → also 7 of 7 on Quality tab.
- "Timeline plots warning strip shows only 5 change-point pills" → `drift-change-point-chip` chips now render all supplied change points; test in [drift/summaryPanels.test.ts:105](frontend/src/features/drift/summaryPanels.test.ts#L105) asserts length 7.
- "Filter traces by drift status showed 0 counts" → tabs now read `Run analysis to see drift counts` until the analysis runs, then animate up.

**Still outstanding:**

- **P1 — Top-features cards on the Overview tab are visually identical for every column.** Live at 1440×900 with a Daily / First 50% / Later windows run: all 7 cards show `Score: 100`, `Flagged windows: 363`, `First change: 2017-06-28T19:52:00+00:00`. Only the column name differs. The cards give the user no way to rank or differentiate the columns.
  - **Acceptance criteria**: The Top-features cards show at least one column-differentiating metric (e.g. PSI value, Wasserstein value, or trend direction). The user can rank-order the cards by score or by another metric.

- **P1 — Method-reliability cards on the Quality tab are also visually identical for every column.** Live at 1440×900: all 7 cards show `1 warning` and the identical sentence `Reference is 363× the average window size — PSI/KS may be inflated. Try a longer window or a shorter reference.`
  - **Acceptance criteria**: Method-reliability cards aggregate the warning into a single summary card (e.g. `All 7 columns share the same warning: reference too large`), or differentiate by listing the per-method (PSI / KS / Wasserstein / ES) reliability scores per column.

- **P1 — Change-points cards on the Overview tab truncate the time range mid-timestamp.** Verified live at 1440×900: cards read `HUFL 2017-06-28 19:52 - 2017-06-29 1...`, `MUFL 2017-06-28 19:52 - 2017-06-29 19:...`, `MULL 2017-06-28 19:52 - 2017-06-29 19:5...`. The end timestamp is cut off because the card width is too narrow for both timestamps at full precision.
  - **Acceptance criteria**: Each card fits the full time range with no mid-timestamp break, OR the time range is moved to a second row with explicit `Start` / `End` labels, OR the cards widen when fewer than 7 are shown.

- **P2 — `Latest / Worst / First change` radio buttons sit next to a distribution-mode combobox and a trace combobox** — three related controls crammed into one header row of the `Selected trace evidence` panel.
  - **Acceptance criteria**: The three controls are reorganized into two labeled groups (`Window / Trace` and `Distribution`), with vertical separation.

- **P2 — Drift Overview status banner says `Drift analysis complete. 2541 of 2541 windows flagged. Every window is flagged; consider relaxing thresholds or using a longer baseline.` even though a method-reliability warning is also visible at the top.** Two parallel warnings about the same root cause. The user has to read both to understand the recommended next action.
  - **Acceptance criteria**: One of the warnings absorbs the other (the method-reliability banner carries the suggested action), or the banner text links the two together.

---

## 11. Analysis Context drawer

The Analysis Context drawer has been completely redesigned: it now shows the active dataset, time range, selected series (with removable pills), numeric filters (with column and range), preparation plan, and a `Clear analysis context` button. **Escape closes the drawer**, addressing the highest-impact item from the previous pass.

**Resolved (removed from this file):**
- "Drawer does not close with Escape" → verified: pressing Escape with the drawer open closes it (and returns focus to the toggle button).
- "Drawer has no Clear / Reset button" → `Clear analysis context` button at the bottom of the drawer.
- "Selected Series pills were not interactive" → each pill is now a button `Remove <column> from selected series`.
- "Drawer does not show preparation-plan summary, filter count, or active time range scope" → Time Range / Numeric Filters / Preparation plan sections all present.

**Still outstanding:**

- **P2 — The drawer covers the right ~25 % of the page when open.** On Drift, the color legend / status row; on Pair plot, the Pair-plot right panel; on Correlation matrix, the right-side toolbar — all are partially obscured.
  - **Acceptance criteria**: Either the drawer width is reduced to ~20 % of the viewport with a `Pin` affordance to keep it open, OR the drawer becomes a floating card anchored to the top-right that does not push page content.

- **P2 — The drawer header is `Analysis context` but the top-bar toggle is also labelled `Analysis context`** with a small `(i)` glyph. The icon is the same one used for inline help (`?`), which can confuse users into thinking the drawer is a help panel.
  - **Acceptance criteria**: Toggle uses a unique icon (e.g. side panel glyph), distinct from the `?` help icon.

- **P2 — When the drawer is open on Drift Overview, the rightmost column of change-point cards is hidden behind the drawer.** Verified live at 1440×900: `MUFL 2017-06-28 19:52 - 2017-06-29 1...` is partially obscured.
  - **Acceptance criteria**: Either the drawer docks to the right edge without covering content (the page content area shrinks to accommodate), or the drawer becomes a popover that does not push page content.

---

## 12. Pipeline Workbench (modal)

The workbench has been reworked: the destructive `Use original dataset` action now has a confirm dialog that interpolates the count and uses correct singular / plural, `Restore baseline` has a confirmation, and the inline page card and workbench card agree on text. The remaining issues are below.

**Resolved (removed from this file):**
- "Pipeline graph cards text-join bug" (P-PREP-01) → solved on both surfaces.
- "Use original dataset semantics" (P-PREP-11) → solved.
- "Restore baseline selects the source revision without confirmation" → confirmation dialog.

**Still outstanding:**

- **P1 — The workbench still duplicates the page's pipeline view.** The action button `Open workbench` on the Preparation page launches this modal; the page's own Ordered-stages section is a separate but equivalent editor.
  - **Acceptance criteria**: Either remove `Open workbench` from the page, or make the workbench a focused editor with only the actions the page cannot show (preview, materialize, restore baseline, export).

- **P1 — The footer actions (`Undo / Redo / Add visible time range / Preview / Restore source dataset / Create prepared dataset`) sit in a single row with no visual hierarchy.** Verified live at 1440×900: 6 buttons of equal weight. `Create prepared dataset` is the primary action but is not styled differently from `Add visible time range` or `Undo`.
  - **Acceptance criteria**: `Create prepared dataset` uses the primary button style (filled, accent color); `Restore source dataset` uses the destructive style (red text/border); `Undo` / `Redo` are ghost buttons; `Add visible time range` and `Preview` are secondary.

- **P2 — `Graph history` only shows the source baseline with a disabled `Delete` action.** No `Restore` action (it would be redundant for the only revision). No `Compare with current` affordance.
  - **Acceptance criteria**: After a second revision exists, each row has a `Restore` action (only on non-current) and a `Delete` action. A `Compare with current` link is reachable from each row.

---

## 13. Settings (modal)

The Settings modal now has clean tabs (`Appearance / Color scales / Analysis defaults / Chart labels / Export`), the Color scheme dropdown has preview swatches (Dark / Light / High contrast / Colorblind-safe), and the Chart palette swatches show 12 colors.

**Resolved (removed from this file):**
- "Tab labels are vague" → tabs are now descriptive.
- "Chart palette has no preview" → swatches shown next to the dropdown.
- "Settings modal ignores Escape and click-outside" → both wired via shared `createModalController` in [frontend/src/ui/shell/createModalController.ts](frontend/src/ui/shell/createModalController.ts) (Escape closes; backdrop click on `event.target === modal` closes). Settings, help, and column-filter modals all use this controller.

**Still outstanding:**

- **P2 — `Color scheme` preview swatches are tiny (≈ 16 px).** At 1440×900 the Dark / Light / High contrast / Colorblind-safe chips are not distinguishable.
  - **Acceptance criteria**: Preview swatches enlarge to at least 24 × 24 px and have a label visible on hover or below the chip.

- **P2 — `Layout density` is set to `Spacious` with no visible preview of what `Compact` looks like.** The hint text says "Density changes are previewed live across the workspace before you apply." but the preview only kicks in after Apply.
  - **Acceptance criteria**: Changing the dropdown actually previews the density in the workspace (without committing), and the previous density is restored on Cancel.

---

## 14. Keyboard Shortcuts dialog

The dialog lists ~15 shortcuts grouped by feature area (Move around / Inspect & edit / Save & export). The remaining issues are small.

**Resolved (removed from this file):**
- "Press ? to toggle this help, or Esc to close." was muted inline text → now uses `kbd`-style chips for `?` and `Esc` and is visible on its own row at the bottom of the dialog.
- "There was no search/filter input" → dialog now has a `Search shortcuts…` searchbox at the top that filters by both label and key combination.

**Still outstanding:**

- **P2 — The Drift-specific shortcuts (`Enter / D` for Run, `E` for Export CSV, `J / P` for JSON / PNG) are missing from the dialog.** Verified live at 1440×900: the dialog shows only Move around / Inspect & edit / Save & export, no Drift group. The Home page's shortcuts disclosure still lists a Drift group with those keys.
  - **Acceptance criteria**: The keyboard shortcuts dialog surfaces page-specific shortcut groups (Drift, Causality, FFT, Spectrogram, etc.) under a `By page` section, with at least the Drift group visible by default.

---

## 15. Sidebar / Navigation

The sidebar still has the two-group structure (`Workspace` / `Spectrum & diagnose`) and the alt-key shortcuts `⌥1`–`⌥3`, `⌥6`–`⌥0`. `⌥4` (Correlation matrix) and `⌥5` (Pair plot) are not shown in the visible labels, although the keyboard help dialog mentions them.

**Resolved (removed from this file):**
- "Spectrum & diagnose section label is the only category label" → both groups (`Workspace` and `Spectrum & diagnose`) now show the label.

**Still outstanding:**

- **P1 — Sidebar item shortcut hints show `⌥1`, `⌥2`, `⌥3`, `⌥4`, `⌥5`, `⌥6`, `⌥7`, `⌥8` only inside the Home page card labels.** Verified live at 1440×900: the sidebar item buttons themselves do not show the alt-key hint; only the page-level Home cards do. Users who navigate via keyboard have no in-sidebar reference.
  - **Acceptance criteria**: Every sidebar item either shows its alt-key hint as a small trailing glyph, or none does. The current "in Home only" state is inconsistent.

- **P1 — `Collapse` item at the bottom of the sidebar is styled identically to a navigation item.** Its icon is the same hamburger as the mobile sidebar toggle.
  - **Acceptance criteria**: `Collapse` uses a chevron / double-chevron icon and is visually grouped with `Settings` (as a layout control, not a navigation item).

- **P1 — `Settings` is at the bottom of the sidebar, separated by an empty gap from the analysis pages.** Users looking for app-level preferences have to scroll.
  - **Acceptance criteria**: `Settings` is grouped with the analysis pages (so the user discovers it during normal browsing) OR is positioned at the top of the sidebar under the brand.

- **P2 — All sidebar icons use the same stroke weight and fill style** but mean very different things (chart vs causal graph vs drift bars).
  - **Acceptance criteria**: Each icon uses a domain-distinct pictogram (line chart, network, bar chart, calendar heatmap, etc.) so the sidebar reads as a visual index.

- **P2 — The active sidebar state indicator (blue background) does not extend the full row width.** Verified live at 1440×900: the active item has a coloured icon and a coloured label, but the background highlight stops at the icon.
  - **Acceptance criteria**: The active row has a coloured background that spans the full sidebar width.

---

## 16. Top bar / app shell

The top bar has been streamlined. The dataset switcher, the freshness indicator, the workflow banner, the workbench button, the analysis-context toggle, and the help / settings actions are present.

**Resolved (removed from this file):**
- "Preparation button in the top bar is the same label as the sidebar item" → top-bar button now reads `Workbench` (open preprocessing pipeline workbench) instead of `Preparation`.
- "Guided workflow enabled toast is low contrast" → toasts now render in the unified top-right container with `aria-live="polite"` and a Dismiss button.
- "Freshness indicator only showed `—`" → now shows `Updated N min ago` after the first compute; chip is `UPDATED 19 MIN AGO` in the verified live state.

**Still outstanding:**

- **P1 — The top-bar button row mixes text labels (`Guide`, `Workbench`, `State`) and icon-only actions** (data switcher, keyboard shortcuts, settings, app actions). The visual weight is inconsistent.
  - **Acceptance criteria**: Either every top-bar action has a text label, or only icon-only actions are used. Mixing the two creates a noisy header.

- **P1 — The `State` text label is much longer than the other labels**, and breaks the visual rhythm of the row.
  - **Acceptance criteria**: `State` is shortened (e.g. `Context`), abbreviated, or moved into a single icon-only button.

- **P2 — `Analysis workspace` is the only label in the top-left; the brand `EdaTime` lives in the sidebar.** The header does not communicate product identity on smaller screens where the sidebar is collapsed.
  - **Acceptance criteria**: A small brand mark (logo or wordmark) appears in the top-left on every viewport.

---

## 17. Cross-cutting concerns

### 17.1 First-time experience
- **P0 — There is no onboarding flow.** A new user lands on Overview with no instructions. The `Change dataset` button and `Continue to <last page>` button are the only onboarding cues, and `Continue to <last page>` is invisible until they visit at least one analysis page.
  - **Acceptance criteria**: A first-run toast or banner appears the first time the user loads a dataset: `Welcome to EdaTime. Try Signals to inspect your data, or Preparation to clean it. Open the (?) Help on any page for control-by-control guidance.` The banner dismisses on click and never returns unless the user clears their session.

### 17.2 Mode / state changes
- **P1 — `Reset` buttons on each chart mean different things** (Signals: zoom; Spectrogram: window/hop; Drift: thresholds). They are all labelled `Reset`.
  - **Acceptance criteria**: Each `Reset` button label reflects its scope (`Reset zoom`, `Reset window`, `Reset thresholds`).