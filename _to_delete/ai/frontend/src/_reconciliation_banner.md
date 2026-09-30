# AI frontend — reconciliation notes (2026-07-16)

> Cross-cutting notes for AI agents. The frontend has been heavily refactored
> since most of these docs were written. The following changes affect many docs
> in this folder:

## Store layout

The legacy composite `appState` Proxy at `frontend/src/store/index.ts` and its
compat shim at `frontend/src/store/appStateCompat.ts` were **removed**.

Sub-state modules live as flat siblings in `frontend/src/store/`:
- `chartState.ts` — chart viewport, zoom history, chart text, stack-from-zero
- `uiState.ts` — filter text, adaptive filter column, series colors, profile grid state, preview state
- `datasetState.ts` — metadata, numeric cols, column profiles, dataset revision
- `analyticsState.ts` — rolling / anomaly / spectral-filter preview state
- `scatterState.ts` — scatter page state (view, drag, color, points, etc.)
- `events.ts` — `emitStoreEvent`, `subscribe`, `unsubscribe`, `clearSubscribers`

Code that did `appState.adaptiveFilterColumn` now does
`uiState.adaptiveFilterColumn` (or imports the corresponding setter).
Code that did `appState.setMetadata` now does `setMetadata(dataset, ...)` from
`./datasetState.js`.

See per-doc "Reconciled" notes for the specific mapping.

## File relocations

| Old path | New path |
| --- | --- |
| `frontend/src/app/adaptiveGesture.ts` | `frontend/src/features/timeseries/adaptiveGesture.ts` |
| `frontend/src/app/pageLifecycle.ts` | `frontend/src/platform/pageLifecycle.ts` |
| `frontend/src/app/pageRegistry.ts` | `frontend/src/app/pageModules.ts` |
| `frontend/src/app/webgpuGuard.ts` | `frontend/src/chart/webgpuGuard.ts` |

## Removed folders

The following folders no longer exist; their docs were deleted:
- `frontend/src/pages/` (pages now in `features/*`)
- `frontend/src/scatter/` (→ `features/scatter/`)
- `frontend/src/causal/` (→ `features/causal/`)
- `frontend/src/drift/` (→ `features/drift/`)
- `frontend/src/bootstrap/` (migrated into `app/` and `features/*`)
- `frontend/src/legacy/` (never archived)
- `frontend/src/services/timeseries/` (→ `services/api/timeseries.ts`)
- `frontend/src/services/profile/` (→ `features/upload/profile.ts`)
- `frontend/src/services/chart/` (→ `features/*` chart modules)

## API base path

All frontend URLs use the `/api/v1` prefix. There is no `/api` alias.

