# EdaTime — Live Audit (2026-07-02, ETTm2 sample)

Run against the running dev environment with the home-page "Load ETTm2 sample dataset" entry point and a 69,680-row ETTm2 dataset loaded into the backend. No code changes were made; the audit only reviewed the running UI.

## High impact

### 1. Scatter returns "No scatter points found" with stale "2 column" filters even after clearing
- Page: `#page=scatter`
- Symptom: scatter plot shows the marginal histograms and the empty state reads **"No scatter points found / No points match active filters (2 column, 0 adaptive)"**. Marginal histograms are clearly populated from real data, but the main plot area is empty.
- Clicking **"Clear active filters"** does not immediately resolve it (the empty-state message survives the click); a reload is needed.
- This matches the highest active priority in the ledger ("Scatter color-by-column is currently unreliable"). The current default state for an ETTm2 sample load reproduces an empty plot even with `Color column = None` — i.e. it is not just a color-by-column regression but also a filter-reset regression.
- Reproduction: Home → Load ETTm2 → click Scatter. Wait briefly. The plot is empty even though the histograms render around it.

### 2. Timeseries chart legend is out of sync with chip rail
- Page: `#page=timeseries`
- Symptom: chip rail exposes 7 columns (HUFL, HULL, MUFL, MULL, LUFL, LULL, OT) but the chart legend drawn by the chart engine on the right only lists **HUFL, HULL, OT** for a fresh ETTm2 load.
- The default-active chip set (HUFL, HULL, OT) does match the legend, but extra chips show up in the rail without any visible "off" affordance — a user opening this page cannot tell which columns are currently rendered without activating each chip first.
- The two surfaces disagree about what is "selected".

### 3. Timeseries chip rail overflows the toolbar with no scroll affordance
- Page: `#page=timeseries`, top toolbar
- Symptom: `.timeseries-chip-rail` has `scrollWidth: 805`, `clientWidth: 390` (only 3 of 7 chips visible: HUFL, HULL, MUFL). MULL, LUFL, LULL, OT are off-screen to the right.
- No scrollbar, no edge fade, no chevrons; users without mouse-wheel intuition cannot tell that 4 more series exist behind the right edge.
- The persistent "Ctrl + click …" adaptive-filter hint ribbon is placed in the same row and competes for the same horizontal space, squeezing the chip rail even further.
- This maps directly to roadmap priority #4 ("time-series UI with more columns / column-toggle ergonomics"). On the data already shipped (7 columns) the problem is reproducible without any extra work.

### 4. Scatter "Suggestions" silently filters out the strongest available pair
- Page: `#page=scatter`, Suggestions strip
- Symptom: header reads "Suggestions (|corr| ≥ 0.70) — No suggestions above |corr| >= 0.70". The current X/Y pair (HUFL × HULL) shows **Pearson: 0.671** — i.e. it is just below threshold and so the user is told nothing is interesting, when in fact it is the strongest pair in the dataset.
- The correlations page shows the strongest pair as HULL × MULL = 0.91 (heatmap). The scatter page does not surface it; the slider is 0.70 by default and there is no "lower threshold to see top-N" affordance until you touch the slider.
- This is the kind of "all quiet on the empty-state front" UX failure where most of an entry-point tour ends with "no suggestions here".

### 5. FFT page axis labels collide
- Page: `#page=fft`
- Symptom: Y-axis title `log10(Magnitude)` is drawn at almost the same screen location as the topmost tick label, so the rotation makes them overlap into a single illegible blob. The text bleeds into the top-most tick value and the upper-left annotation cluster (`0.02 1hz / 0.06 hz / (1.81E5 days)`).
- Y-axis tick labels are emitted with high precision (e.g. `0.4659095`, `-0.8607398`, `-2.1873892` …) — six decimal places, not a clean `1.0 / 0.1 / 0.01 / 0.001` log spacing, so even without the title collision the axis is hard to read.
- Same axis-title collision appears on `#page=spectrogram` ("Frequency (Hz)" stacking against the `0.28 mHz` tick).

### 6. FFT/Spectrogram toolbar control row gets clipped on the right
- Page: `#page=fft`, `#page=spectrogram`
- Symptom: on a 1280px-wide viewport the right-hand control labels read "**CLIP… / CLIP METHOD / CLIP %**" in the screenshot — the option text is truncated mid-word by the panel edge instead of either wrapping or letting the row stretch.

### 7. Modal does not block the rest of the app
- Page: `#page=drift`
- Symptom: opening Settings from Drift left the dimmed drift page interactive underneath; the modal backdrop intercepted some clicks (Upload click was suppressed while Settings was open) but the navigation chrome itself could be reached, leading to inconsistent state.
- A user can click "Apply" on Settings and then see the underlying drift page react to keystrokes carried over.

## Medium impact

### 8. Timeseries chart shows a long flat horizontal "spike" through OT
- Page: `#page=timeseries`
- Symptom: the OT line (and parts of MUFL once enabled) renders as a long horizontal blue/pink/green band at very low or constant values across most of the time axis, with a single visible outlier near `08.05.2017`. The flat band dominates the plot and hides other series in the same Y range; effective dynamic range is poor.
- A `null`-replacement or sticky-value default for OT (which is the target in ETTm2) appears to render that way.

### 9. Drift stats endpoint returned HTTP 500 during the session
- Page: `#page=drift`
- Symptom: backend metrics show `POST /api/drift/stats 500: 1` recorded during the audit. The Drift page still rendered the timeline after a manual Compute — the chart was usable — so the 500 is partial. A user following the same flow as the audit may silently get a stats panel that never finishes loading.
- `/api/metrics` endpoint is otherwise healthy (no rate-limit hits, low cache hit ratio on `/api/data`, scatter sampling showing ~645k points returned across 15 requests).

### 10. Correlations header still reads "Raw aligned values" on the cells even when the dataset is dense
- Page: `#page=correlations`
- Symptom: subtitle says "Raw aligned values · 69680 aligned pairs" while the heatmap is dense — fine semantically, but visually this looks like the rows are unaligned/raw; consider aligning with the scatter copy when both pages agree on the metric.

### 11. Timeseries page has no clear default for the Outlier spike near 08.05.2017
- Page: `#page=timeseries`
- Symptom: the 113.76 max drives a Y-axis tick from 81.49 → 113.76 with a huge empty band between 81.49 and the actual data. The chart does not offer "exclude outliers" / percentile clipping on the time series itself, while the FFT/Spectrogram pages have it. Asymmetrical capability between the primary chart and the spectral charts is confusing.

### 12. Settings → Density: only "Spacious" offered
- Page: `Settings → Appearance → Layout → Density`
- Symptom: only one option is visible — the combobox is effectively a label. Either the other modes need to be wired, or the control should not be shown yet.

### 13. Settings → Apply button has no preview of the change
- Page: Settings dialog
- Symptom: changing "Color scheme" or "Density" and clicking Apply flips global state immediately. Pressing Cancel after picking something visibly different still leaves the previously-picked value in the underlying state until next open, so Cancel is not a true cancel.

## Low impact

### 14. Adaptive-filter hint banner competes with the chip rail
- Page: `#page=timeseries`
- Symptom: the "Ctrl + click a selected series to add an adaptive line filter" inline hint sits inside the chip rail row, pushing chips off-screen and overlapping the rail's right edge.

### 15. Upload page preview table leaves the rest of the page empty
- Page: `#page=upload`
- Symptom: after the column-profile grid there is a large empty area (~600px tall) with no help text, "Database" tab state, or follow-on guidance about what to do next. Looks like a layout regression.

### 16. Timeseries x-axis tick label for 08.05.2017 sits under a major outlier
- Page: `#page=timeseries`
- Symptom: the spike intercepts the date label, making it visually merge with the vertical axis line. Cosmetic, but degrades the visual cleanliness of the most interesting moment in the dataset.

---

## What I verified is working

- Backend `/api/health` 200, `/api/metadata` returns 7 numeric columns for ETTm2 and a `time_range` of `1467331200000–1530042300000`.
- Sample-data ingestion from the home page successfully populates `dataset_revision=4`, `dataset_rows=69680`.
- Correlations heatmap renders all 7 × 7 cells with correct values (highest HULL × MULL = 0.91, lowest LUFL × OT = -0.14).
- Drift page renders the box-plot detail and timeline after pressing Compute, with red severity classification on flagged windows.
- Spectrogram page renders the heatmap with log colorbar and two-threshold filter sliders.
- Filter "Clear active filters" button on scatter does eventually repaint points (after a follow-up action) — but it does not visibly "do something" on first press.
- All sidebar routing works, including Ctrl-key shortcuts (Alt+1, Alt+2, Alt+3, Alt+6, Alt+7, Alt+8, Alt+9, Alt+0).

## Suggested triage order

1. Scatter empty-state regression (issue #1) — fixes the headline "Scatter color-by-column" priority and likely surfaces related filter-state bugs.
2. Timeseries chip overflow (#3) — quick CSS/UX win, ties to roadmap #4.
3. Timeseries legend/chip inconsistency (#2).
4. Scatter suggestions threshold UX (#4).
5. FFT/Spectrogram axis labels (#5, #6).
6. Drift stats 500 (#9).
7. Remaining low/medium items.
