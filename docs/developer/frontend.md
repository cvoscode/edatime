# Frontend Architecture

## Entry Points And Build Outputs

The editable frontend source lives under `frontend/src/`.

The browser loads:

- `crates/edatime-bin/frontend/dist/index.html`
- hashed JavaScript and CSS assets from `crates/edatime-bin/frontend/dist/assets/`
- runtime-only static files copied into `crates/edatime-bin/frontend/dist/`, such as `sw.js` and `libs/`

The Node/Vite build uses `frontend/index.html` as its source HTML entry and compiles TypeScript from `frontend/src/` into the packaged browser bundle consumed by the app shell.

## Current Architecture

The frontend now follows a feature-first, page-runtime-oriented structure:

- `frontend/src/app.ts`
  - top-level composition root for startup order, Timeseries wiring, dataset bootstrap, and global runtime hooks
- `frontend/src/app/*`
  - shell bootstrap, page lifecycle, page registry, navigation, chart bootstrap, shortcuts, and WebGPU guard rails
- `frontend/src/pages/*`
  - page controllers for FFT, heatmap, spectrogram, and Timeseries
- `frontend/src/pages/shared/*`
  - shared runtime helpers such as `analysisPageRuntime.ts`, `pageRuntime.ts`, and `requestTask.ts`
- `frontend/src/features/*`
  - feature entrypoints and workflow owners for Timeseries, upload, scatter, drift, causal, FFT, heatmap, and spectrogram
- `frontend/src/scatter/*`, `frontend/src/drift/*`, `frontend/src/causal/*`
  - page-local subsystems for the larger analytics surfaces
- `frontend/src/services/api/*`
  - the only transport boundary; owns fetch calls, response handling, and payload parsing
- `frontend/src/ui/*`
  - rendering surfaces, shared controls, empty-state helpers, export helpers, and composites
- `frontend/src/store/*`
  - focused sub-states (`chartState`, `datasetState`, `uiState`, `analyticsState`, `scatterState`, `runtimeState`) plus `appStateCompat.ts` for the composite `appState` re-export

## Legacy Archive

`frontend/src/legacy/` is a **reference-only archive** of deprecated frontend
implementations. It is excluded from the TypeScript build, the architecture
checker, the dev server, and the production bundle. Do not import from it in
new code, and do not add new files there without updating the archive policy
in `frontend/src/legacy/README.md`.

The archive currently contains:

- `legacy/components/` — deprecated atoms/molecules/organisms
- `legacy/bootstrap/{appShell,pageLoaders,timeseriesBootstrap}.ts` — deprecated
  app boot wrappers
- `legacy/state.ts` — copy of the pre-refactor composite state module, kept for
  historical reference (the live tree imports composite state via
  `store/appStateCompat.js`)
- `legacy/ui/columns.ts` — pre-refactor column UI wrapper

The live tree's compat surface for these archives is:

- `store/appStateCompat.ts` — re-exports the composite `appState` for legacy
  importers
- `features/timeseries/columnsController.ts` — replaces the old `ui/columns.ts`
- `app/shell.ts` and `app/pageRegistry.ts` — replace the old
  `bootstrap/appShell.ts` and `bootstrap/pageLoaders.ts`
- `features/timeseries/entrypoint.ts` — replaces `bootstrap/timeseriesBootstrap.ts`
- `ui/metaBar.ts` — canonical owner of `setMetaText` / `buildMetaBar`

## Boot Sequence

`frontend/src/app.ts` remains the main entrypoint, but major boot responsibilities are now split across focused modules:

- `app/shell.ts` and `app/shell/*`
  - theme, accessibility normalization, home navigation, sample datasets
- `app/bootstrap/chartBootstrap.ts`
  - lazy chart module loading and chart-type registration
- `app/bootstrap/globalShortcuts.ts`
  - keyboard shortcuts and command wiring
- `app/pageModules.ts`
  - lazy page entrypoint loading
- `app/pageRegistry.ts`
  - metadata/page readiness tracking

## Page Model

The app still uses a single-page shell with hidden and visible page sections.

Runtime ownership is now more consistent:

- `pages/shared/pageRuntime.ts`
  - generic page lifecycle, status, loading, and empty-state seams
- `pages/shared/analysisPageRuntime.ts`
  - analysis-page wrapper that composes page runtime plus export binding
- `pages/shared/requestTask.ts`
  - abort-before-new async request helper used by page controllers

Important current behavior:

- the app opens on the Upload page by default
- ingest does not auto-navigate after reload
- scatter and scatter-matrix remain two views over one scatter state graph

## Key Frontend Modules

### `features/timeseries/*`

Owns Timeseries control wiring:

- chip rendering and rebuild hooks
- range/filter actions
- search inputs
- series collapse and context-menu behavior

### `pages/timeseriesPage.ts`

Owns Timeseries page orchestration:

- fetch/render flow
- empty-state policy
- viewport updates
- analytics follow-up after data renders

### `features/upload/*` and `ui/upload.ts`

Upload is now split between:

- `features/upload/*`
  - file-source logic, preview lifecycle, database source logic, partial-load helpers, upload feature entrypoint
- `ui/upload.ts`
  - DOM rendering surface and event binding facade

### `scatter/*`

Scatter is split into focused modules:

- `scatterPage.ts`
  - main orchestration and chart lifecycle
- `runtime.ts`
  - page runtime, empty state, GPU checks, filter badge
- `correlationsPanel.ts`
  - suggestion rendering and correlation refresh
- `controls.ts`
  - control event wiring
- `rendering.ts`
  - chart option building, overlays, exports, colorbar, and selection UX
- `matrix.ts`
  - matrix-view rendering and pair selection
- `state.ts`
  - scatter-specific state helpers

### `drift/*`

Drift is now split between:

- `driftPage.ts`
  - page orchestration and ECharts rendering
- `runtime.ts`
  - page runtime, export helpers, and ECharts module caching
- `viewModels.ts`
  - derived formatting, status summaries, colors, and tooltip builders
- `controls.ts`
  - drift control event wiring

### `ui/toolbar.ts`

Owns shared page-level controls:

- page switching
- zoom and export controls
- analysis control sync
- drawing tools

## Frontend Extension Guidelines

- Keep transport logic in `services/api/*`.
- Add page-specific orchestration to the relevant page controller before considering app-wide state.
- Prefer `pages/shared/*` helpers when multiple pages share lifecycle, loading, or export behavior.
- Prefer `features/*` for control/workflow wiring instead of pushing DOM policy into `app.ts`.
- Reuse shared chip, empty-state, and export helpers where behavior already matches.
