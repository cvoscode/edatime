# EdaTime — Usage Issues Found as a Data Scientist with ETTm2

**Date:** 2026-06-28
**Tester role:** Data scientist
**Dataset:** `ETTm2.csv` (69,680 rows, 8 columns — `date`, `HUFL`, `HULL`, `MUFL`, `MULL`, `LUFL`, `LULL`, `OT`, sampled every 15 min from 2016-07-01 to 2018-06-26)
**Environment:** `http://127.0.0.1:5173/#page=…` (dev server, WebGPU active)
**Scope:** End-to-end walkthrough of home → upload → timeseries → correlations → scatter → FFT → spectrogram → upload/profile, plus cross-page UX issues found while exploring the dataset.

This file lists everything I bumped into as a data scientist exploring ETTm2. Issues are grouped by impact and by page, with one-paragraph "as a data scientist" context for each. They are all *behavioral/UX/visual* — no code changes were made during the audit.

---

## Severity legend

| Level   | Meaning                                                                   |
| ------- | ------------------------------------------------------------------------- |
| **H**   | Breaks an expected EDA workflow or produces visibly wrong results.        |
| **M**   | Confusing or unprofessional — wastes time, hides information, or looks off. |
| **L**   | Polish / discoverability issue; can be ignored once the user knows the app. |

---

## TL;DR — remaining issues

Issues that have been **addressed** since this audit were written:

| # | Section | Issue (summarized) | Resolution |
| - | ------- | ------------------ | ---------- |
| 1.1 | §1.1 | OT/HUFL share same color `#00d4ff` | Fixed — `SERIES_COLORS` expanded to 12 colors + dedicated target accent for OT |
| 1.2 | §1.2 | Palette has only 6 colors for 7 series | Fixed — now 12 distinct colors in `seriesColors.ts` |
| 1.3 | §1.3 | Cross-page color palettes inconsistent | Fixed — all pages reference shared `SERIES_COLORS` from `utils/seriesColors.ts` |
| 2.1 / 3.1 | §2.1, §3.1 | Scatter "Suggestions" panel hard-coded threshold with empty suggestions for ETTm2 | Fixed — `renderTopPairs()` surfaces globally ranked pairs; X/Y biased to strongest pair on first load |
| 2.6 | §2.6 | Strong-negative pairs not flagged | Fixed — top-pair pills get a `.negative` class and sign indicator (−) for ≤ −0.5 |
| 3.2 | §3.2 | Scatter X/Y defaults to HUFL/HULL instead of strongest pair | Fixed — `refreshCorrelationsAndSuggestions()` biases to top pair on first load |
| 4.1 | §4.1 | FFT X-axis too narrow, daily/weekly cycles invisible | Partially fixed — max_points raised to 131072 and dominant peaks with period labels now shown in a spectral info panel below the chart |
| 4.3 | §4.3 | High/Low Hz inputs non-functional without filter type | Fixed — `syncFilterCutoffInputs()` disables Low/High Hz based on filter type with descriptive title hints |
| 4.4 | §4.4 | Clip controls disabled by default, no clear reason | Fixed — proper enable/disable logic with hint titles shown when Outliers is off |
| 4.5 | §4.5 | Toggle chips have no visual "active" state until after FFT computes | Fixed — loading class + `aria-disabled` on chips during fetch; placeholder suppressed while loading |
| 6.1 | §6.1 | Date column min/max truncated and timezone-shifted | Fixed — `formatProfileValue()` now uses ISO 8601 (`toISOString()`) with UTC label |
| 7.8 | §7.8 | Toasts disappear too quickly to read | Fixed — durations bumped: success=5200ms, info/warning=6000ms, error=sticky |

Remaining unresolved issues follow below.

---

## 1. Timeseries page

### 1.4 [M] The famous ETTm2 spike on 2017-04-17 is clipped at the chart's top edge

**As a data scientist:** The spike (HUFL = 107.89, MULL = 28.7) is exactly the kind of anomaly ETTm2 is famous for. The default Y-axis (0–107.89) makes the spike a flat horizontal line going off the top, and the "step" I see near 30.03.2017 is the climb into the spike being drawn against the ceiling. The spike should be the *hero* of the chart, not a clipped line.

**Evidence:** API confirms max(HUFL) = 107.89; the chart's Y-axis ends at 107.89 (from the metadata); the line is drawn at the top edge.

**Suggested fix:** Add 5–10% headroom to the Y-axis auto-range, or apply a winsorized percentile-based Y-range (e.g., 1st/99th percentile) with a visible marker for clipped points.

### 1.5 [M] The X-axis shows wall-clock dates, but the dataset's `date` column is UTC ms

**As a data scientist:** ETTm2's `date` column is recorded in UTC. The chart renders axis ticks in the local timezone. This is fine in most regions, but it is worth making this explicit in a tooltip or in a small "timezone: UTC" label so an analyst does not get bitten by +1h / +2h shifts.

### 1.6 [M] No way to focus on a single time window of ETTm2 from the page

**As a data scientist:** The 30.03.2017 spike is interesting but it is one data point among 70K. A common first step is to zoom into "the last 7 days" or "the spike period". The toolbar does have a zoom slider, but the chip filter / time-range controls are nested and not discoverable.

**Suggested fix:** Add quick presets ("Last 24h", "Last 7d", "Last 30d", "Around spike") in the chart toolbar.

### 1.7 [M] Y-axis tick labels show 5-digit precision (`49.26`, `78.57`, …) — fine — but no unit label

**As a data scientist:** ETTm2 columns are unitless in the CSV (or carry hidden units). Showing "OT (°C?)" or "HUFL" on the Y-axis would help. Currently the Y-axis is unlabeled.

### 1.8 [L] Toast "Data updated on timeseries page." fires on every chip toggle

**As a data scientist:** Toggling OT triggers a toast that says only "Data updated on timeseries page." It is non-informative and fires for every change. A user with the screen reader on hears it constantly.

**Suggested fix:** Either drop the toast (the visual chip change is enough feedback) or only show it on first paint.

### 1.9 [L] "Viewing 100%" zoom label never updates on chip toggle

**As a data scientist:** The zoom indicator says "Viewing 100%" even though I clearly have all 70K points on screen. The "100%" claim is technically the *initial* view, but it stops reflecting my actual zoom level after I pan or zoom.

### 1.10 [L] `Clear Filter` is visible even when no filter is active

**As a data scientist:** The "Clear Filter" button is rendered unconditionally, but if no filter is set, clicking it is a no-op. It should be hidden or disabled when there is nothing to clear.

---

## 2. Correlations page

### 2.2 [M] Metric selector shows "Pearson · Raw aligned v..." (truncated)

**As a data scientist:** The label is cut off with an ellipsis on the dropdown — I cannot tell which variant of "Pearson" is currently active (Pearson · raw aligned vs Pearson · differenced vs Spearman, etc.).

**Suggested fix:** Widen the dropdown or shorten the labels ("Pearson (raw)", "Pearson (Δ)", "Spearman", …).

### 2.3 [M] Clustered column labels are tiny and vertical

**As a data scientist:** When "Group similar" is on, the columns reorder (HUFL, LUFL, HULL, MULL, OT, LULL, MUFL), but the labels are so small and rotated that I have to squint to read them. A larger label area or hover tooltips with the full correlation value would be friendlier.

### 2.4 [M] No "click cell to jump to scatter" affordance

**As a data scientist:** The matrix is the natural launching pad for scatter — clicking a high-corr cell should populate X/Y. Currently I have to switch to scatter, change the dropdowns, and lose context.

### 2.5 [L] "Group similar" toggles row + column clustering but there is no legend explaining the resulting order

**As a data scientist:** It is not obvious *why* HUFL and LUFL are next to each other in the clustered order. A small caption or hover-tooltip with the within-cluster order would help.

---

## 3. Scatter page

### 3.3 [M] Density colorbar label "DENSITY (VIRIDIS)" is rotated 90° on the right edge

**As a data scientist:** The vertical text is fine, but it is clipped against the right edge of the chart on smaller viewports (visible in the screenshot — the last few characters of the rotated label disappear).

### 3.4 [M] Marginal histograms (top + right of density plot) only show one of the two variables

**As a data scientist:** The top marginal shows HUFL's distribution; the right marginal shows HULL's. The right marginal is very faint (almost invisible in the screenshot) because it is rendered at the same Y-range as the heatmap. Increasing the marginal plot's contrast / line width would help.

### 3.5 [L] "Raw aligned values · 69680 aligned pairs" label is correct but doesn't say what "aligned" means

**As a data scientist:** A small tooltip or footnote explaining that "raw aligned" means no interpolation / time-shift between the two series would be a nice touch.

### 3.6 [L] Switching to "Scatter (points)" mode would benefit from a "color by" hint next to the dropdown

**As a data scientist:** I can see a "Color by" control on the toolbar in the screenshot, but the affordance is buried in the row above the chart. The scatter "points" mode is exactly where the color-by column matters most.

---

## 4. FFT page

### 4.2 [M] Y-axis labels show 7-digit precision (`0.84792778`, `-0.45719733`, …) and the unit label "log10(Magnitude)" overlaps the tick labels

**As a data scientist:** The Y-axis is unreadable. Tick labels like `0.84792778` should round to `0.85` or `0.8`, and the rotated "log10(Magnitude)" text overlaps them.

**Suggested fix:** Format tick labels to 1–2 decimal places; widen the left margin to give the rotated label breathing room.

### 4.6 [L] No window-overlap control

**As a data scientist:** Most STFT tools expose a hop size or window-overlap control. Right now the FFT page only has a window size dropdown — no hop control.

### 4.7 [L] "Filter" type dropdown offers spectral filter options but does not show a preview until the user clicks Preview

**As a data scientist:** This is OK, but the Preview button is small and the result is rendered on the timeseries chart (a hidden page). A user toggling Filter on the FFT page expects to see the effect on the FFT plot.

---

## 5. Spectrogram page

### 5.1 [H] Clicking "Compute" updates the colorbar but the heatmap does not render

**As a data scientist:** I picked HUFL, window = 256, clicked Compute, and the placeholder text "Pick a numeric column and click Compute to generate the spectrogram." remains visible. The colorbar updates with values, suggesting the API call succeeded and the data is in hand, but the canvas does not show a heatmap. This is the same class of issue called out in `issue.md` (Issue #3).

**Evidence:**
- API `GET /api/analytics/spectrogram?…` with `start`, `end` as ISO datetimes returns 200 + 657 KB of JSON.
- The frontend's `fetchSpectrogram(startIso, endIso, column, winSize)` builds the URL with whatever the page passes; the rendered canvas stays empty.

**Suggested fix:** Add console logging for the spectrogram draw path, ensure the chart container has non-zero height before `setOption`, and surface a clear toast on failure (the current silent failure is the worst kind).

### 5.2 [M] "Clip method" and "Clip %" controls are disabled until "Outliers" is checked, but the chip is far below

**As a data scientist:** Same affordance issue as the FFT page (§4.4). The chip order (Outliers → Clip method → Clip %) is sensible, but a user must hunt for Outliers.

### 5.3 [M] Default "Window" is 256, but a 15-min dataset over 2 years with window 256 produces only 1 bin per ~2.5 days — the spectrogram is too coarse to see daily cycles

**As a data scientist:** The default window size of 256 samples (= 64 hours) means the spectrogram has very low time resolution. For ETTm2 a window of 96 (1 day) or 672 (1 week) is more meaningful.

**Suggested fix:** Provide window-size presets labeled in real-world units ("1 hour", "1 day", "1 week") and pick a sensible default for the dataset's sampling rate.

### 5.4 [L] No way to compare two columns side-by-side in the spectrogram

**As a data scientist:** A common EDA question is "do HUFL and OT share the same time-frequency structure?" The page is single-column; a 2-column mode would be very useful.

### 5.5 [L] The colorbar has "High · 1.264" and "Low · -3.234" floating labels that look like debug output

**As a data scientist:** Two extra labels (`· -2.110`, `· 0.140`) appear alongside the High/Low text — they look like leaked tooltips. Should be cleaned up to show only min/max with units.

---

## 6. Upload / Profile page

### 6.2 [M] "Upload & Ingest" button is enabled even before any file is selected

**As a data scientist:** Clicking it with no file selected does nothing visible. It should be disabled until a file is picked (or a database is connected).

### 6.3 [M] Database tab is visible to data scientists loading a CSV

**As a data scientist:** When working with local CSVs, the Database tab is a distraction. It would be friendlier to hide it (or move it to a settings menu) for the common case.

### 6.4 [M] Profile columns are not sortable

**As a data scientist:** The column profile table has a `↑` next to "COLUMN" (which I assume is a sort indicator) but clicking it does nothing. I cannot sort by name, dtype, null count, or range.

### 6.5 [L] No way to see distribution cards (histogram, KDE, box) for numeric columns from the profile

**As a data scientist:** The chip rail and the histogram in the metadata are great, but per-column distribution cards would help. (Noting: the home page mentions "Distribution cards (histogram/KDE/box) for numeric columns" as a feature — but they don't seem to appear in the profile grid.)

### 6.6 [L] No filter for "numeric only" or "datetime only" in the profile

**As a data scientist:** A small pill toggle "Show only numeric" would make the 7-of-8-column case more focused.

### 6.7 [L] The "All / None" pill is hidden behind the "Filter columns" input on narrow widths

**As a data scientist:** On a 1440px viewport this is fine, but at 1280px the "All/None" buttons get pushed under the search input.

---

## 7. Cross-cutting UX / accessibility

### 7.1 [H] Analytics drawer close button is off-screen on a 1440×1024 viewport when the chart is at 100% zoom

**As a data scientist:** I had to dismiss the analytics drawer via `document.getElementById('analytics-close-btn').click()` because Playwright reports "element is outside of the viewport". This is a real accessibility bug — a sighted user with a 1366×768 laptop would also fail to reach the close button.

**Evidence:** `locator.click: Timeout 10000ms exceeded … element is outside of the viewport`.

**Suggested fix:**
- Pin the drawer's close button to the visible region of the drawer (e.g. make the drawer `position: sticky` internally).
- Or use a modal backdrop so clicking outside the drawer closes it.

### 7.2 [H] Timeseries chart legend overlaps with the data area for series with long names

**As a data scientist:** The chart's right-side legend (HUFL, HULL, MUFL) sits over the actual data, and the rightmost data points (e.g. 26.06.2018 area) are partially hidden behind the legend. With more than 4 series the problem gets worse.

**Suggested fix:** Put the legend in the toolbar (above/below the chart) like the FFT page does, or auto-shrink the plot area to make room for the legend.

### 7.3 [M] The "Draw" toolbar shows "TOOL" + "COLOR" + "WIDTH" + "Clear" + "Clear Filter" — the "Clear" and "Clear Filter" buttons are visually indistinguishable

**As a data scientist:** "Clear" (clears drawing) and "Clear Filter" (clears adaptive filters) are both text buttons with no icon. Easy to mis-click.

**Suggested fix:** Add icons or labels like "Clear drawings" / "Clear filters".

### 7.4 [M] The header buttons (keyboard shortcuts, settings, theme, context) use icons only — no tooltips or aria-labels visible

**As a data scientist:** A new user has no idea what the keyboard icon, gear, sun/moon, or "Context" buttons do without hovering. (The ARIA labels exist, but they are not visible as tooltips on hover in my testing.)

### 7.5 [M] The "Guide" button label is misleading

**As a data scientist:** The "Guide" toggle says it toggles "guided workflow" — but in the home page there is no actual guided workflow overlay; instead the page just renders the same content with a `pressed` state. I never saw a guided overlay.

### 7.6 [M] Y-axis label on FFT chart overlaps the tick labels

Cross-references **4.2** — the rotated "log10(Magnitude)" text crosses the numeric tick labels.

### 7.7 [L] Several buttons have only icons (no text), making the app harder for a data scientist new to the tool

**As a data scientist:** Most EDA tools label their buttons. Icons-only is fine for power users but raises the learning curve.

### 7.9 [L] "Settings" page button in the sidebar navigates to a route, but the page is empty — it should either open the settings modal or show a placeholder

**As a data scientist:** Clicking the gear icon in the sidebar goes to `#page=settings`, but the main panel is empty. I expect the modal to open or a "Settings are a modal — open with this button" notice.

### 7.10 [L] The "Context" button in the header is not explained anywhere

**As a data scientist:** The "Context" label is too generic. The home page intro says "Analysis context panel" but I never saw a context panel pop up.

---

## 8. Sample-data / onboarding

### 8.1 [M] Loading ETTm2 puts 3 chips active (HUFL, HULL, MUFL) — not OT

**As a data scientist:** The default timeseries view is HUFL, HULL, MUFL. Given OT is the canonical ETTm2 target, the default should probably be HUFL + OT (one feature, one target) so a data scientist immediately sees the prediction problem.

### 8.2 [L] The "ETTm2 Sensor Data" tile says "7 columns" — the CSV has 8 columns including `date`

**As a data scientist:** Minor inaccuracy. The card says 7 columns, but the dataset has 8 (date + 7 numeric). I would expect 8.

### 8.3 [L] No "click here to load this dataset's first 1000 rows" preview

**As a data scientist:** Loading a 70K-row dataset takes a few seconds. A "preview" button (similar to the upload preview) would let me decide faster.

---

## 9. Data-science-specific observations about ETTm2

These are not bugs in the app, but **insights that a data scientist would expect to surface immediately** and that the app does not actively help with:

| Observation | Where I expected to see it |
| --- | --- |
| HUFL max = 107.89 is a 2-sigma outlier (≥ 99.9th percentile). | A "Spikes" badge on the metadata bar, or a marker on the timeseries chart. |
| MULL spike on 2017-04-17 is concurrent with the HUFL spike (transformer event). | A "coincident events" badge, or at least a vertical line at the spike date. |
| HULL ↔ MULL = 0.91 is by far the strongest pair. | Already surfaced on scatter page via top-pairs panel (§2.1 fixed). |
| LULL ↔ MUFL = -0.60 is a strong negative (low-useful vs mid-useful). | Already flagged in top-pairs with sign indicator (§2.6 fixed). |
| OT correlates weakly with everything (≤ 0.5) → possibly a "near-target, low-predictor" finding. | A "OT correlation matrix" or a "best predictor of OT" callout. |
| The dataset's 7 numeric series have **very different scales** (HUFL max 107.89, MULL max 29.81, LULL max 3.73). | A "normalize before plotting" toggle in the chart toolbar, or a per-axis scale option. |
| 96 samples/day × 730 days = 70,080 expected rows. The CSV has 69,680 — a 400-row gap. | A "missing timestamps" badge on the profile. |

---

## 10. Minor visual issues

| # | Where | Issue |
| - | ----- | ----- |
| 10.1 | All chart pages | Y-axis tick label font weight is bolder than the X-axis, drawing the eye to the wrong axis. |
| 10.2 | Timeseries toolbar | The "Clear Filter" button is the same width as "Clear" — easy to mis-click. |
| 10.3 | Profile grid | "100.0%" non-null bar has no visual width — looks like a thin line. |
| 10.4 | Correlations page | The `?` next to "TYPE" has no tooltip in my testing. |
| 10.5 | All pages | The meta bar (rows + numeric series) has an almost-invisible divider. |
| 10.6 | Spectrogram colorbar | The "·" markers between High/Low and the value labels are oddly placed (e.g. `· -2.110` floats mid-colorbar). |
| 10.7 | Timeseries chart | A flat horizontal segment appears near 30.03.2017 — this is the spike being clipped to the top edge (§1.4). |
| 10.8 | Scatter page | The Y-axis label "HULL" overlaps the rotated "DENSITY (VIRIDIS)" text on the right edge (§3.3). |
| 10.9 | FFT page | Two of the seven default colors are not color-blind safe (`#facc15` yellow and `#f97316` orange next to each other) — fixed by palette unification (§1.2/§1.3 resolved). |
| 10.10 | Sidebar | Collapse/expand icon doesn't rotate to indicate collapsed state. |

---

## 11. Items I would expect to work but did not (gap list)

These are workflows that an experienced EDA user would assume exist but I could not find:

- [ ] "Copy SQL/query" for the current timeseries view.
- [ ] "Save current view" (the URL changes via hash, but no "share link" button).
- [ ] Quick range buttons on the timeseries chart (24h, 7d, 30d, all).
- [ ] "Difference" or "pct-change" toggle on the timeseries chart (would be very useful for ETTm2's HULL–MULL pair).
- [ ] "Show OT as target line" overlay (predict-then-compare).
- [ ] A "spike annotation" button — one click to mark the current peak.
- [ ] Side-by-side spectrogram for two columns.
- [ ] Matrix view that respects the "Top correlations" selection from the correlation page.
- [ ] Export of the current *filtered* scatter points as Parquet (export Parquet is listed as a roadmap item).
- [ ] Export of the current *filtered* timeseries window as Parquet.
- [ ] A keyboard shortcut to focus the next series chip (right now `Tab` works but `←` / `→` between chips would be friendlier).
- [ ] "Reset all" button on the timeseries page to clear every filter / color override at once.

---

## 12. Cross-references to existing issues

The following findings overlap with previously reported issues:

| This report | Existing file | Note |
| ----------- | ------------- | ---- |
| §5.1 | `issue.md` Issue #3 ("Spectrogram Compute button appears non-functional") | Same root cause, still reproducible on 2026-06-28 (partial fix applied). |
| §7.1 | `issue.md` Issue #3, `issues.md` Issue #3 (analytics drawer blocks interactions) | Still reproducible; close button is off-screen. |

---

## 13. Recommended next steps (priority order)

1. **Surface top correlations on the home page.** The scatter page now shows them via `renderTopPairs()`, but the home page still lacks a "Top correlations" widget — see §9 observations row for HULL ↔ MULL = 0.91. *(H, ~3h)*
2. **Pin the analytics drawer close button** to a visible part of the drawer. *(H, ~1h)*
3. **Fix the silent spectrogram render failure.** Add logging, surface a toast on error, and ensure the chart container has non-zero height before `setOption`. *(H, ~2h)*
4. **Add headroom to the timeseries Y-axis** so spikes are visible without clipping (§1.4). *(M, ~1h)*
5. **Lower spectrogram default window size** with real-world unit presets (e.g. "1 day", "1 week") for 15-min datasets (§5.3). *(M, ~30 min)*
6. **Add quick range buttons** ("24h", "7d", "30d", "All") to the timeseries toolbar (§1.6). *(M, ~2h)*
7. **Fix FFT Y-axis formatting** — round tick labels to 1–2 decimal places and widen left margin for rotated label (§4.2 / §7.6). *(M, ~1h)*
8. **Widen scatter metric selector dropdown** or shorten labels so "Pearson (raw)" is readable (§2.2). *(M, ~30 min)*

---

*End of audit.*