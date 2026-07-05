# EdaTime app review (ETTm2 walkthrough)

Walked through the app using the **ETTm2** sample dataset (`HUFL, HULL, MUFL,
MULL, LUFL, LULL, OT`, 69 680 rows). Reviewed the running app in the browser
and inspected the backend API responses. This document lists observed issues
and a fix plan per issue. Severity is the user's-visible impact.

Severity legend: **H** high (blocks primary use), **M** medium (visual or
workflow friction), **L** low (polish).

## Top priorities to address first

1. **Scatter "No scatter points found"** when "Link chart range" is on but no
   range is set (Issue 6, H).
2. **Scatter Y-axis wrong / y-floor stripe** (Issues 7, 8, H).
3. **Correlation colormap inverted** for positive values (Issue 17, H).
4. **Drift Start/End timezone shift + 363/363 flag-everything** (Issues 14,
   15, H).
5. **Timeseries legend overlapping Y-axis labels on zoom** (Issue 3, H).

---

## Issues found

### 1. Timeseries "X of N active" counter is stale (M)

After toggling MUFL on (4 of 7 columns active), the label still reads
`3 of 7 active. Click chips to add more.`. The legend/trace group updates
correctly, but the inline count text doesn't.

### 2. Timeseries chips and "Filter columns" row have broken layout (M)

When chips overflow (more than ~5 selected), the row containing
"Series / Filter columns…" input gets pushed down and the chips render above
the toolbar row, leaving the SERIES label isolated in the upper-left and the
chips floating between two unrelated rows. The two rows should be one
horizontally-scrolling group.

### 3. Timeseries chart legend overlaps Y-axis labels on zoom-in (H)

After zooming to a narrow range, the right-side floating trace legend (HUFL,
HULL, OT, MUFL) renders on top of the Y-axis tick labels (`61.11`, `46.53`),
making both unreadable.

### 4. Timeseries hides negative values for HULL when "Pin lower bound" is on (M)

With `Pin lower bound = 0` and the default chart range, HULL values below
zero are silently clipped at the floor (real HULL range is
`min=-29.32, max=36.44`). Users lose visibility of negative excursions and
of the 30.03.2017 large outlier cluster.

### 5. Timeseries "Viewing X%" indicator behaves oddly after Quick Range (L)

After pressing `7d`, the indicator briefly showed `Viewing 1%`. Likely a
fraction-vs-percent formatting glitch while the chart is settling.

### 6. Scatter reports "No scatter points found" when "Link chart range" is on with no time filter (H)

With Link chart range enabled but no active time range / adaptive filters,
the scatter view shows:
`No scatter points found — No points match active filters (1 column, 0 adaptive).`
even though the density backdrop clearly contains data. Toggling the checkbox
off recovers the points.

### 7. Scatter Y-axis range is wrong for HULL (H)

The Y-axis displays ticks at `1.49, 13.44, 25.40, 37.36` for HULL when
`HULL.min=-29.32, HULL.max=36.44`. The negative half is missing and a
horizontal "stripe" of points at `y ≈ 1.49` is visible, indicating a partial
drop / floor in the axis padding. Likely a `min > max` or `pad < 0` bug in
the axis-fit logic.

### 8. Scatter density shows a long horizontal bright bar at the y-axis floor (M)

In density mode the entire row at `y = 1.49` is lit up, including parts of
the canvas far away from the data cluster. Looks like zero / NaN
substitutions, or a missing y-bin on the bins array.

### 9. FFT page only plots 2 of N selected columns by default (M)

The chip row shows 7 columns but only `HUFL` and `HULL` are pressed. This is
a reasonable default but the selection is not visible on the legend until
the user toggles chips. No hint explains that the chart starts with only
two.

### 10. FFT Y-axis shows negative "log10(Magnitude)" values (M)

Magnitudes are non-negative. After log, log10(magnitude) should also be
non-negative. Current axis shows `0.164, -0.615, -1.393, -2.171, -2.949`.
Either log10 is being applied to a value that has been centered/scaled, or
the axis is offset incorrectly. Either way, "log10(Magnitude)" should
produce values ≥ 0.

### 11. Spectrogram X-axis labels are rotated to a near-vertical angle (M)

Time labels like `06/20 09:45` are tilted almost 90°, fighting each other
and the next tick. Auto-rotate is too aggressive; should use a shallower
angle or fewer ticks.

### 12. Spectrogram color range is dominated by yellow (M)

Default color range is `-3.998 .. 0.575` (LOG10). With "None" normalize and
no clipping, ~99 % of pixels saturate at the bright yellow end. Either the
default normalize/clipping is wrong, or the colorbar isn't being computed
from the visible data range.

### 13. Causal workflow banner has an empty action box with only ✕ (M)

On the Causal page the guided-workflow card shows
`✓ 4 completed → Causal` and then a small empty box containing only an `✕`
button. There is no "Open …" action button for the current step. On
non-current pages (Upload, Scatter) the workflow banner shows the correct
action button (e.g. "Open Timeseries", "Open Scatter"). The Causal
branch is missing the action button or the empty placeholder is wrong.

### 14. Drift page uses an off-by-2-hour timestamp for Start/End (H)

Default reference shows `Start: 01/07/2016 02:00` and `End: 28/06/2017 23:52`
while the dataset spans `2016-07-01 00:00:00` to `2018-06-26 19:45:00`.
The start is shifted by 2 hours and the end is shifted to the wrong day
boundary. Looks like a TZ conversion (Europe/Berlin?) is applied to a
UTC-stored time column. Reference window therefore does not align with
the data.

### 15. Drift flags every window as RED (363/363) for every column (H)

All seven columns show `Flagged windows: 363/363` with PSI > 5, Wasserstein
> 2, KS p ≈ 0. ETTm2 has real concept drift, but **identical 363/363 across
every column and identical "Strongest reasons: psi_major, wasserstein, ks,
es"** suggests a degenerate comparison — possibly caused by the wrong
reference window (#14) or by comparing daily windows that don't overlap
the reference range.

### 16. Drift "Columns" picker shows a single value instead of a multi-select (M)

The Columns pill shows `HUFL` / `7 columns` but it isn't styled like a
multi-select pill — it looks like a single-select combobox until the user
opens the dialog. Users miss that this is a multi-select.

### 17. Correlation matrix colormap appears inverted for positive values (H)

The diagonal `1.00` cells render dark red, off-diagonal `0.67` cells render
in white/light pink, and `0.91` (HULL↔MULL) is lighter than `0.67` (HUFL↔LUFL).
The mapping appears reversed: brighter = lower |corr|, darker red = higher
|corr|. Negative values render in light blue that is hard to read on the
dark background.

### 18. Settings page not verified in this pass (—)

Settings link exists in the sidebar but was not exercised; flagged for a
follow-up walkthrough.

### 19. Home page sample cards: text overflow / inconsistent CTA label (L)

"Upload a file to get started" sits in the hero CTA; the sample cards under
"Try with sample data" include the badge `Best first stop: Timeseries` for
ETTm2 but the same-style card for Sinusoidal has `FFT` only. The badge is
helpful, but the helper line under each card is slightly clipped on the
Sinusoidal card at default zoom.

### 20. Several chart overlays / export controls not exercised (—)

`Drawing tools`, `Analytics → Bands, anomalies, cleanup`, `Annotations`,
and `Export → SVG/JSON/Parquet` were not exercised end-to-end. They are
flagged for a follow-up pass; likely candidates for similar staleness
issues to #1.

---

## Fix plan

Each plan is sized to be a single PR / commit. Items ordered by impact.

### F1. Fix scatter "No scatter points found" when Link chart range is on but empty (Issue 6)

Goal: When "Link chart range" is on, the scatter query should still return
data unless the user explicitly selected a chart viewport that has no
overlap with the scatter range.

Suggested approach:

- Audit `frontend/src/scatter/*` for the link-chart-range wiring. Confirm
  that an empty linked range is treated as "no filter" instead of "filter
  that matches nothing".
- In `frontend/src/services/api/scatter.ts` (or equivalent transport
  helper), make sure that an empty `start/end` pair is dropped from the
  request payload, mirroring the timeseries data fetcher.
- Add a regression test that mounts the scatter page with "Link chart
  range" checked and an empty viewport, asserts no empty-state copy is
  shown, and asserts a non-zero `returned_points` in the latest fetch.
- Add a `tests/unit_tests.rs` / frontend test covering: empty linked range
  → no filter, non-empty → filter applied.

### F2. Fix scatter Y-axis range and the bright stripe at y = 1.49 (Issues 7, 8)

Goal: HULL (and other columns) should render with their full range, and no
horizontal stripe should appear.

Suggested approach:

- Locate the axis-fit logic in `frontend/src/scatter/rendering.ts` (or
  wherever the density/scatter option builder lives).
- Confirm that axis bounds use `[min, max]` of the visible points,
  including negatives; never clamp by `[0, max]`.
- Confirm that empty bins are still binned into the y-bin array (no
  division by zero or `min >= max` shortcut).
- For the stripe: verify there is no `if (y === undefined) y = 0` default;
  filter out `null/undefined` and non-finite values before computing
  density, and skip missing bins.
- Add a fixture of 1000 random points including negatives, assert no
  y-floor stripe, assert `y_axis_min < 0`.

### F3. Fix correlation matrix colormap (Issue 17)

Goal: Strong positive correlations should look bright/saturated, weak
correlations pale, negatives blue. Number labels must stay legible.

Suggested approach:

- Locate the colormap construction in
  `frontend/src/scatter/correlationsPanel.ts` (or matrix mode).
- Pick a diverging colormap (e.g. RdBu reversed) and anchor it at `[-1, 0,
  +1]` with `0` as the neutral midpoint.
- Sanity check by asserting the diagonal cell color is the most saturated
  end of the scale and the `0` cell is at the neutral midpoint.
- Bump contrast on numeric labels (white or near-white text on saturated
  cells, dark text on pale cells, or always a contrasting stroke).
- Add a unit test that renders a known matrix and asserts the colors at
  `[i,i]`, `[0,1]`, and `[0,1]` where `corr = -1`.

### F4. Fix Drift Start/End timezone shift (Issue 14)

Goal: The reference Start/End inputs should display the dataset's actual
UTC time, not a shifted value.

Suggested approach:

- Find the formatter used for the Start/End inputs
  (`frontend/src/pages/driftPage.ts` or similar).
- The dataset stores `date` as `datetime[ms]` already in UTC. Verify the
  formatter is `formatInUtc(...)` and not `formatInLocal(...)`.
- Once shifted back to UTC, the default `First 50%` should land near
  `2016-07-01 00:00 → 2017-06-28 ~00:00` instead of `02:00 → 23:52`.
- Add a regression test that loads ETTm2, reads the displayed reference
  start, and asserts it equals `2016-07-01T00:00`.

### F5. Fix Drift all-windows-flagged regression (Issue 15)

Goal: Drift results should reflect real distribution shifts, not flag
every window uniformly.

Suggested approach:

- Verify the reference window is actually applied. The 363/363 across
  every column plus identical "Strongest reasons" suggests a single
  shared comparison result is being reused per column without proper
  per-column windowing.
- Confirm the backend route `POST /api/drift/stats` (or equivalent)
  computes the reference per column or takes the reference window once
  and applies it consistently.
- Sanity-check by running drift against a stable synthetic series (e.g.
  sine wave) — it should not flag every window.
- Add a backend integration test asserting that two disjoint windows of
  the same stable distribution report `Flagged ≈ 0`.

### F6. Make Timeseries active-count text reactive (Issue 1)

Goal: "X of N active" updates immediately on chip toggle.

Suggested approach:

- Find the active-count text node in `frontend/src/features/timeseries/*`
  (likely a derived value). Replace any memoized/read-once value with a
  live read of `selectedSeries.length` from the store.
- Add a vitest unit test that toggles chips and asserts the text updates
  synchronously.

### F7. Fix Timeseries chips / Filter-columns layout (Issue 2)

Goal: Series chip row + Filter columns input should be one tidy
horizontally-scrolling group that doesn't push other rows around.

Suggested approach:

- Audit the toolbar flex layout in the Timeseries page toolbar module.
  Ensure the chips wrapper has `flex-wrap: wrap` with the input sticking
  to the left, and that it does not break onto a separate row above the
  controls toolbar.
- If the right-side workflow hint can't fit, it should be allowed to
  collapse below the chips, not above.
- Add a Playwright screenshot regression at two viewports (1280 and
  1600 width) with all 7 columns selected, capturing the layout.

### F8. Move Timeseries legend out of the chart plot area on zoom (Issue 3)

Goal: Legend must not overlap Y-axis labels.

Suggested approach:

- In `frontend/src/chart/DataChart.ts`, when the chart is zoomed-in (small
  X span), relocate the trace legend to the toolbar area (next to
  "Series") or pin it to the top-left *inside* the toolbar wrapper, not
  inside the SVG canvas.
- Verify the floating legend is removed (or moved) when chart width is
  small.
- Add a Playwright screenshot regression for both initial and zoomed-in
  states.

### F9. Make negative Y values visible when Pin lower bound is off (Issue 4)

Goal: HULL negative excursions should remain visible.

Suggested approach:

- In `frontend/src/features/timeseries/entrypoint.ts` and related, verify
  the default Y-range is computed from `Math.min`/`Math.max` over visible
  points and that "Pin lower bound" only kicks in when explicitly
  enabled. With the default off, negatives should be visible.

### F10. Replace single-value Columns pill with a multi-select pill (Issue 16)

Goal: Drift Columns pill should look and act as a multi-select.

Suggested approach:

- Locate the columns pill in the drift page UI; ensure it always shows
  `N columns` when `N > 1`, and that the dropdown clearly indicates
  multi-select behavior (and a quick "All / Single / None" toggle).

### F11. Fix FFT Y-axis for log10(Magnitude) (Issue 10)

Goal: log10(Magnitude) should be ≥ 0.

Suggested approach:

- Locate the FFT Y-axis configuration. Confirm the FFT magnitude is
  normalized before log, or that the axis `min = 0`. Magnitudes are
  always ≥ 0; log10 of them is ≥ -∞, but typically you floor at a small
  epsilon or shift by 1 to avoid negative infinities.
- If log10 is intentional for small values, document and clamp the
  axis `min = -3` or similar.

### F12. Tune Spectrogram axis label rotation and default normalization (Issues 11, 12)

Goal: Time labels stay readable; the heatmap shows real variation instead
of an all-yellow field.

Suggested approach:

- For label rotation: in the spectrogram option builder, rotate X labels
  by -25° or use multi-line labels instead of -90°.
- For color: default `Normalize = Min-max` (or `Z-score`) so the colorbar
  spans the actual data range. Disable log scale by default for cleaner
  reads, or make log scale explicit with a more aggressive color domain.
- Add Playwright screenshot regression at default and at "Min-max" +
  "Outliers 1%" modes.

### F13. Repair Causal guided-workflow action button (Issue 13)

Goal: Workflow card should render the correct "Open …" action button for
the next step, or render a clean empty state when there is no next step.

Suggested approach:

- Audit `frontend/src/components/workflow/*` (or equivalent) for the
  empty `✕` rendering. Add a fallback when the current step has no
  suggested next page: either hide the action box entirely or replace
  it with "Current step" disabled state.

### F14. Stale "Viewing X%" indicator after Quick Range (Issue 5)

Goal: The zoom indicator displays a sensible percentage as soon as the
chart settles.

Suggested approach:

- Confirm the zoom indicator reads from the current chart viewport, not
  from a previous value, and that the format is integer percent with no
  fraction when below 10 %.

### F15. Verify Home sample card layout polish (Issue 19)

Goal: Sinusoidal sample card description fits without clipping.

Suggested approach:

- Audit the card grid CSS so descriptions wrap to multiple lines instead
  of clipping.

### F16. Add browser-verified regression tests for the fixes above

Goal: Every fix should land with a Playwright or vitest regression test
that reproduces the original symptom and confirms the new behaviour.

Suggested approach:

- Add a `tests/e2e_audit_tests.ts` scenario that:
  - Loads the ETTm2 sample
  - Walks Timeseries → Scatter → FFT → Spectrogram → Causal → Drift →
    Correlations → Home
  - Captures a screenshot per page
  - Asserts the key UI invariants (legend not overlapping y-axis, scatter
    returns points, drift does not flag all windows, correlation colors
    match expectations, etc.)

### F17. Settings + remaining untouched controls (Issues 18, 20)

Goal: Cover Settings page, drawing tools, analytics modal, annotations,
and additional exports.

Suggested approach:

- Schedule a second walkthrough that exercises each of these surfaces and
  files follow-up issues.