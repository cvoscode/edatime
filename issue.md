# Issue: Timeseries command bar — color-by alignment and redundant summary

## Summary

Two small UX/layout cleanup items for the timeseries command bar
(`#page-timeseries > .timeseries-context-bar`):

1. The **Color-by** selector is currently rendered on its own row, below the
   column chips, instead of sitting inline with them.
2. The **series summary line** (`<p id="timeseries-series-summary">`, e.g.
   *"7 of 7 active. Click chips to add more."*) is redundant discoverability
   noise that adds vertical space and is already conveyed by the chip
   rail's own tooltips, `aria-label`, and the Draw toolbar help button.

---

## Problem 1 — Color-by is on a separate row

### Current behavior

- `frontend/index.html:360` places the color-by slot in a dedicated slot
  element:
  ```html
  <div id="timeseries-color-slot" class="timeseries-color-slot"></div>
  ```
- `frontend/src/features/timeseries/colorByControl.ts:26` mounts
  `ColorBySelect` into that slot.
- `frontend/css/modules/toolbar.css:188` styles
  `.timeseries-color-slot` as `display: inline-flex; align-items: center;
  gap: 10px; min-width: 0; flex-wrap: wrap; justify-content: flex-end`.
- The command bar uses `timeseries-command-bar__left | __center | __right`
  layout, and the chip rail + color slot currently wrap onto separate
  flex lines at intermediate viewports (see `responsive.css:221, 444`
  which moves `.timeseries-color-slot` to `justify-content: flex-start`
  on its own row).

Result: the color-by chip ends up beneath the column chips instead of
trailing them on the same horizontal row at the desktop layout (≈1100 px
and above).

### Desired behavior

- Render the color-by selector inline with the column chips on the same
  row at desktop widths, trailing to the right of the chip rail.
- Keep the existing responsive collapse at narrow viewports (the chip
  rail and color slot may wrap below ~760 px; only fix the desktop
  placement).
- The slot's `id="timeseries-color-slot"` and the
  `renderColorByControl({ slotId: … })` contract should be preserved so
  `columnsController.ts`, `help.ts`, and `columnsController.test.ts` keep
  working without churn beyond DOM/CSS.

### Acceptance criteria

- [ ] At ≥1100 px viewport width, `Color by` and the column chips share
      a single visual row.
- [ ] Chip tooltips, `aria-label`, and the `series-toggles` rail
      container's own `title` attribute still carry the active/total
      count.
- [ ] `responsive.css` narrow-viewport rules continue to wrap the color
      slot below the chips below ~760 px.
- [ ] No regression in `npm test` (the `columnsController.test.ts`
      fixture should still find `#timeseries-color-slot`).

---

## Problem 2 — Remove the redundant `timeseries-series-summary` paragraph

### Current behavior

- `frontend/index.html` (within `#timeseries-series-disclosure`) contains:
  ```html
  <p id="timeseries-series-summary" class="timeseries-series-summary"
     aria-live="polite">7 of 7 active. Click chips to add more.</p>
  ```
- `frontend/src/features/timeseries/columnsController.ts:78, 94` writes
  to this element from `buildColumnToggles`:
  ```ts
  const summary = document.getElementById('timeseries-series-summary');
  if (summary) summary.textContent = summaryText;
  ```
- `frontend/src/features/timeseries/columnsController.test.ts:12, 67`
  asserts against this element id.
- The summary duplicates information already exposed via:
  - the chip rail container's `title` and `aria-label` (also set in
    `columnsController.ts` via `syncSummary`),
  - the Draw toolbar `?` help button (`features/timeseries/help.ts`),
  - the per-chip "Color source" badge and tooltips.
- The earlier inline *"Ctrl + click"* hint chip was already removed
  from this module for the same discoverability-via-tooltip reasons
  (see the file-level doc comment at
  `frontend/src/features/timeseries/columnsController.ts:1-13`).

### Desired behavior

- Delete the `<p id="timeseries-series-summary">` element from
  `frontend/index.html`.
- Drop the two `document.getElementById('timeseries-series-summary')`
  writers in `frontend/src/features/timeseries/columnsController.ts`
  (the empty-state branch around line 78 and the `syncSummary` closure
  around line 94). Keep the container `title` / `aria-label` write so
  the same text remains available to screen readers via the chip rail.
- Update `frontend/src/features/timeseries/columnsController.test.ts`
  to drop the `<p id="timeseries-series-summary"></p>` fixture and the
  `getElementById('timeseries-series-summary')?.textContent` assertion;
  cover the same behavior by asserting on the chip-rail container's
  `aria-label` / `title` instead.
- No other module should reference
  `timeseries-series-summary` after this change
  (`grep_search` reports only the three files above and
  `ColorBySelect.ts`/`Dropdown.ts` are unrelated).

### Acceptance criteria

- [ ] No `<p id="timeseries-series-summary">` element rendered on the
      timeseries page.
- [ ] Active/total count still discoverable via chip-rail
      `aria-label` / `title` and the Draw toolbar help.
- [ ] `grep_search` for `timeseries-series-summary` returns zero hits
      under `frontend/src/` and `frontend/index.html`.
- [ ] `npm test` and `npm run check:frontend:all` pass.

---

## Problem 3 — Remove the post-pipeline preview chart on the Preparation page

### Current behavior

- `frontend/src/features/prepare/index.ts:200-247` defines
  `renderPipelinePreviewChart(data, columns)`, which builds a
  `div.prepare-workspace__preview-chart` containing an inline
  `<svg viewBox="0 0 600 150">` with up to three downsampled
  `<polyline>` series (cyan / amber / green) and `aria-label` of the
  form `"Post-pipeline preview of <col1>, <col2>, <col3>"`.
- `frontend/src/features/prepare/index.ts:725-728` mounts it inside the
  `#prepare-pipeline-preview` section:
  ```ts
  const previewChart = renderPipelinePreviewChart(
      deps.getCurrentData?.() ?? null,
      deps.workspace?.getSnapshot().selection.columns ?? [],
  );
  graphSection.append(graphTitle, graphCopy, previewCaption, previewChart, graphScroll);
  ```
- `frontend/css/modules/prepare.css:17-18` styles it:
  ```css
  .prepare-workspace__preview-chart { display: grid; min-height: 150px; margin: 10px 0; place-items: center; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-dim); background: var(--surface-0); font-size: .8rem; }
  .prepare-workspace__preview-chart svg { display: block; width: 100%; height: 150px; }
  ```
- The chart is redundant with the larger pipeline graph SVG
  (`renderPipelineGraphSvg` → `graphScroll`) already in the same
  section, and the user can already see full-resolution series on the
  Timeseries page after materialization. It currently adds ~170 px of
  vertical chrome to the Preparation workspace without unique signal.

### Desired behavior

- Remove the post-pipeline line-preview chart from the Preparation
  workspace entirely. The section `#prepare-pipeline-preview` should
  still render its title, copy, caption (`previewCaption`), and the
  full pipeline-graph SVG (`graphScroll`); only `previewChart` is
  dropped.
- Delete `renderPipelinePreviewChart` from
  `frontend/src/features/prepare/index.ts` along with its helpers
  (the local `yMin`/`yMax`/`ySpan`/downsampling loop and the
  `colors` array). No other call sites exist
  (`grep_search` shows only the definition + the one append site).
- Remove the now-unused `.prepare-workspace__preview-chart` and
  `.prepare-workspace__preview-chart svg` rules from
  `frontend/css/modules/prepare.css` (lines 17-18).
- The `formatPipelinePreviewCaption(...)` text caption above the chart
  is unrelated to the SVG preview and must be preserved — it still
  communicates stage summary information.

### Acceptance criteria

- [ ] `grep_search` for `prepare-workspace__preview-chart` returns zero
      hits under `frontend/src/`, `frontend/css/`, and `frontend/index.html`.
- [ ] `grep_search` for `renderPipelinePreviewChart` returns zero hits.
- [ ] The `#prepare-pipeline-preview` section still shows the section
      heading, copy, caption, and the pipeline-graph SVG; only the
      downsampled line-preview SVG is gone.
- [ ] No test fixture changes required
      (`frontend/src/features/prepare/index.test.ts:84` asserts on
      `'Adaptive line'` text from `formatPipelinePreviewCaption`, not
      on the chart DOM).
- [ ] `npm test` and `npm run check:frontend:all` pass.

---

## Problem 4 — Dataset switcher click does nothing (broken `toggle` handler)

### Current behavior

- The header dataset picker
  (`#dataset-switcher > .dataset-switcher__summary` → label
  `#dataset-switcher-label`, menu `#dataset-switcher-menu`) is wired up
  in `frontend/src/ui/datasetSwitcher.ts`.
- The only thing that triggers `loadMenu()` is:
  ```ts
  root.addEventListener('toggle', () => { if (root.open) void loadMenu(); },
                         { signal: lifetime.signal });
  ```
- **No `click` / `keydown` / `pointerdown` handler is attached to the
  `summary`** anywhere in the file or in the rest of `frontend/src/`.
- Native `<details>` only opens via a click on the `<summary>`, which
  fires a `toggle` event. However, on this page the
  `summary.dataset-switcher__summary` is also wrapped by
  additional layers and styled with `list-style: none` +
  `::-webkit-details-marker { display: none; }` (see
  `frontend/css/modules/dataset-context.css:3`). In several browsers
  — particularly when the `<details>` is inside another
  `<header>` / topbar region and the summary has `cursor: pointer`
  but no explicit `display: list-item` reset — the `toggle` event
  never fires (or fires inconsistently) and the menu stays closed.
- Reproducible symptom reported in this session: clicking the
  `source-1` chip in the topbar does **not** open the dataset menu,
  so users cannot switch the active dataset or load a new one from
  the header.

### Desired behavior

- Clicking (or pressing `Enter` / `Space` while focused on) the
  `.dataset-switcher__summary` reliably opens the
  `<details id="dataset-switcher">` and triggers `loadMenu()`.
- Activating a `.dataset-switcher__item` switches the active dataset
  version via the existing `selectDatasetVersion(version.id, …)`
  call, closes the menu, and refreshes the label.
- Activation is accessible: keyboard works via `Enter`/`Space`, and
  `aria-expanded` is kept in sync with the open state.
- The bug fix must not regress the "load new dataset" footer button
  nor the existing `selectDatasetVersion` failure path
  (`Could not switch · <message>`).

### Suggested fix sketch (illustrative; do not commit blindly)

- In `frontend/src/ui/datasetSwitcher.ts`, add an explicit toggle
  trigger alongside the existing `toggle` listener:
  ```ts
  root.querySelector('summary')?.addEventListener('click', (event) => {
      // Native <details> already toggles on summary click; only
      // intervene to swallow bubbling of inner controls if needed.
  }, { signal: lifetime.signal });
  ```
  and, if the symptom persists, drive `root.open` from an explicit
  handler:
  ```ts
  root.querySelector('summary')?.addEventListener('click', () => {
      root.open = !root.open;
  }, { signal: lifetime.signal });
  ```
- In `frontend/css/modules/dataset-context.css`, harden the summary
  so the marker suppression doesn't accidentally swallow the click
  target in some engines:
  ```css
  .dataset-switcher__summary { display: flex; ... }   /* already set */
  .dataset-switcher__summary::marker { content: ''; }
  ```
- Update the `#dataset-switcher` `<details>` markup in
  `frontend/index.html:252-259` so the `aria-expanded` attribute
  reflects `root.open` after toggling, e.g. via the same handler that
  calls `loadMenu()`.

### Acceptance criteria

- [ ] In Chromium-based browsers (including the integrated browser
      used during development), clicking `summary.dataset-switcher__summary`
      opens the `<details>` and populates
      `#dataset-switcher-menu` with the dataset-version list from
      `listDatasetVersions`.
- [ ] Keyboard activation (`Enter` / `Space` while the summary has
      focus) opens the menu.
- [ ] `aria-expanded` on `#dataset-switcher` mirrors `root.open`.
- [ ] Clicking an already-active version does not call
      `selectDatasetVersion` and still closes the menu.
- [ ] Selecting a different version updates
      `#dataset-switcher-label` and the
      `dataset.activeSourceVersionId` in the workspace store.
- [ ] Existing failure / loading / empty / "load new dataset"
      branches in `loadMenu` continue to render correctly.
- [ ] `npm test` and `npm run check:frontend:all` pass.

---

## Problem 5 — Pipeline graph node cards are visually weak (style pass)

### Current behavior

- The active stage node renders as a flat rectangle
  (`<rect ... rx="12">`) with the same flat surface fill as every other
  card and only `stroke-width: 1.5` to differentiate it:
  - CSS: `frontend/css/modules/modals.css:148-158`
    ```css
    .pipeline-graph__node rect {
      fill: var(--shell-surface-elevated);
      stroke: var(--shell-border-strong);
      stroke-width: 1.5;
    }
    .pipeline-graph__node--source rect { fill: color-mix(in srgb, var(--cyan) 8%, …); stroke: var(--cyan); }
    .pipeline-graph__node--result rect { fill: color-mix(in srgb, var(--green) 8%, …); stroke: var(--green); }
    .pipeline-graph__node--disabled rect { opacity: 0.55; … }
    .pipeline-graph__node--annotation rect { fill: var(--amber); fill-opacity: 0.09; … }
    .pipeline-graph__node.is-selected rect { stroke: var(--accent); stroke-width: 3; }
    ```
  - Markup: `frontend/src/cleaning/pipelineGraph.ts:329` emits
    `<rect x="…" y="…" width="${nodeWidth}" height="${nodeHeight}" rx="12" />`
    inside a `<g class="pipeline-graph__node …" role="button">`.
- Observed issues from the in-browser capture attached to this issue:
  1. The active step card (`.pipeline-graph__node--active` has no
     distinct fill / stroke variant — only the inherited 1.5 px
     `--shell-border-strong` border) so it disappears into the
     background.
  2. The detail body (column + range lines, e.g.
     *"MUFL: keep below 2017-04-07 · 03:11 @ 68.0173 → 2017-06-06"*)
     is `font-size: 10px; fill: var(--text-dim)` and easily runs
     off the right edge of the 212 px-wide card. The current node
     height formula
     (`pipelineGraph.ts:281: const nodeHeight = Math.max(82, 58 + maxSpecLines * 16);`)
     only accommodates the longest single detail line — not
     wrapped/overlapping ones.
  3. Long stage specs render on a single `<text>` line and overflow
     the rounded rect with no clipping or fade.
  4. There is no visual affordance for "this is the currently
     selected stage" beyond the heavier stroke — no halo, no inner
     highlight, no chevron/indicator.
  5. Edges have a 2.25 px accent stroke (`modals.css:144`) but no
     arrowhead emphasis; arrow markers are tiny
     (`markerWidth/Height=8`).

### Desired behavior

- Active and selected stage cards should read as the focal element of
  the graph at a glance:
  - Subtle elevation: add a soft inner accent (`fill: color-mix(in
    srgb, var(--accent) 10%, var(--shell-surface-elevated))`) for
    `.is-selected` or introduce a new
    `.pipeline-graph__node--active rect` selector.
  - Slightly thicker, accent-tinted stroke on hover/focus
    (`stroke-width: 2` → `2.5`, `stroke: var(--accent)`).
  - Add a soft outer glow via `<filter>` or a doubled stroked rect
    (e.g. a second `<rect>` with `stroke-opacity: 0.25;
    stroke-width: 6`) so the active card "pops" without breaking the
    existing palette.
- Detail lines must fit inside the card:
  - Either widen `nodeWidth` (currently 212 px in
    `pipelineGraph.ts:281`) to ~240–260 px when
    `maxSpecLineLength > 22`, or
  - Increase per-line `<tspan dy>` so each row has more horizontal
    room, or
  - Truncate long detail strings with a `…` ellipsis in
    `wrapWords(...)` (`pipelineGraph.ts:281`) and expose the full
    string in the `<title>` tooltip already emitted on line 327.
- Selected-stage indicator:
  - Add a small left-edge accent bar (a thin `<rect>` with
    `width="3"` painted in `--accent`) at the left of
    `.is-selected` cards, OR
  - Add a corner badge (`<text>` in the top-right reading
    *"Selected"*).
- Edges:
  - Increase `markerWidth/Height` from 8 to 10 for legibility, and
    add `markerUnits="userSpaceOnUse"` so the arrowhead doesn't
    shrink when `vector-effect: non-scaling-stroke` is later
    applied elsewhere.
- Eyebrow ("STEP 1") should have a tiny accent dot to its left for
  visual rhythm:
  - Emit `<circle cx="…" cy="…" r="2" fill="var(--accent)" />`
    before the eyebrow `<text>` when the node is selected/active.
- Respect existing token system. Do not introduce new colors; use
  `var(--accent)`, `var(--cyan)`, `var(--amber)`, `var(--green)`,
  `color-mix(...)` patterns already in use at
  `modals.css:149-152`.

### Acceptance criteria

- [ ] Active stage card is visually distinct from disabled /
        source / result cards at default zoom.
- [ ] No detail line overflows the rounded-rect bounds in the
        current pipeline (`Filters` stage with the four ETTm2 columns).
- [ ] Selected card shows a clearly perceivable indicator
        (accent bar, badge, or halo) in addition to the existing
        stroke change.
- [ ] Edge arrowheads are legible at the default node size.
- [ ] Hover and focus states remain reachable via keyboard
        (`tabindex="0"` is already set in `pipelineGraph.ts:329`)
        and the existing `:focus` rule at `modals.css:155` still
        applies.
- [ ] Existing assertions in
        `frontend/src/cleaning/pipelineGraph.test.ts:107-108`
        (`.pipeline-graph__node--disabled is-selected` and
        `.pipeline-graph__edge--bypassed`) still pass.
- [ ] `npm test` and `npm run check:frontend:all` pass.

---

## Problem 6 — Skip the heatmap pair-confirmation modal, jump straight to Pair plot

### Current behavior

- On the Correlation matrix page, clicking (or pressing `Enter`/`Space`
  on) a heatmap cell opens a confirmation dialog
  (`#heatmap-pair-dialog`) instead of going straight to the Pair plot:
  - Markup: `frontend/index.html:1210-1223`
    ```html
    <dialog id="heatmap-pair-dialog" class="modal modal--compact" ...>
      <div class="modal-header"><h2 id="heatmap-pair-title">Pair details</h2></div>
      <div class="modal-body">
        <p id="heatmap-pair-summary" class="modal-hint">…</p>
        <p class="modal-hint">The matrix remains open behind this dialog…</p>
      </div>
      <div class="modal-actions">
        <button id="heatmap-pair-close" class="btn btn-ghost" type="button">Close</button>
        <button id="heatmap-pair-open" class="btn btn-primary" type="button">Open in Pair plot</button>
      </div>
    </dialog>
    ```
  - Open / close / focus-trap logic:
    `frontend/src/features/heatmap/page.ts:185-208` (`openPairDialog`,
    `closePairDialog`) and `frontend/src/features/heatmap/page.ts:665-705`
    (the `pairClose`/`pairDialog` `cancel` / `keydown` handlers).
  - Cell click handler:
    ```ts
    // frontend/src/features/heatmap/page.ts:467-473
    openPairDialog(x, y, Number(cell.dataset.correlationValue), cell);
    ```
    and the suggestion handler at `page.ts:459` also calls
    `openPairDialog(...)`.
  - Fallback already exists: when the dialog nodes can't be found,
    `openPairDialog` silently delegates to `openScatterPair(x, y)`
    (`page.ts:188-190`).
- Result: every correlation-matrix click requires **two actions**
  (click cell → click "Open in Pair plot") instead of one. The
  dialog content (the Pearson value + a "correlation does not establish
  causation" caveat) is informational and is already implied by the
  cell's own tooltip / numeric label.

### Desired behavior

- Clicking a heatmap cell (or pressing `Enter`/`Space` on it) should
  navigate **directly** to the Pair plot with the X / Y columns set.
  No intermediate modal.
- The "Correlation does not establish causation" caveat should still
  appear *somewhere* on the Pair plot page or as a small toast/tooltip
  on the heatmap cell — but it should not gate the navigation.
- The keyboard activation path (`container.onkeydown` at
  `page.ts:475-…`) must continue to work and must also skip the modal.
- The pair-confirmation dialog markup (`#heatmap-pair-dialog`,
  `#heatmap-pair-title`, `#heatmap-pair-summary`,
  `#heatmap-pair-close`, `#heatmap-pair-open`) and its CSS
  (`.modal--compact` etc.) can be removed; verify nothing else in
  the codebase depends on them.

### Suggested change

1. Replace the two `openPairDialog(...)` call sites at
   `page.ts:459` and `page.ts:469` with a direct call to
   `openScatterPair(x, y)` (the same helper `openPairDialog` already
   falls back to at `page.ts:188-190`).
2. Delete the `openPairDialog` / `closePairDialog` definitions
   (`page.ts:185-208`) and the related pair-dialog listeners
   (`page.ts:665-705`).
3. Remove the `<dialog id="heatmap-pair-dialog" …>` block from
   `frontend/index.html:1210-1223`.
4. Drop any unused CSS selectors referencing
   `#heatmap-pair-dialog`, `.modal--compact`, etc. (search
   `frontend/css/**`).
5. Update tests in
   `frontend/src/features/heatmap/page.test.ts:181, 382, 386, 404-408,
   436-437, 468` that currently expect the dialog to open. They
   should now assert that clicking a cell calls
   `openScatterPair(x, y)` and lands on the Pair plot with the
   correct X / Y values.

### Acceptance criteria

- [ ] Single click on any non-diagonal heatmap cell navigates to the
      Pair plot with X = `cell.dataset.rowName` and Y = `cell.dataset.colName`.
- [ ] Keyboard activation (`Enter` / `Space`) on a focused heatmap
      cell also navigates directly.
- [ ] No `#heatmap-pair-dialog` element remains in the DOM (and
      `grep_search` for `heatmap-pair-dialog|heatmap-pair-close|heatmap-pair-open|heatmap-pair-title`
      returns zero hits under `frontend/src/`, `frontend/css/`,
      `frontend/index.html`).
- [ ] The "correlation does not establish causation" caveat is still
      surfaced on the heatmap page (cell `title` / tooltip) or the
      Pair plot page (existing hint copy).
- [ ] `npm test` and `npm run check:frontend:all` pass after the
      test updates above.

---

## Problem 7 — Remove the Pair plot "Correlation matrix › MUFL × HUFL" breadcrumb

### Current behavior

- The breadcrumb is injected programmatically on the Pair plot page
  (when `activePage() === 'scatter'`) by
  `frontend/src/ui/breadcrumbs.ts`:
  ```ts
  // frontend/src/ui/breadcrumbs.ts:1-60
  export function initBreadcrumbs(showPage: (page: string) => void): () => void {
      ...
      const render = () => {
          ...
          if (page !== 'scatter') return;
          ...
          const nav = document.createElement('nav');
          nav.className = 'page-breadcrumb';
          ...
          addLink('Correlation matrix', 'correlations');
          nav.append(document.createTextNode('›'));
          const current = document.createElement('span');
          current.textContent = `${x} × ${y}`;
          ...
          header.insertAdjacentElement('afterend', nav);
      };
      ...
  }
  ```
- Wired into the app composition root at
  `frontend/src/app/pageModules.ts:28` (import) and
  `frontend/src/app/pageModules.ts:143` (`deps.registerCleanup(initBreadcrumbs(deps.showPage))`).
- Styled at `frontend/css/modules/dataset-context.css:12-14`:
  ```css
  .page-breadcrumb { display: flex; align-items: center; gap: 7px; margin: -2px 0 10px; color: var(--text-muted); font-size: .75rem; }
  .page-breadcrumb button { padding: 0; border: 0; color: var(--accent); background: none; font: inherit; cursor: pointer; }
  .page-breadcrumb button:hover { text-decoration: underline; }
  ```
- Visible DOM on Pair plot
  (`#page-scatter > nav.page-breadcrumb`):
  ```
  Correlation matrix › MUFL × HUFL
  ```
- It duplicates navigation that is already trivially reachable via the
  left sidebar (`Correlation matrix` item) and via the back button, and
  the `MUFL × HUFL` label just echoes the X / Y dropdowns that are
  already shown on the same page header.

### Desired behavior

- Stop rendering the breadcrumb on the Pair plot page. The Pair plot
  page header should stand alone.
- Delete the breadcrumb feature entirely (module + CSS + test + import
  wiring). It is not used on any other page
  (`grep_search` for `page-breadcrumb` and `initBreadcrumbs` shows the
  three files above only).

### Suggested change

1. Delete `frontend/src/ui/breadcrumbs.ts`.
2. Delete `frontend/src/ui/breadcrumbs.test.ts` (the only test file
   for this feature).
3. In `frontend/src/app/pageModules.ts`, drop the import at line 28
   (`import { initBreadcrumbs } from '../ui/breadcrumbs.js';`) and
   the registration at line 143
   (`deps.registerCleanup(initBreadcrumbs(deps.showPage));`).
4. Remove the three rules in
   `frontend/css/modules/dataset-context.css:12-14`.

### Acceptance criteria

- [ ] `grep_search` for `page-breadcrumb` returns zero hits under
      `frontend/src/`, `frontend/css/`, `frontend/index.html`.
- [ ] `grep_search` for `initBreadcrumbs` returns zero hits.
- [ ] No `nav.page-breadcrumb` element renders on the Pair plot
      page; the page header sits directly under the topbar with the
      existing 10 px gap.
- [ ] `npm test` and `npm run check:frontend:all` pass.

---

## Feature — Combine Correlation matrix + Pair plot into a single "Correlation matrix" page

### Goal

Replace the current two-page flow (Correlation matrix → click a cell
→ modal → click "Open in Pair plot" → Pair plot page) with a single
"Correlation matrix" page that hosts both the matrix heatmap and a
live Pair-plot preview for the currently selected cell. There is no
longer a separate Pair-plot page or route.

### User-visible behavior

- **Single page.** The sidebar entry *Pair plot* is removed. The
  *Correlation matrix* entry remains and now hosts both views.
- **Heatmap on the left / top.** Renders the same matrix it does today
  (Pearson / Spearman / Distance, Clustered / Source order, Lock
  order, PNG export, etc.).
- **Pair-plot preview on the right / bottom.** Whenever a non-diagonal
  cell is selected (click, `Enter`, `Space`, or programmatic via
  `selectCell(x, y)`) the preview updates to show the X-vs-Y scatter
  with the same density / color-by / range controls currently on
  `#page-scatter`.
- **Synchronised selection.** Selecting a cell highlights it in the
  matrix and drives the preview; changing X or Y via the preview's
  dropdowns re-selects the corresponding cell in the matrix. The two
  views never disagree about which pair is being inspected.
- **URL hash.** `#page=correlation-matrix` remains the only route for
  this combined view. `#page=pair-plot` is deprecated — visiting it
  redirects to `#page=correlation-matrix` (or simply renders the
  combined page; see "Routing" below).
- **Empty / loading / error states.** Same empty / loading / error
  states that exist today, scoped to the combined page rather than
  two pages.

### Files / modules to merge

- **Heatmap (matrix) feature** — keep as-is at
  `frontend/src/features/heatmap/`:
  `page.ts`, `index.ts`, `cellPresentation.ts`, `colorScale.ts`,
  `gridLayout.ts`, `loadErrorPolicy.ts`, `matrixPolicy.ts`,
  `orderingPolicy.ts`, `help.ts`.
- **Scatter (Pair plot) feature** — keep rendering + state code,
  re-home it under `frontend/src/features/heatmap/pairPlot/` so the
  scatter is now a sub-view of the heatmap. Source files to move /
  re-export:
  - `frontend/src/features/scatter/runtime.ts`
  - `frontend/src/features/scatter/state.ts`
  - `frontend/src/features/scatter/controls.ts`
  - `frontend/src/features/scatter/rendering.ts` (+ `renderingDensity.ts`)
  - `frontend/src/features/scatter/layout.ts`
  - `frontend/src/features/scatter/matrix.ts` / `matrixGrid.ts`
  - `frontend/src/features/scatter/correlationsPanel.ts`
  - `frontend/src/features/scatter/colorbarPresentation.ts`
  - `frontend/src/features/scatter/tooltipPresentation.ts`
  - `frontend/src/features/scatter/renderLimit.ts`,
    `seriesPolicy.ts`, `responsePolicy.ts`, `selectionZoom.ts`,
    `chartLifecycle.ts`, `pairIntent.ts`, `export.ts`, `help.ts`,
    `helpers.ts`.
  - The scatter CSS module (`cssModules: ['scatter']` in
    [pageModules.ts:89-99](frontend/src/app/pageModules.ts#L89-L99))
    is kept but renamed to `correlation-matrix` and merged with the
    heatmap layout styles.
- **Page descriptor.** Delete the `'scatter'` descriptor at
  [pageModules.ts:87-99](frontend/src/app/pageModules.ts#L87-L99).
  Extend the `'heatmap'` descriptor at
  [pageModules.ts:73-86](frontend/src/app/pageModules.ts#L73-L86) so
  `initHeatmapPage` also constructs the pair-plot sub-view.
- **HTML.** Delete `<section class="page" id="page-scatter" …>`
  ([frontend/index.html:623](frontend/index.html#L623) and the
  surrounding toolbar / canvas markup up through the closing
  `</section>`). Delete the sidebar entry
  `<button class="nav-item" type="button" data-page="scatter" …>`
  ([frontend/index.html:129](frontend/index.html#L129)). Merge the
  pair-plot toolbar fields (`#scatter-x-col`, `#scatter-y-col`,
  density toggle, color-by, ranges, etc., currently at
  [frontend/index.html:647-654](frontend/index.html#L647-L654)) into
  the heatmap page so the preview can drive them. Keep
  `#page-correlations` / `data-page-name="correlations"` as the only
  route (verify the existing route key by reading
  `frontend/src/app/pageModules.ts` line 74 / 88 and
  `frontend/index.html` sidebar).

### Cross-view wiring

- **Selection propagation.**
  - On heatmap cell click / `Enter` / `Space`, set the preview's
    X / Y dropdowns and dispatch the existing
    `change` event so the scatter runtime re-renders.
    Currently: `frontend/src/features/heatmap/page.ts:455-475` calls
    `openPairDialog(...)`. Replace with a new
    `selectCellForPreview(x, y)` that updates the dropdowns and
    re-renders.
  - On scatter X / Y dropdown change, locate the corresponding cell
    in the matrix (`rowIndex` / `colIndex` from
    `frontend/src/features/heatmap/gridLayout.ts`) and set the
    matrix's `.is-selected` class without re-rendering the matrix.
- **Routing.** Add a small compatibility shim
  (`frontend/src/app/router.ts` or wherever page navigation is
  handled) so a legacy `#page=pair-plot` URL still opens the
  combined page. Do **not** keep the old `'scatter'` descriptor.
- **Modal removal.** This combines with the prior "remove the
  heatmap pair-confirmation modal" change — the dialog no longer
  makes sense once the pair plot lives on the same page.

### State, workspace, and contracts

- Reuse `workspace.scatter.selection.xColumn` /
  `.yColumn` (read/write via `workspace.setFilters` / existing
  setters in `frontend/src/store/workspace/`) so the pair-plot
  selection becomes a first-class part of the workspace intent,
  not a page-local state.
- No new backend routes are required: `fetchScatterPoints` and
  `fetchCorrelationMatrix` already exist under
  `frontend/src/services/api/`. Confirm in
  `frontend/contracts/api/v1/` that both routes are listed and that
  no v1 schema change is needed.

### Acceptance criteria

- [ ] Sidebar shows a single *Correlation matrix* entry. No
      *Pair plot* entry remains; `data-page="scatter"` returns zero
      hits in `frontend/`.
- [ ] `#page=correlation-matrix` opens a single page that contains
      both the heatmap and a live pair-plot preview.
- [ ] Clicking any non-diagonal cell selects it (visible
      `.is-selected` state) and updates the pair-plot preview.
- [ ] Changing X / Y in the preview's dropdowns re-selects the
      corresponding cell in the matrix.
- [ ] `#page=pair-plot` (legacy URL) opens the combined page
      instead of 404 / blank.
- [ ] All existing heatmap tests
      (`frontend/src/features/heatmap/page.test.ts` etc.) still pass
      after the merge.
- [ ] Scatter tests migrate to live under
      `frontend/src/features/heatmap/pairPlot/*.test.ts` and pass.
- [ ] `npm run check:frontend:all`, `npm test`, and the documented
      bundle-budget benchmarks (`npm run bench:app:artifacts`) pass.

### Open questions for the implementer

- Layout: split-view (matrix left, preview right) at desktop, stacked
  at < ~1100 px — confirm against the existing responsive CSS in
  `frontend/css/modules/responsive.css` and
  `frontend/css/modules/scatter-*.css`.
- PNG export: should it cover both views in one image, or remain
  per-view?
- Should the matrix's "Lock order" also pin the scatter's column
  order? (Probably yes — they're showing the same dataset.)

---

## Notes for implementer

- The two changes are independent and can be done in either order. They
  do not require any backend, contract, or store changes — both are
  pure frontend DOM/CSS adjustments in the timeseries command bar.
- Be careful with `responsive.css`: keep the existing `@media` blocks
  that move the color slot below the chips at narrow widths; only
  adjust the desktop placement.
- Do not reintroduce backwards-compatibility shims for the removed
  summary element. Update the test fixture and the controller to drop
  the writer entirely.
