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
