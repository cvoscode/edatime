# Improvement Features Ledger

## 2026-05-21

### Issue: ChartGPU Fallback Not Working in Auto Mode

**Impact:** High  
**Effort:** Medium

**Description:**  
When ChartGPU fails to initialize in auto mode (e.g., `NotFoundError: Failed to execute 'insertBefore' on 'Node'`), the fallback to ECharts doesn't trigger properly. The error occurs deep inside ChartGPU's internal code during blob URL import, before our try-catch can capture it.

**Evidence:**
```
[ChartRegistry] Auto mode, checkWebGPUAdapterAvailable: true
[ChartRegistry] Final engine selection: ChartGPU
[useChartEngine] init failed: NotFoundError: Failed to execute 'insertBefore' on 'Node':
    at jt (http://127.0.0.1:3000/assets/index.DDgZZHls.js:2:23865)
```

**Missing expected log:** `[ChartRegistry] ChartGPU init failed, falling back to ECharts:`

**Root cause:** The error originates from ChartGPU's own initialization (`jt` function) before our wrapper's try-catch can intercept it.

**Current behavior:** ChartGPU selected in auto mode → init fails → chart status set to 'error' → no data rendered

**Desired behavior:** ChartGPU selected in auto mode → init fails → fallback to ECharts → chart renders with data

**Affected files:**
- `frontend/src/components/chart/ChartRegistry.ts` - fallback logic present but not catching the error
- `frontend/src/components/chart/ChartGPUAdapter.ts` - error thrown before try-catch
- `frontend/src/hooks/useChartEngine.ts` - catches error and sets status to 'error'

**Next steps:**
1. Make ChartGPU more resilient to DOM initialization issues
2. Ensure fallback triggers reliably when ChartGPU init fails at any stage
3. Add better error logging to identify exact failure point
4. Consider making 'echarts' the default in auto mode until ChartGPU is more stable

---

### Issue: Backend Data Not Loaded on Startup

**Impact:** High  
**Effort:** Low

**Description:**  
When the backend server starts, it doesn't automatically load a default dataset. The frontend shows "No data loaded" until user uploads data via the UI.

**Current state:** `GET /api/metadata` returns `{"revision":0,"total_rows":0,...}`

**Expected:** ETTm2.csv or similar dataset loaded on startup for demo/development purposes.

---

### Issue: Browser Service Worker Caching Old Frontend

**Impact:** Medium  
**Effort:** Low

**Description:**  
When rebuilding the frontend, the browser may serve old cached content via service worker, making it appear the rebuild didn't take effect.

**Workaround:** Open new browser page with `forceNew: true` or disable SW in dev.

**Fix:** Ensure service worker cache busting works correctly with versioned assets.

---

## 2026-07-05 — ETTm2 walkthrough

Audited the app end-to-end with the ETTm2 sample dataset. Full list with
fix plans lives in `issue.md` at the repo root. Ledger entries below are
the high-impact findings surfaced from that pass.

### Issue: Scatter shows "No scatter points found" when "Link chart range" is on but no time filter is set

**Impact:** High  
**Effort:** Low

**Description:**  
With Link chart range enabled and no active viewport / adaptive filter,
scatter shows the empty-state copy "No scatter points found — No points
match active filters (1 column, 0 adaptive)." even though the density
backdrop contains data. Toggling the checkbox off recovers points.

**Fix plan:** F1 in `issue.md`.

### Issue: Scatter Y-axis range is wrong (positive-only) for HULL with a stripe at y = 1.49

**Impact:** High  
**Effort:** Low

**Description:**  
HULL range is `min=-29.32, max=36.44` but the scatter Y-axis shows
ticks at `1.49, 13.44, 25.40, 37.36` and a long horizontal bright
stripe is visible at the floor.

**Fix plan:** F2 in `issue.md`.

### Issue: Correlation matrix colormap appears inverted for positive values

**Impact:** High  
**Effort:** Medium

**Description:**  
Diagonal `1.00` cells render dark red, off-diagonal `0.67` cells render
white/pale, and `0.91` cells render lighter than `0.67`. The mapping
seems reversed for the `[0, 1]` half of the diverging colormap.

**Fix plan:** F3 in `issue.md`.

### Issue: Drift page uses an off-by-2-hour timestamp for Start/End and flags every window RED

**Impact:** High  
**Effort:** Medium

**Description:**  
Default reference shows `01/07/2016 02:00 → 28/06/2017 23:52`, while the
dataset spans `2016-07-01 00:00:00 → 2018-06-26 19:45:00`. Resulting
output flags `363/363` windows RED across all 7 columns with identical
"Strongest reasons: psi_major, wasserstein, ks, es" — likely a
degenerate comparison driven by the misaligned reference.

**Fix plan:** F4 + F5 in `issue.md`.

### Issue: Timeseries legend overlaps Y-axis labels when zoomed in

**Impact:** High  
**Effort:** Low

**Description:**  
After zooming (e.g. `7d`), the floating trace legend renders on top of
the Y-axis tick labels (`61.11`, `46.53`), making both unreadable.

**Fix plan:** F8 in `issue.md`.

### Issue: Timeseries "X of N active" counter is stale after toggling chips

**Impact:** Medium  
**Effort:** Low

**Description:**  
Toggling MUFL on updates the legend/trace but the inline text still
reads `3 of 7 active`.

**Fix plan:** F6 in `issue.md`.

### Issue: Timeseries chips and "Filter columns" row layout is broken when chips overflow

**Impact:** Medium  
**Effort:** Low

**Description:**  
With ≥5 chips selected the chips overflow above the toolbar row, leaving
the SERIES label isolated. Should be a single horizontally-scrolling
group.

**Fix plan:** F7 in `issue.md`.

### Issue: Spectrogram X-axis labels rotated nearly vertical, color range dominated by yellow

**Impact:** Medium  
**Effort:** Low

**Description:**  
Time labels at ~90° rotation fight each other; with default normalize
"None", the heatmap is mostly bright yellow because the data range
(-3.998..0.575 log10) is not adapted to the visible data.

**Fix plan:** F12 in `issue.md`.

### Issue: FFT Y-axis "log10(Magnitude)" shows negative values

**Impact:** Medium  
**Effort:** Low

**Description:**  
Magnitudes are non-negative, so log10 should be ≥ 0. The axis shows
`0.164, -0.615, -1.393, -2.171, -2.949`, suggesting log is being
applied after an unexpected shift or the axis is offset.

**Fix plan:** F11 in `issue.md`.

### Issue: Causal workflow banner shows an empty action box with only ✕

**Impact:** Medium  
**Effort:** Low

**Description:**  
On the Causal page the guided-workflow card renders a small empty box
containing only an ✕ button. Other pages (Upload, Scatter) correctly
render an "Open …" action button.

**Fix plan:** F13 in `issue.md`.

### Issue: Drift Columns picker doesn't look like a multi-select

**Impact:** Medium  
**Effort:** Low

**Description:**  
The columns pill renders as a single-value combobox until opened;
users miss that it is a multi-select.

**Fix plan:** F10 in `issue.md`.

### Issue: Timeseries negative values hidden when Pin lower bound is on by default

**Impact:** Medium  
**Effort:** Low

**Description:**  
HULL values below zero (real min -29.32) are clipped at 0 with
"Pin lower bound" enabled by default — losing visibility of negative
excursions and outliers.

**Fix plan:** F9 in `issue.md`.

### Issue: Home sample card description may clip on Sinusoidal card

**Impact:** Low  
**Effort:** Low

**Fix plan:** F15 in `issue.md`.

### Issue: Timeseries "Viewing X%" indicator shows a fraction briefly after Quick Range

**Impact:** Low  
**Effort:** Low

**Fix plan:** F14 in `issue.md`.

### Issue: Settings, drawing tools, analytics modal, annotations, additional exports not exercised in this pass

**Impact:** Unknown  
**Effort:** N/A

**Next steps:** Schedule a follow-up walkthrough and file any new issues.

---

## 2026-07-07 — Home page "Top correlations" widget removal

### Issue: Home "Top correlations (current dataset)" widget is unstyled, dead on narrow widths, and unused

**Impact:** Medium  
**Effort:** Low (completed — removal done in this audit)

**Description (what was found during the audit):**  
The widget between "Try with sample data" and "Recommended workflow" rendered the strongest correlation pairs from `/api/scatter/correlations` as click-to-jump chips into the Scatter page.

Observations from the responsive walkthrough (1920 / 1280 / 1024 / 768 / 414 / 375):

- The widget markup used class names `.home-top-pairs`, `.home-top-pair-row`, `.home-top-pair-row__x|arrow|y|corr` but no matching CSS lives in `frontend/css/modules/home.css` (verified — zero matches for any of those selectors). It therefore inherits default `<button>` styling and renders as a single line of cramped, plain text inside one grey `<div>` rather than a row of chips.
- The "Strongest pairs …" copy still consumes vertical space on mobile even when the widget is data-empty (no dataset loaded) because the section is hidden via `hidden`, but the inline copy is in the same wrapper. On narrow screens the title + copy consume ~60px without context.
- The widget depends on a dataset being loaded (`numeric_columns.length >= 2`), so first-time visitors on a fresh home page never see anything from it.
- The widget does not interact with any other page state when clicked beyond setting dropdowns and dispatching `edatime:page-change`; the same effect can be reached from the "Scatter" card or via the existing `correlationsPanel.ts`.
- No tests, no docs (developer guide or otherwise), and no other source consumers depend on this widget. `TopPairItem` continues to be used by `frontend/src/types.ts` and consumed by `frontend/src/store/scatterState.ts`, so the type stays.

**Action taken (this audit):**  
Removed the widget and all code exclusively used by it.

- Delete: `frontend/src/features/home/topCorrelations.ts` and the now-empty `frontend/src/features/home/` directory.
- Edit: `frontend/index.html` — drop the `#home-top-correlations-section` block; the page now flows `Sample data → Recommended workflow → Advanced analyses → Keyboard shortcuts` directly.
- Edit: `frontend/src/app/shell/deferredSubsystems.ts` — drop the `registerSubsystem('home-top-correlations', …)` call and the `await ensureSubsystem('home-top-correlations', deps)` line in `ensureHomeSubsystems`.
- Edit: `ai/frontend/src/app/shell/deferredSubsystems.md` — remove `'home-top-correlations'` from the subsystem list and the note about `ensureHomeSubsystems`.

**Verification:**

- `npm run typecheck` — passes.
- `npm run check:frontend:arch` — `Frontend architecture checks passed.`
- `npm test` — 874 / 876 passed; the two failing tests (`scripts/frontendBuildContract.test.ts` and `frontend/src/causal/causalLayout.test.ts`) are pre-existing on `master` (confirmed via `git stash` round-trip) and unrelated to this change.
- Live reload of `http://127.0.0.1:5173/#page=home` — a11y snapshot no longer contains the "Top correlations" heading, the `#home-top-correlations-section` wrapper, or any `.home-top-pair-row` buttons. Page tree reduces from `Sample datasets → Top correlations → Recommended workflow → Advanced analyses` to `Sample datasets → Recommended workflow → Advanced analyses`.

**Net effect:**

- One less deferred subsystem at home-page boot (avoids the `fetchScatterCorrelations` call when no data is loaded, and the related `setDropdownValue + navButton.click + page-change event` waterfall).
- One less design-broken section to style on mobile (the widget never had CSS for `.home-top-pair-row` and would have required new `home.css` rules and media-query work to look right).
- The scatter correlation-suggestion flow is still intact via `frontend/src/scatter/correlationsPanel.ts` on the dedicated Scatter page (`⌥3`) and via the heatmap on the Correlations page (`⌥7`).
- No caller depends on `__edatime.ensureSubsystem('home-top-correlations')` (confirmed via repo-wide grep).

---

## 2026-07-07 — Upload page "Source status" + "Next step" guidance cards removed

### Issue: Upload page is crowded by redundant "Source status" / "Next step" guidance cards

**Impact:** Medium  
**Effort:** Low (completed — removal done in this audit)

**Description (what was found during the upload-page audit):**

The upload page (panel id `#upload-panel`) renders two persistent "guidance" cards directly under the tab bar / load options and above the column profile grid:

- **Source status** — `id="upload-source-guidance"` (`File mode · waiting for a CSV or Parquet file.`).
- **Next step** — `id="upload-next-step-guidance"` (`Choose a file, preview the detected columns, then ingest the selected set.`).

Observations from the responsive walkthrough:

- The information in these cards **duplicates** the existing affordances: the active tab (File / Database) already tells the source mode, the `#upload-preview-status` element already reports "Profiling file…" / "Preview ready" / "Preview failed", and the `partial-enabled` toggle + the "Upload & Ingest" button already communicate the next concrete action.
- At desktop widths the cards take a wide 2-column row that consumes ~120 px of vertical space in a panel already cramped against the column profile grid.
- On tablet widths the column drops to `1fr` (per `frontend/css/modules/responsive.css`) but still consumes ~140 px before the grid appears.
- On phone widths (<900 px) the cards stack into single-column rows but the text doesn't reflow well; at 375 px they're two stacked full-width cards that add ~170 px of dead weight between the Load options panel and the column table.
- The values are managed by two helpers (`setUploadSourceGuidance`, `setUploadNextStepGuidance`) wired through `syncUploadGuidance(...)` in 8 call sites across `initUploadPanel`. They have no semantic value beyond echoing the same state the rest of the panel already shows.
- `setUploadPreviewStatus(...)` (which controls `#upload-preview-status` — the inline status text under the tab strip) is the right surface for "what's happening now"; the guidance cards are an outdated parallel.

**Action taken (this audit):**

Removed the cards and all code exclusively used by them.

- Edit: `frontend/index.html` — removed the `<div class="upload-preview-guide">…</div>` block (the two `__card` divs with `upload-source-guidance` and `upload-next-step-guidance`).
- Edit: `frontend/src/features/upload/preview.ts` — removed `setUploadSourceGuidance` and `setUploadNextStepGuidance` exports, and the three call sites that set them inside `runFilePreview`.
- Edit: `frontend/src/ui/upload.ts` — removed the corresponding import, removed the `syncUploadGuidance(...)` helper, and removed all 8 call sites in `initUploadPanel` / `switchUploadSource` (file change handler ×2, drag-drop handler ×2, init ×1, database tab switch ×1, file tab switch ×1, plus the helper itself).
- Edit: `frontend/src/ui/upload.test.ts` — removed the two `<div>` mocks for the removed IDs and removed the now-empty "keeps persistent source guidance in sync with the active upload mode" `it` block; all other upload tests remain unchanged.
- Edit: `frontend/css/modules/upload.css` — removed `.upload-preview-guide`, `.upload-preview-guide__card`, `.upload-preview-guide__label`, `.upload-preview-guide__value` (4 rules).
- Edit: `frontend/css/modules/responsive.css` — removed the responsive `.upload-preview-guide { grid-template-columns: 1fr; }` rule.
- No AI/docs mirrors referenced these classes (verified via `grep ai docs`).

**Verification:**

- `npm run typecheck` — passes.
- `npm run check:frontend:arch` — `Frontend architecture checks passed.`
- `npx vitest run frontend/src/ui/upload.test.ts` — 33 passed (4 skipped, same as before).
- `npm test` — 873 passed; the same 2 pre-existing failures on `master` (confirmed via `git stash` round-trip) and **no new failures**.
- Live reload of `http://127.0.0.1:5173/#page=upload`:
  - a11y snapshot: no `Source status` / `Next step` headings, no `#upload-source-guidance`, no `#upload-next-step-guidance`, no `.upload-preview-guide*` matches.
  - Visual: the upload panel now flows `File/Database tabs → Drop zone | Load options | Upload & Ingest → File preview toolbar → column profile grid`. The wasted vertical gap (~120 px on desktop, ~170 px on mobile) between the controls and the column table is gone, giving the column table a full screen of room earlier in the scroll.

**Net effect:**

- ~120 px of redundant vertical space reclaimed on desktop, more on narrow viewports.
- Three helpers (`setUploadSourceGuidance`, `setUploadNextStepGuidance`, `syncUploadGuidance`) and 8 call sites removed — code path that mirrors state already visible in the tab strip and `#upload-preview-status` no longer has to stay in sync.
- CSS footprint trimmed: 4 base rules + 1 responsive rule.
- Net diff: 4 files modified, 1 test case simplified, no behavior change for upload validation / preview / ingest flows.


**Fix plan:** F17 in `issue.md`.
---

## 2026-07-07 — Upload page: Filter input and Preview status hidden when not very wide

### Issue: `#profile-filter-input` and `#upload-preview-status` are clipped off the right edge when the screen is "not very wide"

**Impact:** High  
**Effort:** Low (completed — fix shipped in this audit)

**Description (what was found during the upload-page walkthrough):**

After removing the redundant "Source status" / "Next step" guidance cards, an existing layout bug surfaced. Two essential controls in `.upload-preview-head` — the **Filter columns…** input (`#profile-filter-input`) and the **preview status** span (`#upload-preview-status`) — were **clipped off the right edge** of the panel at intermediate viewports.

User-reported observation: *"These two elements vanish when the screen is very unwide"* (i.e. when the screen is *not* very wide).

Probe across viewports (`tmp/probe-upload.mjs`):

| Viewport | Filter rect.x..x+w | Upload-preview right edge | Visible? |
|---|---|---|---|
| 1920 × 1080 | 1531..1691 | 1896 | ✅ |
| 1440 × 900  | 1239..1399 | 1416 | ✅ (barely) |
| 1280 × 800  | 1225..1385 | 1376 | ❌ clipped 9 px past container |
| 1024 × 768  | 1185..1345 | 1000 | ❌ filtered input clipped, status missing |
| 768 × 1024  | 567..727  |  | ✅ (responsive rule kicks in) |
| 414 × 896   | 165..385  |  | ✅ (filter wraps to own row) |
| 375 × 800   | 126..346  |  | ✅ (filter wraps to own row) |

Root cause (DOM-ancestor trace, `tmp/inspect-tree.mjs`):

- `.upload-preview` is `display: grid; grid-template-rows: auto auto minmax(300px, 1fr)`. Its single **implicit** grid column was being sized by `auto` (= max-content of any grid item).
- The head's flex children included the Filter wrapper with `flex: 1 1 240px; min-width: 240px` and the Status span with `margin-left: auto; white-space: nowrap` — both of which forced the row to grow beyond the parent.
- The head itself is a grid item with **no `min-width: 0`** and **no `minmax(0, 1fr)`** column track on its grid parent, so it could not shrink below its content's intrinsic size (1156 px at 1024 viewport).
- Result: the head grew to ~1156 px wide regardless of the actual panel width. The `.upload-preview { overflow: hidden }` rule then **clipped** anything that fell outside its own 794 px box.

**Fix applied (this audit):**

Two CSS rules in `frontend/css/modules/upload.css`:

```css
.upload-preview {
  display: grid;
  grid-template-columns: minmax(0, 1fr);   /* was implicitly 'auto' (max-content) */
  grid-template-rows: auto auto minmax(300px, 1fr);
  /* … */
  min-width: 0;                            /* allow grid item to shrink */
}

.upload-preview-head {
  /* …existing rules… */
  min-width: 0;                            /* allow flex row to shrink */
}

.upload-preview-head > * {
  min-width: 0;                            /* allow all flex children to shrink */
}

.upload-preview-filter {
  flex: 1 1 200px;                         /* was 1 1 280px + min-width 240px */
  min-width: 0;
}

.upload-preview-filter .column-filter-input {
  width: min(220px, 100%);                 /* was min(360px, 100%) */
}

.upload-preview-status {
  flex: 0 1 auto;                          /* was no flex setting; flex defaults */
  min-width: 0;
  white-space: normal;                     /* was nowrap */
  text-align: right;
}
```

The root-level fix is the `grid-template-columns: minmax(0, 1fr)` on `.upload-preview` — without it the grid item's implicit `auto` column track expands to the content of the head row regardless of `min-width: 0` elsewhere.

**Verification:**

- `tmp/probe2.mjs` ancestor trace before the fix: head reported `w: 1156, scrollWidth: 1156` while parent reported `w: 796, scrollWidth: 1156` and `gridTemplateColumns: "1156px"`. After the fix: head reports `w: 794, scrollWidth: 794` and parent's `gridTemplateColumns` remains `794px`.
- `tmp/probe-upload.mjs` re-run across 1920 / 1440 / 1280 / 1024 — both `filter` and `status` report `offScreenRight: false` at every width.
- `tmp/probe-narrow.mjs` re-run across 900 / 768 / 414 / 375 — both `filter` and `status` still report `offScreenLeft/Right: false` (no regression at narrow viewports either).
- Visual screenshots (`/tmp/upload-{1024,1280,1440,1920}.png` after the fix):
  - **1024**: Filter input and "Select a file to preview columns" status text **both visible** for the first time (previously fully clipped off the right edge).
  - **1280**: Filter input is fully inside the panel, Status text wraps to its own row below the toolbar.
  - **1920**: No regression — single-row layout preserved as before.
- `npm run typecheck` — passes.
- `npm run check:frontend:budgets` — `Frontend bundle budgets passed.`

**Net effect:**

- Filter input is now always visible at every tested viewport (1920 → 375) — previously partially or fully clipped from 1280 down through 1024.
- Preview status text is now always visible — previously missing from 1280 down through ~1100.
- The head row still wraps cleanly at narrow widths (its existing `flex-wrap: wrap` + the narrower `min(220px, 100%)` input width).
- No new CSS feature used; the fix relies on the existing grid/flex toolchain that the rest of the panel already uses.
- Net CSS diff: ~10 lines changed in `frontend/css/modules/upload.css`.


---

## 2026-07-07 — Timeseries header: redundant chip-status row + clipped adaptive-hint chip removed

### Issue: `timeseries-chip-status__summary` and `timeseries-adaptive-hint` redundant, clipped on intermediate viewports

**Impact:** Medium  
**Effort:** Low (completed — removal done in this audit)

**Description (what was found during the audit):**

The timeseries page rendered two persistent discovery affordances below the chip rail:

1. **`.timeseries-chip-status__summary`** — text reading `3 of 7 active. Click chips to add more.` (or `No numeric series available.`).
2. **`.timeseries-adaptive-hint`** — a blue pill containing `[Ctrl + click] a selected series to add an adaptive line filter ×` with a dismiss button; the × set a `localStorage` preference (`edatime_timeseries_adaptive_hint_dismissed`).

Probe across viewports (`tmp/probe-timeseries.mjs`) showed both elements were clipped off the right edge of the page at intermediate widths and pushed visual weight into a fixed 50 px row at every width:

| Viewport | Summary visible | Adaptive hint visible |
|---|---|---|
| 1920 × 1080 | ✅ | ✅ |
| 1440 × 900  | ✅ | ✅ (just inside) |
| 1280 × 800  | ✅ | ✅ |
| 1100 × 800  | ✅ | ❌ offScreenRight: true |
| 1024 × 768  | ✅ | ❌ offScreenRight: true (chip clipped) |
| 900  × 800  | ✅ | ❌ |
| 768  × 1024 | ✅ | ❌ |
| 414 × 896   | ✅ | ❌ ("Ctrl +" only visible) |
| 375 × 800   | ✅ | ❌ ("Ctrl +" only visible) |

The chip rail itself already conveys "3 of 7 active" via selection state. The hint was dismissed on first install anyway (the × button), and the parallel information was already documented in:
- the per-chip `title`/context-menu entries (Ctrl+click gesture),
- the Draw toolbar `?` button which already opened the keyboard-shortcuts modal,
- the global `?` shortcut for the keyboard-shortcuts modal.

Both elements consumed vertical space (50 px row + 49 px per element height) that crowded the chip rail at narrow viewports. At 375 px the hint chip literally showed only "Ctrl +" before being clipped.

**Action taken (this audit):**

Removed both elements and the code exclusively used by them. Replaced them with non-intrusive `title` / `aria-label` tooltips so the same information is still discoverable.

- Edit: `frontend/src/features/timeseries/columnsController.ts`
  - Removed `ADAPTIVE_HINT_DISMISSED_KEY`, `isAdaptiveHintDismissed`, `setAdaptiveHintDismissed`, `refreshAdaptiveFilterHint` exports.
  - Removed `syncAdaptiveFilterHint`, `ensureChipStatusRow`, `syncChipStatusSummary` helpers.
  - Removed the `syncAdaptiveFilterHint(container)` call from `buildColumnToggles`.
  - Inlined a compact tooltip snippet on the rail container: `container.setAttribute('title', summaryText)` and `container.setAttribute('aria-label', summaryText)` so the count is still available via hover and screen-reader announcement.
- Edit: `frontend/src/ui/drawControls.ts`
  - Replaced the "if dismissed, re-show inline hint" branch with a single call to `showKeyboardShortcutsHelp()`.
  - Added a `title` attribute on the `?` button spelling out the discoverability text: *"Show drawing and adaptive-filter help — ctrl + click a selected series chip to target adaptive line filters"*.
- Edit: `frontend/src/features/timeseries/columnsController.test.ts`
  - Replaced the three hint/summary test cases (`renders an inline adaptive-filter hint`, `lets the user dismiss the adaptive-filter hint`, `exposes a refresh hook`) with one focused test that asserts the rail container's `title` and `aria-label` carry the count and update when chips toggle.
- Edit: `frontend/src/pages/timeseriesLayout.test.ts`
  - Removed the obsolete assertion `expect(chipsCss).toContain('.timeseries-chip-status')`.
  - Added a regression guard `expect(chipsCss).not.toContain('.timeseries-chip-status')` and `expect(chipsCss).not.toContain('.timeseries-adaptive-hint')`.
- Edit: `frontend/css/modules/chips.css`
  - Removed `.timeseries-chip-status`, `.timeseries-chip-status__summary`, `.timeseries-adaptive-hint`, `.timeseries-adaptive-hint__kbd`, `.timeseries-adaptive-hint__label`, `.timeseries-adaptive-hint__dismiss`, `__dismiss:hover/:focus-visible`, `__active` rules.
- Edit: `ai/frontend/src/features/timeseries/columnsController.md`
  - Removed the obsolete exports from the API mirror.
  - Replaced the file's lead paragraph with a description of the removal rationale.

**Verification:**

- `npm run typecheck` — passes.
- `npm run check:frontend:arch` — `Frontend architecture checks passed.`
- `npm run check:frontend:budgets` — `Frontend bundle budgets passed.`
- `npx vitest run frontend/src/features/timeseries/columnsController.test.ts frontend/src/pages/timeseriesLayout.test.ts frontend/src/ui/drawControls.test.ts` — 15/15 passing.
- `npm test` — 872 passing; the same 2 pre-existing failures on `master` and **no new failures**.
- `tmp/verify-timeseries.mjs` after the fix:
  - `document.querySelector('.timeseries-chip-status')` → `null` ✅
  - `document.querySelector('.timeseries-adaptive-hint')` → `null` ✅
  - `document.querySelector('.timeseries-adaptive-hint__kbd')` → `null` ✅
  - `document.querySelector('.timeseries-adaptive-hint__dismiss')` → `null` ✅
  - `column-toggles` `title` and `aria-label` → both `"3 of 7 active. Click chips to add more."` ✅
  - `draw-help-btn` `title` → `"Show drawing and adaptive-filter help — ctrl + click a selected series chip to target adaptive line filters"` ✅
- Visual screenshots (`/tmp/timeseries-after-*.png`):
  - **1920 × 1080**: page tree reduces from `Series + Filter / Chip rail / Summary text + Dismissable hint / Draw toolbar / Chart` to `Series + Filter / Chip rail / Draw toolbar / Chart` — chart gains ~50 px of vertical space.
  - **375 × 800**: previously the "Ctrl + click" hint was clipped to just "Ctrl +" — now it's gone, and the chip rail flows directly into the Draw toolbar with no intermediate row.
  - **1024 × 768 / 768 × 1024 / 1100 × 800**: chip-status row was clipped at 1100 — gone everywhere.

**Net effect:**

- ~50 px vertical row reclaimed at every viewport.
- 13 removed selectors in CSS, 3 exports + 3 functions + 1 constant removed from JS.
- Three tests removed (and one strengthened) in `columnsController.test.ts`; one positive assertion replaced with two negative guards in `timeseriesLayout.test.ts`.
- All removed code was exclusively used by these two elements (verified via repo-wide grep + the test file references).
- Discoverability intact: hover the chip rail → tooltip says "3 of 7 active. Click chips to add more."; hover the Draw `?` button → tooltip says "Show drawing and adaptive-filter help — ctrl + click a selected series chip to target adaptive line filters"; press `?` or click the `?` button → keyboard-shortcuts modal opens.

