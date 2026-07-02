# EdaTime Usage Audit — Remaining Issues

This file is a pruned subset of the original 2026-06-29 audit. Items that
have been implemented end-to-end have been removed. Items that are
**partially implemented** are kept, but only the unfixed portion is
described. Items that have **not been implemented at all** are kept
verbatim. New observations from later sessions (if any) should be added
at the bottom under "New observations".

Sample dataset used during the audit: ETTm2 (69,680 rows, 7 columns).

Severity legend:
- **H** High — confusing or broken core flow
- **M** Medium — visible friction / wasted time
- **L** Low — cosmetic or nice-to-have

---

## 1. Matrix loads cells one-by-one with a visible "fill in" effect

**Severity:** M
**Pages affected:** Scatter → Matrix view

**What I saw.** After entering Matrix view with the ETTm2 sample, the
status string updates through "Matrix loaded 4/16 cells with
Histogram diagonals", "8/16 cells", "12/16 cells", up to "16/16 cells"
— the cells visibly appear over time. Each batch (~4) comes in, then
more, with the heatmap or scatter inside each cell redrawing as data
arrives.

**What's already done.**
- [frontend/src/scatter/matrix.ts:230-275](frontend/src/scatter/matrix.ts#L230)
  coalesces paints to one per `requestAnimationFrame`, so the visible
  jank is reduced even though status text still updates per cell.

**What's still missing.**
- A batch endpoint: a new `POST /api/scatter/matrix` that accepts
  `{ columns, filters, linked_range, point_limit, color_column }` and
  returns Arrow IPC with a flat `[x, y, pair_id]` schema (or one IPC
  stream per pair in a multi-part response). Decode once, then paint
  the entire grid in one synchronous step.
- Raise the worker pool (e.g. 8 or 12) and prioritize (current pair >
  suggested columns > rest) — `buildMatrixFetchPairs` already supports
  priority, so this is mostly a tuning change on top of the batch
  endpoint.
- Defer `scheduleRender` to fire only on the first response and once
  at the end (skip intermediate redraws) so the user sees a single
  "snap" from empty to fully populated rather than a slow fill-in. The
  rAF coalesce in place is a stop-gap, not the end state.

**Verification path.** With DevTools Network throttling on "Fast 3G"
and the matrix view, capture screenshots at t=0 ms, 250 ms, 500 ms,
1 s, 2 s. The number of populated cells should jump in larger steps
(or one step at all), not trickle in one at a time.

---

## 2. Scatter Plot still shares Plot/Matrix filter state after Matrix

**Severity:** H
**Pages affected:** Scatter → Plot view

**What I saw.** After viewing the Matrix view, switching back to **Plot**
in the same page left the density plot showing a faint diagonal blob
with the overlay **"No scatter points found / Clear active filters"**
even though the chart axis was clearly zoomed in
(`HUFL: -2.14 → 109.11`). Clicking "Clear active filters" repopulated
the density plot.

**What's already done.**
- Switching Matrix → Plot now resets the stale plot zoom/view state, so
  the chart no longer stays blank just because the previous view bounds
  were invalid for the refreshed point set.
- When carried filters leave Plot empty, the page now surfaces a
  non-blocking warning with a one-click **Clear** action instead of only
  leaving the user in the empty state.

**What's still missing.**
- Plot and Matrix still share one filter state. The current hint makes
  the failure recoverable, but the underlying coupling remains.
- [frontend/src/store/scatterState.ts:71-145](frontend/src/store/scatterState.ts#L71)
  still has a single shared filter model. If the product wants truly
  independent Plot vs Matrix exploration, add explicit
  `plotFilters` / `matrixFilters` ownership instead of relying on one
  shared slice plus recovery messaging.

**Verification path.** Use the VS Code browser, open Matrix, then
Plot. Reload and capture whether the "No scatter points found" overlay
is shown when filters carry over.

---

## 3. Correlations heatmap has no fit-to-screen toggle

**Severity:** M
**Pages affected:** Correlations (`#page=heatmap`)

**What I saw.** The Correlations heatmap now fills the shell more
cleanly and the headers are readable, but there is still no direct
"fit to screen" affordance when the user wants to snap the matrix back
to the panel width without manually adjusting the size slider.

**What's already done.**
- [frontend/src/pages/heatmapPage.ts:276](frontend/src/pages/heatmapPage.ts#L276)
  now uses CSS grid (`display:grid;width:100%`) with explicit
  `grid-template-columns` / `grid-template-rows`.
- [frontend/src/pages/heatmapPage.ts:198-216](frontend/src/pages/heatmapPage.ts#L198)
  derives cell size from `container.clientWidth` via
  `responsiveCell = Math.max(minCell, Math.min(maxCell, fitCell))`,
  so the grid fills the shell width instead of staying at
  `column-count × fixed-cell-size` width.
- Column headers are now rendered horizontally instead of using the
  old rotated `heatmap-header--vertical` presentation.

**What's still missing.**
- A small "Fit to screen" toggle so the user can snap the matrix to
  the panel width regardless of the slider position.

**Verification path.** Open the Correlations page, drag the panel to
half-width and full-width, capture screenshots, confirm the matrix
expands and the column headers remain readable (horizontal, not
rotated).

---

## 4. Series chip colour picker has no live preview or dark-theme palette

**Severity:** L
**Pages affected:** Timeseries (and FFT, Causal, Drift)

**What I saw.** Each series chip has a `<input type="color">` that
opens a native picker. Changing the colour does update the line
colour in the chart, but the native picker defaults to a 2D palette
that's a poor match for dark backgrounds, and the chip swatch does not
update its style preview as the user drags inside the picker.

**Where it comes from.**
[frontend/src/ui/primitives/ColorInput.ts](frontend/src/ui/primitives/ColorInput.ts)
is a 21-line wrapper around native `<input type="color">` with no
custom picker, no preset palette UI, and no in-place live preview.
The chart line updates live because `onColorInput` is wired into
`setSeriesColor`, but the picker itself remains the OS default.

**Suggested fix.**
- Replace the native `<input type="color">` with a compact custom
  picker (presets + hex input) that shows swatches tuned for the
  dark theme.
- Update the chip swatch + chart line immediately as the user picks.
- Keep the native input as a fallback for accessibility (`<input
  type="color">` with a visually hidden label is still keyboard
  accessible).

**Verification path.** Open Timeseries, change a chip colour, verify
the chart line updates without lag and that the chip swatch reflects
the new colour through the custom picker.

---

## 5. Adaptive line filter hint still has no quick-reference entrypoint

**Severity:** L
**Pages affected:** Timeseries (`#page=timeseries`)

**What I saw.** Drawing an adaptive filter line by Ctrl+clicking on
the chart is now documented inline, but there is still no quick
reference entrypoint near the **Draw** toolbar itself. Users who
dismiss the hint or skip the keyboard help modal still have no obvious
in-context way to rediscover the interaction vocabulary.

**What's already done.**
- [frontend/src/features/timeseries/columnsController.ts:74-103](frontend/src/features/timeseries/columnsController.ts#L74)
  inserts a `.timeseries-adaptive-hint` element after the chip rail
  with a "Ctrl + click" kbd badge and the helper text. The hint
  flips to an "active target" state once a column is chosen.
- The hint can now be dismissed and that preference persists across
  reloads.
- The keyboard help modal
  ([frontend/src/utils/a11y.ts:126](frontend/src/utils/a11y.ts#L126))
  lists `Ctrl+click → Set adaptive filter`.

**What's still missing.**
- No "?" icon next to the **Draw** toolbar that opens a quick
  reference modal for the chart interaction vocabulary.

**Verification path.** Reload Timeseries, confirm the hint is visible
without scrolling, dismiss it (or click "?"), reload, and confirm the
preference persists.

---

## 6. Timeseries zoom shows negative y-range with selected series that are all positive

**Severity:** L
**Pages affected:** Timeseries

**What I saw.** With all 7 series selected on Timeseries, the y-axis
shows `-15.42` to `113.77`. Series like OT (oil temperature) are
non-negative, so the lower half of the chart is empty. This is
expected auto-scaling behaviour, but the wide negative range makes
the non-OT series look noisy.

**Where it comes from.** [frontend/src/ui/toolbar.ts](frontend/src/ui/toolbar.ts)
and [frontend/src/chart/DataChart.ts](frontend/src/chart/DataChart.ts)
contain no `stackFromZero`, `autoscale-per-series`, `baseline`, or
`perSeries` toggle. Y-range logic in `chartInteractions.ts` and
`DataChart.ts` uses standard `yMin`/`yMax` from data extents
(`dataYMax = Number.NEGATIVE_INFINITY` then iterated), producing the
full data range.

**Suggested fix.**
- Add a "Stack from zero" / "Autoscale per series" toggle in the
  chart toolbar (already a known roadmap item).
- Or, add a small "Y range" manual override so users can pin the
  lower bound to 0 for non-negative data.

**Verification path.** Open Timeseries with all 7 numeric series
selected, confirm the toolbar exposes a per-series / zero-baseline
toggle that changes the y-axis bounds without a refetch.

---

## New observations

> Append new items here as they are observed in later sessions.
> Include the same fields: Severity, Pages affected, What I saw,
> Where it comes from, Suggested fix, Verification path.
