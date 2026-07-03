# EdaTime app review — issues spotted

Reviewed the running app on `http://127.0.0.1:5173/` with the **ETTm2 sample dataset** loaded (69,680 rows × 7 cols: HUFL, HULL, MUFL, MULL, LUFL, LULL, OT).

Environment notes:

- Frontend served via Vite dev server at `127.0.0.1:5173`.
- The Vite HMR WebSocket dropped once during navigation (`ws://127.0.0.1:5173/` → `ERR_CONNECTION_REFUSED`) but page navigation continued to work.
- Dev console otherwise clean on the pages visited.

---

## 1. EdaTime logo / loading wave icon renders as a jagged polyline (looks broken)

**Where:** App loading overlay (`.app-loading-overlay__brand`) AND the brand mark in the top header (`EdaTime` title in the banner), AND the icon on the "Sinusoidal Waves" sample card.

**What's off:** The icon is intended to look like a smooth sine wave / sparkline, but the SVG is a polyline with 5 hardcoded points:

```html
<polyline points="1,10 4,6 7,12 10,3 13,8 15,7"></polyline>
```

Because `stroke-linejoin="round"` only applies to where two straight segments meet, and these segments are very short with sharp angle changes, it renders as a **pointy zig-zag / spike pattern** rather than a smooth wave. In the screenshots it looks more like a heartbeat trace or a spike chart than a sine wave — and it does look like a "loading bar" because of the chunky spikes.

**Fix idea:** Use a `path` with cubic bezier (`C`/`S`) curves, or use many more points with `stroke-linejoin="round"` to approximate a sine wave. Example:

```html
<path d="M1 9 C3 4, 5 4, 7 9 S11 14, 13 9 S15 6, 15 6"
      fill="none" stroke="currentColor" stroke-width="1.7"
      stroke-linecap="round" stroke-linejoin="round"></path>
```

The exact same polyline is reused in three places, so this fix should land in the shared icon component.

---

## 2. Correlations / heatmap: tiny grid stuck in top-left, axis labels overlap

**Where:** `#page=heatmap` (Correlations page).

**What's off:** With ETTm2 (7 numeric columns), the heatmap renders as a small 7×7 block in the upper-left corner of the main content area. The column labels along the top are rotated 90° and stacked on top of each other — `HUFL`, `LUFL`, `HULL`, `MULL`, `OT`, `LULL`, `MUFL` are all crammed into the same ~80px vertical strip. The row labels along the left are also clipped against the plot edge. Clicking `Auto-fit` did not visibly correct this.

This is independent of cell size (`36` looks reasonable), so the heatmap container is failing to size to its host, or the labels are not getting extra room.

**Fix idea:**

- Make sure the `<main>` host gives the heatmap a measurable width (it currently looks like the SVG is sized off its intrinsic grid width and never grows with the available space).
- Reserve explicit padding for axis labels (left for row labels, top for column labels) — currently they appear to live outside the plot area but with no margin.
- After Auto-fit, run a ResizeObserver-based relayout, not a one-shot layout on mount.

---

## 3. FFT page: top peak labels overlap into one unreadable blob

**Where:** `#page=fft`.

**What's off:** The "Top peaks" annotation labels above the highest magnitude peak render as a stack of overlapping text:

```
0.08 µHz
656 µHz
-1.8 (e02)
1415 d
```

This is visually a mess — it looks like a bug in the peak annotation layout. Each top-peak callout is being drawn at roughly the same XY near the dominant peak, so the strings collide.

**Fix idea:**

- Stagger peak callouts vertically (offset subsequent labels by N pixels) or use leader lines so they don't all sit on top of each other.
- Limit to 3 peaks (or fewer if the dataset only has one truly dominant one) and order by magnitude.

Also: `Sample rate 1.111e-3 Hz` / `Nyquist 5.556e-4 Hz` — note **Nyquist < sample rate**. The values look swapped or miscomputed; Nyquist should be `sample_rate / 2 ≈ 5.556e-4` only if the sample rate is `1.111e-3`. So that's actually consistent if it's a unit issue (the sample rate is in **Hz** but the axis is **µHz**, and the display might be showing the µHz value while the underlying unit string says Hz). Either way the labels are inconsistent — either the unit label is wrong, or the values are.

---

## 4. Timeseries: Y-axis tick labels overlap each other on the left

**Where:** `#page=timeseries` with ETTm2 selected series (HUFL, HULL, OT).

**What's off:** The Y-axis tick labels (e.g. `112.79`, `80.79`, `48.80`, `16.80`, `-15.20`) collide vertically — `112.79` and `80.79` are stacked on top of each other and unreadable, and the legend's `OT` row partially overlaps the axis labels.

**Fix idea:**

- Drop one or two ticks when the label height exceeds available spacing, or increase the left margin / plot padding.
- Move the in-canvas legend further from the Y-axis or add a small background plate behind it.

---

## 5. Spectrogram: looks OK with ETTm2, but `High · 1.228` / `Low · -3.499` colorbar ticks have no units labelled on the legend ends

Minor — the colorbar shows numeric High/Low but the unit (`log10 magnitude`) is only shown at the very bottom right, wrapped onto two lines (`LOG10\nMAGNITUDE`). Looks unintentional in the dark theme.

---

## 6. URL hash / page-id mismatch on Correlations

When I clicked the `Correlations` nav button, the page changed to the heatmap view but the URL ended up as `http://127.0.0.1:5173/#page=heatmap` instead of `#page=correlations`. So either the nav button is mis-keyed (it stores the wrong page id) or the URL is rewritten after navigation. Worth a quick check that the canonical page id is `correlations` everywhere.

---

## 7. Vite HMR WebSocket drops mid-session

Console error during testing:

```
WebSocket connection to 'ws://127.0.0.1:5173/' failed:
  Error in connection establishment: net::ERR_CONNECTION_REFUSED
```

Page still worked, so this is likely a benign HMR reconnect, but worth keeping an eye on because it surfaced while I was just navigating pages.

---

## Things that worked correctly

- ETTm2 sample load (`69K rows · 7 columns`) triggered the toast, populated metadata, and the chart rendered.
- Timeseries chart shows the 3 active series and adapts when chips are toggled.
- Series chips, per-series color picker button, adaptive filter hint, quick-range buttons (`24h / 7d / 30d / All`), zoom controls, robust-range, draw tools are all wired and visible.
- FFT trace legend toggles (`HUFL` / `HULL`) work.
- Spectrogram computes and renders with the configured window/hop/scale.
- Scatter page renders density plot for HUFL ↔ HULL with viridis legend (from the first snapshot, before ETTm2 reload).
- Drift page empty state is clean (`No drift analysis yet`).
- Keyboard shortcut badges (`⌥1…⌥0`) shown in nav and on home cards.

---

## Suggested priority

1. Heatmap layout regression (issue #2) — this is a clear functional regression for the Correlations page.
2. EdaTime / "loading wave" icon (issue #1) — small but it's the very first thing users see, and currently looks broken.
3. FFT top-peak annotation layout (issue #3) — currently unreadable.
4. Timeseries Y-axis label collision (issue #4) — visible on every chart load.
5. Remaining polish items (#3 Nyquist unit, #5 colorbar units, #6 hash id, #7 HMR WS).