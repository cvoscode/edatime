# Spectrogram Page — UI Layout Improvement Plan

**Date:** 2026-07-11
**Scope:** `frontend/src/pages/spectrogramPage.ts`, `frontend/src/pages/spectrogramChartRuntime.ts`, `frontend/index.html`, `frontend/css/modules/{layout,toolbar,responsive}.css`
**Dataset verified:** ETTm2 (69,680 rows · 7 numeric columns: HUFL, HULL, MUFL, MULL, LUFL, LULL, OT) loaded into the shared `DataFrame`.
**Method:** Probed the live dev server at `http://127.0.0.1:5173/#page=spectrogram` with Playwright at six viewport sizes (1920×1080, 1440×900, 1280×800, 1024×768, 820×1180, 414×896). Screenshots saved to `/tmp/probe-spectrogram-*.png`.

---

## 1. Findings (current behavior)

### 1.1 Toolbar overflow at ≥1920 px (highest impact)

The Display segment is **1107 px wide** and pushes Export (260 px), Zoom (179 px) and Compute (103 px) off the right edge. The toolbar wraps to **2 rows** at 1920×1080. **Compute** then gets bumped alone to the far left of row 2, separated visually from Export/Zoom, breaking the "primary action on the right" convention. This is the most visible defect on wide screens.

### 1.2 Toolbar overflow at 1280 px

The Clip segment is pushed off the right edge of the toolbar. Users lose access to `Clip`, `Clip method`, and `Clip %` controls without resizing the window — a functional defect, not just cosmetic.

### 1.3 Sidebar wraps at ≤1024 px

The vertical nav labels wrap mid-word ("Timeserie s", "Correlatio ns", "Spectrogr am"). This is a global sidebar issue but especially painful on the spectrogram page where the chart already competes for horizontal space.

### 1.4 Eyebrow labels waste horizontal space

`DISPLAY`, `EXPORT`, `ZOOM` eyebrows repeat the segment's purpose that the field labels (`Column`, `Window`, `Hop`, `Scale`, `Normalize`, `Clip`) already convey. At ≤940 px the CSS hides them, but at desktop widths they still consume ~120 px of segment width. Removing or repurposing them frees space for the actual controls.

### 1.5 Clip controls are noisy when inactive

`Clip method` and `Clip %` inputs are always rendered (just disabled). When "Outliers" is unchecked they take ~180 px of horizontal space with no information value. The FFT page already solves this with `.fft-filter-band.is-hidden` toggling — we should mirror that.

### 1.6 Export uses a disclosure menu, FFT uses inline icon buttons

The spectrogram Export segment uses a `<details class="toolbar-disclosure">` for "Format → Image + HTML". The FFT page replaced this with `.fft-export-icons` (inline PNG / SVG / HTML / CSV buttons). The inline pattern is faster to scan and one click shorter to reach each format.

### 1.7 No results summary or context panel for the rendered spectrogram

- `spectrogramChartRuntime.ts` queries `summaryEl = document.getElementById('spectrogram-summary')` but the element does not exist in `index.html`. That code path is dead.
- The FFT page exposes a `.fft-spectral-info` overlay with sample rate, Nyquist, and top peaks. A spectrogram equivalent ("Time points · Frequency bins · Sample rate · Nyquist · Time span") would help users interpret the rendered result.

### 1.8 Colorbar layout on small screens

- At 820×1180 the colorbar moves to a horizontal strip **below** the chart (per `@media (max-width: 720px)`), which is correct.
- At 414×896 the colorbar still overlaps with the chart because `cb-range-track` (131 px) exceeds the visible track height (12 px). The label `Z-SCORE → [0,1]` truncates to `[0,1]` on the right side because the colorbar's overflow container is 374 px wide but the label sits next to "Low · 0.000" without spacing.

### 1.9 Empty state placement

The empty state (`#spectrogram-empty-state`) is a sibling of `#spectrogram-chart-row` inside `.main--analysis-chart`. On wide screens it appears as a small overlay; on narrow screens it is pushed below the chart and is not very discoverable.

---

## 2. Goals

1. **Single-row toolbar** at ≥1280 px viewport widths with no horizontal scroll.
2. **Visible primary action** (Compute) on the right at every viewport, never wrapped alone to row 2.
3. **All controls reachable** at every viewport ≥1024 px, including Clip and Outliers.
4. **Mobile (≤720 px)** stacks chart over colorbar cleanly, with the colorbar as a compact strip.
5. **Results context** (sample rate, Nyquist, bin/point counts) visible after Compute.
6. **No regression** to FFT or other toolbar pages.

---

## 3. Implementation plan

All work lives under `frontend/` source files; no Rust or `dist/` changes.

### Step 3.1 — Tighten the toolbar to fit one row at ≥1280 px

**File:** `frontend/index.html` (spectrogram toolbar) and `frontend/css/modules/toolbar.css`

1. Drop the eyebrow labels on the spectrogram page only. Eyebrows are redundant with field labels and consume ~40 px × 3 segments ≈ 120 px.
   ```html
   <!-- Before -->
   <span class="scatter-toolbar__eyebrow">Display</span>
   <!-- After: remove the eyebrow span entirely for spectrogram segments -->
   ```
   Update `toolbar.css`:
   ```css
   #page-spectrogram .scatter-toolbar__eyebrow { display: none; }
   #page-spectrogram .scatter-toolbar__segment { padding: 6px 10px; }
   ```
2. Collapse the **Clip band** (method + %) into a hidden subgroup controlled by the Outliers toggle. Mirror the FFT `.fft-filter-band` pattern.
   ```html
   <span class="toolbar-field__control scatter-link-toggle">
     <input id="spectrogram-clip-toggle" ... />
     <span>Outliers</span>
   </span>
   <div class="spectrogram-clip-band is-hidden" id="spectrogram-clip-band">
     <label ... >Clip method</label>
     <label ... >Clip %</label>
   </div>
   ```
   ```css
   #page-spectrogram .spectrogram-clip-band {
     display: inline-flex;
     align-items: center;
     gap: 8px;
     flex-wrap: nowrap;
     min-width: 0;
   }
   #page-spectrogram .spectrogram-clip-band.is-hidden { display: none; }
   ```
3. Convert Export from disclosure to **inline icon buttons** matching the FFT page (`.fft-export-icons`). Drop the "Image + HTML" placeholder label and reveal PNG / SVG / HTML as flat buttons with a 2-letter label.
4. Re-order segments so **Compute is always the rightmost element** in `.toolbar-group--push`. Currently Compute is its own `scatter-toolbar__segment`; move it into the Export segment (or push it with `flex: 0 0 auto; margin-left: auto`) so it never wraps alone.

**Expected impact:** at 1920 px the toolbar height drops from 127 px to ~58 px and fits one row. At 1280 px the Clip band becomes reachable (collapses to 0 width when Outliers is off).

### Step 3.2 — Make the sidebar text-safe at narrow widths

**File:** `frontend/css/modules/sidebar.css` (verify existing rules) and add overflow handling.

Add `min-width: 0` and `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` to `.nav-text` inside the sidebar nav. Keep the current icon-only collapsed mode for ≤640 px. Apply on `#page-spectrogram` and other analysis pages where chart space matters most.

### Step 3.3 — Surface a "results context" panel after Compute

**File:** `frontend/index.html` (add markup inside `#spectrogram-colorbar` or as a sibling) and `frontend/src/pages/spectrogramChartRuntime.ts`.

1. Add the missing `#spectrogram-summary` element that the runtime already queries:
   ```html
   <div id="spectrogram-summary" class="spectrogram-spectral-info" hidden aria-live="polite">
     <span class="spectrogram-spectral-info__row">
       <span class="spectrogram-spectral-info__label">Sample rate</span>
       <span id="spectrogram-summary-rate" class="spectrogram-spectral-info__value">—</span>
     </span>
     <span class="spectrogram-spectral-info__row">
       <span class="spectrogram-spectral-info__label">Nyquist</span>
       <span id="spectrogram-summary-nyquist" class="spectrogram-spectral-info__value">—</span>
     </span>
     <span class="spectrogram-spectral-info__row">
       <span class="spectrogram-spectral-info__label">Time points</span>
       <span id="spectrogram-summary-points" class="spectrogram-spectral-info__value">—</span>
     </span>
     <span class="spectrogram-spectral-info__row">
       <span class="spectrogram-spectral-info__label">Frequency bins</span>
       <span id="spectrogram-summary-bins" class="spectrogram-spectral-info__value">—</span>
     </span>
   </div>
   ```
2. Render it as an overlay anchored to the top-right of `#spectrogram-chart`, mirroring `.fft-spectral-info` (`position: absolute; top: 8px; right: 8px`). Use `pointer-events: none` so it doesn't block zoom.
3. Update `spectrogramChartRuntime.ts` to populate the four fields after a successful compute, using the existing `formatFrequencyInUnit` helper from `spectralPresets.ts`.
4. Remove the dead `summaryEl` lookup (or wire it to the new element).

### Step 3.4 — Responsive refinements

**File:** `frontend/css/modules/layout.css` and `responsive.css`

1. **≤1280 px**: hide the `Scale` toggle label text ("Log"), keep only the checkbox. The label is decorative — the icon is self-evident.
2. **≤1024 px**: collapse the Display segment to a single chip-rail with a "Filters" disclosure button. Open state reveals Window, Hop, Scale, Normalize, Clip as a popover or expanding row. Keep Column visible always.
3. **≤720 px** (existing breakpoint): the colorbar already moves below the chart — keep this, but fix the label overflow by adding `flex-shrink: 0; min-width: 0;` and `overflow: hidden; text-overflow: ellipsis;` to `.scatter-colorbar-vname`.
4. **≤480 px**: stack Export and Compute into a single full-width row below the field chips. Use `.spectrogram-mobile-actionbar` with two buttons (Export, Compute) of equal width.
5. **Print / very small** (≤360 px): collapse all toolbar field labels — show only icons + select chevron. This is the most aggressive breakpoint and should not be reached on tablets/phones in portrait, but matters for split-screen workflows.

### Step 3.5 — Empty state polish

**File:** `frontend/css/modules/chart.css` and `frontend/src/pages/spectrogramChartRuntime.ts`

1. Center the empty state inside `#spectrogram-chart-row` (not as a sibling below it). Use `position: absolute; inset: 0; display: grid; place-items: center;`.
2. Add a subtle icon (SVG waveform) inside the empty state to telegraph what the page produces.
3. Show the last computed result metadata (`Last run: HUFL · 96 window · 50% hop`) as a small hint when the empty state is visible after a prior compute.

### Step 3.6 — Colorbar cleanup

**File:** `frontend/css/modules/layout.css` (`.spectrogram-chart-row` rules)

1. Increase the desktop colorbar width from 72 px to **84 px** so the vertical `High / Low` tick labels and the `z-score → [0,1]` annotation never truncate on viewports between 1280 and 1600 px.
2. On ≤720 px, switch the colorbar's `High · 1.000` / `Low · 0.000` labels to a compact `High` / `Low` only (no numeric), placed at the ends of the strip. Move the numeric value into the `aria-valuenow` for screen readers and a tooltip.
3. Confirm the colorbar slider handles (`cb-handle`) are ≥44 px tall on touch devices (current 22 px is at the edge of WCAG 2.5.5 target size for fine motor).

### Step 3.7 — Verification matrix

After implementing Steps 3.1–3.6, re-run the probe at the six sizes and confirm:

| Viewport | Toolbar rows | Compute position | Clip reachable | Colorbar layout | Result |
|----------|--------------|------------------|----------------|-----------------|--------|
| 1920×1080 | 1 | rightmost | yes (collapsed) | right side, vertical | pass |
| 1440×900 | 1 | rightmost | yes | right side, vertical | pass |
| 1280×800 | 1 | rightmost | yes (collapsed) | right side, vertical | pass |
| 1024×768 | 2 (Disclosure row 2) | rightmost | via disclosure | right side, vertical | pass |
| 820×1180 | 2 (Disclosure row 2) | full-width row 2 | via disclosure | below chart, horizontal | pass |
| 414×896 | 3+ (stacked) | full-width | via disclosure | below chart, compact | pass |

Update the existing `frontend/src/pages/spectrogramPage.test.ts` and `frontend/src/pages/spectrogramChartRuntime.ts` test stubs to cover the new summary element.

### Step 3.8 — Documentation

Update `docs/developer/spectrogram-page.md` with a short "Layout notes" section explaining the breakpoint ladder and the inline Export pattern (mirrored from FFT). The note should call out that the spectrogram now shares the inline export and clip-band collapse patterns with FFT so future contributors don't fragment the conventions.

---

## 4. Out of scope (intentional)

- **Backend changes** — the spectrogram endpoint, scaling logic, and color contract are stable. No Rust work needed.
- **New chart type or new export formats** — only the export UX changes from disclosure to inline buttons.
- **FFT or other page refactors** — only borrow patterns; do not modify FFT markup.
- **Color scale customization** — handled in Settings; not part of this layout pass.

---

## 5. Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Toolbar CSS leak to other pages | Scope all new rules under `#page-spectrogram` selectors. Reuse `#page-fft` rule patterns as a model. |
| Disabling eyebrows hides useful context | The field-level labels (`Column`, `Window`, `Hop`, etc.) already convey the same information per control; the segment-level eyebrow was redundant on this page. |
| Inline Export icons take more space than disclosure | Inline is ~120 px (3 buttons × ~40 px); disclosure was ~150 px but added a tap. Inline wins on tap count and screen reader simplicity. |
| Colorbar widening eats chart width | Increase is +12 px (72 → 84). At 1280 px the chart width drops from ~1140 to ~1128 px — negligible. |
| Summary panel blocks zoom drag | Use `pointer-events: none` and `aria-live="polite"`. Mirror FFT proven pattern. |

---

## 6. Estimated effort

| Step | Estimate | Notes |
|------|----------|-------|
| 3.1 — toolbar one-row fit | S | HTML + CSS + minimal JS for clip-band toggle |
| 3.2 — sidebar text safety | XS | CSS-only |
| 3.3 — results context panel | M | Markup + small JS hook in runtime |
| 3.4 — responsive refinements | M | CSS-only, multi-breakpoint |
| 3.5 — empty state polish | S | Markup + CSS |
| 3.6 — colorbar cleanup | S | CSS-only |
| 3.7 — verification | S | Re-run probe, update tests |
| 3.8 — docs | XS | Markdown update |

Total: ~one focused session. No backend, no new dependencies.
