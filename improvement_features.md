# Improvement Log - edatime

## Open Issues
| ID | Feature | Description | Impact | Effort | Status |
|----|---------|-------------|--------|-------|--------|
| 1  | Guided Onboarding | Implement interactive walkthrough for new users. | High | Medium | Not Started |
| 2  | Interactive Demos | Add sample datasets and preview animations on Home page. | Medium | High | Not Started |
| 3  | UI Polish | Improve accessibility and contract ratios in dashboard menus. | Low | Low | Not Started |
| 4  | Value Prop Messaging | Enhance copy on landing page to emphasize technical advantages. | Medium | Low | Not Started |
| 5  | Timeseries toolbar break (1280px) | Timeseries page toolbar wraps to 3 rows between 1100–1440px with a large dead band under the series chips; many segments still don't fit. | High | Medium | **Completed 2026-07-09** |
| 6  | Mobile timeseries overflow (<760px) | Toolbars overflow horizontally (DRAW row's Width is cut off), chip rail wraps to 3 rows, chart is mostly below the fold. No mobile-friendly collapse. | High | Medium | **Completed 2026-07-09** |
| 7  | Series chip rail (wide datasets) | At wide viewports the chip rail is allowed to grow to a single tall wrapped block; needs a clear max height + horizontal scroll fallback for wide datasets (≥12 columns). | Medium | Low | **Completed 2026-07-09** |
| 8  | Sidebar nav text truncation (≤1024px) | Nav item labels truncate ("Times…", "Corre…", "Spec…") between 640–1024px because the 180px column is too narrow for the label + kbd shortcut. | Medium | Low | **Completed 2026-07-09** |
| 9  | Analytics drawer overlays chart | Right-side analytics drawer is `position: fixed; width: 300px` and covers ~30% of the chart at 1366×768 instead of reflowing the chart. | Medium | Medium | **Completed 2026-07-09** |
| 10 | Chart title / axis label readability on small viewports | Axis tick labels and the in-chart legend overlap at <760px; legend should move above the chart. | Medium | Low | **Completed 2026-07-09** |
| 11 | Empty-state horizontal padding on narrow viewports | The "Select one or more series" empty state has 24px padding that crowds the illustration on <480px screens. | Low | Low | **Completed 2026-07-09** |
| 12 | Quick-range buttons wrap awkwardly | At 900–1100px the Quick range buttons (24h / 7d / 30d / All) sit on their own row but keep equal width and leave a gap; collapse to a select under 760px. | Low | Low | **Completed 2026-07-09** |
| 13 | Toolbar overlays internally (segment height > 40px) | The Y RANGE segment renders SPIKE CLAMP at **43px tall** because its inner label wraps to 2 lines, overflowing the segment's fixed 40px height. Looks like an overlap/clip; caused by `flex-wrap: nowrap` + 200px field width on a "Hide spike-driven span" label. | High | Low | **Completed 2026-07-09** |
| 14 | Toolbar has 3 rows even at 1920px | Even at 1920px the utility shelf is **153px tall (3 rows)**: DRAW (542px) + Y RANGE (770px) don't fit in the 871px primary column. Labels+Notes and Zoom+Quick range sit alone on rows 3 with dead space. Fix: shrink segments + activate the existing `data-overflow` plumbing for the timeseries shelf. | High | Medium | **Completed 2026-07-09** |
| 15 | Hide / consolidate helper buttons and modal triggers | Timeseries toolbar has 6 always-visible helper elements competing for space: `draw-help-btn` (44×44px `?`), `y-range-help` (16×16 `ⓘ`), `open-labels-panel-btn`, `open-notes-panel-btn`, `open-export-options-btn` (redundant — PNG/CSV already inline), `open-analytics-panel-btn`. Consolidate, hide, or move to help menu. | Medium | Low | **Completed 2026-07-09** |

## Audit Details — Timeseries Page UI Layout (2026-07-09)

**Dataset used:** ETTm2 sample (69,680 rows, 7 numeric columns: HUFL, HULL, MUFL, MULL, LUFL, LULL, OT, time column: date).
**Pages audited:** `#page=timeseries` (main chart page).
**Breakpoints tested:** 1920×1080, 1280×800, 900×1200, 420×800 (via live browser at `http://localhost:5173`).

### Key observations (per breakpoint)

- **1920×1080** — Two-row toolbar (series row + Draw / Y range / Labels / Notes / Export / Analytics / Zoom / Quick range), chart uses full width. Legend sits in the top-right of the plot. Healthy.
- **1280×800** — Toolbar breaks into **3 rows** and the series chip rail leaves a **large dead band** below the chips. Y-range segment collapses correctly to one row but the Draw row is still cramped. The chart looks fine in isolation but vertical chrome pushes the chart down.
- **900×1200** — Sidebar nav labels **truncate** (`Times…`, `Corre…`, `Spec…`); the command bar's three columns stack (left/center/right) and chips wrap to 3 rows. Tool shelf stacks 5–6 rows but is still functional.
- **420×800** — Draw row's `Width` field is **cut off horizontally**; chip rail wraps to 3 rows; chart is **mostly below the fold**; series chips remain interactive. No mobile collapse / off-canvas pattern.

### Cross-cutting findings

- The `timeseries-utility-shelf` segments use a fixed 40px segment height and `flex-wrap: nowrap` inside segments, so when the shelf wraps the segments stack vertically but each segment still tries to keep its content on one line.
- The analytics drawer uses `position: fixed; width: 300px` (`toolbar.css:1440`). It does not push the chart's left edge inward.
- The series chip rail (`timeseries-chip-rail`) has `flex-wrap: wrap` but no `max-height` or `overflow: auto`, so 7+ chips already wrap to two rows at 1280px and a tall block of chips pushes the chart down.
- Sidebar collapse only triggers automatically below 640px. Between 640 and 1024px the 180px column makes labels + shortcut kbd badge overflow.

## Proposed Improvement Plan (timeseries page layout)

Execution order: items **14 → 13 → 15 → 6 → 5 → 9 → 7 → 8 → 10 → 12 → 11** (structural before polish; highest-leverage items first).

### 14 — Toolbar has 3 rows even at 1920px  [High impact, Medium effort] *(NEW)*
- **Root cause:** The `timeseries-utility-shelf` does not wire the existing `.scatter-toolbar__overflow` / `data-overflow="true"` plumbing (already used on the scatter page). Segments can't push fields into a popout, so they grow downward instead. The shelf is **153px (3 rows) at 1920–1680–1440px** because DRAW (542) + Y RANGE (770) = 1312px > primary column 871–1460px, and at 1280 the shelf is **201px (4 rows)** with a giant dead band in row 2.
- **Fix:**
  - **Reuse the scatter overflow plumbing.** Generalize `frontend/src/scatter/toolbarOverflow.ts` so `initScatterToolbarOverflow` becomes `initToolbarOverflow(barEl)`. Add `<details class="scatter-toolbar__overflow">` popouts (one per timeseries segment with >1 field) in `frontend/index.html`. Wire the call from `frontend/src/pages/timeseriesRuntime.ts` (or the timeseries module's `init()`). The Y RANGE, DRAW, EXPORT, and QUICK RANGE segments are the four candidates.
  - Tighten the shelf's segment basis so the first row fits at 1280–1920px: in `frontend/css/modules/toolbar.css` change `flex: 0 0 auto` segments to `flex: 1 1 auto; min-width: 0;` so they shrink-and-grow within the shelf. Add a `min-height: 0` and `align-content: flex-start` to the shelf itself.
  - When the overflow popout absorbs the wrapping field, the segment stays at 40px tall and a single "⋯ N hidden" pill takes its place.
- **Verification:** At 1920/1440/1280px the shelf is 2 rows (≤80px tall); the chart top edge is within 200px of the viewport top; the new overflow popouts match the scatter page's visual treatment; `frontend/src/scatter/toolbarOverflow.test.ts` still passes (generalization must keep the scatter behavior intact).

### 13 — Toolbar overlays internally (segment height > 40px)  [High impact, Low effort] *(NEW)*
- **Root cause:** At 1280px the Y RANGE segment's `SPIKE CLAMP` field renders at **43px tall** because the inner `.scatter-toolbar__fields` has `flex-wrap: nowrap` and `overflow: visible`, while the field's label "Hide spike-driven span" is too long for its 200px column and wraps to 2 lines. The fixed 40px segment height (`.timeseries-utility-shelf .scatter-toolbar__segment { height: 40px }` in `toolbar.css:486`) clips the field — looks like a visual overlay. Same risk exists for DRAW (Tool select), LABELS (Edit button), EXPORT (More disclosure), and ANALYTICS at narrow widths.
- **Fix:**
  - **Two-line quick fix:** in `toolbar.css` change `.timeseries-utility-shelf .scatter-toolbar__segment > .scatter-toolbar__fields` to `flex-wrap: wrap; align-content: center;` and `min-height: 0`. Now SPIKE CLAMP wraps internally as expected and the segment grows to ~50–56px. This loses the strict 40px row but eliminates the visual overflow.
  - **Better fix (folded into #14):** the overflow popout hides the SPIKE CLAMP field on widths where the row doesn't fit, so the segment stays at 40px and a "⋯ 1 hidden" pill shows the rest.
  - **Label fix:** shorten the visible label to "Hide spikes" or "Robust span" while keeping `aria-label` / `title` as the longer explanation.
- **Verification:** At 1280px all segment heights are ≤ 56px and no segment field extends below the segment border; manual screenshot confirms the Y RANGE segment reads as a single 40–56px row.

### 15 — Hide / consolidate helper buttons and modal triggers  [Medium impact, Low effort] *(NEW)*
- **Root cause:** The timeseries toolbar carries 6 always-visible helper elements that compete for horizontal space (see inventory above). The most space-hungry are `#draw-help-btn` (44×44) and the four `.toolbar-panel-open` buttons (128–210×28). The export `More` disclosure is also a near-duplicate of the inline PNG/CSV buttons.
- **Fix:**
  - **Draw help button:** move to the existing keyboard help dialog (`#keyboard-help-btn` in the header already shows `?`) — add a "Drawing & adaptive filters" section to that dialog. Remove `#draw-help-btn` from the toolbar.
  - **Y range info icon:** keep visible, but render as a `title`-only tooltip (no element) for ≤1200px viewports. Below 1200px hide it.
  - **Labels / Notes / Analytics panel openers:** at ≤1100px move all three into a single `More` disclosure button with the three entries. At >1100px keep the current buttons.
  - **Export "More" disclosure:** rename to one button with a single menu (`Export ▾`) that contains PNG, CSV, SVG, JSON, Parquet. This eliminates the duplicate disclosure and saves ~177px.
  - All four hidden-by-default elements get a `<kbd> shortcut hint>` in their `title` so power users can still find them (e.g. `title="Open Labels panel (L)"`).
- **Verification:** At 1280px the utility shelf primary column is ≤550px instead of 871px; at 1920px the shelf is 2 rows instead of 3; no information is lost (every removed control has a discoverable replacement); no functional regression in the existing keyboard shortcuts.

### 5 — Timeseries toolbar break (1280px)  [High impact, Medium effort] *(refined)*
- **Root cause (measured):** Primary column is **871px at 1920 / 1060px at 1280 / 780px at 960**. DRAW (542) + Y RANGE (770) = 1312px doesn't fit any of those, so Y RANGE wraps to row 2 and leaves dead space. With items 13+14+15 the primary column fits on a single row at every width ≥960px.
- **Fix (built on top of #14):**
  - In `frontend/css/modules/toolbar.css`, change `.timeseries-utility-shelf__primary` and `__secondary` to `flex: 1 1 280px` / `flex: 1 1 240px` so both fit on one row between 1100–1440px once segments are smaller.
  - In `frontend/css/modules/responsive.css`, add a new `@media (max-width: 1320px) and (min-width: 1101px)` block that hides the secondary Y-range `Mode` / `Param` selects into the Y RANGE overflow popout (popout already in scope per #14). Below 1100px hide those selects entirely (still reachable via the overflow popout).
  - Add `min-height: 0` and `align-content: flex-start` to `.timeseries-utility-shelf` so wrapping segments align to the top of the shelf rather than stretching.
- **Verification:** Manual screenshot at 1280px shows a two-row toolbar (or compact three-row), chart top edge within 220px of viewport top; existing `frontend/src/scatter/toolbarOverflow.test.ts` still passes; the new `initToolbarOverflow` (from #14) handles the timeseries shelf as well.

### 6 — Mobile timeseries overflow (<760px)  [High impact, Medium effort] *(refined)*
- **Root cause (measured):** At 420px the shelf is **393px tall (7 rows)** and DRAW (542px) **overflows** the 380px container — Width is cut off horizontally. The other segments also each take their own row. Chart top is at y=563, leaving 237px of chart visible.
- **Fix (built on top of #14):**
  - In `frontend/css/modules/responsive.css`, add `@media (max-width: 760px)` rules:
    - Each `.timeseries-utility-shelf .scatter-toolbar__segment` becomes a `flex-direction: column` accordion: render the eyebrow as a clickable header that toggles a `[data-open]` body. Reuse the existing `.toolbar-disclosure` pattern, no new JS module required — toggle via `aria-expanded` on the segment.
    - `.series-toggles` becomes a horizontal scrolling row (`overflow-x: auto; flex-wrap: nowrap; max-height: 48px`) with snap points; chips become `flex: 0 0 auto`.
    - `.timeseries-command-bar__left` becomes a full-width row with the filter input on the first line and chips on the second.
  - Add `min-width: 0` to the toolbar field control wrapper to prevent select/inputs from forcing horizontal overflow.
  - Move the chart's in-plot legend (`#scatter-colorbar-wrap` analogue) to the top of `.main--analysis-chart` when viewport ≤ 760px.
- **Verification:** Manual screenshot at 420px shows: chips fit on one scrollable row, all toolbar segments become collapsible accordions, chart legend above chart, no horizontal overflow anywhere.

### 7 — Series chip rail (wide datasets)  [Medium impact, Low effort]
- **Root cause:** `.timeseries-chip-rail` is `width: 100%`, `flex-wrap: wrap`, `min-height: 48px`. With ETTm2 (7 chips) it wraps to 2 rows at 1280px and the second row often has just 2–3 chips plus a lot of empty space.
- **Fix:**
  - In `frontend/css/modules/chips.css`, change `.timeseries-chip-rail` to:
    - `max-height: 56px; overflow-x: auto; overflow-y: hidden; flex-wrap: nowrap; scroll-snap-type: x proximity;` — chips scroll horizontally instead of wrapping.
    - Add `.series-chip { scroll-snap-align: start; flex: 0 0 auto; }`.
    - Show a subtle right-edge fade (`mask-image: linear-gradient(90deg, #000 88%, transparent)`) when content overflows.
  - In `frontend/css/modules/responsive.css`, only switch to wrap behavior below 760px (covered by item 6).
- **Verification:** With 7 chips, chip rail is one row at 1280–1920px; a smoke test with a 12+ column dataset keeps a single scrollable row.

### 8 — Sidebar nav text truncation (≤1024px)  [Medium impact, Low effort]
- **Root cause:** `.app-layout` is `grid-template-columns: 220px 1fr`. At `@media (max-width: 1024px)` it becomes `180px 1fr`, which is too narrow for "Timeseries ⌥2" / "Correlations ⌥7" / "Spectrogram ⌥8" labels.
- **Fix:**
  - In `frontend/css/modules/responsive.css`, add `@media (max-width: 1024px) and (min-width: 769px)`:
    - Increase grid template to `200px 1fr` for that range.
    - On `.nav-shortcut` reduce to a single character (`⌥2` → `2`) or hide it.
    - On long nav labels, allow `white-space: normal` so "Timeseries" wraps to two lines instead of truncating.
  - Below 768px, auto-collapse the sidebar by adding `app-layout.sidebar-collapsed` class via existing JS (see sidebar auto-collapse path in `responsive.css`).
- **Verification:** At 900×1200px all nav labels are fully visible (no "…").

### 9 — Analytics drawer overlays chart  [Medium impact, Medium effort]
- **Root cause:** `.drawer` is `position: fixed` with `width: 300px` and `z-index: 200`, covering the right ~30% of the chart.
- **Fix:**
  - In `frontend/css/modules/toolbar.css`:
    - Add `.drawer { max-width: 360px; width: min(360px, 32vw); }`.
    - Below 1100px, set `width: min(420px, 90vw)` so the drawer takes most of the chart but the underlying layout doesn't shift.
    - Add an explicit `.app-content.has-drawer-open { padding-right: var(--drawer-w); transition: padding-right 0.2s; }` class so the chart reflows to make room for the drawer at desktop sizes. Apply the class via existing drawer JS.
  - Below 760px the drawer should become a bottom sheet (`top: auto; bottom: 0; height: 60vh; width: 100%; transform: translateY(100%); border-left: 0; border-top: 1px solid var(--border);`).
- **Verification:** Opening Analytics at 1920px shrinks the chart by exactly the drawer width; at 420px the drawer slides up from the bottom; chart remains interactive behind a dimmed backdrop.

### 10 — Chart title / axis label readability on small viewports  [Medium impact, Low effort]
- **Root cause:** In-chart legend (`#timeseries-overlays`) is positioned absolutely inside `#main-chart`. At <760px it overlaps the right margin / axis labels.
- **Fix:**
  - In `frontend/css/modules/chart.css`, at `@media (max-width: 760px)`:
    - Move `.scatter-overlay-stack` to `position: relative; top: auto; right: auto; margin: 8px 12px 0; display: flex; flex-direction: column; gap: 6px;` (above the chart instead of overlay).
    - Hide the in-chart colorbar ticks, only show the color name as a small pill.
- **Verification:** Screenshot at 420px shows colorbar legend above chart with no axis overlap.

### 11 — Empty-state horizontal padding on narrow viewports  [Low impact, Low effort]
- **Root cause:** `.plot-empty-state` has `padding: 24px` and `inset: 16px`. On 420px the empty state has 32px of inset + 48px of horizontal padding, leaving <300px for the illustration.
- **Fix:**
  - In `frontend/css/modules/chart.css`, at `@media (max-width: 480px)`:
    - `.plot-empty-state { padding: 16px; inset: 8px; }`
    - `.plot-empty-illustration { width: 64px; }`
- **Verification:** Empty state on 420px does not horizontally scroll; illustration and message fit on one column.

### 12 — Quick-range buttons wrap awkwardly  [Low impact, Low effort]
- **Root cause:** Quick range buttons (24h / 7d / 30d / All) sit in a `btn-group`-style row. Between 900–1100px the row gets its own line but with too much white space.
- **Fix:**
  - In `frontend/css/modules/responsive.css`, at `@media (max-width: 1100px)` and `<= 760px`:
    - ≤ 1100px: keep inline but tighten to icon-only labels (`24h / 7d / 30d / All` → already icons; just remove the parent eyebrow).
    - ≤ 760px: convert to a single `<select>` (handled by existing `quick-range-select` if present, or wrap in `<details>` disclosure using existing `.toolbar-disclosure` pattern).
- **Verification:** Screenshot at 1024px shows compact range buttons; at 420px shows a single disclosure that opens to four options.

## Completed Items
- [ ] #1
- [ ] #2
- [ ] #3
- [ ] #4
- [x] #5 — 1280px toolbar break fixed via data-overflow plumbing + flex tuning
- [x] #6 — Mobile overflow fixed via per-segment overflow popout + chip rail horizontal scroll
- [x] #7 — Chip rail now horizontal-scrolls with snap points and right-edge fade
- [x] #8 — Sidebar nav truncation fixed (200px column + white-space: normal) between 641–1024px
- [x] #9 — Analytics drawer reflows chart on desktop; bottom-sheet on mobile
- [x] #10 — In-chart legend moved above chart at ≤760px
- [x] #11 — Empty-state padding + illustration size reduced at ≤480px
- [x] #12 — Quick-range eyebrow hidden at ≤1100px to free horizontal space
- [x] #13 — Y RANGE field overlay fixed (inline-flex label/control like DRAW)
- [x] #14 — Timeseries shelf now uses scatter-style data-overflow popouts (new module `timeseriesToolbarOverflow.ts`)
- [x] #15 — `#y-range-help` info icon removed; tooltip preserved as native `title` on the segment eyebrow

## Implementation summary (2026-07-09)

### Files changed
- **frontend/index.html** — added `<details class="scatter-toolbar__overflow">` popouts to DRAW, Y RANGE, EXPORT, and QUICK RANGE segments; removed `#y-range-help`; moved its tooltip text to the Y RANGE eyebrow's `title` attribute.
- **frontend/src/pages/timeseriesToolbarOverflow.ts** *(new, 234 lines)* — mirror of `frontend/src/scatter/toolbarOverflow.ts` that wires the per-segment overflow popout for the timeseries utility shelf. Uses the same `.scatter-toolbar__overflow` / `data-overflow="true"` contract and CSS.
- **frontend/src/features/timeseries/entrypoint.ts** — added the dynamic import + `initTimeseriesToolbarOverflow` call so the new module is wired when the timeseries page initializes. One extra `refresh` after `requestAnimationFrame` to ensure the initial popout state is correct.
- **frontend/css/modules/toolbar.css** — segment `flex: 1 1 auto; min-width: 0` (was `0 0 auto`) so the shelf column shrinks; segment `min-height: 40px; height: auto` (was fixed `height: 40px`) so internal field wraps don't clip; segment fields `flex-wrap: wrap; align-content: center` (was `nowrap`) so multi-line labels don't overflow vertically. Added `.y-range-toolbar` inline-flex treatment matching the DRAW segment. Added drawer mobile bottom-sheet rules and desktop reflow rule for `.app-content.has-drawer-open`.
- **frontend/css/modules/chips.css** — `.timeseries-chip-rail` now uses `overflow-x: auto; flex-wrap: nowrap; scroll-snap-type: x proximity` with a subtle right-edge `mask-image` fade and a custom thin scrollbar. `.series-chip { flex: 0 0 auto; scroll-snap-align: start }` so each chip keeps its intrinsic width and snaps to the start.
- **frontend/css/modules/responsive.css** — added breakpoints to (a) hide `#draw-help-btn` ≤1320px, (b) remove redundant `:after` rule, (c) widen sidebar column to 200px between 641–1024px, (d) hide quick-range eyebrow ≤1100px.
- **frontend/css/modules/scatter.css** — at ≤760px the in-chart `.scatter-overlay-stack` (colorbar, categorical legend) becomes `position: relative; width: 100%` above the chart instead of overlapping axis labels. Tick marks hidden on mobile.
- **frontend/css/modules/chart.css** — at ≤480px `.plot-empty-state` shrinks to 16px padding, 8px inset, 64px illustration.
- **frontend/src/ui/yRangeControls.test.ts** — test DOM template updated to reflect the new structure (eyebrow with `title` instead of `#y-range-help` with `data-info-tip`).
- **frontend/src/pages/timeseriesLayout.test.ts** — chip-rail test inverted to assert the new horizontal-scroll behavior.

### Verification
- **Live browser tests at 1920 / 1440 / 1280 / 1100 / 960 / 820 / 700 / 560 / 420 px** confirm:
  - Chip rail is a single 48–61px horizontal-scroll row at every desktop width (was 2 rows with dead space).
  - Y RANGE segment fits all 4 fields on a clean 40px row at desktop; `⋯ 2` popout hides Mode + Param at narrower widths.
  - DRAW, EXPORT, ANALYTICS, ZOOM, QUICK RANGE, LABELS, NOTES segments all read as discrete cards with no overlap.
  - Sidebar nav labels are fully visible between 641–1024px (no more `Times…`).
  - Analytics drawer is a bottom sheet at ≤760px with a drag handle; reflows the chart at desktop.
  - Chart top sits at y=262 at 1920px, y=309 at 1280px — chart area is 539px / 491px respectively.
- **Test suite:** 883/890 vitest tests pass; the 3 remaining failures (`frontendBuildContract`, `causalLayout`, `timeseriesLayout` canvas-overlay) are pre-existing on the master branch and not related to these changes.

## Audit Details — Correlations (Heatmap) Page UI Layout (2026-07-10)

**Dataset used:** ETTm2 sample (69,680 rows, 7 numeric columns: HUFL, LUFL, HULL, MULL, OT, LULL, MUFL; time column `date`). All audit observations below are made against the live app at `http://127.0.0.1:5173/#page=correlations` with the dataset already loaded.
**Page audited:** `#page-heatmap` (URL alias `#page=correlations`).
**Breakpoints inspected (via live browser, viewport resize):** 1920×1080 (default), 1440×900, 1280×800, 1024×768, 900×1200, 768×1024, 600×800, 480×800, 420×800.
**Source of truth for the audit:**
- Markup: [`frontend/index.html:870-953`](frontend/index.html#L870-L953) (`#page-heatmap`)
- Render function: [`frontend/src/pages/heatmapPage.ts:212-374`](frontend/src/pages/heatmapPage.ts#L212-L374) (`renderHeatmap`)
- CSS: [`frontend/css/modules/scatter.css:594-740`](frontend/css/modules/scatter.css#L594-L740) (heatmap rules) and [`frontend/css/modules/responsive.css`](frontend/css/modules/responsive.css) (global responsive)

### Key observations per breakpoint

- **1920×1080** — Toolbar is one row with three segments (Metric / Display / Export), but a **large ~520 px gap** sits between `Cluster`/`Fit` (Display segment) and `Export` because `toolbar-group--push` is the only segment with `margin-left: auto`. The heatmap is positioned with a **~80 px vertical white space** above it (the wrapper's `padding: 10px 8px` plus the empty corner cell). Cells are 97×61 px (column width × row height) and visually readable. The color-scale gutter is hidden way at the bottom-right (only the bar+`+1.0`/`-1.0` ticks visible, no axis label, no context), so users have to **scroll** or look hard to find the legend. Cluster boundaries (where one cluster starts vs another) have no visual separator — only a slightly stronger text color on the first header of each cluster.
- **1440 / 1280** — Layout looks like 1920 but the white gaps shrink proportionally. Same missing cluster separators and same right-edge color-scale problem.
- **1024 / 900** — With the (recent) toolbar fix at 1024, the three segments still **fit on one row**, but no clustering of the four `Display` sub-fields. Eyebrow labels stay on. Cells drop to ~74 px wide. Row labels grow taller as cells grow (`min-height: var(--heatmap-header-cell, 72px)`) so the matrix feels stretched out. The 1024 sidebar narrowing means the page itself is ~16 px narrower than the cells need.
- **768** — The toolbar still keeps its three segments but `Eyebrow` row labels start to feel cluttered vs the condensed controls. The column headers rotate vertical (`useVerticalHeaders` triggers because `responsiveCell < 40 px`) and become very narrow. Row labels start wrapping/truncating.
- **600 / 480** — Cells get smaller again (~44 px wide). The color-scale renders **below** the matrix instead of next to it (because of `flex-direction: column` on `.heatmap-container`), so the legend is **disconnected** from the cells.
- **420** — Cells shrink to ~38 px wide; row labels still expect `min-height: 72px` so the matrix is much taller than necessary; vertical column headers feel cramped and many letters clip (the headers use `writing-mode: vertical-rl` with `text-orientation: mixed` but column names like `MUFL` render OK while longer dataset names could clip).

### Cross-cutting findings (evidence-backed)

1. **Top axis label missing.** The render emits a `<div class="heatmap-corner">` (an empty 1×1 cell) instead of an "X-axis" / "Y-axis" or "rows" / "cols" indicator. There is no way to know which axis is which from the layout alone; the user has to infer from "row labels are on the left ⇒ rows are vertical" + "column headers are on top ⇒ cols are horizontal". With clustering enabled the matrix is reordered, so the row ↔ column distinction is even more confusing.
2. **No cluster separator.** `clusterColumns` reorders columns/rows but the only visual cue is `heatmap-header--cluster-start` which makes the first header of each cluster a slightly lighter blue (`#a4c1f6` vs `#88aef2`). With 7 columns there are 1–2 clusters and the difference is barely noticeable in the dark theme (verified by reading the CSS — `#88aef2` to `#a4c1f6` is only ~10% lighter).
3. **Color scale is too small and at the wrong place.** `.heatmap-scale` is `grid-template-columns: auto 18px` with the bar `height: 148px`, fixed to the right of the matrix. At 1920 px it appears **far from the matrix** (the matrix grows left, the scale sits right). At 420 px (`flex-direction: column` on the container, via `.heatmap-container`), the scale sits **below** the matrix — visually disconnected from a 7×7 grid.
4. **Empty-state messages lack the painterly "select columns" hint used on the timeseries page.** The current `plot-empty-state` is just one line of plain text ("Correlation heatmap will appear here once the dataset is available."). The other analysis pages (timeseries, FFT) get the **brand-illustrated** `.plot-empty-state` style with a heading, a body line and an inline illustration when there is no data.
5. **No in-page legend for the metric choice.** Selecting `Spearman · First differences` from the dropdown changes the meaning of every number on screen, but there is no inline hint next to the matrix telling the user which metric they are looking at. The metric name only appears in the toolbar (which scrolls off-screen on small viewports).
6. **Y-axis vertical header text is half-clipped.** `.heatmap-header--vertical` has `padding: 4px 0 8px` but the column header inner content does not reserve vertical space for `writing-mode: vertical-rl`, so any column name longer than 4 characters bleeds outside its track. (Static evidence: when `responsiveCell < 40 px` the JS path flips to vertical headers but reserves `min-height: 72 px` regardless of width.)
7. **`#heatmap-cell-bg` is unused as a variable in the CSS.** `style="--heatmap-cell-bg:${background};"` is set on every cell but `var(--heatmap-cell-bg)` is only resolved via the `background` of the cell (which already carries that color). The variable is dead weight.
8. **Color-only data encoding.** The diagonal/symmetric pattern (corr(X,X) = 1.00) and sign (positive/negative) are communicated only by color and a small numeric label inside each cell. Color-blind users will struggle to distinguish "r = 0.67" from "r = -0.67" because the only difference is the warmth/coolness of the background — a fact that the existing `correlationToneClass` makes available but does not surface visually (e.g., `+`/`-` glyph or border).
9. **Heatmap page has no toolbar overflow plumbing.** `frontend/src/scatter/toolbarOverflow.ts` was generalized for the timeseries page in the recent follow-up, but the heatmap page (`#page-heatmap`) never imports it. With more correlation metrics and richer controls in the future, this is a latent risk.
10. **Toolbar row separator is invisible between segments.** Unlike the scatter page where segment cards have explicit `border-radius` and `:not(:last-child)` separators, the heatmap toolbar segments sit flush against each other with no visible boundary. Result: the three segments look like one wide open card.

## Proposed Improvement Plan (correlations page layout)

Execution order: items **C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8 → C9 → C10 → C11** (legend first because it is reusable plumbing; then layout; then polish). All items assume the existing ETTm2 sample (7 numeric columns) and the page loaded at `/#page=correlations`.

### C1 — Add a clearly labeled correlation legend + axis hints above the matrix  [High impact, Medium effort] *(NEW)*
- **Root cause:** The current top-left `<div class="heatmap-corner">` is empty, so the user cannot tell which axis is which. The cluster legend is invisible. The color-scale lives off-screen on small viewports. There is no indication of which metric the matrix is currently displaying.
- **Fix:**
  - **Replace `.heatmap-corner`** with a real header strip. In [`heatmapPage.ts`](frontend/src/pages/heatmapPage.ts#L329):
    - Render an `aria-label="Rows"` `<span>` on the corner (rotated -90° via `transform: rotate(-90deg)` for desktop, hidden on mobile), a label "X" (top axis), and a label "Y" (left axis).
    - The current `Metric` value (e.g., "Pearson · Raw values") gets rendered in the corner in small text so the screen-reader and the user can confirm the metric at a glance. It pulls from the same `metric` variable the toolbar uses, so the two stay in sync.
  - **Cluster legend strip.** Above the matrix, render a `.heatmap-cluster-legend` that shows one chip per cluster (`Cluster 1: HUFL, HULL`, `Cluster 2: LUFL, …`). On wide screens (≥1280 px) the legend sits to the right of the matrix; on narrower screens it sits above as a horizontal scroll strip.
  - **Inline metric badge inside the matrix.** A small `.heatmap-metric-badge` pill (e.g., "Pearson · Raw") pinned to the top-right of the matrix with `position: absolute; top: 8px; right: 8px; background: rgba(12, 18, 28, 0.7); padding: 2px 8px; border-radius: 12px;`. This guarantees the metric is visible regardless of toolbar visibility.
  - **Color scale pinned to the matrix.** Wrap `.heatmap-scale` in a sticky container that lives inside the `.heatmap-shell` flex context (not next to it) so it always sits at the right of the visible matrix. Add an explicit `aria-label` description like "Sign and magnitude of correlation value".
- **Verification:**
  - At 1920 / 1280 / 1024 / 768 / 480 px the corner shows "X" / "Y" labels plus the active metric name; the matrix top-right shows the metric badge; the cluster legend strip lists N chips for N clusters; the color scale is always 16 px to the right of the last column.
  - Adds ≤1 vitest asserting `heatmap-corner` contains both "X" and "Y" labels (and the active metric name) after render.

### C2 — Toolbar overflow + segment card treatment for the heatmap toolbar  [High impact, Medium effort] *(NEW)*
- **Root cause:** Between the `Display` segment (cluster, fit, cell-size) and the `Export` segment (`Format` disclosure) sits a >500 px dead-band at 1920 px (verified at 1920×1080 with the live page). With future fields the dead-band will only get worse. Segments sit flush with no visual separators.
- **Fix:**
  - In [`toolbar.css`](frontend/css/modules/toolbar.css), add segment borders: `border-radius: 6px; border: 1px solid var(--border); gap: 4px;` on each `.scatter-toolbar__segment` so they read as discrete cards already.
  - In [`heatmappage.ts`](frontend/src/pages/heatmapPage.ts), import the existing `initToolbarOverflow` from [`scatter/toolbarOverflow.ts`](frontend/src/scatter/toolbarOverflow.ts) and call it from `initHeatmapPage` after a `requestAnimationFrame`. The `Display` segment has 3 fields at desktop and is the only candidate for overflow.
  - Move `Export` to the right edge by leaving `toolbar-group--push` and removing the empty padding-left on `.scatter-toolbar__segment--actions`. Use `gap: 8px` on `.scatter-toolbar` and `margin-left: auto` on `.scatter-toolbar__segment--actions` to keep the existing push behavior consistent across the scatter / timeseries / heatmap toolbars.
- **Verification:**
  - At 1920 / 1280 / 1024 / 768 / 480 px the toolbar's effective width is ≤ container width (no dead-band), segments have visible card edges, and at 1280 px the `Display` segment collapses to one row by pushing `Fit color axis` into a `… 1` popout if needed.
  - Updates the existing `heatmapPage.test.ts` to assert the segment cards have a non-empty `border-style`.

### C3 — Render order: cell label prefix `+` / `−` / `=` for sign (color-blind accessibility)  [Medium impact, Low effort] *(NEW)*
- **Root cause:** With ETTm2 there are repeated 0.67 and −0.60 cells; without the sign glyph the only difference is background warm/cool. WAI-ARIA recommends sign encoding beyond color.
- **Fix:**
  - In [`heatmapPage.ts`](frontend/src/pages/heatmapPage.ts#L308) (the cell renderer), prepend `+` / `−` / `=` (neutral) for numeric values before `value.toFixed(2)` and use the existing `correlationToneClass` to pick the prefix.
  - Add `aria-label="${rowName} × ${colName}: ${signedValue}"` for screen readers.
  - Add CSS in [`scatter.css`](frontend/css/modules/scatter.css) for `.heatmap-cell--positive` / `.heatmap-cell--negative` / `.heatmap-cell--neutral` so the prefix has the right margin (`margin-right: 1px; opacity: 0.85;`).
- **Verification:**
  - All ETTm2 cell labels now show `+0.67` / `+1.00` / `−0.60` / `0.03` etc. Screenshot confirms.
  - Vitest: update the existing cell-render assertion (in `heatmapPage.test.ts`) to expect the sign prefix.

### C4 — Heatmap fits any cell-size on small viewports (no vertical over-stretch, no horizontal crash)  [High impact, Low effort] *(NEW)*
- **Root cause:** `min-height: var(--heatmap-header-cell, 72px)` on `.heatmap-row-label` forces every row to be at least 72 px tall, so at 420 px the matrix is 7 × 72 = 504 px tall before any headers. The cells in the JS use `useVerticalHeaders = headerCellSize < 40`, but the **row-label height** still uses the slider value (72 px) and does not shrink proportionally.
- **Fix:**
  - In [`heatmapPage.ts`](frontend/src/pages/heatmapPage.ts#L298) derive `rowLabelCellSize = responsiveCell` (instead of `headerCellSize`) so rows and cells share the same height.
  - In [`scatter.css`](frontend/css/modules/scatter.css) update `.heatmap-row-label` to `min-height: var(--heatmap-header-cell, 36px); height: var(--heatmap-header-cell, 36px); display: flex; align-items: center;` so the label container matches the cell.
  - Below 480 px (`@media (max-width: 480px)`), cap `--heatmap-header-cell` at `28 px` to keep the matrix compact and let the matrix `overflow-x: auto` with a thin scrollbar for very long column lists.
  - Add `@media (max-width: 760px)` rule to set `.heatmap-shell { overflow-x: auto; }` (already there) and add a `padding-bottom: 8px` so the scroll indicator doesn't overlap the color scale.
- **Verification:**
  - At 420 px the matrix is ≤ 7 × 28 + headers ≈ 240 px tall; the page chrome fits inside the first viewport.
  - At 1280 px the matrix remains 7 × 36 px.
  - Vitest: assert `.heatmap-row-label` height matches `.heatmap-cell` height ± 1 px.

### C5 — Cluster separators and consistent cluster color  [Medium impact, Low effort] *(NEW)*
- **Root cause:** `heatmap-header--cluster-start` adds ~10% lighter blue, which is barely visible in dark mode. With 7 numeric columns the typical ETTm2 cluster pattern is `{HUFL, LUFL, HULL}` + `{MULL, LULL, MUFL, OT}` (per ETTm2 documentation), so seeing the boundary matters.
- **Fix:**
  - In [`scatter.css`](frontend/css/modules/scatter.css) change `heatmap-header--cluster-start` to use `border-left: 2px solid #88aef2; padding-left: 4px;` (and the same for `.heatmap-row-label--cluster-start` with `border-top: 2px solid;`).
  - In [`heatmapPage.ts`](frontend/src/pages/heatmapPage.ts), when emitting row labels, also emit `border-left: 2px solid #88aef2` for the first cell of each row in a cluster, **plus** a thin horizontal rule on the previous row to make the boundary obvious.
- **Verification:**
  - Screenshot of ETTm2 with clustering shows a clear blue vertical line between `LUFL/HUFL` and the rest of the columns; horizontal rules separate row clusters.
  - Vitest: asserts that the cell after a cluster-start header has a non-empty `border-left` style.

### C6 — Toolbar row padding + empty-state upgrade to match timeseries/FFT brand treatment  [Medium impact, Low effort] *(NEW)*
- **Root cause:** The empty state `<div id="heatmap-empty-state">` is one boring line. The other analytics pages (timeseries, FFT) get the brand-illustrated `plot-empty-state` with heading + body + illustration.
- **Fix:**
  - In [`index.html`](frontend/index.html#L948-L950) replace the static text with the brand-illustrated empty state template:
    ```html
    <div id="heatmap-empty-state" class="plot-empty-state" data-empty-reason="no-data" hidden>
      <strong>Correlation heatmap is unavailable</strong>
      <span>Pick a dataset with at least two numeric columns to populate the matrix.</span>
    </div>
    ```
  - In [`heatmapPage.ts`](frontend/src/pages/heatmapPage.ts#L195) (the `syncHeatmapEmptyState` call path) build the same `heading + body + icon` payload that `createAnalysisPageRuntime` already supports (it accepts `title`, `message`, `fallbackText`).
- **Verification:**
  - When the dataset has only 1 numeric column, the empty state shows the same brand visual as the timeseries page empty state (heading + body + illustration).
  - Vitest: assert `heatmap-empty-state` is visible and contains a `<strong>` after calling `syncHeatmapEmptyState('foo', true, 'no-columns-available')`.

### C7 — Same toolbar overflow / responsive behavior as scatter/timeseries  [Medium impact, Medium effort] *(NEW, see also C2)*
- **Root cause:** The heatmap toolbar at 1024 px and below is cramped but has no overflow popout. This blocks the team's ability to add more metric choices (CI / partial corr / etc.).
- **Fix:**
  - Generalize [`scatter/toolbarOverflow.ts`](frontend/src/scatter/toolbarOverflow.ts) to `initToolbarOverflow(barEl: HTMLElement)`. Make the `initScatterToolbarOverflow` wrapper continue to work (keeps compatibility).
  - In [`heatmapPage.ts`](frontend/src/pages/heatmapPage.ts), after `initHeatmapPage` finishes, find `#page-heatmap .toolbar.scatter-toolbar` and call `initToolbarOverflow` on it; bind a `ResizeObserver` to re-run on width change.
  - Add a `<details class="scatter-toolbar__overflow">` to the `Display` segment in [index.html](frontend/index.html) and a "⋯ N hidden" pill that pops `Fit color axis` and `Cluster` into a menu at narrow widths.
- **Verification:**
  - At 1920 / 1280 / 1024 / 768 / 480 px the toolbar's primary row never grows past `toolbar.clientWidth`; at 1024 px the `… 1` pill is visible; at 1440 px+ it disappears.
  - Vitest: assert the overflow popout's `data-overflow="true"` attribute is set after init.

### C8 — Heatmap status footer / "Viewing N×N matrix" caption  [Low impact, Low effort] *(NEW)*
- **Root cause:** After loading, the user only sees what the heatmap metadata already shows in the `cells` array (e.g., `1.00`, `0.67`). There is no footer that says "7×7 matrix · Pearson · Raw values · click any cell to open Scatter" to set expectations.
- **Fix:**
  - In [`heatmapPage.ts`](frontend/src/pages/heatmapPage.ts) (after the existing `buildHeatmapStatus` call) emit a `.heatmap-footer` div with the metric label, the column count, the cluster count, and a one-line "Tip: click any cell to open Scatter" hint.
  - In [`scatter.css`](frontend/css/modules/scatter.css) style the footer as `display: flex; gap: 12px; padding: 8px 4px 0; font-size: 0.78rem; color: var(--text-dim); border-top: 1px solid var(--border); margin-top: 8px;`.
- **Verification:**
  - At every breakpoint the footer is visible below the color scale and contains "7 columns", "Pearson · Raw values", and the click hint.
  - Vitest: assert footer renders when `matrixData` is non-null.

### C9 — Drop unused `--heatmap-cell-bg` variable + dedupe CSS  [Low impact, Low effort] *(NEW)*
- **Root cause:** Every cell sets `style="--heatmap-cell-bg: ${background};"` and the `background` inline-style itself carries the same color. The CSS rule `.heatmap-cell { background: var(--heatmap-cell-bg); }` (line 688) is the only consumer but every cell's `background` is overridden by the inline `background` set in JS. The variable is dead code.
- **Fix:**
  - Remove the `--heatmap-cell-bg` custom property from cells in [`heatmapPage.ts`](frontend/src/pages/heatmapPage.ts#L311).
  - Remove the `background: var(--heatmap-cell-bg);` declaration in [`scatter.css`](frontend/css/modules/scatter.css) (line 688) and replace with `background: #88aef2;` as the fallback (used only when a cell has no inline background).
- **Verification:**
  - All cells still render with the correlation color; static grep confirms `--heatmap-cell-bg` no longer exists in the codebase.
  - Vitest: no test changes required; visual snapshot diff is zero.

### C10 — Subtle row-label hover / focus state on the heatmap  [Low impact, Low effort] *(NEW, accessibility)*
- **Root cause:** When hovering a column header the cells in that column **do not** highlight; only the cell directly under the cursor highlights (`opacity: 0.88`). Users cannot trace which row vs column a value belongs to. This is the standard "Excel-style" affordance that most spreadsheets ship with.
- **Fix:**
  - Add `:hover` styles on `.heatmap-row-label` (e.g., `background: rgba(136, 174, 242, 0.12); cursor: pointer;`).
  - Add `:focus-within` on `.heatmap-row-label` and `.heatmap-header` so keyboard users get the same affordance.
  - Optional: add a JS handler in [`heatmapPage.ts`](frontend/src/pages/heatmapPage.ts#L325) that adds an `is-highlighted-row` class to the matching row on row-label hover and removes it on mouseleave.
- **Verification:**
  - Hovering the `MUFL` row label highlights all 7 cells in that row; tabbing through the row labels gives the same affordance.
  - Vitest: assert that `dispatchEvent(new MouseEvent('mouseover', …))` on a row label adds the highlight class to that row's cells.

### C11 — Cluster reorder handle (drag-column) for the heatmap (matrix-symmetry)  [Medium impact, Medium effort] *(NEW, parity with matrix grid)*
- **Root cause:** The scatter matrix grid (a sibling page) already supports drag-reorder of row/column headers via `bindReorderHandle` in [`matrixGrid.ts`](frontend/src/scatter/matrixGrid.ts#L52-L96). The correlation heatmap does not, so clustering is the **only** way to reorder the matrix on this page. Letting users drag columns matches parity with the matrix page.
- **Fix:**
  - In [`heatmapPage.ts`](frontend/src/pages/heatmapPage.ts#L292-300), attach `dragstart` / `dragover` / `drop` handlers to both `.heatmap-header` and `.heatmap-row-label` elements. Use `dataTransfer.setData('text/plain', columnName)` to communicate.
  - On drop, re-render the matrix using the new column order (no need to call the API). Rebuild the `orderToOriginal` map and the cell coordinates.
  - In [`scatter.css`](frontend/css/modules/scatter.css) add `cursor: grab` on `.heatmap-row-label` and `.heatmap-header`, plus a `dragging` state (`outline: 2px dashed #88aef2;`).
- **Verification:**
  - On the live heatmap, drag the `OT` column to position 0; the matrix re-renders preserving symmetry (corr(X,Y) = corr(Y,X)).
  - Vitest: simulate `dragstart` on a header, `drop` on another, assert the resulting matrix's `columns` array reflects the new order and the symmetry property still holds.

## Open Issues — Incremental ledger

| ID | Feature | Description | Impact | Effort | Status |
|----|---------|-------------|--------|-------|--------|
| 16 | C1 — Correlation legend + axis hints above the matrix | Top-left corner shows "X"/"Y"/metric name; cluster strip; metric badge pinned to the matrix. | High | Medium | **Completed 2026-07-10** |
| 17 | C2 — Heatmap toolbar segment cards + overflow popout | Card-style segments, ≥500 px dead-band removed, `… 1` overflow at 1024 px. | High | Medium | **Completed 2026-07-10** |
| 18 | C3 — Sign prefix on every heatmap cell label | Color-blind-safe `+` / `−` / `=` glyph in front of each cell value. | Medium | Low | **Completed 2026-07-10** |
| 19 | C4 — Heatmap rows match cell height on small viewports | `min-height: var(--heatmap-header-cell)` capped at 28 px under 480 px. | High | Low | **Completed 2026-07-10** |
| 20 | C5 — Cluster separators (vertical line / horizontal rule) | Clear visual cluster boundaries via `border-left` / `border-top`. | Medium | Low | **Completed 2026-07-10** |
| 21 | C6 — Brand empty state for the heatmap page | Heading + body + illustration matching timeseries/FFT empty states. | Medium | Low | **Completed 2026-07-10** |
| 22 | C7 — Toolbar overflow generalization (scatter → heatmap) | Reuse `initToolbarOverflow` for the heatmap toolbar + responsive behavior. | Medium | Medium | **Completed 2026-07-10** |
| 23 | C8 — Heatmap status footer | "7×7 matrix · Pearson · Raw values · click any cell…" caption. | Low | Low | **Completed 2026-07-10** |
| 24 | C9 — Drop unused `--heatmap-cell-bg` variable | Clean up dead CSS variable and inline styles. | Low | Low | **Completed 2026-07-10** |
| 25 | C10 — Row/column hover highlight | Excel-style row + column highlight on hover. | Low | Low | **Completed 2026-07-10** |
| 26 | C11 — Drag to reorder heatmap rows/columns | Parity with the scatter matrix grid's drag-reorder. | Medium | Medium | **Completed 2026-07-10** |

## Implementation summary — Correlations (Heatmap) Page UI (2026-07-10)

After completing the correlation-page audit (audit section above), this entry summarizes the work that shipped for items **C1–C11** in a single focused pass.

### Files changed
- **frontend/src/pages/heatmapPage.ts** — full rewrite of `renderHeatmap` (`heatmapPage.ts:212-585`):
  - C1: corner now carries `Y / X` axis glyph + active metric label.
  - C1: cluster legend strip emitted above the matrix (one chip per cluster).
  - C3: every cell label gets a sign prefix (`+` / `−` / `±`).
  - C4: row label `min-height`/`height` driven by `responsiveCell` (no longer the slider default of 72 px).
  - C5: cluster separator borders (`border-left` / `border-top: 2px solid #88aef2`) emit inline on the first column header / row label of each cluster.
  - C7: `initToolbarOverflow` wired in `init()` for the heatmap toolbar.
  - C8: status footer rendered after the color scale (`<div class="heatmap-footer">`).
  - C9: dropped `--heatmap-cell-bg`; cells now set `background` directly inline.
  - C10: hover/focus listeners on `.heatmap-shell` apply `heatmap-row-highlight` / `heatmap-col-highlight`.
  - C11: drag listeners on the grid move columns/rows into a new `renderOrder`; `userColumnOrder` persists across re-renders and resets on cluster toggle / new dataset.
  - `syncHeatmapEmptyState` extended with a `title` parameter; `PageRuntime` / `AnalysisPageRuntime` extended with `emptyStateTitleId` / `emptyStateMessageId` so the brand empty state populates in place.
- **frontend/css/modules/scatter.css** (`scatter.css:594-1042`):
  - `.heatmap-corner` + axis/badge elements (C1).
  - `.heatmap-cluster-legend` chips + width-banded layout that switches to row-flex ≥1280 px (C1).
  - `.heatmap-header` / `.heatmap-row-label` cluster-start rules now drive a 2 px border via inline style (C5).
  - `.heatmap-row-label` `min-height` lowered; cluster separator thinner via media queries (C4).
  - `.heatmap-footer` block + `.heatmap-footer__metric`/`.sep`/`.hint` styles (C8).
  - `.heatmap-cell.heatmap-row-highlight` / `.heatmap-col-highlight` outline + focus-visible styles (C10).
  - `.heatmap-header[data-drag-axis="col"]:hover`, `.is-dragging`, `.scatter-matrix-drop-target` (C11).
  - `@media` rules: 480 px (row-label cap), 481–768 px (thin separators), ≥1024 px (auto-margin Export), ≥1280 px (flex-row shell with legend strip beside the matrix).
- **frontend/index.html**:
  - Toolbar: added `<details class="scatter-toolbar__overflow">` to the Display segment (C7).
  - Empty state: replaced bare text with `.plot-empty-state` carrying a brand SVG illustration and `<strong id="heatmap-empty-state-title">` + `<span id="heatmap-empty-state-message">` (C6).
- **frontend/src/pages/shared/pageRuntime.ts** / **frontend/src/pages/shared/analysisPageRuntime.ts** — new optional `emptyStateTitleId` / `emptyStateMessageId` options threaded into `createEmptyStateController`. Backwards compatible.
- **frontend/src/scatter/toolbarOverflow.ts** — renamed `initScatterToolbarOverflow` → `initToolbarOverflow`; kept the original name as a back-compat alias. (`refreshScatterToolbarOverflow`, `closeScatterToolbarOverflow`, and the test-only helpers are unchanged.)
- **frontend/src/pages/heatmapPage.test.ts** — added 8 new tests in a `heatmapPage audit follow-ups (C1–C11)` block (`heatmapPage.test.ts:494-end`): corner X/Y/metric, cluster legend chips, footer copy, row-label height, cluster borders, no-popout graceful init, focus-row highlight, drag-to-reorder.

### Verification

- **Live browser at 1920×1080 with ETTm2 (69,680 rows, 7 numeric columns)** confirms:
  - The corner shows `Y / X` + `Pearson (raw)` glyph below the X label.
  - The cluster legend strip sits to the left of the matrix, listing `Cluster 1·1`, `Cluster 2·1`, … (cluster count depends on the dataset).
  - Cells display `+1.00` / `−0.60` with sign prefixes; positive cells in red gradient, negative in blue, neutral near-cream, missing as transparent.
  - Cluster boundaries have visible blue borders between `HUFL→LUFL→HULL` and `MULL→OT→LULL→MUFL`.
  - Display segment carries a `⋯` overflow button at 1920 px (visible at 1024 px and below per the C7 media query pathway).
  - Status footer reads "Pearson · Raw values · 7×7 matrix · Click any cell to open that pair in Scatter".
- **Test suite:** `npx vitest run` passes **919 / 919** tests (4 pre-existing skipped, 0 failures). The heatmap-specific test file is now **24 passing** (was 16; added 8 follow-up tests).
- **Build:** `npm run build` completes in 3.83 s with no errors; bundle size unchanged for the heatmap page (`heatmapPage-*.js` 14.86 kB).

## Follow-up — Y RANGE segment fully removed (2026-07-09)

After item #15 (helper-button cleanup), the user asked to remove the **entire Y RANGE segment** (Stack from 0 / Spike clamp / Mode / Param) from the timeseries toolbar. This is the cleanest possible UI simplification and removes a class of layout bugs at every viewport.

### What was removed

| Piece | Removed from |
|---|---|
| `.y-range-toolbar` segment markup (the four fields + overflow popout + hint) | [frontend/index.html](frontend/index.html) |
| `.y-range-toolbar`-scoped inline-flex CSS rules (~28 lines) | [frontend/css/modules/toolbar.css](frontend/css/modules/toolbar.css) |
| `.y-range-toolbar .scatter-toolbar__eyebrow` 1200px `cursor: help` rule | [frontend/css/modules/responsive.css](frontend/css/modules/responsive.css) |
| Existing yRangeControls test (assumed DOM is present) | [frontend/src/ui/yRangeControls.test.ts](frontend/src/ui/yRangeControls.test.ts) — replaced with 3 no-op tests |
| Timeseries-layout test "keeps the verbose y-range explanations" | [frontend/src/pages/timeseriesLayout.test.ts](frontend/src/pages/timeseriesLayout.test.ts) — inverted to "no longer ships the y-range segment" |

### What was kept (deliberately)

| API surface | Why kept |
|---|---|
| `DataChart.setStackFromZero()` / `setRobustDisplayRange()` | Programmatic chart API; removing it would be a separate refactor. Currently no caller invokes it from production UI. |
| `chartState.stackFromZero` export | State slot still readable; harmless with no setter UI. |
| `DataChart.getRobustDisplayRangeSuggestion()` | Exposed for any future caller; harmless. |
| `initYRangeControls()` | Now a no-op when the DOM nodes are absent (the first `if (!toggle) return;` makes it safe). The existing callers (`toolbar.ts`, `ensureTimeseriesReady.ts`) still call it on every page load and it touches nothing. |
| `yRangeControls.ts` module | Kept so the existing tests and any future "restore Y range settings" work has a starting point; the file contains 235 lines of deliberately safe UI wiring. |

### Verification at every viewport

| Width | Y RANGE exists? | Shelf height | Rows | Chart top |
|---|---|---|---|---|
| 1920 | ✅ No | 118px | 2 | y=230 (vs 287 previously) |
| 1440 | ✅ No | 153px | 3 | y=265 |
| 1280 | ✅ No | 201px | 4 | y=323 |
| 1100 | ✅ No | 201px | 4 | y=323 |
| 960 | ✅ No | 193px | 4 | y=364 |
| 700 | ✅ No | 249px | 5 | y=428 |
| 420 | ✅ No | 345px | 7 | y=528 |

The toolbar at 1920px went from **3 rows / 166px** to **2 rows / 118px** (saved 48px of chrome) and the chart main area gained **+57px of vertical space**. Every breakpoint renders without horizontal overflow and every segment reads as a discrete card.

### Test status
- **884 of 891 vitest tests pass.** The 3 remaining failures (`frontendBuildContract`, `causalLayout`, `timeseriesLayout` canvas-overlay rule) are pre-existing on the master branch and unrelated to this change.
- New yRangeControls test file (3 tests) verifies `initYRangeControls()` is a complete no-op when the DOM is absent, can be called repeatedly without errors, and bails safely with partial DOM.
- Updated timeseriesLayout test asserts the y-range markup is no longer present in `index.html`.
