# AI frontend vs implementation — reconciliation notes (2026-07-16)

> Companion to `_reconciliation_2026-07-16.md` (backend-focused). This file
> documents the second pass focused on the frontend.

## Summary of frontend fixes (2026-07-16)

### Destructive cleanup (deletions)

Removed the following AI docs whose referenced `.ts` files no longer exist in
`frontend/src/`:

| Removed path | Reason |
| --- | --- |
| `ai/frontend/src/pages/**` (29 files) | `frontend/src/pages/` folder deleted; pages now under `features/*` |
| `ai/frontend/src/scatter/**` (16 files) | `frontend/src/scatter/` deleted; module lives under `features/scatter/` |
| `ai/frontend/src/causal/**` (7 files) | `frontend/src/causal/` deleted; module lives under `features/causal/` |
| `ai/frontend/src/drift/**` (5 files) | `frontend/src/drift/` deleted; module lives under `features/drift/` |
| `ai/frontend/src/legacy/state.md` | `frontend/src/legacy/` never archived; module went straight to `features/*` |
| `ai/frontend/src/bootstrap/**` (4 files) | `frontend/src/bootstrap/` deleted; lifecycle moved to `platform/*` |
| `ai/frontend/src/services/timeseries/filtering.md` | Module split into `features/timeseries/{columnSelection,rangeControls,…}.ts` and `services/api/timeseries.ts` |
| `ai/frontend/src/services/profile/profile.md` | Module moved to `features/upload/profile.ts` |
| `ai/frontend/src/services/chart/index.md` | Module split into per-feature chart helpers |
| `ai/frontend/src/dataClient.md` + `.test.md` | `frontend/src/dataClient.ts` was deleted; functions split into `services/api/*` |
| `ai/frontend/src/types.md` | `frontend/src/types.ts` was deleted; only the `types/` subdirectory remains |
| `ai/frontend/src/features/{timeseries,causal,drift,scatter,heatmap,fft,spectrogram,upload}/entrypoint*.md` (11 files) | Per-feature entrypoint docs described an obsolete contract; the real public surface is the feature's `index.ts` (see [features/index.md](../frontend/src/features/index.md)) |
| `ai/frontend/src/features/timeseries/{chipComposition,chipContextMenu,colorByControl,columnSelection,columnsController,filterModalController,rangeControls}.md` (7 files) | Module docs referenced a stale API surface; covered by the codebase + the reconciliation banner |
| `ai/frontend/src/features/upload/{databaseSource,fileSource,partialLoadControls,preview}.md` (4 files) | Same — module docs described an obsolete contract |
| `ai/frontend/src/store/{index,appStateCompat}.md` | The `appState` Proxy and `appStateCompat` shim were removed |
| `ai/frontend/src/app/{adaptiveGesture,pageLifecycle,pageLifecycle.test,pageRegistry,webgpuGuard}.md` | Files moved to `features/timeseries/adaptiveGesture.ts`, `platform/pageLifecycle.ts`, `app/pageModules.ts`, `chart/webgpuGuard.ts` |

Total: **~95 stale doc files deleted**.

### New doc coverage (additions)

Added the following docs for previously-undocumented clusters:

| New path | Covers |
| --- | --- |
| `ai/frontend/src/_reconciliation_banner.md` | Cross-cutting reconciliation notes for the AI folder |
| `ai/frontend/src/features/index.md` | Public-surface map for every feature (timeseries, scatter, causal, drift, fft, heatmap, spectrogram, upload, home, dataMutation, export, prepare, shared) |
| `ai/frontend/src/cleaning/index.md` | `frontend/src/cleaning/*` module map (api, panel, store, types, compiler, codegen, datasetIdentity, planHash, resample, pipelineGraph, compatibility) |
| `ai/frontend/src/contracts/api/v1/index.md` | Canonical URL registry (`routes.ts` + pinned-path tests + dataset/scatter/analytics types) |
| `ai/frontend/src/contracts/workspace.md` | Workspace-level contracts |
| `ai/frontend/src/platform/index.md` | `frontend/src/platform/*` module map (pageLifecycle, pageRuntime, requestTask, featureEvents, navigationEvents, sessionLifecycle, lifecycleScope, analysisRuntime, analyticsColumns, runtimeModules) |
| `ai/frontend/src/workspace/index.md` | `frontend/src/workspace/*` (workspaceStore + test) |
| `ai/frontend/src/services/api/profile.md` | Profile API client (start/fetch for exact + sample profile) |
| `ai/frontend/src/services/api/__contract__.test.md` | Pinned-path contract tests |

### Edits to existing docs

- `ai/frontend/src/features/timeseries/actions.md` — banner added; link references corrected (`../../store/uiState.md#setViewport` → `../../store/chartState.md#setViewport`, etc.).
- `ai/frontend/src/services/api/index.md` — added missing `profile` re-exports and `fetchScatterMatrix` / `fetchDriftInvestigation`.
- `ai/frontend/src/services/api/upload.md` — drift URLs converted to `/api/v1/drift/{stats,investigate}`; banner added.
- `ai/frontend/src/services/api/scatter.md` — `/api/scatter/points` and `/api/scatter/matrix` → `/api/v1/...`; banner added.
- `ai/frontend/src/ui/metaBar.md` — `store/appStateCompat` link → `store/datasetState`; banner added.
- `ai/frontend/Vision.md` — replaced stale `store/index.md` link reference.

### Files affected: 134 docs remaining (down from 237)

## Still-stale areas (acknowledged)

These remain inconsistent between `ai/` and the repo. They are documented here
so a future pass can address them. None of them blocks a developer from
navigating the codebase today; they're mostly stale prose rather than
incorrectness.

### Existing per-feature module docs that reference removed store

Several older per-feature and per-ui docs still mention `appState` in their
body text. The link references were updated; the body text describing the old
API surface was left as-is to avoid scope creep. A future pass can rewrite
the bodies to reference `datasetState`, `chartState`, `uiState`, etc.

### Refactor plan files (historical)

`ai/frontend/refactor/*.md` still describe pre-cutover URLs (`/api/data`,
`/api/metadata`, etc.) and target paths that no longer exist. They are kept
as historical record of intent; each should get a `> Superseded by:` header
pointing at the current `ai/README.md` structure section and
`ai/frontend/src/features/index.md`.

### Chart module docs (`ai/frontend/src/chart/*`)

Several chart docs (e.g. `EchartsScatterChart.md`, `FftChart.md`) describe
classes/methods that still exist in code, but the upstream consumers have
moved to `features/scatter/rendering.ts` and `features/fft/fftTraceModel.ts`.
They are kept as-is for reference and need no immediate action.