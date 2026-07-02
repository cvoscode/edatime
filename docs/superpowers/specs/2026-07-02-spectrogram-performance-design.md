# Spectrogram Performance Design

## Goal

Improve spectrogram rendering speed for both initial compute and post-compute interactions without changing the visible feature set, backend contract, or page workflow.

## Scope

- Optimize `frontend/src/pages/spectrogramChartRuntime.ts`.
- Preserve the existing backend `fetchSpectrogram(...)` request contract.
- Preserve current controls, colorbar behavior, zoom, and tooltip content.
- Keep the ECharts heatmap renderer for this pass.

## Non-Goals

- No backend aggregation or API contract changes.
- No renderer rewrite to canvas/image tiles.
- No fidelity-reducing decimation policy in this pass.
- No broader analytics-page refactor outside the spectrogram runtime.

## Problem Statement

The current spectrogram runtime already caches raw/log grids, but redraws still pay large O(N) costs:

- `buildPointsFromGrid(...)` rebuilds the full heatmap tuple array when display mode changes.
- `cachedGrid.points.filter(...)` allocates another full array on every colorbar redraw.
- Each point currently carries redundant per-cell payload (`timeMs`, `freq`, `raw`) that can be derived from axis data and indices.

This makes both initial `Compute` and interaction redraws slower than necessary, especially on dense spectrograms.

## Selected Approach

Keep the ECharts heatmap path, but redesign the frontend cache so the spectrogram data is materialized once per compute and reused across redraws.

### Why this approach

- It directly targets the current hotspot in the live runtime.
- It keeps behavior stable.
- It avoids product decisions about downsampling quality.
- It creates a clean seam for a later decimation pass if needed.

## Architecture

### 1. Stable Spectrogram Render Cache

Replace the current single `cachedGrid.points` model with a cache that separates:

- source magnitude storage
- per-mode display values
- reusable chart payloads
- current visible range state

Proposed cache shape:

- `result: SpectrogramResult`
- `freqLen: number`
- `raw: Float64Array`
- `log: Float64Array`
- `linearDisplay: Float64Array`
- `logDisplay: Float64Array`
- `linearPoints: HeatmapPoint[]`
- `logPoints: HeatmapPoint[]`
- `linearMin: number`
- `linearMax: number`
- `logMin: number`
- `logMax: number`

`HeatmapPoint` remains ECharts-compatible, but stores only:

- `xIndex`
- `yIndex`
- `displayValue`
- `rawValue`

Time and frequency labels are derived from `spectrogramResult.times_ms` and `spectrogramResult.frequencies` in the tooltip formatter instead of being duplicated into every tuple.

### 2. One-Time Point Materialization Per Compute

On each successful `Compute`:

- flatten backend magnitudes into typed arrays
- derive `logDisplay` and `linearDisplay`
- compute min/max per display mode
- build `linearPoints` once
- build `logPoints` once

After that:

- log toggle swaps between `linearPoints` and `logPoints`
- redraw does not rebuild point tuples

### 3. Visual Range Instead of JS Filtering

Colorbar interactions stop filtering `series.data` in JavaScript when `visualMap` can preserve the current visible behavior.

Instead:

- `series.data` stays bound to the full cached point array for the active mode
- colorbar drag updates the active visible numeric range
- redraw applies that range to `visualMap.min` and `visualMap.max`

Expected effect:

- no per-drag `Array.prototype.filter(...)`
- no large throwaway arrays during colorbar interaction
- smoother handle movement and faster redraws

Fallback rule:

- if `visualMap` only recolors values and does not preserve the current hide/filter semantics, keep a second cached visibility layer derived from the stable point arrays rather than rebuilding or re-filtering from raw magnitudes

### 4. Render-State Decisions

The render path becomes:

1. Resolve active mode: `log` or `linear`
2. Read the prebuilt cached point array for that mode
3. Resolve min/max from cache
4. Resolve current visual range from colorbar state
5. Call `chart.setOption(...)` with stable `series.data`

The render path no longer:

- recomputes display arrays
- rebuilds point arrays on toggle
- filters point arrays on colorbar drag

## Data Flow

### Compute

1. User clicks `Compute`
2. Runtime fetches backend spectrogram payload
3. Runtime builds the stable render cache
4. Runtime stores applied normalize/clip settings
5. Runtime renders using the cached point array for the active mode

### Log Toggle

1. User toggles `Log`
2. Runtime selects `logPoints` or `linearPoints`
3. Runtime reuses cached min/max for that mode
4. Runtime redraws without rebuilding point data

### Colorbar Drag

1. User drags a colorbar handle
2. Runtime updates visible numeric range state
3. Runtime redraws with the same cached point array
4. `visualMap` range changes; `series.data` identity stays stable

## Error Handling

- Preserve current fetch/render error placeholder behavior.
- If cache construction finds no finite values for a mode, preserve the current fallback min/max normalization.
- If normalized output disables frontend log scaling, continue to use the linear cached display path.

## Testing

### Regression Tests

Add or update focused tests in `frontend/src/pages/spectrogramPage.test.ts` to verify:

- log toggles reuse cached point arrays instead of rebuilding them
- colorbar drags do not shrink `series.data` through JS filtering
- normalized spectrograms still render correctly with the new cache structure
- tooltip content still resolves correct time, frequency, display, and raw values

### Verification Commands

- `npm test -- frontend/src/pages/spectrogramPage.test.ts`
- `npm run check:frontend`

## Risks

### ECharts still owns final draw cost

This pass removes avoidable frontend allocation and filtering overhead, but ECharts heatmap rendering remains the main lower bound once the JS hot path is improved.

### Visual filtering semantics

Moving colorbar interaction from JS point filtering to `visualMap` range control may change whether out-of-range cells are hidden versus recolored/clamped. The implementation must preserve the current user-visible expectation; if `visualMap` alone does not do that, the fallback cached-visibility path becomes mandatory.

## Follow-Up Criteria

If this pass still leaves large spectrograms slow, the next step should be a second design for one of:

- viewport-aware downsampling/aggregation
- image/canvas-backed spectrogram rendering

That work should be justified by a fresh measurement after this cache redesign lands.
