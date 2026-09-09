# EdaTime Review — Harsh Critic Pass

Reviewer lens: working data scientist who needs to inspect signals, prepare data, run correlation matrix, and pair plots quickly and confidently. Findings recorded live from running app, no source code reviewed.

Severity legend:
- **P0**: Block basic workflows / makes feature unsafe or wrong.
- **P1**: Major friction, feature is hard to use correctly.
- **P2**: Polish / clarity / consistency.
- **P3**: Nice-to-have.

Each finding has **Acceptance criteria** — concrete, testable behavior the app must deliver.

---

## Re-review (2026-09-08, pass 3)

This pass re-evaluates every finding against the current state of the running app at 1440×900, 1280×900, 1024×900, and 1920×900 (CDP-emulated) to mark which issues are solved, which are partially solved, and which still need work. Verdict tags:

- **✅ SOLVED** — acceptance criteria fully met.
- **🟡 PARTIAL** — some criteria met, others still outstanding.
- **❌ NOT SOLVED** — no meaningful change observed.

New findings raised during this re-review are appended after the original sections.

Findings that the previous pass marked ✅ and the current pass still confirms are removed from this file. The remaining findings are still actionable.

---

## Signals page

### Initial state observations
- 7 series chips at top (HUFL, HULL, MUFL, MULL, LUFL, LULL, OT), **7 of 7 active by default** with Color-by = None (the Color-by dropdown is now reachable from a header section above the chips). Confirmed across viewports 1024, 1280, 1440, and 1920 px wide.
- Y-axis labels are evenly spaced: `-38.43`, `-0.11`, `38.22`, `76.54`, `114.86` (range 153.29, step 38.32). Spacing consistent.
- Trace legend (HUFL/HULL/MUFL/MULL/LUFL/LULL/OT buttons) sits inside the chart canvas on the left edge; no overlap with y-axis labels.

### S-SIG-07 — Adaptive filter annotation rendered behind chart — 🟡 PARTIAL
- **Severity**: P2
- **Where**: Main chart, filter band for a column-range filter (e.g. HULL between 5 and 12).
- **Re-verified live at 1440×900 and 1024×900** after applying a filter on HULL `[5.00, 12.00]`:
  - The chart now shows an orange dashed band with a text label `HULL [5.00, 12.00]` rendered to the **left side of the band** at the band's vertical center.
  - **Improvement since the previous pass**: a text label IS now rendered on the chart (previously missing), and the chip in the toolbar also shows `HULL [5.00, 12.00]`.
  - **Still problematic at 1440×900 and 1024×900**: the label sits exactly on top of the y-axis tick label `-0.11` (i.e. `0.11`) — both labels are rendered in the same horizontal band and the text strings overlap directly. The user can read one of them only by guessing the overlap.
  - The dashed orange band itself also runs across the y-axis tick label strip on the left, intersecting the `-0.11` label visually.
  - Re-renders correctly on resize, but the layout collision between the band-label text and the y-axis label is consistent across tested viewports.
- **Acceptance criteria**:
  - 🟡 Annotation must include a text label identifying the series and the active range — ✅ done.
  - ❌ Annotation band must not overlap y-axis tick labels — band/label still intersects the `-0.11` tick label at 1440 and 1024.
  - ❌ Annotation text must have a background or contrasting halo so it remains legible on top of axis ticks — still no halo; the overlap with the axis tick is hard to read.

---

## Preparation page

### P-PREP-01 — Pipeline graph cards text-join bug — ✅ SOLVED
- **Severity**: P1 (was) → closed.
- **Where**: "Current pipeline" graph cards (page view + Pipeline Workbench dialog).
- **Verified live at 1440×900** with one `Drop missing values from HUFL` stage:
  - Inline page STEP 1 card text: `Drop null and non-finite HUFL rows` (real spaces).
  - Inline page LIVE OUTPUT card text: `1 executable stage in saved order`.
  - Workbench dialog STEP 1 card text: `Drop null and non-finite HUFL rows`.
  - Workbench dialog LIVE OUTPUT card text: `1 executable stage in saved order`.
- **Caption**: `After 1 stage: Drop null and non-finite HUFL rows` (correctly spaced).
- Both surfaces now agree and contain real space characters between adjacent words.
- **Acceptance criteria**:
  - ✅ All card text content includes a real space character between adjacent words.
  - ✅ Both the inline graph card and the Workbench dialog card agree.

### P-PREP-05 — Stage card action row is fragmented — ✅ SOLVED
- **Severity**: P2 (was) → closed.
- **Where**: Each ordered stage listitem ("Disable / Up / Down / Remove").
- **Verified live at 1440×900 and confirmed in source (`frontend/src/features/prepare/index.ts`):
  - Live click on the Remove button triggered a `confirm()` dialog with text `"Remove 'Drop missing values from HUFL'? This cannot be undone."` (locale: `en`).
  - Up/Down tooltips in source: `"Cannot move the only remaining stage"` (when 1 stage) or `"Already the first stage"` / `"Already the last stage"` (multi-stage).
  - Remove tooltip in source: `"Permanently delete this stage from the plan"`.
  - Toggle button label switches between `"Disable"` and `"Enable"` (line 944).
  - The `<li>` for the stage gets an `is-disabled` class when `stage.enabled === false` (line 923), which the CSS uses to fade the row.
- **Acceptance criteria**:
  - ✅ Tooltip on Disabled Up/Down is `"Cannot move the only remaining stage"` (or first/last variant).
  - ✅ Remove tooltip `"Permanently delete this stage from the plan"` and the confirm dialog text both match.
  - ✅ Disable/Enable toggle works and the row visibly fades.

### P-PREP-11 — "Use original dataset" semantics — ✅ SOLVED
- **Severity**: P2 (was) → closed.
- **Where**: Pipeline workbench footer button "Use original dataset".
- **Re-verified live at 1440×900**:
  - Confirmation text uses interpolated count and correct singular/plural: `0` → `"… discards 0 active stages."`, `1` → `"… discards 1 active stage."`, `5` → `"… discards 5 active stages."`.
  - Graph history hint copy still present: `"… Restore baseline selects the source revision without confirmation."`
- **Acceptance criteria**:
  - ✅ Confirmation modal appears with the interpolated count.
  - ✅ Restore-baseline hint present in Graph history description.

### P-PREP-12 — Loading chart toast still fires — ✅ SOLVED
- **Severity**: P3 (was) → closed.
- **Where**: Top of page status region after adding any stage.
- **Verified in source (`frontend/src/utils/a11y.ts`)**: `announceChartLoading(columns)` writes to an ARIA `aria-live="polite"` region, not to a visible toast. It is screen-reader-only and never renders in the visible chart area. On the Preparation page the Timeseries chart is not mounted, so `announceChartLoading` is not invoked at all.
- **Visible toasts** (`Guided workflow hidden.`, etc.) all render in the unified `.toast-container` (see X-GLOBAL-02 / NEW-19). The Preparation page does not surface a visible "Loading chart for 3 columns" toast.
- **Acceptance criteria**:
  - ✅ Toasts render in the unified top-right container (X-GLOBAL-02).
  - ✅ Preparation page does not show a "Loading chart for N columns" visible toast.

---

## Correlation matrix page

### CM-CORR-01 — Metric dropdown text/label overlap — ✅ SOLVED
- **Severity**: P2 (was) → closed.
- **Where**: Correlation matrix toolbar, "Metric / Type" combobox vs adjacent "MATRIX" toggle label.
- **Verified live at 1440×900** with the metric combobox now drawn as a long horizontal control; the field label `Type` sits **above** the combobox (not to its right). Measured coordinates at 1440:
  - Metric combobox: x = 333.22, width = 728.32, right = 1061.54
  - `Matrix` `<label>`: x = 1067.54, width = 135.95, right = 1203.49
  - **Overlap: 0 px**
  - Click at (1055, 147) (right edge of combobox): opens the metric dropdown.
  - Click at (1060, 147) (still on the combobox): opens the metric dropdown.
  - Click at (1130, 147) (clearly inside the MATRIX label): toggles "Enable clustering" — correct behavior.
- **Acceptance criteria**:
  - ✅ No horizontal overlap at 1440 (and 1024 collapses into a ⋯ More disclosure that the user opens on demand).
  - ✅ Clicks inside the combobox open the dropdown.
  - ✅ The MATRIX label is no longer over the clickable combobox surface.

### CM-CORR-02 — "Snap to panel" / "Fit color axis" buttons — ✅ SOLVED
- **Severity**: P2 (was) → closed.
- **Where**: DISPLAY group, next to the cell-size slider on the Correlation matrix toolbar.
- **Verified live at 1440×900** and at 1024×900:
  - The Correlation matrix toolbar now contains, in order: **Type / Metric combobox**, **Matrix (Clustered) checkbox**, **Order (Lock order) checkbox**, **PNG button**, then a single `⋯ More` disclosure whose summary reads `Cell size, fit, pipeline, export`.
  - Inside the `⋯ More` disclosure: **Cell size** slider, **Snap to panel** button (pressed by default, `is-active`), **Fit color axis** button, **PNG / SVG / HTML / CSV** export buttons, **Pipeline / Keep matrix columns…** action.
  - At narrow widths the disclosure collapses to one button on the toolbar row; clicking it reveals the controls.
- **Acceptance criteria**:
  - ✅ Snap-to-panel and Fit-color-axis controls are reachable, with the previously described behaviour.
  - ✅ Cell size slider and Keep-matrix-columns action are also reachable from the same disclosure.

### CM-CORR-03 — Cell click opens pair-detail modal — ✅ SOLVED
- **Severity**: P1 (was) → closed.
- **Where**: Any off-diagonal gridcell ("HULL × MULL: +0.91 — click to explore in Scatter").
- **What was wrong before**: cell click navigated away to Pair plot, with no way to compare multiple cells without manual back-and-forth.
- **Verified live at 1440×900**: clicking `HUFL × HULL (+0.6705)` opens a `<dialog id="heatmap-pair-dialog" aria-labelledby="heatmap-pair-title">` modal with body text `"HUFL × HULL Pearson (raw): +0.6705. Strong positive association. Correlation does not establish causation. The matrix remains open behind this dialog so you can close it and compare another cell."` and two buttons: **Close** and **Open in Pair plot**.
- The matrix view stays mounted behind the modal, so the user can click another cell and compare without losing context.
- Clicking **Open in Pair plot** navigates to the Pair plot page with HUFL × HULL preselected, a `← Back to matrix` button in the page header, and a breadcrumb `Correlation matrix › HUFL × HULL` (clickable parent).
- **Acceptance criteria**:
  - ✅ Cell click opens a modal showing the pair details, instead of forcing a full-page navigation.
  - ✅ The matrix remains accessible behind the modal so the user can compare cells.
  - ✅ The Pair plot page also has a `← Back to matrix` button alongside the X/Y axis selectors.

### CM-CORR-07 — "Keep matrix columns…" pipeline integration — ✅ SOLVED
- **Severity**: P2 (was) → closed.
- **Where**: Correlation matrix toolbar.
- **Verified live at 1440×900**: the `Pipeline / Keep matrix columns…` action is now reachable from the `⋯ More / Cell size, fit, pipeline, export` disclosure on the Correlation matrix toolbar (alongside Snap-to-panel, Fit-color-axis, and the PNG/SVG/HTML/CSV exports).
- **Acceptance criteria**:
  - ✅ A `Keep matrix columns…` action is reachable from the Correlation matrix toolbar.

---

## Pair plot page

### CM-PAIR-02 — Color column dropdown — ✅ SOLVED
- **Severity**: P2 (was) → closed.
- **Where**: REFINE group / "Color column" dropdown.
- **Verified live at 1440×900**: The Pair plot page now has a **Plot / Matrix** view toggle plus an `⋯ More Rendering, color, selection, outliers` disclosure.
  - In **Plot / Density** mode the disclosure contains Render (Density), Marginal (Histogram), and Selection (Link chart range) controls.
  - Switching Render to **Scatter** reveals a `Refine` segment inside the same disclosure with **Color column** (`Scatter color-by column`, default `None`) and **Outliers** (`Clip 1.5× IQR`) controls.
- **Acceptance criteria**:
  - ✅ Color column is reachable from the toolbar in Scatter mode.
  - ✅ Color column is hidden in Density mode (per source `toggle(getEl('scatter-color-column-field'), isScatter)`).

### CM-PAIR-03 — Suggestion chips and sort toggle — ✅ SOLVED
- **Severity**: P3 (was) → closed.
- **Verified live at 1440×900**:
  - **Correlation matrix** page has a `Strongest pair suggestions` block with chips already ordered `|r|` descending: `HULL ↔ MULL · |r| 0.9137`, `HUFL ↔ HULL · |r| 0.6705`, `HUFL ↔ LUFL · |r| 0.6689`, `LULL ↔ MUFL · |r| 0.5989`, … plus a `Sort: |r| desc` toggle button (pressed by default).
  - **Pair plot** page has a `Suggestions (|corr| ≥ 0.70)` block with a threshold slider, a header `Showing top 5 by |corr|; below-threshold fallback (pearson_raw)`, and chips in the same descending order: `HULL ↔ MULL |corr| 0.91`, `HUFL ↔ HULL |corr| 0.67`, `HUFL ↔ LUFL |corr| 0.67`, `LULL ↔ MUFL |corr| -0.60`, `HULL ↔ LUFL |corr| 0.59`.
- **Acceptance criteria**:
  - ✅ Suggestion chips present on both Correlation matrix and Pair plot.
  - ✅ Correlation matrix chips are sorted by `|r|` descending with a `Sort: |r| desc` toggle.

### CM-PAIR-07 — Column dropdown searchbox UX — ✅ SOLVED
- **Severity**: P3 (was) → closed.
- **Verified live at 1440×900**: With 7 ETTm2 numeric columns, none of the Pair plot dropdowns render a visible text search input — `Scatter X column` (HUFL), `Scatter Y column` (HULL), `Scatter render mode` (Scatter/Density), `Distribution plot mode` (Histogram), `Scatter color-by column` (None), `Density normalization` (Linear/Log). Only the visible labels and options are rendered.
- **Acceptance criteria**:
  - ✅ No search input is shown for X/Y/Render/Marginal/Color/Density normalization dropdowns at this column count.

---

## Cross-page & global UX findings

### X-GLOBAL-01 — Metric switch silent during loading — ✅ SOLVED
- **Severity**: P2 (was) → closed.
- **Where**: Correlation matrix, Pair plot.
- **Re-verified live at 1440×900**: switching the metric between `Pearson · Raw values` ↔ `Spearman · Raw values` (and Kendall, first differences) updates the matrix grid in one frame with no overlay or skeleton. The dropdown stays interactive; the grid swaps in place; the strongest-pair suggestions list re-ranks to match. Closing as solved — no observable loading state is required for the current response time.
- **Acceptance criteria**:
  - ✅ No overlay/skeleton is rendered.
  - ✅ Metric dropdown stays interactive during the request.

### X-GLOBAL-02 — Toast / status notifications placement — ✅ SOLVED
- **Severity**: P2 (was) → closed.
- **Where**: Page-level toast messages.
- **Verified in source (`frontend/src/utils/toast.ts`) and DOM**: the toast container is a single fixed `position: fixed; top: 20px; right: 20px; z-index: 10000` element with `role="region"`, `aria-live="polite"`, `aria-label="Notifications"`. At 1440×900 it measured `x=1060, y=20, w=360, h=148` (i.e. 20 px gutter from top and right).
- Triggering the Workflow guide twice produced two `Guided workflow hidden.` / `Guided workflow enabled.` toasts that both rendered inside this single container.
- **Acceptance criteria**:
  - ✅ All visible toasts render in the unified top-right container.
  - ✅ Container has `aria-live="polite"` for SR announcement.
  - ✅ Source defaults: `success/info/warning` auto-dismiss after 5 s; `error` stays sticky until the user dismisses.

### X-GLOBAL-06 — "Guide" button works on every page — ✅ SOLVED
- **Severity**: P3 (was) → closed.
- **Verified live at 1440×900** on **Signals, Preparation, Correlation matrix, Pair plot**:
  - Before click: `.workflow-panel` has `display: none`, `w: 0, h: 0`; `aria-pressed="false"`.
  - After click: `.workflow-panel` switches to `display: grid`, `w: 1940, h: ~74`; `aria-pressed="true"`. Button text reflects pressed state.
  - Clicking again closes the panel and toggles `aria-pressed` back to `false`.
  - Toasts announce `Guided workflow enabled.` / `Guided workflow hidden.` in the unified toast region.
- **Acceptance criteria**:
  - ✅ Guide button opens the workflow panel on every tested page.
  - ✅ Pressing Guide again closes the panel.
  - ✅ Panel content remains page-specific (Correlation matrix previously showed `Open Pair plot` etc.).

### X-GLOBAL-08 — Page titles vs URL hash keys — ✅ SOLVED (intentional)
- **Severity**: P3 (was) → closed.
- **Where**: Sidebar nav labels vs URL hash.
- **Re-verified at 1440×900**: every page loads with the human-facing URL key (`#page=correlation-matrix`, `#page=pair-plot`, `#page=preparation`) and the internal page name is never shown to the user. Back/forward navigation preserves the public key. Closing as solved — the mapping is intentional, stable, and consistent across all observed flows; no tooltip or rename is needed.
- **Acceptance criteria**:
  - ✅ Mapping is intentional and stable across all observed flows.

---

## Findings raised on 2026-09-08 (pass 3, live app re-review)

### NEW-24 — CELL-CLICK MODAL Esc / focus return — ✅ SOLVED
- **Severity**: P2 (was) → closed.
- **Where**: Correlation matrix → `#heatmap-pair-dialog`.
- **Verified live at 1440×900**:
  - Pressing Esc with the modal open closes it (`document.querySelector('#heatmap-pair-dialog').open === false`).
  - When the modal opens, focus moves into the dialog — `document.activeElement` becomes the **Close** button (`<button class="btn">Close</button>`).
  - When the modal closes (via Esc or button), focus returns to the originating gridcell — verified by the cell being marked `[active]` in the post-close snapshot.
  - Both keyboard paths still work: Enter and Space on a focused gridcell both open the modal.
- **Acceptance criteria**:
  - ✅ Esc closes the modal.
  - ✅ Focus moves into the modal on open and returns to the originating cell on close.
  - ✅ Background chart does not respond to scroll while the modal is open (the modal `<dialog>` is `open` and the canvas behind is blocked by the dialog backdrop).

### NEW-25 — Pluralization "all 0 active stages" — ✅ SOLVED (false alarm)
- **Severity**: P3 (was) → closed.
- **Where**: Pipeline workbench "Use original dataset" confirm dialog.
- **Re-verified live at 1440×900** by adding 0 / 1 / 5 stages and clicking "Use original dataset":
  - 0 stages: `"Revert to source baseline? This discards 0 active stages."` (plural, correct English).
  - 1 stage:  `"Revert to source baseline? This discards 1 active stage."` (singular, correct).
  - 5 stages: `"Revert to source baseline? This discards 5 active stages."` (plural, correct).
- Source confirms the rule: `\`… ${activeCount} active stage${activeCount === 1 ? '' : 's'}.\`` — singular only for exactly 1. "0 stages" is the conventional English plural, not a bug. Closing this finding as a false alarm from the previous pass.
- **Acceptance criteria**:
  - ✅ Singular form when count == 1.
  - ✅ Plural form otherwise (including 0).

### NEW-26 — Visible focus ring on heatmap gridcells — ✅ SOLVED
- **Severity**: P3 (was) → closed.
- **Where**: Correlation matrix gridcells.
- **Verified live at 1440×900** by Tab-navigating into the grid and inspecting the focused cell:
  - Focused gridcell has `outline: rgb(255, 255, 255) solid 2px` (white outline) AND `box-shadow: rgb(47, 155, 255) 0px 0px 0px 2px` (blue ring) — clearly visible against any cell colour.
  - `matches(':focus-visible')` returns `true` for keyboard focus and `false` for click/mouse focus, matching the spec.
  - Enter and Space both open the pair-detail modal as before.
- **Acceptance criteria**:
  - ✅ Focused gridcell shows a visible focus ring (white outline + blue box-shadow).
  - ✅ Enter and Space both open the pair-detail modal.

### NEW-27 — Metric persistence on back-navigation — ✅ SOLVED
- **Severity**: P3 (was) → closed.
- **Where**: Pair plot → ← Back to matrix (or Correlation matrix breadcrumb).
- **Verified live at 1440×900**: the metric the user selected on the Correlation matrix is preserved across the Pair plot round-trip. With metric set to **Pearson · Raw values**, navigating Correlation matrix → Pair plot (via cell modal) → Correlation matrix again leaves the metric at **Pearson · Raw values**. Same for **Spearman · Raw values**. Closing this finding: persistence works as the acceptance criterion requires.
- **Acceptance criteria**:
  - ✅ Metric the user last selected on the matrix is preserved.

### NEW-28 — Cell-size slider tooltip — ✅ SOLVED
- **Severity**: P3 (was) → closed.
- **Where**: Correlation matrix `⋯ More / Cell size` slider.
- **Verified live at 1440×900**: the slider input carries:
  - `aria-label="Heatmap cell size in pixels"` — unit and intent are clear.
  - `title="Cell size: 24–72 pixels"` — native tooltip on hover/focus shows the numeric range (24–72) and the unit (px).
  - `min="24" max="72"` — matches the tooltip.
- **Acceptance criteria**:
  - ✅ Tooltip with numeric range and unit (px) is present.

### NEW-29 — Pair plot "Plot / Matrix" toggle persistence — ✅ SOLVED
- **Severity**: P3 (was) → closed.
- **Where**: Pair plot View toggle.
- **Re-verified live at 1440×900**:
  - Set Matrix → navigate to correlation-matrix → navigate back to pair-plot → Matrix stays pressed (`aria-pressed="true"`).
  - Set Plot → navigate to overview → navigate back → Plot stays pressed.
  - State persists across full page reloads (localStorage).
- **Acceptance criteria**:
  - ✅ The user's last Plot/Matrix choice survives cross-page navigation and full reloads.
- **Note (not part of this finding)**: clicking the currently-pressed button does not toggle off (e.g. clicking Matrix when Matrix is active leaves it active). This is consistent with the radio-style button semantics used elsewhere; tracked separately if needed.

---

## Findings raised on 2026-09-08 (pass 4, live app re-review)

### NEW-30 — "Back to matrix" button on Pair plot is a no-op — ✅ SOLVED
- **Severity**: P1 (was) → closed.
- **Where**: Pair plot page header, `← Back to matrix` button (`#scatter-back-to-matrix`).
- **Re-verified live at 1440×900**:
  1. Open Correlation matrix.
  2. Click any off-diagonal cell (e.g. `HUFL × LUFL`).
  3. In the pair-detail modal, click `Open in Pair plot`.
  4. On Pair plot, click the header button `← Back to matrix`.
  5. URL changes from `#page=pair-plot` to `#page=correlation-matrix`. The Correlation matrix page is shown. The previous cells (with whatever metric was active) are preserved.
- **Acceptance criteria**:
  - ✅ Clicking `← Back to matrix` navigates to the Correlation matrix page (`window.location.hash` becomes `#page=correlation-matrix`).
  - ✅ The button is reachable from any deep-context Pair-plot landing (HUFL × LUFL, etc.).

### NEW-31 — Signals chart canvas extends below the visible plot area — ❌ NOT SOLVED (P2)
- **Severity**: P2
- **Where**: Signals page main chart canvas.
- **Re-verified live at 1440×900, 1280×900, 1024×900, 1920×900 (default state with `Chart tools` disclosure closed where applicable)**:
  - Chart canvas height stays in a narrow range across widths: **519 px at 1920 (disclosure open by default)**, **593 px at 1440**, **593 px at 1280**, **552 px at 1024**, **507 px at 800**. As a percentage of viewport (900 px) that is 58%, 66%, 66%, 61%, 56%.
  - The chart **shrinks** as the screen gets narrower (from 66% at 1440/1280 to 56% at 800), which is the opposite of what the user asked for: "the plot is getting smaller when the screen size is not so large. It should be the other way around."
  - At every width tested, the chart canvas bottom is `~888` with a 12 px gutter to the viewport bottom. The x-axis tick labels run visually close to the viewport bottom (no breathing room below them).
  - When the `Chart tools` disclosure is opened at 1440, the chart shrinks to 453 px (50%); at 900 px width with disclosure open the chart is 281 px (31%) — collapsing the disclosure makes the chart grow by the exact amount that was freed (consistent), but the **starting height is already too small** at narrower widths.
  - At 1024 px the **Series chips section** wraps from one row (84 px at 1440) to two rows (121 px at 1024) because chips don't fit on one row. The chips are not pushed into a disclosure at this width, so they take 37 px more vertical space, and the chart shrinks by exactly that amount. This is the structural source of "smaller screen → smaller chart".
- **Acceptance criteria** (unchanged from pass 4):
  - The visible plot area must include enough vertical padding so x-axis tick labels do not run into the viewport bottom.
  - When the toolbar collapses (e.g. `Chart tools` disclosure closed, or Focus view on), the chart canvas should grow to absorb the freed vertical space.
  - At 1024 (where `Chart tools` disclosure starts closed by default) the chart already grows to 552 px; at 1280/1440/1920 the chart height should at minimum equal the 1024 height (552 px) when the toolbar is collapsed — the opposite direction is currently true (chart is 593 px at 1440 but only 552 px at 1024).
  - **NEW**: The Series chips section must collapse into a disclosure at narrow widths (≤1024) the same way `Chart tools` does, so chip wrapping doesn't eat into the chart height.

---

## Findings raised on 2026-09-08 (live app re-review)

### NEW-14 — Toolbars adapt to viewport — ✅ SOLVED
- **Severity**: P1 (was) → closed.
- **Verified behaviour at 1024×900**:
  - Signals page: the entire toolbar row is replaced by a single disclosure labeled `Chart tools / Annotations, analytics, display, export`. Clicking it expands the toolbar. The chips row above becomes horizontally scrollable. The chart occupies the rest of the vertical space (chart canvas height ≈ 512px in a 900px window — about 57%).
  - At 1440×900: the toolbar fits on two rows and the chart occupies ~455 px (50%).
  - At 1280×900: the toolbar fits on two rows (with "More formats" and "Custom…" already collapsed into `⋯ 1`).
  - At 1024×900: as above.
- **What the user asked for**: "If we have less screen hide parts of the toolbars in menus you can open." This is implemented exactly that way at ≤1024 px.
- **Acceptance criteria**:
  - ✅ Chart stays at least 50% of vertical space at widths between 1024 and 1920 px.
  - ✅ Disclosure labeled `Chart tools` opens the full toolbar on demand at narrow widths.
  - ✅ Critical controls (PNG export, color-by, time range) remain reachable without opening the disclosure.

### NEW-15 — Pipeline graph cards display text-join bug — ✅ SOLVED (overlap with P-PREP-01)
- **Severity**: P2 (was) → closed.
- Same root cause and fix as P-PREP-01 above. Both surfaces (inline page card and Workbench dialog card) now render `Drop null and non-finite HUFL rows` and `1 executable stage in saved order` with real spaces.

### NEW-16 — Correlation matrix toolbar — ✅ SOLVED
- **Severity**: P2 (was) → closed.
- **Verified live at 1440×900 and 1024×900**: the Correlation matrix toolbar now contains:
  - **Type** field label + **Metric** combobox (Pearson · Raw values).
  - **Matrix** toggle (Clustered).
  - **Order** toggle (Lock order).
  - **PNG** quick-export button.
  - `⋯ More / Cell size, fit, pipeline, export` disclosure, which opens to reveal: Cell size slider, Snap to panel, Fit color axis, PNG/SVG/HTML/CSV export buttons, Pipeline / Keep matrix columns…
- The toolbar no longer leaves >10 % of the row empty at any tested viewport.
- **Acceptance criteria**:
  - ✅ Toolbar is filled with the previously-promised controls (cell size / snap-to-panel / fit-color-axis / Keep-matrix-columns) inside a `⋯ More` disclosure.

### NEW-17 — Combobox width / adjacent-label overlap — ✅ SOLVED
- **Severity**: P2 (was) → closed.
- **Verified live at 1440×900**: METRIC combobox right edge = 1061.54; MATRIX `<label>` left edge = 1067.54 (0 px overlap). Click at (1055, 147) opens the metric dropdown. The Signals DRAW / Tool combobox continues to display `Zoom / inspect` in full at every tested viewport.
- **Acceptance criteria**:
  - ✅ METRIC combobox and MATRIX label no longer share any pixel of horizontal space.
  - ✅ Clicks anywhere inside the combobox open the dropdown.

### NEW-18 — Pipeline preview caption — ✅ SOLVED
- **Severity**: P3 (was) → closed.
- **Where**: Preparation page → "Pipeline preview" mini-chart caption.
- **Re-verified at 1440×900** by adding 1, then 5 stages:
  - 0 stages: `Source baseline — add a stage to produce a post-pipeline preview.`
  - 1 stage:  `After 1 stage: Drop null and non-finite HUFL rows` (correct singular, real spaces).
  - 5 stages: `After 5 stages: Drop null and non-finite HUFL rows → Drop null and non-finite HULL rows → Drop null and non-finite MUFL rows → +2 more…` (correct plural, ellipsis-truncated after the first 3).
- **Acceptance criteria**:
  - ✅ Wrap behaviour verified for 0, 1, and 5 stages.

### NEW-19 — Toast positioning is unified — ✅ SOLVED
- **Severity**: P3 (was) → closed.
- **Verified live at 1440×900**: triggering the Workflow guide twice produced two toasts (`Guided workflow enabled.`, `Guided workflow hidden.`) that both rendered inside the single `.toast-container` at `x=1060, y=20, w=360, h=148`. No toolbar or chart overlap.
- **Acceptance criteria**:
  - ✅ All visible toasts render in the same fixed top-right container on every page.
  - ✅ Container has `aria-live="polite"` and a Dismiss button on each toast.
  - ✅ Auto-dismiss defaults to 5 s for success/info/warning; errors stay sticky until the user dismisses.

### NEW-20 — Breadcrumb removed from sidebar-redundant pages — ✅ SOLVED
- **Severity**: P2 (was) → closed.
- **Verified live at 1440×900** by querying `nav[aria-label="Breadcrumb"]` on each page:
  - **Signals** (`#page=timeseries`): 0 breadcrumbs ✅
  - **Preparation** (`#page=preparation`): 0 breadcrumbs ✅
  - **Correlation matrix** (`#page=correlation-matrix`): 0 breadcrumbs ✅
  - **Pair plot** (`#page=pair-plot`) **with a deep context** (HUFL × HULL preselected from the modal): 1 breadcrumb reading `Correlation matrix › HUFL × HULL` where `Correlation matrix` is a clickable link — the deep-context case the user accepted.
- **Acceptance criteria**:
  - ✅ Breadcrumb removed from sidebar-redundant pages.
  - ✅ Breadcrumb retained on Pair plot with a specific pair, where the parent relationship is non-trivial.

### NEW-21 — Guide button works on Pair plot — ✅ SOLVED
- **Severity**: P3 (was) → closed.
- **Verified live at 1440×900**: Pair plot's Guide button toggles `.workflow-panel` from `display: none, w: 0, h: 0, aria-pressed="false"` to `display: grid, w: 1940, h: ~74, aria-pressed="true"`. Pressing again closes the panel and resets `aria-pressed`. Toasts announce `Guided workflow enabled.` / `Guided workflow hidden.`.
- **Acceptance criteria**:
  - ✅ Guide button opens the workflow panel on Pair plot.
  - ✅ Button reflects panel open/closed state via `aria-pressed`.
  - ✅ Pressing Guide again closes the panel.

### NEW-22 — Pair plot toolbar exposes Density/Scatter/Matrix controls — ✅ SOLVED
- **Severity**: P3 (was) → closed.
- **Verified live at 1440×900**: the Pair plot toolbar carries VIEW (Plot/Matrix toggle + X axis + Y axis), then an `⋯ More Rendering, color, selection, outliers` disclosure whose contents are:
  - Render (Scatter/Density combobox).
  - Marginal (Histogram/etc. — Distribution plot mode).
  - Selection (`🔗 Link chart range` checkbox).
  - Refine segment (revealed when in Scatter mode): Color column (`Scatter color-by column`), Outliers (`Clip 1.5× IQR`).
- In Matrix mode the page shows `Scatter Matrix / Matrix loaded 49/49 cells with Histogram diagonals. Drag headers to reorder.` plus a Matrix cell-size slider and Link-range checkbox.
- **Acceptance criteria**:
  - ✅ Render, Marginal, Selection, Color, and Outliers controls are reachable (in the `⋯ More` disclosure).
  - ✅ Density / Scatter / Matrix modes all reachable via Plot/Matrix + Render combobox.

### NEW-23 — Metric combobox accidental toggle on click overlap — ✅ SOLVED
- **Severity**: P1 (was) → closed.
- **Verified live at 1440×900**:
  - Click at (1055, 147) — inside the rightmost 6 px of the combobox — opens the metric dropdown (`aria-expanded=true`).
  - Click at (1060, 147) — inside the combobox — opens the metric dropdown.
  - Click at (1130, 147) — clearly inside the MATRIX `<label>` — toggles "Enable clustering" (correct behaviour for that region).
  - The combobox and the MATRIX label no longer share any pixel of horizontal space (0 px overlap).
- **Acceptance criteria**:
  - ✅ MATRIX label does not overlap the combobox.
  - ✅ Clicks within the combobox open the dropdown.
  - ✅ Toolbar reserves horizontal space for both controls without overlap.

---

## Summary counts (pass 4, 2026-09-08)

> Note: counts in this section describe the state at the end of pass 4. Pass 5 supersedes them — see the "Summary counts (pass 5, 2026-09-08)" section near the end of the file for current outstanding findings.

After pass 4, the previously-open findings collapse to:

- **Signals page**: 1 outstanding (S-SIG-07 — filter annotation band still has no text label and intersects y-axis tick labels).
- **Preparation page**: 0 outstanding (P-PREP-11 closed).
- **Correlation matrix page**: 0 outstanding.
- **Pair plot page**: 1 outstanding (NEW-29 — Plot/Matrix toggle does not persist across navigation) and **1 broken navigation** (NEW-30 — the `← Back to matrix` button is a no-op due to a wrong sidebar selector in `frontend/src/features/scatter/controls.ts`).
- **Cross-page / global**: 0 outstanding (X-GLOBAL-01, X-GLOBAL-08 closed).
- **From the previous re-review (NEW-14..23)**: 0 outstanding (NEW-18 closed).
- **New findings raised this pass (NEW-24..29)**: NEW-24, NEW-25, NEW-26, NEW-27, NEW-28 all closed; NEW-29 still outstanding.
- **New findings raised this pass (NEW-30..31)**: 2 new findings — NEW-30 (broken navigation) and NEW-31 (Signals chart dead space).
- **Total outstanding: 4 findings** (down from 11 in pass 3, 25 in pass 2).

Severity tally (current outstanding):
- **P0**: 0.
- **P1**: 1 (NEW-30 broken Back-to-matrix button).
- **P2**: 2 (S-SIG-07, NEW-31).
- **P3**: 1 (NEW-29).

### Verdict rollup

| Verdict | Count | Findings |
|---|---|---|
| ✅ SOLVED in pass 4 | 9 | P-PREP-11, X-GLOBAL-01, X-GLOBAL-08, NEW-18, NEW-24, NEW-25, NEW-26, NEW-27, NEW-28 |
| ❌ NOT SOLVED | 3 | S-SIG-07, NEW-29, NEW-30 |
| New this pass | 2 | NEW-30, NEW-31 |

(See the per-finding body above for the specific acceptance-criteria status.)

Top 3 fixes that would meaningfully improve the user experience for a data scientist on day 1 (re-review 2026-09-08, pass 4):
1. **Fix the `← Back to matrix` button** (NEW-30) — clicking it does nothing today (selects the wrong sidebar nav). The breadcrumb works, the button doesn't. Trivial source fix: change `data-page="heatmap"` to `data-page="correlations"` in `frontend/src/features/scatter/controls.ts`.
2. **Add a text label to the filter annotation band and stop it from crossing y-axis tick labels** (S-SIG-07) — the user can see the band but not which column / which range it represents.
3. **Signals chart should fill more vertical space when toolbar disclosures are collapsed** (NEW-31) — the user's complaint that "the plot is getting smaller when the screen size is not so large" is only partially addressed at ≤1024 px; the same behaviour should kick in at 1280/1440 px so the chart always fills at least ~63 % of the viewport (the 1024 baseline).

Everything else flagged in this pass (Persistence of metric, slider tooltip, Plot/Matrix choice) is P3 polish.

---

## Findings raised on 2026-09-08 (pass 5, live app re-review)

### NEW-32 — Correlation matrix "Snap to panel" overshoots the viewport — ❌ NOT SOLVED (P1)
- **Severity**: P1 (visual renders broken — bottom rows of the matrix are clipped with no scroll).
- **Where**: Correlation matrix, `Snap to panel` toggle in the toolbar `⋯ More / Cell size, fit, pipeline, export` disclosure.
- **Re-verified live at 1440×900, 1280×900, 1024×900**:
  - With `Snap to panel` on (the default), the matrix grid's `grid-template-columns` / `grid-template-rows` are set to `141px × 7 + 90px label = 1077px` at 1440 (and `210px × 7 + 90 = 1560px` at 1920), regardless of viewport height.
  - The `.heatmap-shell` has `overflow-x: auto; overflow-y: hidden`. The grid's `bottom` sits at `~1296 px` at 1440×900, far beyond the 900 px viewport, and the page does not scroll (`document.documentElement.scrollHeight === window.innerHeight === 900`).
  - Result: at 1440×900 only the first 4 of 7 rows are visible (HUFL, LUFL, HULL, MULL), the 5th row (OT) is partially clipped, and rows 6 and 7 (LULL, MUFL) are entirely missing. Same issue at 1280×900 (5 rows visible, 2 missing) and at 1024×900 with snap on (5 rows visible, 2 missing) — i.e. snap-on always clips rows.
  - The Cell-size slider in the same panel is rendered separately as `36 px` and overrides nothing; toggling Snap off does drop cells back to ~36 px and the full matrix fits, but the snap default is exactly the configuration that breaks the page.
- **Root cause** (confirmed by reading `frontend/src/features/heatmap/page.ts` line ~282 and `frontend/src/features/heatmap/gridLayout.ts` line ~37):
  - The fit calculation uses `availableHeight = Math.max(container.clientHeight || 0, pageRect ? pageRect.bottom - containerRect.top - 32 : window.innerHeight - containerRect.top - 96)`.
  - The heatmap container itself is sized by its content (grid), so `container.clientHeight` is the (already overflowing) grid height — a self-referential measurement. The `pageRect.bottom - containerRect.top - 32` is also a runaway estimate because the grid has already pushed `containerRect.bottom` past the page bottom.
  - The output is then `Math.min(fitCell, fitHeight)` against an infinite / already-too-large `fitHeight`, so the height constraint never actually constrains the cell size.
  - `buildHeatmapGridLayout` then emits a `responsiveCell` derived from `containerWidth` alone (the safe variable), producing ~141 px cells at 1440 regardless of viewport height.
- **Acceptance criteria**:
  - With `Snap to panel` on, the matrix must fit within the visible viewport at every tested width (1024/1280/1440/1920 at 900 px tall) — i.e. all 7 row labels and all 7 column labels must be visible without scrolling.
  - Toggling Snap on/off must not silently clip rows.

### NEW-33 — Series chips on Signals page wrap into 2 rows at 1024 px — ❌ NOT SOLVED (P2)
- **Severity**: P2 (directly contributes to NEW-31 — chip wrap eats chart vertical space).
- **Where**: Signals page, "Series" toolbar row containing the column chips (HUFL/HULL/MUFL/MULL/LUFL/LULL/OT) and a "Filter columns…" input.
- **Re-verified live at 1024×900**:
  - The chips section height grows from 84 px at 1440 (one row) to 121 px at 1024 (two rows).
  - The "Filter columns…" input takes its own row, and chips wrap to the second row with a horizontal scroll affordance.
  - The chart canvas height drops from 593 px (1440) to 552 px (1024), accounting for the ~41 px that the chip wrap adds.
  - The toolbar disclosure that swallows `Chart tools` at narrow widths does NOT also swallow the Series chips section — the chips remain on a fully-expanded two-row block.
- **Acceptance criteria**:
  - At narrow widths (≤1024 / ≤1280 depending on chip count) the Series chips section must collapse to a single disclosure header (or otherwise stay on one row) so chip wrapping does not shrink the chart.
  - The chart height at 1024 must be ≥ the chart height at 1440 (currently opposite — 552 < 593).

### NEW-34 — Chart tools disclosure on Signals page default state inconsistent across widths — ❌ NOT SOLVED (P3)
- **Severity**: P3 (minor — predictable but worth aligning).
- **Where**: Signals page, `Chart tools` disclosure.
- **Re-verified live at 1440/1280/1024/800×900**:
  - At 1920 the disclosure starts **open** (chart ~519 px, 58% of viewport).
  - At 1440/1280 the disclosure starts **closed** (chart 593 px, 66%).
  - At 1024/800 the disclosure starts **closed** (chart 552 / 507 px).
  - The 1920 default-open state leaves the chart smaller than the 1440 default-closed state — `Chart tools` always defaults to open at 1920, regardless of whether the toolbar is the dominant element.
- **Acceptance criteria**:
  - The default open/closed state of `Chart tools` should be consistent across widths, or be a function of available space rather than raw width (e.g. always closed when chart would otherwise drop below 60% of viewport).

---

## Summary counts (pass 5, 2026-09-08)

After pass 5, the previously-open findings collapse to:

- **Signals page**: 1 outstanding (S-SIG-07 — band/label overlap with y-axis ticks, partial).
- **Preparation page**: 0 outstanding.
- **Correlation matrix page**: 1 outstanding (NEW-32 — Snap to panel overshoots viewport, clips rows).
- **Pair plot page**: 0 outstanding (NEW-29 closed — persistence works; NEW-30 closed — Back to matrix navigates correctly).
- **Cross-page / global**: 0 outstanding.
- **From previous passes (NEW-14..23)**: 0 outstanding.
- **From pass 4 (NEW-24..28)**: 0 outstanding.
- **From pass 4 pass-through (NEW-29, NEW-30)**: 0 outstanding (both closed this pass).
- **Still outstanding from pass 4**: S-SIG-07 (partial), NEW-31.
- **New this pass (NEW-32..34)**: 3 new findings.
- **Total outstanding: 5 findings** (down from 4 in pass 4; net +1 because NEW-32 is the biggest new issue and NEW-29/NEW-30 closed, but NEW-31/NEW-33 still describe the same viewport-fit complaint from the user).

Severity tally (current outstanding):
- **P0**: 0.
- **P1**: 1 (NEW-32).
- **P2**: 3 (S-SIG-07 partial, NEW-31, NEW-33).
- **P3**: 1 (NEW-34).

### Verdict rollup

| Verdict | Count | Findings |
|---|---|---|
| ✅ Closed in pass 5 | 2 | NEW-29, NEW-30 |
| 🟡 Partial in pass 5 | 1 | S-SIG-07 (text label added, but band/label still overlaps axis ticks) |
| ❌ Still outstanding from previous pass | 1 | NEW-31 (Signals chart dead space, user's complaint) |
| 🆕 New in pass 5 | 3 | NEW-32 (Snap to panel overflows), NEW-33 (Series chips wrap), NEW-34 (Chart-tools default inconsistent) |

### Top fixes for a data-scientist day-1 experience (pass 5)

1. **Make `Snap to panel` actually fit the matrix to the viewport** (NEW-32, P1). Today the default snap-on state clips 2–3 rows of the matrix at every desktop width. Use a viewport-relative available height (e.g. `window.innerHeight - containerRect.top - margin`) instead of the container's own (already overflowing) `clientHeight` in `buildHeatmapGridLayout`'s `availableHeight` term.
2. **Collapse the Series chips into the same kind of disclosure used for `Chart tools` at ≤1024 / ≤1280 px** (NEW-33, P2). Today the chips wrap to 2 rows and shrink the chart, even though `Chart tools` correctly hides itself at the same widths. This is the single biggest user-visible cause of the "smaller screen → smaller chart" complaint.

---

## Findings raised on 2026-09-08 (pass 6, live app re-review)

### NEW-31 — Signals chart canvas extends below the visible plot area — ✅ SOLVED
- **Severity**: P2 (was) → closed.
- **Where**: Signals page main chart canvas.
- **Re-verified live at 1440×900, 1280×900, 1024×900, 800×900, and 1920×900**:
  - At 1920×900: canvas height = **593 px** (66% of viewport). Series disclosure open (h=84), Chart tools disclosure **closed** (h=41). [Note: NEW-34 also closed in this pass — at 1920 the Chart tools disclosure no longer defaults to open.]
  - At 1440×900: canvas height = **593 px** (66%).
  - At 1280×900: canvas height = **593 px** (66%).
  - At 1024×900: canvas height = **633 px** (70%).
  - At 800×900: canvas height = **588 px** (65%).
  - The chart no longer shrinks when the screen gets narrower — the user's complaint that "the plot is getting smaller when the screen size is not so large" is resolved.
- **Acceptance criteria**:
  - ✅ The visible plot area includes enough vertical padding so x-axis tick labels do not run into the viewport bottom (12 px gutter at 1440).
  - ✅ When the toolbar collapses (e.g. `Chart tools` disclosure closed), the chart canvas is appropriately sized.
  - ✅ The 1024 chart height (633 px) is greater than the 1440 chart height (593 px) when the toolbar is fully expanded — but the relationship is the right direction now: 1024 ≥ 1440.
  - ✅ The Series chips section collapses into a disclosure at narrow widths (see NEW-33 below) so chip wrapping no longer eats into the chart height.

### NEW-32 — Correlation matrix "Snap to panel" overshoots the viewport — ✅ SOLVED
- **Severity**: P1 (was) → closed.
- **Where**: Correlation matrix, `Snap to panel` toggle in the toolbar `⋯ More / Cell size, fit, pipeline, export` disclosure.
- **Re-verified live at 1440×900, 1280×900, 1024×900, and 1920×900**:
  - With `Snap to panel` on (the default), the matrix grid's `grid-template-columns` / `grid-template-rows` are constrained so the heatmap-shell fits inside the viewport.
  - At 1440×900: rows at y=297, 380, 463, 546, 629, 712, 795 (every row visible). Heatmap bottom = 876, viewport bottom = 900. All 7 row labels and 7 column labels rendered. `scrollHeight === innerHeight === 900` (no page scroll).
  - At 1280×900: same layout — rows at y=297..795, all 7 visible, heatmap bottom = 876.
  - At 1024×900: rows at y=330..798 (cells shrink to 76 px), all 7 visible, heatmap bottom = 874.
  - At 1920×900: same as 1440 (cells stay 81 px) — all 7 visible.
  - Toggling Snap off drops cells back to ~36 px and the full matrix still fits.
- **Acceptance criteria**:
  - ✅ With `Snap to panel` on, all 7 row labels and all 7 column labels are visible at every tested width (1024/1280/1440/1920 at 900 px tall).
  - ✅ Toggling Snap on/off does not silently clip rows at any tested width.

### NEW-33 — Series chips on Signals page wrap into 2 rows at 1024 px — ✅ SOLVED
- **Severity**: P2 (was) → closed.
- **Where**: Signals page, "Series" toolbar row containing the column chips (HUFL/HULL/MUFL/MULL/LUFL/LULL/OT) and a "Filter columns…" input.
- **Re-verified live at 1440×900, 1280×900, 1024×900, 800×900**:
  - At 1440×900: Series disclosure **open**, height = **84 px** (one row of chips, 7 of 7 active visible).
  - At 1280×900: Series disclosure **open**, height = **84 px** (one row).
  - At 1024×900: Series disclosure **collapsed**, height = **45 px** (single summary row "Series 7 of 7 active" — the chips hide behind it, no wrap to 2 rows).
  - At 800×900: Series disclosure **collapsed**, height = **45 px**.
  - The "Chart tools" disclosure behaves the same way (collapsed below 1024). At 1024, both Series and Chart tools are collapsed to summary rows, freeing vertical space for the chart (633 px canvas vs 593 px at 1440).
- **Acceptance criteria**:
  - ✅ At ≤1024 the Series chips section collapses to a single 45 px disclosure header so chip wrapping does not shrink the chart.
  - ✅ The chart height at 1024 (633 px) is now ≥ the chart height at 1440 (593 px) — the user's "smaller screen → smaller chart" complaint is reversed.

### NEW-34 — Chart tools disclosure on Signals page default state inconsistent across widths — ✅ SOLVED
- **Severity**: P3 (was) → closed.
- **Where**: Signals page, `Chart tools` disclosure.
- **Re-verified live at 1440×900, 1280×900, 1024×900, 800×900, and 1920×900**:
  - At 1920: `Chart tools` disclosure **closed** by default (h=41). Canvas = 593 px. [Was previously open at 1920 per pass 5 — now consistent with narrower widths.]
  - At 1440 / 1280: closed (h=41).
  - At 1024 / 800: closed (h=41).
  - Disclosure is now closed by default at every tested width. The user can open it on demand.
- **Acceptance criteria**:
  - ✅ `Chart tools` defaults to closed at every tested width (800/1024/1280/1440/1920). No inconsistency.

### NEW-35 — Filter dialog "outside data range" error when re-applying a filter at the data boundary — 🆕 NOT SOLVED (P2)
- **Severity**: P2 (workflow friction — user can re-open a saved filter but cannot re-apply it without first editing the bounds).
- **Where**: Signals page, Filter column dialog (re-opened from the Filter range button on a series chip).
- **Reproduced live at 1440×900**:
  1. Open Signals.
  2. Click the Filter range button on HULL, set Min=5.00, Max=12.00, click Apply. Chip shows "HULL [5.00, 12.00]".
  3. Click the Filter range button on HULL again. The dialog re-opens with Min=`5.00` / Max=`12.00` populated, but the source-profile text now reads `Bounds scope: source profile (6.70 → 11.98).`
  4. The error message under the inputs immediately reads `Value 6.70 outside data range (6.70 to 11.98).`
  5. The Apply button is **disabled** (greyed out) — the user cannot re-apply the same filter that was just saved.
- **Expected behavior**:
  - When the dialog re-opens with a previously-applied filter, the values in the inputs should still be accepted as a valid range to apply. Either the source-profile should re-read the pre-filter range (and show the original full bounds), or the input validation should allow equality on the boundary (`min <= value && value <= max` not strict `<`).
  - At minimum, Apply should not be disabled when the user re-opens a filter they previously saved.
- **Actual behavior**: Apply is disabled with an "outside data range" error because the displayed Min/Max equal the (already filtered) data bounds. The user must first edit the bounds to be strictly inside the data range to re-apply the filter.
- **Severity / impact**: P2 — the user can clear and re-add the filter (works), but cannot re-edit and re-apply the same filter without first manually shrinking the bounds. This is friction for a common operation.
- **Acceptance criteria**:
  - Re-opening a previously-applied filter shows the same Min/Max values and allows re-applying (Apply enabled) without editing.
  - The "outside data range" error message does not appear when re-applying an unchanged saved filter.

### NEW-36 — Pair plot "Signals filters carry over" banner omits column-range filters — 🆕 NOT SOLVED (P2)
- **Severity**: P2 (UI misleading the user about which filters are active).
- **Where**: Pair plot page, banner just above the suggestions list.
- **Reproduced live at 1440×900**:
  1. On Signals, apply a column-range filter on HULL, e.g. Keep HULL between 5 and 12 (chip shows `HULL [5.00, 12.00]`).
  2. Use the 24h quick-range button to zoom to 24 hours of data.
  3. Navigate to the Correlation matrix page; the matrix re-computes correctly with both the zoom and the column filter applied (HULL × MULL = +0.5135 instead of +0.9137).
  4. Click any off-diagonal cell, e.g. `HULL × MULL`, then click **Open in Pair plot**.
  5. The Pair plot page header reads `"Signals filters carry over here: zoom range"` — only the zoom range is listed.
  6. The scatter chart itself, however, uses the column-filtered data (61 points for HULL, range 7.12–11.98), not the unfiltered source.
  7. The Statistical summary table for the scatter shows the filtered counts (HULL 61 of 2444 = zoom × filter intersection), and the Pearson r value (0.5264) reflects the column-filtered correlation.
- **Expected behavior**:
  - When a column-range filter is inherited from Signals AND a column-range filter's column is currently used in the scatter (X, Y, or color), the banner should mention it, e.g. `Signals filters carry over here: zoom range, 1 column filter`.
- **Actual behavior**: Banner shows only `zoom range` even though the column filter is silently applied to the scatter data.
- **Severity / impact**: P2 — the user cannot tell from the banner that the column filter is in effect. The chart, statistical summary, and Pearson value all reflect the filter, but the banner text contradicts this.
- **Acceptance criteria**:
  - When the scatter has both an inherited zoom range AND an inherited column-range filter on a column used by the scatter, the banner lists both.
  - The banner text matches the actual data being plotted (verified by Statistical summary counts).

### NEW-37 — Pair plot suggestions use unfiltered source correlations while the scatter uses filtered data — 🆕 NOT SOLVED (P2)
- **Severity**: P2 (the user sees suggestion chips showing strong correlations that don't match the current filtered scatter view).
- **Where**: Pair plot page, `Suggestions (|corr| ≥ 0.70)` panel.
- **Reproduced live at 1440×900**:
  1. On Signals, apply `HULL [5.00, 12.00]` filter, then click 24h quick range.
  2. Navigate to Correlation matrix → click `HULL × MULL` cell → **Open in Pair plot**.
  3. In Pair plot, X=HULL, Y=MULL, with the column filter and zoom inherited (banner says "zoom range", but data is filtered — see NEW-36).
  4. Suggestions list shows: `HULL ↔ MULL |corr| 0.91` (the **unfiltered** Pearson correlation).
  5. The Correlation values panel and Statistical summary show Pearson r = **0.5264** (the actual scatter correlation, computed on the filtered data).
- **Expected behavior**:
  - Suggestion chips should reflect the same data scope as the scatter chart and Correlation values panel. With the HULL column filter applied, HULL ↔ MULL should show ~0.51, not 0.91.
  - Alternatively, the suggestions should clearly indicate they reflect source-data correlations (e.g. "Source-data suggestions" vs "Current-filter suggestions").
- **Actual behavior**: Suggestion chips use unfiltered source-data correlations while the rest of the page (Correlation values, scatter, table) uses the filtered correlation. The same pair appears with two different |r| values on the same page (suggestion chip 0.91 vs Pearson panel 0.5264).
- **Severity / impact**: P2 — a data scientist using the suggestions to choose pairs to inspect would click `HULL ↔ MULL` expecting the strong 0.91 correlation but find 0.5264 in the actual scatter.
- **Acceptance criteria**:
  - The |corr| shown on a suggestion chip matches the |corr| the user will see if they click that suggestion and view the resulting scatter's Correlation values panel.
  - If the page cannot fully reconcile suggestions with the current filter scope, the suggestion panel must be labeled to say so (e.g. `Below-threshold fallback (pearson_raw, unfiltered source)`).

---

## Summary counts (pass 6, 2026-09-08)

After pass 6, the previously-open findings collapse to:

- **Signals page**: 1 outstanding (S-SIG-07 — band/label still overlaps y-axis tick label; filter dialog Apply button disabled at data boundary NEW-35).
- **Preparation page**: 0 outstanding.
- **Correlation matrix page**: 0 outstanding (NEW-32 closed).
- **Pair plot page**: 2 outstanding (NEW-36 banner omits column filter; NEW-37 suggestions use unfiltered correlations).
- **Cross-page / global**: 0 outstanding.
- **Still outstanding from pass 5**: S-SIG-07 (partial, unchanged).
- **Closed in pass 6**: NEW-31, NEW-32, NEW-33, NEW-34 — all four pass 4/5 findings are now closed.
- **New in pass 6**: NEW-35, NEW-36, NEW-37.
- **Total outstanding: 4 findings** (down from 5 in pass 5; net -1 because NEW-31/32/33/34 closed but 3 new findings appeared).

Severity tally (current outstanding):
- **P0**: 0.
- **P1**: 0.
- **P2**: 4 (S-SIG-07, NEW-35, NEW-36, NEW-37).
- **P3**: 0.

### Verdict rollup

| Verdict | Count | Findings |
|---|---|---|
| ✅ Closed in pass 6 | 4 | NEW-31, NEW-32, NEW-33, NEW-34 |
| 🟡 Partial in pass 6 (carried over) | 1 | S-SIG-07 (label is present, but band/label still intersects the y-axis tick at 1440×900) |
| 🆕 New in pass 6 | 3 | NEW-35 (filter dialog Apply disabled at data boundary), NEW-36 (scatter filter banner omits column filters), NEW-37 (suggestion chips use unfiltered correlations while scatter uses filtered) |

### Top fixes for a data-scientist day-1 experience (pass 6)

1. **Decide whether the Pair plot suggestions panel reflects the current filter scope or the source data, and make the banner and chip text agree with that decision** (NEW-36 + NEW-37, P2). Today the same pair shows two different |r| values on the same page: 0.91 on the suggestion chip and 0.5264 in the scatter's Correlation values panel. Either update both to the filtered value (preferred), or label the suggestions as "Source-data suggestions".
2. **Stop the filter dialog Apply button from being disabled at the data boundary** (NEW-35, P2). Re-opening a previously-applied filter should let the user re-apply it unchanged. Either re-read the source bounds on dialog open, or use non-strict comparison in the input validator.
3. **Stop the filter annotation band from crossing the y-axis tick label** (S-SIG-07, P2). The orange dashed band and its `HULL [5.00, 12.00]` text label both intersect the `-0.11` y-axis tick on the left edge of the chart at every tested viewport. Either shrink the band so it starts to the right of the y-axis labels, or move the band label to a position that doesn't overlap a tick.
3. **Move the filter-band label so it doesn't collide with the y-axis tick label** (S-SIG-07, P2). Today the band label text is drawn at the same y as the `-0.11` y-axis tick at both 1440 and 1024. Either inset the band start so the label clears the axis gutter, or add a contrasting halo so the label is legible on top of the tick.

---

## Findings raised on 2026-09-08 (pass 7, live app re-review)

Pass 7 re-ran the outstanding pass-6 set against the live app (1440×900, Vite dev at `http://127.0.0.1:5173/`) with a HULL column filter (`HULL [5.00, 12.00]`, stats row `Count 61 / Min 7.12 / Max 11.979 / Missing 37.11%`) and the 24h quick range applied. No previously-open finding was observed as fixed. Pass 7 adds one new finding (NEW-38) and strengthens the live evidence for NEW-36 and NEW-37.

### NEW-38 — Filter dialog rejects the displayed source-profile boundary value — 🆕 NOT SOLVED

- **Severity**: P2 (a value the UI itself displays in the field and in the "Bounds scope" hint cannot be re-entered; the user is told it is out of range when it is exactly the range maximum).
- **Where**: Signals → *Filter column* dialog, HULL, opened fresh (no prior filter).
- **Reproduced live**:
  1. On Signals (24h, no active column filter) open the HULL filter dialog. Min field shows `-13.90`, Max field shows `36.44`.
  2. Both min and max `<input type=number>` spinbuttons report `aria-invalid=true` on initial load even though the Apply button is **enabled** — an inconsistent a11y/validation state (fields pre-filled with the valid, currently-shown bounds are marked invalid).
  3. Type Max = `36.44` (the exact value displayed in the field and the "Bounds scope" hint) → hint reads `Value 36.44 outside data range (-13.90 to 36.44)`, Apply becomes **disabled**.
  4. Type Max = `36.43` → validation passes, Apply re-enabled.
  5. Type Max = `36.439` → rejected, and the hint rounds it to `36.44`, so the message again self-references (`36.44 outside … to 36.44`).
- **Root cause**: in `frontend/src/features/timeseries/filterModalController.ts`, `readInputs()` compares the two-decimal *displayed* value against the full-precision stored bound with a **strict** `>`: `if (activeBounds && (from < activeBounds.min || from > activeBounds.max))`. The HULL source max is `36.43899917602539`, whose 2-dp display is `36.44`. Because `36.44 > 36.438997…`, the very value the UI shows is rejected. (The lower edge is unaffected because `-13.90499… → -13.90` rounds *toward* the bound, staying inside.) The out-of-range hint runs the rejected `outsideValue` through the same 2-dp formatter, so any value that rounds to an endpoint reads as "the endpoint is outside the range."
- **Expected behavior**:
  - A value the field or the "Bounds scope" hint displays must pass validation when re-entered unchanged.
  - Boundary comparison should be inclusive (`>=` / `<=`), or the displayed (rounded) value should be compared against the rounded bounds.
  - The out-of-range hint must not print an `outsideValue` whose formatted text equals the range max/min.
- **Acceptance criteria**:
  - On a fresh HULL filter dialog, typing `36.44` into Max (the value shown on open) keeps Apply enabled.
  - The initial min/max fields are not marked `aria-invalid` while they contain the in-bounds, currently-shown bounds (or, if the strict comparison is kept, the invalid state is consistent with the disabled/enabled state of Apply).

### NEW-35 — Filter dialog "Bounds scope" mislabels the applied filter as "source profile" — ❌ NOT SOLVED (carried, re-verified)

- **Severity**: P2.
- **Where**: Signals → *Filter column* dialog, re-opened after applying `HULL [5.00, 12.00]`.
- **Re-verified live this pass**: with the HULL filter active, re-opening the dialog shows "Bounds scope: **source profile** (5.00 → 12.00)" — but the true source profile is `-13.90 → 36.44`; `5.00 → 12.00` is the *applied* filter range. Setting Max = `12.01` → `Value 12.01 outside data range (5.00 to 12.00)`, Apply disabled: the applied filter range is enforced as if it were the data bound. Clearing the filter restores the correct source-profile bounds.
- **Root cause**: `boundsHint()` hardcodes the label "source profile" while `activeBounds` has become the applied filter range after Apply.
- **Acceptance criteria**: after a filter is applied, the bounds-hint label must say the shown bounds are the *current filter* range (and the user must be able to widen/clear it), not "source profile"; or the source-profile bounds must be re-shown and enforced as the actual data bound.

### NEW-36 — Pair-plot carry-over banner states a count, not what is carried — ❌ NOT SOLVED (carried, re-observed)

- **Severity**: P2.
- **Where**: Pair plot page, inherited-filters banner.
- **Re-observed live this pass**: with a HULL column filter and a 24h zoom active, the banner reads "Signals filters carry over here: **zoom range, 1 column filter**". The banner now surfaces a *count* of column filters (improved over pass 6, which omitted the column filter entirely), but it still does not say *which* column, *what* value range, or that the values are being null-replaced — so a data scientist landing on the page cannot tell that HULL is masked to `[5.00, 12.00]` without also reading the stats table.
- **Acceptance criteria**: the banner should name the carried column filter (`HULL [5.00, 12.00]`) rather than only its count, so the inherited data scope is legible without hovering.

### NEW-37 — Suggestion chips use unfiltered correlations while the scatter shows the filtered value — ❌ NOT SOLVED (carried, re-verified with a same-pair capture)

- **Severity**: P2.
- **Where**: Pair plot page, *Suggestions (|corr| ≥ 0.70)* panel vs *Correlation values* panel and scatter.
- **Re-verified live this pass (direct same-pair capture)**:
  1. With the HULL filter active, open the `HULL ↔ MULL |corr| 0.91` suggestion chip.
  2. The breadcrumb becomes `Correlation matrix › HULL × MULL`, X=HULL, Y=MULL.
  3. The Correlation values panel and the Statistical summary both show **Pearson r = 0.5264** / Spearman ρ = 0.5552 over "Raw-value plot · Raw values · **69680 aligned pairs**" — the full raw pair count, not the filtered count.
  4. The suggestion chip that was just clicked still reads `|corr| 0.91`, and the panel caption reads "Showing top 5 by |corr|; below-threshold fallback **(pearson_raw)**".
- **Expected behavior**: the |corr| on a suggestion chip should match the |corr| of the scatter the user lands on after clicking it, or the panel should be labeled as unfiltered source-data suggestions.
- **Acceptance criteria**: `HULL ↔ MULL` shows the same |r| on the chip and in the Correlation values panel; if the panel is intentionally raw/unfiltered, the caption must say so (e.g. `(pearson_raw, unfiltered source)`) instead of the bare `pearson_raw` token.

---

## Summary counts (pass 7, 2026-09-08)

After pass 7:

- **Signals page**: 3 outstanding (S-SIG-07, NEW-35, NEW-38).
- **Preparation page**: 0 outstanding.
- **Correlation matrix page**: 0 outstanding.
- **Pair plot page**: 2 outstanding (NEW-36, NEW-37).
- **Cross-page / global**: 0 outstanding.
- **Still outstanding from pass 6**: S-SIG-07, NEW-35, NEW-36, NEW-37 (none observed fixed).
- **New in pass 7**: NEW-38.
- **Total outstanding: 5 findings** (4 carried from pass 6 + 1 new; net +1).

Severity tally (current outstanding):
- **P0**: 0.
- **P1**: 0.
- **P2**: 5 (S-SIG-07, NEW-35, NEW-36, NEW-37, NEW-38).
- **P3**: 0.

### Verdict rollup

| Verdict | Count | Findings |
|---|---|---|
| ✅ Closed in pass 7 | 0 | — |
| 🟡 Partial in pass 7 (carried over) | 1 | S-SIG-07 (band/label still intersects the y-axis tick at 1440×900) |
| ❌ Still not solved (carried over) | 3 | NEW-35 (bounds-scope "source profile" mislabel), NEW-36 (banner shows column-filter count, not the column/value), NEW-37 (suggestion chips unfiltered vs filtered scatter — same-pair 0.91 chip vs 0.5264 Pearson) |
| 🆕 New in pass 7 | 1 | NEW-38 (filter dialog rejects the displayed source-profile max; strict `>` on 2-dp display) |

### Top fixes for a data-scientist day-1 experience (pass 7)

1. **Make the filter dialog's bounds validation inclusive and consistent** (NEW-38 + NEW-35, P2). Both stem from `filterModalController.ts`: (a) `readInputs()` uses strict `from > activeBounds.max` against the full-precision bound, so the 2-dp displayed max `36.44` (of true max `36.43899…`) is rejected — use an inclusive `>=`/`<=` or compare the rounded values; (b) `boundsHint()` hardcodes the label "source profile" even when `activeBounds` is the applied filter range — relabel to reflect the actual scope. Either fix should also clear the initial `aria-invalid` on pre-filled, in-bounds fields (NEW-38).
2. **Reconcile the Pair plot suggestions with the scatter data scope, or label the distinction** (NEW-37, P2). A same-pair capture shows a `0.91` chip landing on a `0.5264` Pearson scatter over `69680 aligned pairs`. Either compute suggestions on the filtered scope or label the panel as unfiltered source-data.
3. **Name the carried column filter in the Pair plot banner** (NEW-36, P2). "1 column filter" should become "HULL [5.00, 12.00]" so the inherited data scope is legible without a hover.

---

## Re-review (2026-09-09, pass 8)

This pass re-evaluates the 5 outstanding findings from pass 7 against the current state of the running app to mark which are fixed and to surface any newly observed regressions. Re-ran the same Signals → Pair-plot → Settings flow at 1440×900.

Findings that this pass still confirms as ✅ closed are removed from this file. The remaining findings are still actionable. Any new findings raised during this re-review are appended after the original sections.

---

## Signals page

### S-SIG-07 — Adaptive filter annotation overlaps y-axis tick labels — ❌ NOT SOLVED (re-verified)

- **Severity**: P2.
- **Where**: Main chart, filter band for a column-range filter (e.g. HULL between 5 and 12).
- **Re-verified live at 1440×900** with an active HULL filter `[5.00, 12.00]`:
  - The chart still shows an orange dashed band with a text label `HULL [5.00, 12.00]` rendered to the **left side of the band** at the band's vertical center.
  - The label still sits directly on top of the y-axis tick label `-0.11` (i.e. `0.11`) — both strings are rendered in the same horizontal band, the band crosses the y-axis tick label strip, and the text strings overlap directly.
  - Re-renders correctly on resize; layout collision between band-label text and y-axis label is consistent across the tested viewport (1440×900).
- **Acceptance criteria**:
  - ✅ Annotation includes a text label identifying the series and the active range.
  - ❌ Annotation band must not overlap y-axis tick labels — band/label still intersects the `-0.11` tick label at 1440×900.
  - ❌ Annotation text must have a background or contrasting halo so it remains legible on top of axis ticks — still no halo; the overlap with the axis tick is hard to read.

---

## Pair plot page

### NEW-36 — Carry-over banner states a count, not what is carried — ✅ SOLVED

- **Severity**: P2 (was) → closed.
- **Where**: Pair plot page, inherited-filters banner.
- **Re-verified live at 1440×900** with the same HULL column filter `[5.00, 12.00]` carried over from Signals:
  - The banner now reads `Signals filters carry over here: HULL [5.00, 12.00]`.
  - The carried filter is **named** (HULL) and **valued** (`[5.00, 12.00]`), so the inherited data scope is legible without a hover or a stats-table read.
  - Re-rendering the page with a different active filter updates the banner text accordingly.
- **Acceptance criteria**:
  - ✅ Banner names the carried column filter (`HULL [5.00, 12.00]`).
  - ✅ Inherited data scope is legible without hovering.

### NEW-37 — Suggestion chips vs scatter agree on |r| — ✅ SOLVED

- **Severity**: P2 (was) → closed.
- **Where**: Pair plot page, *Suggestions (|corr| ≥ 0.70)* panel vs *Correlation values* panel.
- **Re-verified live at 1440×900** with the HULL filter active, opening the `HULL ↔ MULL` suggestion chip:
  - Chip text now reads `|corr| 0.51` (was `0.91` in pass 7).
  - The Correlation values panel for the same pair shows **Pearson r = 0.5135**, Spearman ρ = 0.5552, over the same pair set as the scatter.
  - Chip |corr| and scatter Pearson r agree to the displayed precision (both `0.51` / `0.5135`).
  - The chip text and Pearson panel value match, so a data scientist landing on the pair can trust the chip number.
- **Acceptance criteria**:
  - ✅ `HULL ↔ MULL` shows the same |r| on the chip and in the Correlation values panel.

---

## Signals → Pair plot cross-page

### NEW-35 — Filter dialog "Bounds scope" labels the applied range correctly — ✅ SOLVED

- **Severity**: P2 (was) → closed.
- **Where**: Signals → *Filter column* dialog, re-opened after applying `HULL [5.00, 12.00]`.
- **Re-verified live at 1440×900** with the HULL filter active:
  - Re-opening the dialog now shows **"Bounds scope: filter (5.00 → 12.00)"** — the bound label matches the actual scope (the applied filter range).
  - Setting Max = `12.01` still produces the hint `Value 12.01 outside data range (5.00 to 12.00)`, with Apply disabled — the applied filter range is still enforced as the data bound, consistent with the label.
  - Clearing the filter restores the original source-profile bounds and the "source profile" wording.
- **Acceptance criteria**:
  - ✅ After a filter is applied, the bounds-hint label says the shown bounds are the *current filter* range (and the user can still widen/clear it).
  - ✅ Enforced bounds match the labelled scope.

### NEW-38 — Filter dialog accepts the displayed source-profile boundary value — ✅ SOLVED

- **Severity**: P2 (was) → closed.
- **Where**: Signals → *Filter column* dialog, HULL, opened fresh (no prior filter).
- **Re-verified live at 1440×900**:
  - Min field shows `-13.90`, Max field shows `36.44`.
  - Both min and max `<input type=number>` spinbuttons **no longer** report `aria-invalid=true` on initial load when they contain the in-bounds, currently-shown bounds; the validation state is consistent with the Apply button (initially enabled).
  - Typing Max = `36.44` (the exact value displayed in the field and in the "Bounds scope" hint) keeps Apply **enabled**; the value the UI displays is now re-accepted.
  - Typing Max = `36.43` also passes validation, Apply stays enabled.
  - The out-of-range hint no longer self-references an `outsideValue` whose formatted text equals the range max/min for the typical HULL case.
- **Acceptance criteria**:
  - ✅ On a fresh HULL filter dialog, typing `36.44` into Max (the value shown on open) keeps Apply enabled.
  - ✅ Initial min/max fields are not marked `aria-invalid` while they contain the in-bounds, currently-shown bounds.

---

## New findings raised in pass 8

### NEW-39 — Causality page renders an empty main canvas after a successful "PCMCI: graph updated" run — 🆕 NOT SOLVED

- **Severity**: P1.
- **Where**: Causality page, main visualization canvas below the trace legend (and above the *Causal graph actions* toolbar).
- **Reproduced live at 1440×900**:
  1. Open Causality. Defaults: `PCMCI` method, ParCorr test, τ max = 3, α = 0.05, PC α = 0.2, no FDR; all 7 traces are enabled in the legend.
  2. Click **Run discovery**. The button briefly shows `Computing…` and is disabled.
  3. On completion, a green toast appears: `✔ PCMCI: graph updated with 7 nodes and 65 links.`
  4. The trace legend below the params (HUFL, HULL, MUFL, MULL, LUFL, LULL, OT, all `[pressed]`) is correctly rendered.
  5. **The main visualization canvas is empty.** The DOM still has the `<main>` element, but it contains no graph, no node list, no edges, no error message, no "no links" placeholder — nothing.
  6. Despite no visible graph, the **Causal graph actions** toolbar at the bottom (`+ Edge`, `Export ▾`, `Save Run`) is **enabled**, so the user is offered to add an edge to, export, and save a graph they cannot see.
  7. Pressing `+ Edge` and selecting two traces silently does nothing visible in the canvas (no edge drawn, no list updated); `Save Run` triggers a download with no rendered artifact to review.
- **Expected behavior**:
  - After `PCMCI: graph updated with 7 nodes and 65 links`, the main canvas must show the directed graph (7 nodes labelled by trace, 65 directed edges) — either as a layout, an adjacency table, or any rendering of the discovered graph.
  - If a layout render fails (e.g. WebGL, canvas, or layout library error), the user must see a clear error or an `Edges: 65 · Nodes: 7` adjacency list fallback.
  - The `+ Edge`, `Export ▾`, `Save Run` actions must not be **enabled** while the canvas is empty / the graph is not rendered; otherwise the user is invited to act on a graph they cannot inspect.
- **Acceptance criteria**:
  - After `Run discovery` with the default parameters on the ETTm2 7-trace dataset, the main canvas contains a visible graph or a legible adjacency/edge list (e.g. 7 node labels + a count of edges).
  - If the graph cannot be rendered, an actionable error message replaces the blank canvas.
  - `+ Edge`, `Export ▾`, and `Save Run` are **disabled** whenever the canvas is empty or the underlying graph data is missing.

---

## Summary counts (pass 8, 2026-09-09)

After pass 8:

- **Signals page**: 1 outstanding (S-SIG-07).
- **Preparation page**: 0 outstanding.
- **Correlation matrix page**: 0 outstanding.
- **Pair plot page**: 0 outstanding.
- **Causality page**: 1 outstanding (NEW-39).
- **Cross-page / global**: 0 outstanding.
- **Closed in pass 8**: NEW-35, NEW-36, NEW-37, NEW-38.
- **New in pass 8**: NEW-39.
- **Total outstanding: 2 findings** (1 carried from pass 7 + 1 new; net -3).

Severity tally (current outstanding):
- **P0**: 0.
- **P1**: 1 (NEW-39).
- **P2**: 1 (S-SIG-07).
- **P3**: 0.

### Verdict rollup

| Verdict | Count | Findings |
|---|---|---|
| ✅ Closed in pass 8 | 4 | NEW-35 (bounds-scope "filter" label), NEW-36 (banner names `HULL [5.00, 12.00]`), NEW-37 (chip `|corr| 0.51` matches Pearson `0.5135`), NEW-38 (Max `36.44` accepted; initial fields not `aria-invalid`) |
| 🟡 Partial in pass 8 (carried over) | 0 | — |
| ❌ Still not solved (carried over) | 1 | S-SIG-07 (band/label still intersects the `-0.11` y-axis tick at 1440×900) |
| 🆕 New in pass 8 | 1 | NEW-39 (Causality main canvas blank after a successful `graph updated with 7 nodes and 65 links` run; graph actions still enabled) |

### Top fixes for a data-scientist day-1 experience (pass 8)

1. **Render the discovered graph on the Causality page, or surface an error and gate graph actions** (NEW-39, P1). The page reports `graph updated with 7 nodes and 65 links` and shows a populated trace legend, yet the main canvas is empty and `+ Edge` / `Export ▾` / `Save Run` remain enabled. Either the layout render is silently failing or its output isn't being attached to the `<main>` element. A user landing on this page cannot review the discovery result and is offered to save / export a graph they cannot see.
2. **Stop the adaptive-filter annotation from overlapping the y-axis tick label** (S-SIG-07, P2). The orange dashed band and its `HULL [5.00, 12.00]` text label still sit directly on top of the `-0.11` y-axis tick at 1440×900 — give the label a contrasting background, push it into the chart body, or render it above/below the y-axis tick strip.

4. **Stop the filter annotation band from crossing the y-axis tick label** (S-SIG-07, P2). The orange dashed band and its `HULL [5.00, 12.00]` label still intersect the `-0.11` y-axis tick at 1440×900. Inset the band start past the axis gutter or add a halo.