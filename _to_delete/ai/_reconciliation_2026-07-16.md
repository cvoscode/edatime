# AI folder vs implementation — reconciliation notes

> This file tracks known divergences between `ai/` and the actual codebase, and what was fixed in the 2026-07-16 reconciliation pass.

## Summary of fixes (2026-07-16)

### Backend (Rust)

| File | Change |
| --- | --- |
| `ai/crates/edatime-service/src/handlers/routes/mod.md` | Replaced the obsolete "Registers `/api` routes" overview with the full current route table mounted under `/api/v1`. |
| `ai/crates/edatime-service/src/handlers/routes/data.md` | Documented the missing `POST /api/v1/data` handler and `PlanAwareDataQuery`. |
| `ai/crates/edatime-service/src/handlers/routes/{upload,config,drift,aggregate,metrics,export,metadata}.md` | Rewrote every endpoint URL from `/api/...` to `/api/v1/...`. |
| `ai/crates/edatime-service/src/handlers/scatter/{matrix,scatter/points,scatter/export,scatter/correlations}.md` | Same: `/api` → `/api/v1`. Also fixed the duplicate `scatter/scatter/` path note. |
| `ai/crates/edatime-bin/src/main.md` | Replaced "Mounts at `/api` and `/api/v1`" with "Mounts at `/api/v1` (single canonical mount; no `/api` alias)". |
| `ai/crates/edatime-service/src/lib.md` | Added `streaming_export` module; clarified the `routes` alias. |
| `ai/crates/edatime-store/src/lib.md` | Added missing modules: `artifacts`, `jobs`, `versions`. |
| `ai/crates/edatime-store/src/state.md` | Rewrote `AppState` to match the real struct: added `dataset_versions`, `artifact_store`, `jobs`, `profile_cache`; removed obsolete `drift_cache`; updated method signatures (added version/artifact/profile-cache methods; marked several methods `async`). |
| `ai/crates/edatime-store/src/cache.md` | Updated `CorrelationMatrixCacheEntry` to include all six raw+diff matrices (Pearson/Spearman/Kendall). Updated `CachedResponse` to the real refcounted `Arc<Bytes>` shape and added `ResponseCache` (TTL + revision-based invalidation). Removed the obsolete `DriftCache` alias. |
| `ai/crates/edatime-query/src/lib.md` | Added missing modules: `temporal`, `cleaning`, `derived`. |

### API contract

| File | Change |
| --- | --- |
| `ai/contract.md` | Added the entire missing families: Cleaning (9 endpoints), Jobs (3), Datasets (3), Profile (4), Config (2), Aggregate (1), Database columns (1), Health & Metrics (2). |

### Frontend (TypeScript)

| File | Change |
| --- | --- |
| `ai/README.md` (project structure) | Replaced the obsolete tree (which listed `pages/`, `state.ts`, `bootstrap/`, `scatter/`, `causal/`, `drift/`, `components/`) with the current tree (which lists `cleaning/`, `contracts/`, `platform/`, `workspace/`, flat `store/` sub-states). Added a "Last reconciled" banner and a note about legacy removed folders. |
| `ai/frontend/src/store/uiState.md` | Rewrote to match the current flat sub-state: removed obsolete `selectedCols`, `columnRanges`, `adaptiveLineFilters`, `selectedColorColumn`; added `profileFilterCategory` (per `usage_issue.md §6.6`). |
| `ai/frontend/src/services/api/{upload,scatter,scatter-matrix}.md` | Rewrote `/api/...` URLs to `/api/v1/...`. |
| `ai/frontend/src/drift/driftPage.md`, `frontend/src/types/api.md`, `frontend/src/scatter/matrix.md` | Same: `/api` → `/api/v1`. |

### Repository guidance

| File | Change |
| --- | --- |
| `.github/copilot-instructions.md` | **Critical fix.** The previous guidance claimed `/api/v1/*` was a backwards-compatibility alias and `/api/*` was the canonical mount. The real router (`src/main.rs:73`, `crates/edatime-bin/src/main.rs:76`) nests `api_router()` only at `/api/v1` — there is no `/api` alias. Updated all 14 endpoint references and added the missing cleaning/jobs/datasets/profile/config/database families to the backend-route inventory. |

## Still-out-of-date (acknowledged)

These remain inconsistent between `ai/` and the repo. They are tracked here so a future pass can address them.

### Refactor plan files (historical)
- `ai/frontend/refactor/2026-05-30-frontend-canonicalization-plan.md` lists pre-cutover URLs (`/api/data`, `/api/metadata`, …) and was never updated after the `/api/v1` cutover. It is now superseded by `ai/contract.md` and should be marked archived.
- `ai/frontend/refactor/2026-06-01-frontend-modularization-staged-{design,plan}.md` and `ai/frontend/refactor/2026-06-01-timeseries-ownership-and-shared-shell-{design,plan}.md` target paths (`frontend/src/pages/`, `frontend/src/services/timeseries/`, `frontend/src/pages/shared/analysisPageRuntime.ts`) that no longer exist. The work landed in `frontend/src/features/*` and `frontend/src/store/*` instead. These docs are kept as historical record of intent; they should each get a `> Superseded by:` header pointing at the current `ai/README.md` structure section.

### Stale frontend module docs (~50+)
The following AI doc paths describe files that no longer exist in the repo and should be deleted or rewritten. They live under:
- `ai/frontend/src/pages/*` (folder deleted; pages now in `frontend/src/features/*`)
- `ai/frontend/src/scatter/*` (folder deleted; scatter now in `frontend/src/features/scatter/*`)
- `ai/frontend/src/causal/*`, `ai/frontend/src/drift/*`, `ai/frontend/src/bootstrap/*` (folders deleted)
- `ai/frontend/src/store/index.md`, `appStateCompat.md`, `legacy/state.md` (files deleted)
- `ai/frontend/src/services/{timeseries,profile,chart}/*` (folders deleted)
- `ai/frontend/src/chart/{EchartsScatterChart,FftChart}.md` (files deleted)
- `ai/frontend/src/dataClient.md` (file deleted; split into `frontend/src/services/api/*`)

### Missing-from-AI real files
- `frontend/src/contracts/api/v1/*` (canonical URL registry, ~5 files)
- `frontend/src/cleaning/*` (~13 files: `api`, `panel`, `store`, `compiler`, `codegen`, `datasetIdentity`, `planHash`, `resample`, `pipelineGraph`, `compatibility`, `types`, `index`)
- `frontend/src/workspace/*`, `frontend/src/platform/*`
- Newer `features/scatter/*` files (`chartLifecycle`, `renderingDensity`, `responsePolicy`, `seriesPolicy`, `selectionZoom`, `colorbarPresentation`, `tooltipPresentation`, `matrixGrid`)
- Newer `features/timeseries/*` files (`lifecycle`, `controller`, `module`, `analyticsOverlay`, `adaptiveGesture`, `filterGesture`, `ensureReady`, `datasetBootstrap`, `fetchedWindow`, `requestIntent`, `zoomHistoryPolicy`, `selectionIntent`, `runtimeCache`)
- Newer `features/{fft,heatmap,spectrogram,causal,drift}/*` files (split per the modularization plan)

These can be regenerated module-by-module as time permits; the critical backend doc corrections above are what unblocks new agent work.