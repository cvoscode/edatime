# EdaTime UI/UX walkthrough — 2026-07-06

This file lists concrete UI/UX problems observed by **only interacting with
the running app** in a browser (Spectrogram, Causal, Drift + brief checks of
Timeseries). The companion "Plan of fixes" section at the bottom maps each
issue to a concrete fix shape so it can be implemented without
re-investigating the symptom.

The walkthrough used the **ETTm2** sample dataset (69 680 rows, 7 numeric
columns + a `date` time column at 15-minute resolution) loaded via the
home-page "Try with sample data" cards. All findings are reproducible from a
fresh browser session without touching the source.

> The previous walkthrough (`issue.md.bak`, 2026-07-05) had **25 issues
> (F1–F25)** with a plan of fixes. This re-walkthrough confirms:
> - **Some prior issues are fixed** (Spectrogram auto-pick now has a toast;
>   FFT no longer shows stuck "Computing…" copy).
> - **Several prior issues remain unchanged** (Y-axis auto-fit, hidden
>   disabled controls, multi-select chip pattern on Drift, threshold jargon,
>   empty-state CTAs).
> - **A new critical regression** on the **Causal page**: clicking
>   Compute sends a valid request to `/api/analytics/causal`, but the
>   response is never rendered — the main `<main>` area stays empty.
> - **A new clarity issue** on Drift: every window is flagged RED
>   (`363/363` flagged windows for both selected columns), which makes the
>   default thresholds look wrong for ETTm2.

Issues are grouped by page; severity is the user-visible impact × how often
the user hits it. New issues use the `S#` prefix to distinguish them from
the prior walkthrough's `F#` set.

---

## Summary table

| #       | Page        | Title                                                                  | Severity |
|---------|-------------|------------------------------------------------------------------------|----------|
| S1      | Spectrogram | Y-axis stretches to 555 µHz — most of the heatmap is empty purple     | High     |
| S2      | Spectrogram | Colorbar `Z-SCORE → [...]` caption clipped at right edge of viewport   | Medium   |
| S3      | Spectrogram | X-axis date labels overlap (`07/01`, `09/12` readable, others cramped) | Medium   |
| S4      | Spectrogram | No "what am I looking at" caption / metadata summary above the chart    | Low      |
| C1      | Causal      | **Graph never renders** — clicking Compute leaves `<main>` empty       | Critical |
| C2      | Causal      | Duplicate toast "PCMCI: running causal discovery..." fired twice       | High     |
| C3      | Causal      | Empty main canvas has no placeholder / CTA / preview before Compute   | High     |
| C4      | Causal      | "GRAPH" toolbar exposes `+ Edge` / `Export` / `Save Run` before run    | Medium   |
| C5      | Causal      | Parameters row has 5 fields + 5 `ⓘ` tooltips on a single row           | Medium   |
| C6      | Causal      | "Run Comparison" panel sits at the very bottom, empty, no hint         | Medium   |
| D1      | Drift       | Status banner "Select one or more columns…" persists after a run      | High     |
| D2      | Drift       | **All 363/363 daily windows flagged RED** — thresholds too tight for ETTm2 | High   |
| D3      | Drift       | Timeline chart Y-axis unlabeled (no "Score / Magnitude" axis title)    | Medium   |
| D4      | Drift       | "Evaluate" dropdown value truncated to `All later win...`              | Medium   |
| D5      | Drift       | "Columns" button hides multi-select behind a single dropdown click     | Medium   |
| D6      | Drift       | "THRESHOLDS" group is jargon (`PSI + Wass + KS + E-S`) with no tooltip | Medium   |
| D7      | Drift       | Window selector shows 24-hour ranges even when Window = "Daily"       | Medium   |
| D8      | Drift       | "Latest N" disabled when "All later windows" mode is on — no hint why  | Low      |
| F4*     | Timeseries  | Y-axis still includes negative range for strictly-positive data       | High     |
| F11*    | Spectrogram | Auto-pick toast appears (FIXED vs previous walkthrough)               | —        |
| F10*    | FFT         | "Computing…" copy no longer sticks (FIXED vs previous walkthrough)    | —        |

\* = carried over from the prior walkthrough; status indicated where known.

---

## Detail per issue

### Spectrogram

#### S1 — Y-axis stretches to 555 µHz; most of the chart is empty purple

**Where:** `/#page=spectrogram`, ETTm2 with HUFL selected, Window = 96, Hop = 50%, Z-score normalize.

**What I see:** The frequency axis goes from `0.00 µHz` to `555.56 µHz`. All
visible signal sits in the bottom ~10 % of the heatmap (below ~46 µHz).
Above that, the canvas is uniform dark purple, indicating near-zero
spectral energy.

**Impact:** Looks broken to first-time users. Same root cause as the FFT
problem F8 from the previous walkthrough — the default frequency window
doesn't match the dominant signal content of slow time series.

---

#### S2 — Colorbar `Z-SCORE → [...]` caption clipped at right edge

**Where:** bottom-right corner of the spectrogram canvas.

**What I see:** The colorbar legend reads `Z-SCORE → [...]` and the value
text is truncated at the right edge of the viewport, so the actual
target range (`[0, 1]`) is partially hidden.

**Impact:** Users can't tell at a glance what the colour scale means.

---

#### S3 — X-axis date labels overlap

**Where:** spectrogram time axis.

**What I see:** Tick labels are rotated ~30° but still overlap. Only
`07/01`, `09/12`, `11/23`, `02/04`, `04/17`, `06/29`, `09/09`, `11/21`,
`02/01`, `04/15` are partially readable; others are stacked.

**Impact:** Time orientation is hard to read on a wide canvas.

---

#### S4 — No "what am I looking at" caption

**Where:** above the spectrogram canvas.

**What I see:** The toolbar at top shows `Column: HUFL · Window: 96 ·
Hop: 50% · Scale: Log · Normalize: Z-score · Clip: Outliers`, but the
chart itself has no header showing what the visualization represents or
the time/frequency ranges.

**Impact:** New users can't immediately orient themselves.

---

### Causal

#### C1 — **Graph never renders** — Compute runs, but `<main>` stays empty

**Where:** `/#page=causal`, ETTm2, HUFL + HULL + OT (or any subset) selected.

**What I see:**

1. Click `▶ Compute`.
2. A toast appears: "PCMCI: running causal discovery..." (see C2 about
   duplication).
3. After ~5–60 s the toast disappears.
4. The `<main>` area is **completely empty**. No SVG, no canvas, no
   placeholder, no error message.

I verified the API works fine via curl:
```
POST /api/analytics/causal
{"columns":["HUFL","HULL","OT"],"tau_max":3,"alpha":0.05,"pc_alpha":0.2,
 "max_conds_dim":null,"method":"pcmci","test":"parcorr","fdr_method":null}
→ 200 OK, returns {columns, graph: 3×3×3 array, links: [...]}
```

The browser's network log shows `POST /api/analytics/causal` failing
with `net::ERR_ABORTED`. The toast says "running" but the request was
aborted (probably a duplicate request firing — see C2). The aborted
request means **no JSON body is parsed by the renderer**, so the graph
never gets a chance to render.

**Impact:** The Causal page is fully broken — clicking Compute produces
no visible feedback of success or failure. Power users will notice the
aborted request; first-time users will assume the algorithm doesn't work.

---

#### C2 — Duplicate "PCMCI: running causal discovery..." toasts

**Where:** notification region while Compute is in flight.

**What I see:** Each click of Compute produces **two identical** toasts,
one immediately after the other. That suggests the click handler fires
twice (likely a double event registration between the entrypoint and the
inner `initCausalPage`).

**Impact:** Confusing for users (looks like two runs), and one of the
two requests gets aborted (→ C1).

---

#### C3 — Empty main canvas has no placeholder or CTA

**Where:** `/#page=causal` before any Compute.

**What I see:** `<main>` is a black void until Compute finishes.
Compare with Drift, which has a clear "No drift analysis yet" empty state
with a secondary line ("Select a column, adjust the reference window,
and press Compute."). The Causal page offers nothing — no icon, no
copy, no CTA, no preview of the selected variables.

**Impact:** New users don't know the page is ready; they may click
nothing and assume the feature is broken.

---

#### C4 — GRAPH toolbar exposes actions before a graph exists

**Where:** top-right `GRAPH` group: `+ Edge` · `Export ▾` · `Save Run` · `▶ Compute`.

**What I see:** `+ Edge`, `Export`, and `Save Run` are all enabled
regardless of whether a graph has been computed. Clicking `Export ▾`
produces no dropdown. Clicking `+ Edge` is undefined behaviour with no
graph.

**Impact:** The toolbar is "always-on" but most actions don't make sense
before Compute. Either disable or hide them.

---

#### C5 — Parameters row density

**Where:** Parameters group on Causal.

**What I see:** `τ max · α · PC α · Max conds · FDR` all in one row, each
followed by a `ⓘ` tooltip. Five inputs + five tooltips on a single
horizontal row is hard to scan.

**Impact:** Power users adapt; first-time users bounce. (Carried over as
F13 in the prior walkthrough; not fixed.)

---

#### C6 — "Run Comparison" panel sits at the bottom, empty and unlabelled

**Where:** bottom of the Causal page.

**What I see:** After the empty main area, there's a `RUN COMPARISON`
group with two empty `<select>` dropdowns (`Run A` vs `Run B`) and
disabled `Compare` / `Clear All` buttons. Until the user runs Compute
at least once, this panel is meaningless. There's no explanation of
"Run Comparison" anywhere.

**Impact:** It takes up vertical space and confuses new users. Either
hide it until at least one run is saved, or add a "What is this?" link.

---

### Drift

#### D1 — Status banner sticks after a successful Compute

**Where:** `/#page=drift`, immediately under the toolbar.

**What I see:** After pressing Compute and getting a result panel with
HUFL & HULL cards, the status banner still reads "Select one or more
columns, choose a baseline, and press Compute." That copy contradicts the
results displayed below it.

**Impact:** Same family of issue as the previous walkthrough's F15. Not
fixed.

---

#### D2 — Every window flagged RED (363/363)

**Where:** `/#page=drift`, after Compute with ETTm2 + "Daily" window.

**What I see:** Both columns (HUFL, HULL) are flagged with `RED` severity.
`Flagged windows: 363/363` for each. The timeline chart at the bottom is
entirely red — there is no "OK" / "Watch" region visible. `Latest window
severity: YELLOW` and `Worst window severity: RED` summary cards reflect
this.

**Impact:** For a stable sensor dataset like ETTm2, this is a strong
signal that the **default thresholds are too tight**. The user either
dismisses the feature as broken or assumes their data is corrupt. The
THRESHOLDS group label (`COMPOSITE PSI + Wass + KS + E-S`) does not
explain what knob to turn.

**Recommendation:** Either auto-tune the thresholds to the data's noise
level, or surface a clear "Why is everything red?" link next to the
threshold label that opens a modal explaining the four tests and how to
relax them.

---

#### D3 — Timeline chart Y-axis has no label

**Where:** the drift timeline plot.

**What I see:** Y-axis ticks read `-10, 0, 10, 20, 30, 40, 50, 60, 70`.
There's no axis title (`Magnitude`, `Score`, `PSI`, etc.) and no hint
about what the y-axis represents (drift score per window, presumably).

**Impact:** New users can't tell if bigger is better or worse without
reading the doc. Adding `Drift score` as a Y-axis title would close
this gap.

---

#### D4 — "Evaluate" dropdown truncates "All later windows"

**Where:** `Evaluate` combobox on Drift toolbar.

**What I see:** Combobox value reads `All later win...` — three letters
short of "All later windows". Same pattern as the prior walkthrough's
F19-style truncation.

**Impact:** Visible only because the toolbar is densely packed; widening
the combobox or shortening the label to "Later windows" would fix.

---

#### D5 — "Columns" multi-select is hidden behind a single button

**Where:** `Data → Columns` row on Drift.

**What I see:** The control is a single button reading `HUFL` (or `2
columns` once multiple are selected). It looks like a single-value
dropdown. To multi-select you have to click and then check boxes in a
modal dialog that includes `All / Single / None` bulk actions.

**Impact:** The previous walkthrough's F14 noted this. The behaviour is
improved (it now says "2 columns" when multiple are picked) but the
**affordance still doesn't match the chip pattern** used on Timeseries,
Spectrogram, and Causal — the inconsistency is the issue.

**Recommendation:** Render the columns as inline chips (like the
Timeseries `Series` chips), so multi-select is visible without a
modal.

---

#### D6 — "THRESHOLDS" group is jargon with no tooltip

**Where:** Drift toolbar.

**What I see:** Group eyebrow says `THRESHOLDS`. The single control
reads `Composite PSI + Wass + KS + E-S` — no tooltip, no expansion, no
plain-language explanation. PSI, Wasserstein, Kolmogorov-Smirnov, and
Energy-distance are all advanced statistics.

**Impact:** First-time users can't tell what the thresholds group does.
Combined with D2 (everything is RED), the user has no path forward.

---

#### D7 — Window selector shows 24-hour ranges while Window = "Daily"

**Where:** top-right of the Drift result panel.

**What I see:** A dropdown reads `HUFL - 2017-06-28 19:52 - 2017-06-29
19:52`. The two timestamps are 24 hours apart — i.e. **the unit shown
in the selector is one window**, not one day. Meanwhile the X-axis of
the timeline plot also shows 24-hour slices (`2017-06-12 19:52 - 2017-06-13 19:52`).

**Impact:** Confusion between "Daily" (the resolution) and "this 24-hour
window" (the slice). The footer timeline labels should match the
selected window unit ("day", "week", "month"), and the selector should
say "Window 1 of 363" or similar.

---

#### D8 — "Latest N" disabled state has no hint

**Where:** Drift toolbar.

**What I see:** "Latest N" is a spinbutton showing `3` but it is disabled
because Evaluate = "All later windows". There's no helper text or
tooltip explaining why.

**Impact:** Users see a greyed-out field and wonder if the app is buggy.
A short subtitle like "only used with 'Latest N windows' mode" would
resolve it.

---

### Timeseries (carry-overs)

#### F4* — Y-axis still includes negative range for strictly-positive data

**Where:** `/#page=timeseries`, ETTm2.

**What I see:** Default Y-axis ticks read `-15.20, 16.80, 48.80, 80.79,
112.79`. All seven series are strictly positive (oil temperatures).
About 25 % of the vertical space is wasted on the negative range.

**Status:** Not fixed from the prior walkthrough.

---

#### F11* — Spectrogram auto-pick toast appears (fixed)

**Status:** The toast "Loaded HUFL automatically. Pick another column
and press Compute to switch." now appears as expected.

---

#### F10* — FFT "Computing…" copy no longer sticks (fixed)

**Status:** The Spectrogram's Compute button is no longer stuck on
"Computing…"; it returns to "Compute" after the result lands. (FFT
itself was not re-tested in this walkthrough.)

---

## Plan of fixes

Each fix below is sized to fit inside one focused PR. Order: C1 first
(Causal is fully broken), then D1 + D2 (Drift contradicts itself),
then the clarity fixes (C3–C6, D3–D8, S1–S4), then the carry-overs
(F4*).

### Fix C1 — Causal Compute actually renders the graph

**Goal:** Clicking Compute on Causal must produce a visible graph.

**Shape:**

- Investigate the `net::ERR_ABORTED` on `POST /api/analytics/causal`.
  Possible root causes:
  - Duplicate event registration between the feature entrypoint and the
    page init (see C2) — one of the two requests gets aborted.
  - The frontend request body uses `variables:` instead of `columns:`,
    which would cause a 422 deserialization error (confirmed via curl:
    the API expects `columns`).
- Confirm the response handler in `frontend/src/causal/causalPage.ts`
  (or wherever the renderer lives) actually paints the graph on a
  successful response. Today, no SVG/canvas appears, which suggests
  the handler either never runs or throws silently.
- Surface any error message returned by the backend as a toast /
  inline status, instead of failing silently.
- Keep the request body shape in sync with the backend schema
  (`columns`, `tau_max`, `pc_alpha`, `alpha`, `max_conds_dim`,
  `fdr_method`, `method`, `test`).

**Acceptance:**
- Compute on Causal with 3 selected columns produces a graph in
  `<main>` within a few seconds.
- Compute failures (HTTP error or backend exception) produce a clear
  toast with the error message and a Retry button.
- No `net::ERR_ABORTED` entries in the network log.

---

### Fix C2 — De-duplicate the Causal Compute click handler

**Shape:**

- Audit where `initCausalPage` (or the Compute button handler) is
  registered. The duplicate toast suggests the click handler is
  bound twice — once by the feature entrypoint and once by an inner
  page init.
- Remove the duplicate binding. Use a single entrypoint that registers
  exactly one listener.
- Add an `AbortController` to the request and call `.abort()` on the
  previous controller when a new Compute is clicked, so re-clicking
  Compute cancels the previous run cleanly.

**Acceptance:**
- Each Compute click produces exactly one toast and one network
  request.
- Re-clicking Compute mid-run cancels the previous request without
  producing an `ERR_ABORTED` console warning.

---

### Fix C3 — Causal empty-state with CTA

**Shape:** Mirror the Drift empty-state pattern.

- When no graph is loaded, render an empty-state card with:
  - An icon
  - Title: "No causal graph yet"
  - Subtitle: "Press Compute to discover causal links between
    HUFL, HULL, and OT." (replace with the actual chip selection).
  - A primary button "Run Compute" that triggers the same handler.
- Render the selected variable chips inside the empty state so the user
  sees what will run.

---

### Fix C4 — Hide GRAPH toolbar actions until a graph exists

**Shape:**

- Disable `+ Edge`, `Export`, and `Save Run` until at least one
  successful Compute has finished.
- Once a graph exists, enable them.
- Alternatively, render a single "Run analysis" CTA before the first
  graph and the full toolbar after.

---

### Fix C5 — Causal Parameters layout

**Shape:**

- Split the Parameters row into two lines:
  - Line 1: τ max, α, PC α
  - Line 2: Max conds, FDR
- Replace the per-field `ⓘ` tooltips with a single "What's this?"
  link that opens a modal explaining every parameter.

---

### Fix C6 — Causal Run Comparison panel

**Shape:**

- Move "Run Comparison" next to the main `<main>` area or collapse it
  into the toolbar until at least one run is saved.
- Add a one-line caption: "Compare two previously-saved runs."

---

### Fix D1 — Refresh Drift status banner after Compute

**Shape:**

- Drive the status banner off `result != null`:
  - Pre-compute: "Select one or more columns, choose a baseline, and
    press Compute."
  - Post-compute: "Drift analysis complete — X of Y windows flagged."
    (or similar summary in the result color)
  - When the user changes a column, restore the pre-compute text.

---

### Fix D2 — Don't flag every window RED on stable data

**Shape:**

- Add an "Auto-tune thresholds" toggle (default on) that adjusts the
  PSI / Wasserstein / KS / ES thresholds relative to the reference
  distribution's own noise floor.
- When the auto-tune is off, show the four numeric thresholds next to
  the THRESHOLDS button so users can see exactly what's being applied.
- When every window is flagged, surface a non-blocking hint:
  "Every window flagged — consider relaxing thresholds or using a
  longer baseline."

---

### Fix D3 — Add a Y-axis title to the Drift timeline chart

**Shape:**

- Label the timeline Y-axis "Drift score" (or whatever the underlying
  metric is — pick one that matches the legend items below).
- The existing legend ("No trigger fired · One trigger fired ·
  Composite drift (2+ score)") should map to the axis.

---

### Fix D4 — Stop truncating "All later windows"

**Shape:**

- Widen the Evaluate combobox or shorten the option label to "Later
  windows".
- Same audit for any other combobox where the value is truncated.

---

### Fix D5 — Drift Columns as inline chips

**Shape:**

- Replace the single "Columns" button + modal with an inline chip row,
  matching the Timeseries `Series` selector and the Causal node
  selector. Each chip is a column name; click to toggle; colour
  matches the chart palette.
- Multi-select summary: "N of 7 selected".

---

### Fix D6 — Drift Thresholds group with tooltip

**Shape:**

- Add an `ⓘ` next to the THRESHOLDS label that opens a modal:
  "Composite drift uses four tests — PSI (population stability),
  Wasserstein distance, Kolmogorov-Smirnov, and Energy distance.
  Each fires when its score exceeds its threshold; 'Composite' fires
  when 2+ tests agree."
- Same pattern for any other jargon-heavy label on the page.

---

### Fix D7 — Align window selector units with the chosen Window

**Shape:**

- When Window = "Daily", the timeline X-axis should show single days
  (`2017-06-28`, `2017-06-29`), not 24-hour ranges.
- The window-selector dropdown should label windows as `Day 1`, `Day 2`
  (or `Window 1 of 363`).
- Same audit for Hourly, Weekly, Monthly.

---

### Fix D8 — Disabled Latest N with helper text

**Shape:**

- Below the Latest N spinbutton, render a small helper line: "Used
  only with 'Latest N windows' mode." when disabled.
- Same pattern for any other disabled combobox/spinbutton in the app.

---

### Fix S1 — Spectrogram auto-zoom to dominant frequency band

**Shape:** Mirror Fix 8 from the prior walkthrough.

- On first render, run a quick "find dominant frequency" pass and
  auto-zoom the Y-axis to a band of `0.1 × … 10 ×` the dominant
  frequency.
- Surface the dominant frequency and chosen band as a small caption
  above the chart.
- Add an "Auto-fit" toggle (default on).

---

### Fix S2 — Stop clipping the colorbar caption

**Shape:**

- The colorbar's `Z-SCORE → [0, 1]` caption should sit inside its
  container with adequate right padding.
- Consider wrapping the caption onto two lines if narrow.

---

### Fix S3 — Spectrogram X-axis label legibility

**Shape:**

- Drop ticks to a reasonable count (`maxTickCount = 8`) and rotate 0° /
  15° instead of 30°.
- Use shorter formats (`'17 Jun` instead of `06/28/2017`) when the
  chart is narrow.

---

### Fix S4 — Spectrogram chart caption

**Shape:**

- Render a one-line caption above the chart: "Spectrogram of HUFL ·
  Window 96 (1 day) · Hop 48 (50 % overlap) · Normalize Z-score
  [0, 1]".
- Update it as the user changes any control.

---

### Fix F4* — Timeseries Y-axis auto-fit for strictly-positive data

**Shape:** (unchanged from the prior walkthrough)

- Compute per-series min/max across active chips within the current
  viewport; floor the lower bound to `min(0, globalMin)`.
- Default-enable "Pin lower bound" when all active series are
  non-negative.

---

## Suggested execution order

1. Fix C1 + Fix C2 — Causal Compute (Causal is fully broken).
2. Fix D1 + Fix D2 — Drift status banner + thresholds (Drift contradicts itself).
3. Fix C3 + Fix C4 + Fix D3 — empty states and axis titles (new users' first impression).
4. Fix S1 — Spectrogram auto-fit (matches FFT fix from prior walkthrough).
5. Fix S2 + Fix S3 + Fix S4 — Spectrogram polish batch.
6. Fix C5 + Fix C6 + Fix D5 + Fix D6 + Fix D7 + Fix D8 — layout & jargon batch.
7. Fix D4 — combobox truncation.
8. Fix F4* — Timeseries Y-axis carry-over.

---

## Out-of-scope notes

- The Causal backend (`POST /api/analytics/causal`) works correctly via
  curl with the right payload shape. The bug is purely in the frontend
  request wiring and/or response handling.
- The Drift backend works fine — the threshold tightness is a UX /
  default-value concern, not a correctness bug.
- The previous walkthrough's out-of-scope notes still apply: the
  backend endpoints (`/api/data`, `/api/scatter/points`,
  `/api/analytics/spectrogram`) are returning the expected payloads.