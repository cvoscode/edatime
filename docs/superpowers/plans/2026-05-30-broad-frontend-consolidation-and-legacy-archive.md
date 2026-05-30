# Broad Frontend Consolidation And Legacy Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the live frontend onto one canonical architecture, archive deprecated implementations under `frontend/src/legacy/`, and remove active imports from legacy compatibility surfaces without changing runtime behavior.

**Architecture:** Preserve the existing app behavior while moving old implementations into an explicit archive tree, excluding that tree from normal validation, and migrating live imports onto `app/`, `ui/`, `features/`, `store/`, `services/`, and `pages/shared/` as the only supported internal surfaces.

**Tech Stack:** TypeScript, Vite, Vitest, Happy DOM, Vanilla DOM rendering, custom store, Node architecture-check scripts

---

## File Map

- **Create:** `frontend/src/legacy/README.md`
  - Documents the archive policy and makes the boundary explicit.
- **Create:** `ai/frontend/refactor/2026-05-30-broad-frontend-consolidation.md`
  - Records the target architecture and migration sequence for AI-assisted work.
- **Modify:** `ai/README.md`
  - Add a pointer to the new frontend refactor planning note.
- **Modify:** `tsconfig.json`
  - Exclude `frontend/src/legacy/**` from normal typechecking.
- **Modify:** `scripts/check-frontend-architecture.mjs`
  - Skip `legacy/` files and fail if live code imports from archived or deprecated surfaces.

- **Create:** `frontend/src/store/appStateCompat.ts`
  - Explicit compatibility home for composite `appState` access if still required during migration.
- **Create:** `frontend/src/ui/metaBar.ts`
  - Canonical owner for `setMetaText()` and `buildMetaBar()`.
- **Modify:** `frontend/src/state.ts`
  - Shrink or remove once helpers have canonical homes.
- **Modify:** `frontend/src/utils/seriesColors.ts`
  - Own active series-color helpers instead of relying on `state.ts`.
- **Modify:** `frontend/src/chart/DataChart.ts`
- **Modify:** `frontend/src/chart/chartOverlays.ts`
- **Modify:** `frontend/src/chart/colorScale.ts`
- **Modify:** `frontend/src/ui/toolbar.ts`
- **Modify:** `frontend/src/ui/profile.ts`
- **Modify:** `frontend/src/ui/upload.ts`
- **Modify:** `frontend/src/ui/settingsPanel.ts`
- **Modify:** `frontend/src/ui/analysisStatus.ts`
- **Modify:** `frontend/src/ui/dataMutationModals.ts`
- **Modify:** `frontend/src/ui/exportControls.ts`
- **Modify:** `frontend/src/ui/viewport.ts`
- **Modify:** `frontend/src/utils/session.ts`
- **Modify:** `frontend/src/utils/provenance.ts`
- **Modify:** `frontend/src/bootstrap/analyticsOverlay.ts`
- **Modify:** `frontend/src/pages/timeseriesPage.ts`
- **Modify:** `frontend/src/pages/fftPage.ts`
- **Modify:** `frontend/src/pages/spectrogramPage.ts`
- **Modify:** `frontend/src/scatter/scatterPage.ts`
- **Modify:** `frontend/src/scatter/state.ts`
- **Modify:** `frontend/src/scatter/rendering.ts`
  - Remove active imports from `state.ts` by using canonical state/helper modules directly.

- **Create:** `frontend/src/features/timeseries/actions.ts`
  - Canonical home for dataset search input wiring and global Timeseries actions.
- **Modify:** `frontend/src/features/timeseries/entrypoint.ts`
  - Own all feature-level Timeseries setup.
- **Modify:** `frontend/src/features/timeseries/columnsController.ts`
  - Remain the canonical column UI owner.
- **Modify:** `frontend/src/app.ts`
- **Modify:** `frontend/src/app/shell.ts`
  - Import canonical Timeseries modules directly.
- **Modify:** `frontend/src/ui/columns.ts`
- **Modify:** `frontend/src/bootstrap/timeseriesBootstrap.ts`
  - Retire from the live architecture after migration.

- **Modify:** `frontend/src/bootstrap/appShell.ts`
- **Modify:** `frontend/src/bootstrap/pageLoaders.ts`
  - Retire from the live boot path after `app.ts` imports directly from `app/`.

- **Modify:** `frontend/src/components/atoms/Button.ts`
- **Modify:** `frontend/src/components/atoms/Chip.ts`
- **Modify:** `frontend/src/components/atoms/ColorInput.ts`
- **Modify:** `frontend/src/components/atoms/IconButton.ts`
- **Modify:** `frontend/src/components/atoms/Select.ts`
- **Modify:** `frontend/src/components/atoms/TextInput.ts`
- **Modify:** `frontend/src/components/molecules/ColorBySelect.ts`
- **Modify:** `frontend/src/components/molecules/ModalFrame.ts`
- **Modify:** `frontend/src/components/molecules/RangeChip.ts`
- **Modify:** `frontend/src/components/molecules/RangeSlider.ts`
- **Modify:** `frontend/src/components/molecules/SeriesChip.ts`
- **Modify:** `frontend/src/components/organisms/ColumnFilterModal.ts`
- **Modify:** `frontend/src/components/organisms/ColumnSelector.ts`
- **Modify:** `frontend/src/components/organisms/RangeControls.ts`
  - Remove from the live source tree after archiving the deprecated component facade.

- **Create:** `frontend/src/legacy/components/...`
- **Create:** `frontend/src/legacy/state.ts`
- **Create:** `frontend/src/legacy/ui/columns.ts`
- **Create:** `frontend/src/legacy/bootstrap/appShell.ts`
- **Create:** `frontend/src/legacy/bootstrap/pageLoaders.ts`
- **Create:** `frontend/src/legacy/bootstrap/timeseriesBootstrap.ts`
  - Archived source snapshots preserved for reference only.

### Task 1: Establish The Legacy Archive Boundary

**Files:**
- Create: `frontend/src/legacy/README.md`
- Modify: `tsconfig.json`
- Modify: `scripts/check-frontend-architecture.mjs`
- Create: `ai/frontend/refactor/2026-05-30-broad-frontend-consolidation.md`
- Modify: `ai/README.md`

- [ ] **Step 1: Create the archive policy document**

Create `frontend/src/legacy/README.md` with a short explicit policy:

```md
# Legacy Frontend Archive

This directory stores archived frontend implementations preserved for reference.

- Do not import from `frontend/src/legacy/` in live runtime code.
- Files here are excluded from normal typechecking and architecture validation.
- If logic needs to return to the live app, reintroduce it through canonical modules under `app/`, `features/`, `pages/`, `services/`, `store/`, `ui/`, or `utils/`.
```

- [ ] **Step 2: Exclude the archive from TypeScript**

Update `tsconfig.json`:

```json
{
  "exclude": [
    "node_modules",
    "target",
    "frontend/src/legacy/**"
  ]
}
```

- [ ] **Step 3: Add architecture rules for archived and deprecated surfaces**

Extend `scripts/check-frontend-architecture.mjs` so it:

- skips files under `frontend/src/legacy/`
- fails if a live file imports from `legacy/`
- fails if a live file imports from `components/`
- fails if a live file imports from `state.ts`
- fails if a live file imports from `ui/columns.ts`
- fails if a live file imports from `bootstrap/appShell.ts`
- fails if a live file imports from `bootstrap/pageLoaders.ts`
- fails if a live file imports from `bootstrap/timeseriesBootstrap.ts`

Suggested guard shape:

```js
const isLegacy = rel.startsWith('frontend/src/legacy/');
if (isLegacy) continue;

function checkDeprecatedImports(pattern, message) {
  const importRe = /from\s+['"]([^'"]+)['"]/g;
  for (const match of text.matchAll(importRe)) {
    if (pattern.test(match[1])) add(file, message, lineOf(text, match.index ?? 0));
  }
}
```

- [ ] **Step 4: Add the AI planning note**

Create `ai/frontend/refactor/2026-05-30-broad-frontend-consolidation.md` covering:

- canonical live surfaces
- archived surfaces
- migration order
- validation rules

Use this outline:

```md
# Broad Frontend Consolidation

## Live Surfaces
## Archived Surfaces
## Migration Waves
## Validation Rules
## Open Risks
```

- [ ] **Step 5: Add a pointer from `ai/README.md`**

Append a short section:

```md
## Planning Notes

- `ai/frontend/refactor/2026-05-30-broad-frontend-consolidation.md` — target architecture and migration order for the legacy-archive refactor.
```

- [ ] **Step 6: Run validation**

Run: `npm run validate`
Expected: PASS with the new archive exclusion and no active imports from blocked surfaces yet, or fail only on known migration targets that Task 2+ will remove.

### Task 2: Extract A Canonical State Compatibility Surface And Drain `state.ts`

**Files:**
- Create: `frontend/src/store/appStateCompat.ts`
- Create: `frontend/src/ui/metaBar.ts`
- Modify: `frontend/src/utils/seriesColors.ts`
- Modify: `frontend/src/state.ts`
- Modify: `frontend/src/app.ts`
- Modify: `frontend/src/pages/timeseriesPage.ts`
- Modify: `frontend/src/pages/fftPage.ts`
- Modify: `frontend/src/pages/spectrogramPage.ts`
- Modify: `frontend/src/bootstrap/analyticsOverlay.ts`
- Modify: `frontend/src/ui/toolbar.ts`
- Modify: `frontend/src/ui/profile.ts`
- Modify: `frontend/src/ui/upload.ts`
- Modify: `frontend/src/ui/settingsPanel.ts`
- Modify: `frontend/src/ui/analysisStatus.ts`
- Modify: `frontend/src/ui/exportControls.ts`
- Modify: `frontend/src/ui/viewport.ts`
- Modify: `frontend/src/ui/dataMutationModals.ts`
- Modify: `frontend/src/chart/DataChart.ts`
- Modify: `frontend/src/chart/chartOverlays.ts`
- Modify: `frontend/src/chart/colorScale.ts`
- Modify: `frontend/src/utils/session.ts`
- Modify: `frontend/src/utils/provenance.ts`
- Modify: `frontend/src/scatter/scatterPage.ts`
- Modify: `frontend/src/scatter/state.ts`
- Modify: `frontend/src/scatter/rendering.ts`

- [ ] **Step 1: Introduce explicit canonical homes**

Create `frontend/src/store/appStateCompat.ts`:

```ts
export { appStateComposite as appState } from './index.js';
```

Create `frontend/src/ui/metaBar.ts`:

```ts
import { appState } from '../store/appStateCompat.js';

export function setMetaText(text: string): void {
    const el = document.getElementById('stat-rows');
    if (el) el.textContent = text;
}

export function buildMetaBar(metadata: { total_rows?: number } | null): void {
    const rows = metadata?.total_rows?.toLocaleString() ?? '—';
    const cols = metadata ? String(appState.numericCols?.length ?? 0) : '—';
    const markup = `
      <div class="meta-stat live"><strong>${rows}</strong> rows</div>
      <div class="meta-stat"><strong>${cols}</strong> numeric series</div>
    `;
    document.getElementById('header-meta')?.replaceChildren();
    document.getElementById('timeseries-meta-bar')?.replaceChildren();
}
```

- [ ] **Step 2: Move active imports off `state.ts`**

Replace imports like:

```ts
import { appState, buildAdaptiveLineY, SERIES_COLORS } from '../state.js';
```

with canonical imports such as:

```ts
import { appState } from '../store/appStateCompat.js';
import { buildAdaptiveLineY } from '../services/timeseries/filtering.js';
import { SERIES_COLORS, getSeriesColor, normalizeSeriesColor } from '../utils/seriesColors.js';
```

Use `frontend/src/state.ts` only as a temporary migration checkpoint if a module cannot be moved in the same change.

- [ ] **Step 3: Shrink `state.ts` to zero live responsibilities**

Once imports are migrated, either remove `frontend/src/state.ts` from the live tree or reduce it to a file that is no longer imported by runtime code.

Expected end-state:

```ts
// No live runtime imports should remain.
export {};
```

or delete it after archiving in Task 5.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- frontend/src/store/store.test.ts frontend/src/state.test.ts frontend/src/utils/session.test.ts frontend/src/pages/fftPage.test.ts`
Expected: PASS

- [ ] **Step 5: Run import smoke check**

Run: `rg -n "from ['\\\"].*state\\.js['\\\"]" frontend/src`
Expected: only archived files or transitional test fixtures remain.

### Task 3: Make Timeseries Feature Modules The Only Active Owner

**Files:**
- Create: `frontend/src/features/timeseries/actions.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.ts`
- Modify: `frontend/src/features/timeseries/columnsController.ts`
- Modify: `frontend/src/app.ts`
- Modify: `frontend/src/app/shell.ts`
- Modify: `frontend/src/ui/columns.ts`
- Modify: `frontend/src/bootstrap/timeseriesBootstrap.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.test.ts`
- Modify: `frontend/src/features/timeseries/columnsController.test.ts`

- [ ] **Step 1: Extract Timeseries action wiring into the feature**

Create `frontend/src/features/timeseries/actions.ts`:

```ts
export interface TimeseriesActionDeps {
    rebuildColumnToggles: () => void;
    renderColumnProfilesGrid: (force?: boolean) => void;
    buildRangeControls: () => void;
    renderCurrentData: () => void;
    fetchAndRender: () => Promise<void>;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    emitChartRangeChange: (sourceKind?: string) => void;
    registerCleanup: (cleanup: () => void) => void;
}

export function initDatasetSearchInputs(deps: Pick<TimeseriesActionDeps, 'rebuildColumnToggles' | 'renderColumnProfilesGrid'>): void {}
export function initTimeseriesActions(deps: TimeseriesActionDeps): void {}
```

- [ ] **Step 2: Move `entrypoint.ts` to the canonical import surface**

Update `frontend/src/features/timeseries/entrypoint.ts`:

```ts
import { initDatasetSearchInputs, initTimeseriesActions } from './actions.js';
import { buildColumnToggles, buildRangeControls, initColumnFilterModal } from './columnsController.js';
```

The entrypoint should own all feature-level Timeseries initialization instead of delegating through `ui/columns.ts` and `bootstrap/timeseriesBootstrap.ts`.

- [ ] **Step 3: Update app boot call sites**

Replace:

```ts
import { buildColumnToggles, buildRangeControls, initColumnFilterModal } from './ui/columns.js';
import { initDatasetSearchInputs, initTimeseriesActions } from './bootstrap/timeseriesBootstrap.js';
```

with:

```ts
import { createTimeseriesEntrypoint } from './features/timeseries/entrypoint.js';
```

and let the entrypoint expose the required hooks.

- [ ] **Step 4: Retire the old live wrappers**

Once active imports are removed, archive:

- `frontend/src/ui/columns.ts`
- `frontend/src/bootstrap/timeseriesBootstrap.ts`

Do not keep them in the live import graph.

- [ ] **Step 5: Run focused Timeseries tests**

Run: `npm test -- frontend/src/features/timeseries/entrypoint.test.ts frontend/src/features/timeseries/columnsController.test.ts frontend/src/pages/timeseriesLayout.test.ts`
Expected: PASS

### Task 4: Remove Deprecated Component And Bootstrap Facades From The Live Tree

**Files:**
- Modify: `frontend/src/app.ts`
- Modify: `frontend/src/bootstrap/appShell.ts`
- Modify: `frontend/src/bootstrap/pageLoaders.ts`
- Modify: `frontend/src/components/atoms/Button.ts`
- Modify: `frontend/src/components/atoms/Chip.ts`
- Modify: `frontend/src/components/atoms/ColorInput.ts`
- Modify: `frontend/src/components/atoms/IconButton.ts`
- Modify: `frontend/src/components/atoms/Select.ts`
- Modify: `frontend/src/components/atoms/TextInput.ts`
- Modify: `frontend/src/components/molecules/ColorBySelect.ts`
- Modify: `frontend/src/components/molecules/ModalFrame.ts`
- Modify: `frontend/src/components/molecules/RangeChip.ts`
- Modify: `frontend/src/components/molecules/RangeSlider.ts`
- Modify: `frontend/src/components/molecules/SeriesChip.ts`
- Modify: `frontend/src/components/organisms/ColumnFilterModal.ts`
- Modify: `frontend/src/components/organisms/ColumnSelector.ts`
- Modify: `frontend/src/components/organisms/RangeControls.ts`

- [ ] **Step 1: Remove live imports from deprecated facades**

Run:

```bash
rg -n "components/|bootstrap/appShell|bootstrap/pageLoaders" frontend/src
```

Replace any remaining matches so live code imports directly from:

- `frontend/src/ui/*`
- `frontend/src/app/shell.ts`
- `frontend/src/app/pageRegistry.ts`

- [ ] **Step 2: Archive the deprecated trees**

Use `git mv` to preserve history:

```bash
git mv frontend/src/components frontend/src/legacy/components
git mv frontend/src/bootstrap/appShell.ts frontend/src/legacy/bootstrap/appShell.ts
git mv frontend/src/bootstrap/pageLoaders.ts frontend/src/legacy/bootstrap/pageLoaders.ts
```

- [ ] **Step 3: Keep the canonical app imports explicit**

`frontend/src/app.ts` should import:

```ts
import { initAppShell } from './app/shell.js';
import {
    clearLoadedPageModules,
    ensurePageModuleLoaded,
    isMetadataReady,
    markMetadataReady,
} from './app/pageRegistry.js';
```

No live import should pass through archived bootstrap adapters.

- [ ] **Step 4: Run architecture validation**

Run: `npm run validate`
Expected: PASS with no active imports from `components/` or archived bootstrap facades.

### Task 5: Archive Deprecated Source Files After Live Imports Reach Zero

**Files:**
- Create: `frontend/src/legacy/state.ts`
- Create: `frontend/src/legacy/ui/columns.ts`
- Create: `frontend/src/legacy/bootstrap/timeseriesBootstrap.ts`
- Create: `frontend/src/legacy/bootstrap/appShell.ts`
- Create: `frontend/src/legacy/bootstrap/pageLoaders.ts`
- Create: `frontend/src/legacy/components/...`
- Modify: `frontend/src/state.ts`
- Modify: `frontend/src/ui/columns.ts`
- Modify: `frontend/src/bootstrap/timeseriesBootstrap.ts`

- [ ] **Step 1: Verify the live import graph is clean before archiving**

Run:

```bash
rg -n "state\\.js|ui/columns\\.js|bootstrap/timeseriesBootstrap\\.js|components/" frontend/src
```

Expected: only files being archived or tests intentionally covering migration behavior.

- [ ] **Step 2: Move the deprecated implementations into `legacy/`**

Use `git mv`:

```bash
git mv frontend/src/state.ts frontend/src/legacy/state.ts
git mv frontend/src/ui/columns.ts frontend/src/legacy/ui/columns.ts
git mv frontend/src/bootstrap/timeseriesBootstrap.ts frontend/src/legacy/bootstrap/timeseriesBootstrap.ts
```

If the live tree still needs a small compatibility file for a staged migration, recreate a minimal facade with an explicit deprecation comment and no unique logic.

- [ ] **Step 3: Re-run the smoke check**

Run:

```bash
rg -n "from ['\\\"].*(legacy|components|state|ui/columns|bootstrap/timeseriesBootstrap)" frontend/src
```

Expected: no live runtime matches outside approved temporary shims.

- [ ] **Step 4: Commit the archive move**

```bash
git add frontend/src/legacy frontend/src
git commit -m "refactor: archive deprecated frontend surfaces"
```

### Task 6: Full Verification And Documentation Sync

**Files:**
- Modify: `ai/frontend/refactor/2026-05-30-broad-frontend-consolidation.md`
- Modify: `docs/developer/frontend.md`
- Modify: `docs/superpowers/plans/2026-05-30-broad-frontend-consolidation-and-legacy-archive.md`

- [ ] **Step 1: Update the AI planning note with implementation status**

After each completed wave, revise:

```md
## Migration Status
- Completed:
- Remaining:
- Validation:
```

Keep the note truthful: planned vs completed work must be distinguishable.

- [ ] **Step 2: Run the final targeted test suite**

Run:

```bash
npm test -- frontend/src/features/timeseries/entrypoint.test.ts frontend/src/pages/shared/analysisPageRuntime.test.ts frontend/src/pages/fftPage.test.ts frontend/src/pages/heatmapPage.test.ts frontend/src/pages/spectrogramPage.test.ts frontend/src/store/store.test.ts
```

Expected: PASS

- [ ] **Step 3: Run the final architecture and typecheck validation**

Run:

```bash
npm run check:frontend
npm run validate
```

Expected: both PASS

- [ ] **Step 4: Run the final import audit**

Run:

```bash
rg -n "components/|legacy/|state\\.js|ui/columns\\.js|bootstrap/appShell\\.js|bootstrap/pageLoaders\\.js|bootstrap/timeseriesBootstrap\\.js" frontend/src
```

Expected: no live-runtime matches outside archived files or intentionally documented temporary facades.

