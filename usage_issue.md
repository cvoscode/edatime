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

## TL;DR — top 5 things to fix first

1. **OT (Oil Temperature) defaults to the same color as HUFL on the timeseries chips** — they are visually merged when plotted together, hiding the most important correlation in the dataset. *(H)*
2. **Scatter "Suggestions" panel says "No suggestions above |corr| ≥ 0.70" even though the strongest pair (HULL–MULL) is 0.91** — the threshold is hard-coded; ETTm2's strongest pair is *not* with the base column. *(H)*
3. **Profile grid truncates the date column's "min"/"max" with "…"** instead of showing the full ISO timestamp — and the time displayed is in the browser's local timezone (e.g. "2:00:00"), shifting UTC midnight away. *(H)*
4. **The FFT page's X-axis only spans ~17 nHz to ~69 nHz** (periods of 6 months to 2 years) for a 2-year, 15-min dataset — daily/weekly/HVAC cycles are completely invisible. *(H)*
5. **Cross-page series color palette is inconsistent** — Timeseries chips use a 6-color palette for 7 series (forcing a duplicate), while FFT chips use a different 7-color palette. A user who customizes a color on the timeseries page sees a totally different color on the FFT page. *(H)*

---

## 1. Timeseries page

### 1.1 [H] OT and HUFL share the same default color (`#00d4ff`)

**As a data scientist:** OT (Oil Temperature) is the standard prediction target in ETTm2 and a key first-vs-rest correlation. When I turn it on, it visually merges with HUFL because both lines are the same color *and* similar in scale. A user would never know they are seeing two separate series.

**Evidence:**
- `frontend/src/utils/seriesColors.ts` defines exactly 6 colors but there are 7 series.
- After clicking the OT chip, the chart's blue line shows two indistinguishable series.

**Suggested fix:** Expand `SERIES_COLORS` to 7+ distinct, color-blind-friendly colors, or assign `OT` a unique semantic color (e.g. a "target" accent).

### 1.2 [H] Timeseries chips default palette (6 colors) < number of series (7)

**As a data scientist:** With 7 series, the default palette cannot assign a unique color to every series. The natural fix is a larger palette (≥ 8) plus ensuring `getSeriesColor(…)` never returns a duplicate for the first 7 calls.

**Evidence:** `frontend/src/utils/seriesColors.ts` line 1–3 — only 6 colors.

### 1.3 [H] Cross-page color palettes are completely different

**As a data scientist:** I customized HUFL to teal on the timeseries chart, then jumped to the FFT page, and the FFT HUFL was a different green. There is no notion of "the HUFL color" across pages.

**Evidence:**
- Timeseries chips: `HUFL=#00d4ff, HULL=#6c63ff, MUFL=#00c896, MULL=#f5a623, LUFL=#ff4a6e, LULL=#c77dff, OT=#00d4ff` (duplicate).
- FFT chips: `HUFL=#7ad151, HULL=#4ac3e8, MUFL=#f97316, MULL=#e879f9, LUFL=#facc15, LULL=#60a5fa, OT=#f43f5e` (all unique).

**Suggested fix:** Move the default palette into a shared `frontend/src/utils/seriesColors.ts` (or a new `palette.ts`) and consume it from every page that renders series.

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

### 2.1 [H] The "Suggestions" panel only suggests pairs above a hard-coded 0.7 threshold

**As a data scientist:** I load ETTm2, go to scatter, and the suggestions panel says "No suggestions above |corr| >= 0.70." The strongest pair in ETTm2 is *HULL ↔ MULL* at 0.91, but the scatter endpoint uses HUFL as the fixed base column, so the user only sees HUFL's correlations (max 0.671 with HULL). The "suggestion" is therefore *not* the best pair — it is the *base column's* best pair. This is a real first-day UX dead end for ETTm2.

**Evidence:** `/api/scatter/correlations` returns `{"base_column":"HUFL","threshold":0.7,…,"correlations":[{"column":"HULL","value":0.671},…],"suggestions":[]}`.

**Suggested fix:**
- Show the top-N strongest pairs (across the whole matrix) in a "Top correlations" panel, *regardless* of a base column.
- Or, expose the base column as a dropdown next to the threshold.

### 2.2 [M] Metric selector shows "Pearson · Raw aligned v..." (truncated)

**As a data scientist:** The label is cut off with an ellipsis on the dropdown — I cannot tell which variant of "Pearson" is currently active (Pearson · raw aligned vs Pearson · differenced vs Spearman, etc.).

**Suggested fix:** Widen the dropdown or shorten the labels ("Pearson (raw)", "Pearson (Δ)", "Spearman", …).

### 2.3 [M] Clustered column labels are tiny and vertical

**As a data scientist:** When "Group similar" is on, the columns reorder (HUFL, LUFL, HULL, MULL, OT, LULL, MUFL), but the labels are so small and rotated that I have to squint to read them. A larger label area or hover tooltips with the full correlation value would be friendlier.

### 2.4 [M] No "click cell to jump to scatter" affordance

**As a data scientist:** The matrix is the natural launching pad for scatter — clicking a high-corr cell should populate X/Y. Currently I have to switch to scatter, change the dropdowns, and lose context.

### 2.5 [L] "Group similar" toggles row + column clustering but there is no legend explaining the resulting order

**As a data scientist:** It is not obvious *why* HUFL and LUFL are next to each other in the clustered order. A small caption or hover-tooltip with the within-cluster order would help.

### 2.6 [L] Strong-negative pairs (LULL ↔ MUFL = -0.60) are not flagged as "negatively correlated"

**As a data scientist:** A strong negative correlation is just as interesting as a strong positive one. The page presents them in a diverging colormap, but a "Top 3 negative" pill would be nice.

---

## 3. Scatter page

### 3.1 [H] Suggestions panel is empty even though the matrix shows clear pairs

Cross-references **2.1** — the scatter page surfaces the same dead-end as soon as the user lands on it. There is no quick way to *discover* that HULL ↔ MULL = 0.91.

### 3.2 [M] The X / Y comboboxes default to HUFL ↔ HULL (Pearson 0.671) but this is not the strongest pair

**As a data scientist:** A default of 0.67 is OK, but the *first impression* would be much stronger if the default were the matrix's top pair (HULL ↔ MULL, 0.91). Users who skip the matrix would otherwise miss the most striking correlation in the dataset.

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

### 4.1 [H] X-axis range is far too narrow — daily / weekly / monthly cycles are invisible

**As a data scientist:** ETTm2 is sampled every 15 min over 2 years. The FFT X-axis only shows frequencies from ~17 nHz to ~69 nHz, i.e., periods of 6 months to 2 years. The relevant signal in a transformer dataset is the *daily* (period = 1 day, frequency = 11.57 µHz) and *weekly* cycles. With the current X-axis I literally cannot see them. The most important peaks in a 15-min dataset are not visible.

**Evidence:** X-axis labels read `0.0000174`, `0.0000347`, … `0.0000694` µHz, with `0` and `1` as the visible range markers.

**Suggested fix:** Either let the user pick a sub-window (zoomed-in time range) before computing the FFT, or auto-window to a representative slice (e.g. last 14 days) so daily cycles are visible.

### 4.2 [M] Y-axis labels show 7-digit precision (`0.84792778`, `-0.45719733`, …) and the unit label "log10(Magnitude)" overlaps the tick labels

**As a data scientist:** The Y-axis is unreadable. Tick labels like `0.84792778` should round to `0.85` or `0.8`, and the rotated "log10(Magnitude)" text overlaps them.

**Suggested fix:** Format tick labels to 1–2 decimal places; widen the left margin to give the rotated label breathing room.

### 4.3 [M] The "High Hz" input is a placeholder `auto` and the "Low Hz" input is `0`, but both are non-functional without "Type = Lowpass/Highpass/Bandpass"

**As a data scientist:** I tried changing Low Hz / High Hz with Type = Off; nothing happens. The inputs should be disabled when Type = Off, or there should be a visible hint that the filter is inactive.

### 4.4 [M] "Clip" + "Clip method" + "Clip %" controls are visible but disabled by default

**As a data scientist:** Three controls in a row all visibly disabled, with no clear reason. The hint "Enable the 'Outliers' toggle above to change the clip method" is shown only as a title attribute. A first-time user will not know to toggle Outliers first.

**Suggested fix:** Either move the disabled controls into a "Clip options" disclosure that opens with Outliers, or set Outliers = on by default when the spectrogram shows extreme values.

### 4.5 [M] Toggle chips (HUFL, HULL, …) have no visual "active" state until after the FFT computes

**As a data scientist:** When I click HUFL, the chip is "loading" briefly, then turns into a chip with a green ring. But the *placeholder text* "Select one or more traces" remains visible until the FFT actually renders. A user could click HUFL twice thinking the first click did not register.

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

### 6.1 [H] Date column "min"/"max" values are truncated with "…" and shifted to local timezone

**As a data scientist:** The profile shows `date` with `min = "7/1/2016, 2:00:00 …"` and `max = "6/26/2018, 9:45:00…"`. The actual UTC start time in the CSV is `2016-07-01 00:00:00` (midnight UTC). The "2:00:00" is the local-timezone shift, and the "…" hides the seconds and AM/PM. A data scientist cannot trust this column for range queries.

**Evidence:** `frontend/src/utils/format.ts` line 22 — `d.toLocaleString()` applies the browser's local timezone to UTC milliseconds.

**Suggested fix:**
- Use ISO 8601 (e.g. `2016-07-01T00:00:00Z`) for `min`/`max` of datetime columns, with explicit UTC label.
- Increase the column width or wrap the date so the full string is visible.

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

### 7.8 [L] Toasts appear and disappear too quickly to read

**As a data scientist:** "Data updated on timeseries page." stays for ~3s. For a meaningful message that's too short. The animations are also abrupt.

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
| HULL ↔ MULL = 0.91 is by far the strongest pair. | A "Top correlations" widget on the home page. |
| LULL ↔ MUFL = -0.60 is a strong negative (low-useful vs mid-useful). | Same. |
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
| 10.7 | Timeseries chart | A flat horizontal segment appears near 30.03.2017 — this is the spike being clipped to the top edge. |
| 10.8 | Scatter page | The Y-axis label "HULL" overlaps the rotated "DENSITY (VIRIDIS)" text on the right edge. |
| 10.9 | FFT page | Two of the seven default colors are not color-blind safe (`#facc15` yellow and `#f97316` orange next to each other). |
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
| §1.2 / §1.3 | `issue.md` Issue #5 ("Upload button refreshing stats…") | Different area, but same class of "stale UI state". |
| §5.1 | `issue.md` Issue #3 ("Spectrogram Compute button appears non-functional") | Same root cause, still reproducible on 2026-06-28. |
| §7.1 | `issue.md` Issue #3, `issues.md` Issue #3 (analytics drawer blocks interactions) | Still reproducible; close button is off-screen. |
| §2.1 | `improvement_features.md` (no exact match) | New finding. |
| §1.1 | `improvement_features.md` (color-by-column reliability) | Different page, same theme: default colors need a unique-color guarantee. |

---

## 13. Recommended next steps (priority order)

1. **Fix the default-color collision (HUFL + OT).** One-line change: extend `SERIES_COLORS` to ≥ 8 distinct colors. *(H, ~30 min)*
2. **Surface top correlations on the home page and on the scatter page.** Either lower the threshold dynamically, or replace the threshold with a "show top 3" widget. *(H, ~3h)*
3. **Fix timezone in profile min/max + remove truncation.** Use ISO 8601 with explicit UTC label, widen the column. *(H, ~1h)*
4. **Widen FFT X-axis or auto-pick a 14-day window.** For 15-min sampled data, the X-axis must include 1–500 µHz to be useful. *(H, ~3h)*
5. **Fix the silent spectrogram render failure.** Add logging, surface a toast on error, and ensure the chart container has non-zero height before `setOption`. *(H, ~2h)*
6. **Unify the cross-page color palette** so a custom color on the timeseries page carries over to FFT / spectrogram. *(H, ~4h)*
7. **Pin the analytics drawer close button** to a visible part of the drawer. *(H, ~1h)*
8. **Lower the spectrogram default window size** to 96 (1 day) for typical 15-min datasets. *(M, ~30 min)*
9. **Add headroom to the timeseries Y-axis** so spikes are visible without clipping. *(M, ~1h)*
10. **Add quick range buttons** ("24h", "7d", "30d", "All") to the timeseries toolbar. *(M, ~2h)*

---

*End of audit.*
