# Drift Analysis Page

**Page ID:** `drift`  
**Route:** `#page=drift`  
**Frontend entrypoint:** `frontend/src/features/drift/index.ts`
**Page controller:** `frontend/src/features/drift/page.ts`
**Backend route:** `POST /api/v1/drift/stats`

## Purpose

The drift page compares a chosen reference interval against later monitoring windows for one or more numeric columns. It is designed to answer:

- does any selected trace drift after the baseline period?
- which columns drift most strongly?
- which windows triggered the drift verdict?

The page uses a composite decision instead of PSI alone. Each window can trigger:

- `psi_minor`
- `psi_major`
- `wasserstein`
- `ks`
- `es`

The backend converts those triggers into `green`, `yellow`, or `red` severity and returns the reasons with each window.

## Real Compute Contract

The drift page does **not** call a page-local compute route. The real contract is:

```http
POST /api/v1/drift/stats
Content-Type: application/json
```

Request body:

```json
{
  "column": "HUFL",
  "window": "daily",
  "referenceStart": "2025-01-01T00:00:00.000Z",
  "referenceEnd": "2025-01-15T00:00:00.000Z",
  "ksPvalueThreshold": 0.05,
  "esPvalueThreshold": 0.05,
  "psiMinorThreshold": 0.10,
  "psiMajorThreshold": 0.20,
  "wassersteinStdMultiplier": 0.10
}
```

Important behavior:

- the frontend issues **one request per selected column**
- `referenceStart` / `referenceEnd` are camelCase on the wire
- the route remains `/api/v1/drift/stats`
- the backend returns all later windows; the frontend can filter them for evaluation modes like `latest` or `latest-n`

## Backend Output

The backend response is `DriftResponse` from `crates/edatime-service/src/analytics/drift.rs`.

Relevant fields:

- `reference`
- `windows[]`
- `thresholds`
- `metadata`

Each window includes:

- distribution stats and exact `start_ms` / `end_ms`
- `ks_stat`, `ks_pvalue`
- `es_stat`, `es_pvalue`
- `wasserstein`
- `psi`
- `jensen_shannon`
- `trigger_reasons`
- `completeness_delta`
- `drift_level`
- `low_sample_warning`

## Frontend Flow

`frontend/src/features/drift/page.ts` owns the page workflow:

1. read selected columns and reference settings
2. POST `/api/v1/drift/stats` once per column
3. keep raw per-column responses
4. apply frontend-side evaluation mode filtering
5. render:
   - summary strip
   - per-column cards
   - timeline chart
   - detail chart
   - detail stats
   - window list

Supporting modules:

- `frontend/src/features/drift/controls.ts` handles picker, reference presets, viewport baseline, exports, shortcuts
- `frontend/src/features/drift/viewModels.ts` formats tooltips, stats, summaries, and filtered window sets
- `frontend/src/features/drift/timelineView.ts` renders the multi-column timeline
- `frontend/src/features/drift/detailView.ts` renders the single-column detail view and list
- `frontend/src/features/drift/selection.ts` stores the active filtered response state

## Current UI Contract

The page exposes:

- column multi-select
- hourly / daily / weekly monitoring windows
- box / density area / ECDF / histogram detail views
- reference source presets including `Current viewport`
- evaluation modes:
  - `All later windows`
  - `Latest window only`
  - `Latest N windows`
- advanced thresholds for PSI, KS, E-S, and Wasserstein standard-deviation multiplier
- timeline/detail/CSV/JSON exports

## Notes for Future Work

- update the generated API contract whenever the route or request fields change
- prefer page-local drift UI changes over introducing a shared analytics abstraction
- if drift verdict rules change, update both `crates/edatime-service/src/analytics/drift.rs` and `frontend/src/features/drift/viewModels.ts` copy together so the UI never misstates the contract
