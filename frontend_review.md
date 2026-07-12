# Frontend Reimplementation Plan and Target Architecture

## Outcome

Replace `frontend_review.md` with this plan. Reimplement the application as a vanilla TypeScript frontend with explicit feature controllers, a scoped workspace store, and one versioned `/api/v1` contract. Preserve product behavior and route-level lazy loading; remove all internal compatibility code.

The implementation is deliberately sequential: each milestone starts by writing behavior tests against the current application, then replaces that seam, then proves the new implementation passes both the pre-existing characterization tests and new architecture/contract tests.

## Implementation Progress

### Completed: explicit state ownership and facade retirement

- Split all production imports away from the mutable `store/index.ts` barrel into focused chart, dataset, runtime, analytics, scatter, UI, and event modules.
- Added an architecture rule that rejects future production imports of the retired barrel.
- Migrated the characterization tests to the same direct state modules and deleted `frontend/src/store/index.ts`.
- Removed the unused upload feature entrypoint; the real upload panel/workflow remains the owner.
- Added packaged frontend asset-graph validation so the emitted HTML must reference the current Vite manifest assets.
- Fixed the upload-to-timeseries regression: default series are now seeded into the workspace before sanitation, so a fresh upload renders selected data.

Verified after each milestone with the full frontend test suite, TypeScript, architecture, bundle-budget, and packaged asset-graph gates. The last facade-retirement verification passed 1,018 frontend tests.

### Next: feature directory ownership

Move each page controller/runtime under its owning `features/<name>/` directory, beginning with timeseries. Preserve the public lifecycle contract and its current characterization tests while removing page-to-feature trampolines only when the new owner directly composes the controller, view, and lifecycle.

## Target Architecture

```text
index.html
  └─ app/bootstrap
      ├─ AppRuntime: routing, page mount/dispose, dataset lifecycle
      ├─ WorkspaceStore: dataset revision, shared selection, filters, viewport intent
      ├─ ApiClient: JSON, Arrow, uploads, downloads, typed errors, cancellation
      └─ FeatureRegistry
          ├─ dataset
          ├─ timeseries
          ├─ scatter + correlations
          ├─ fft / spectrogram
          ├─ causal / drift
          └─ shell/settings

Rust API routers  ←── contracts/api/v1 schemas + fixtures ──→  TypeScript ApiClient
```

Use this source layout:

```text
frontend/src/
  app/              boot, router, runtime, feature registry only
  contracts/        generated API DTOs and schema fixtures; never hand-edit generated types
  platform/         API client, Arrow codecs, DOM/lifecycle helpers, storage, logging
  workspace/        immutable shared state, selectors, dataset-session cancellation
  charts/           renderer adapters, interactions, overlays, export primitives
  ui/               reusable DOM primitives/composites with no feature or API imports
  features/<name>/  controller, state, view, local view-models, tests
```

Each feature exports one public controller factory:

```ts
createFeature(context).mount(root) -> {
  dispose(): void;
  onDatasetChanged(snapshot): Promise<void>;
}
```

Rules:

- `app/` composes features but never accesses page DOM, charts, or endpoints.
- `workspace/` holds only cross-feature intent, never DOM nodes, timers, chart instances, caches, or loading state.
- Feature state is private and disposable. Features interact only through `AppContext`, workspace selectors/actions, and declared feature events.
- Views query only inside their supplied root; all listeners, observers, requests, and chart instances are registered through a lifecycle scope and disposed on navigation/dataset replacement.
- Delete `appStateComposite`, `appStateCompat`, `dataClient.ts`, the monolithic `types.ts`, `legacy/`, `window.__edatime` runtime bridges, and thin `features/*/entrypoint.ts` wrappers.
- Move page implementations out of `pages/`, `scatter/`, `causal/`, and `drift/` into their owning `features/<name>/` folders.
- Split the current chart class into adapter, series/options builder, viewport interaction, legend, overlays, drawings/annotations, and export modules. Do the same controller/view-model separation for scatter and analysis pages.

## API and Contract Target

Introduce `/api/v1` only; remove the old route family after cutover.

- `GET /dataset/metadata`
- `POST /dataset/series/query` → Arrow response
- `POST /dataset/scatter/query`, `/dataset/scatter/matrix`, `/dataset/correlations/query`
- `POST /analysis/{rolling,anomalies,fft,spectrogram,causal,drift}`
- `POST /dataset/import`, `/dataset/database/*`, and explicit dataset mutation commands
- `POST /export/{csv,json,parquet}`

All JSON responses use:

```ts
{ data, dataset: { id, revision }, requestId }
```

All errors use:

```ts
{ code, message, details, requestId }
```

Arrow responses use the same dataset/request metadata through standardized `x-edatime-*` headers. The API client owns decoding, error conversion, request cancellation, deduplication, and revision checks; endpoint modules only provide typed request/response definitions.

Place the canonical OpenAPI/JSON-schema contract and representative request/response fixtures under `contracts/api/v1/`. Generate TypeScript DTOs from it and validate Rust handler payloads and responses against the same fixtures in integration tests.

## Test-First Implementation Sequence

1. **Characterize the current application**

   - Build deterministic dataset fixtures covering numeric, categorical, empty, filtered, large/downsampled, and timezone-sensitive data.
   - Add behavior tests before refactoring: metadata, series Arrow decoding, shared filters, exports, scatter/matrix queries, and every analysis request.
   - Add browser flows for upload, navigation, timeseries zoom/filter, scatter selection, exports, and each analysis page.
   - Add lifecycle tests for route change, rapid dataset replacement, request cancellation, and chart disposal.
   - Capture production bundle sizes and lazy-chunk loading as the performance baseline.

2. **Create the new contract and platform layer**

   - Write contract tests for the target `/api/v1` schema before implementing handlers.
   - Implement Rust routers/DTOs and the TypeScript `ApiClient`; test JSON, Arrow, blob, validation, structured errors, and revision races.
   - Verify existing behavior tests against the new client semantics, intentionally replacing only tests that assert retired transport shapes.

3. **Replace app runtime and shared state**

   - Write tests for route-to-feature mounting, disposal, dataset-session invalidation, and workspace selector updates.
   - Implement `AppRuntime`, `FeatureRegistry`, lifecycle scopes, and `WorkspaceStore`.
   - Remove global bridge/state use from shell boot and verify all initial/lazy navigation tests.

4. **Rebuild dataset and timeseries**

   - Characterize upload/profile/metadata refresh, series selection, range filtering, zoom, annotations, chart exports, and empty states.
   - Implement the dataset feature and split the chart implementation into focused modules.
   - Delete the old timeseries module, compatibility store calls, and obsolete chart paths once the feature tests pass.

5. **Rebuild scatter and correlations**

   - Write tests for query construction, shared filters, box zoom, density mode, matrix loading/cache invalidation, correlation suggestions, and export.
   - Implement one scatter feature with separate query, renderer, matrix, density, and view controller modules.
   - Remove duplicated scatter filter snapshots and the old scatter state/runtime implementation.

6. **Rebuild analysis features**

   - Apply the same test-first process independently to FFT, spectrogram, causal, and drift.
   - Keep shared chart/export primitives in `charts/` or `ui/`; keep domain computation requests and page-specific state within their feature.
   - Verify numerical result fixtures against Rust integration tests and browser rendering flows.

7. **Rebuild shell, UI, CSS, and remove retired code**

   - Test settings, keyboard actions, modal focus/cleanup, responsive navigation, and page CSS loading.
   - Keep tokens, base layout, and reusable controls global; move feature CSS beside its feature and lazy-load it with that feature.
   - Split the oversized shared toolbar CSS by actual ownership.
   - Remove all old source trees, compatibility allowlists, stale tests, old API routes, and dead build aliases.

## Verification Gates

After every milestone, run the affected characterization tests first, then the full gates:

- TypeScript, architecture, and bundle-budget checks.
- Rust contract and route integration tests.
- Frontend unit/controller tests plus Playwright browser flows.
- Production frontend build and packaged-dist validation.
- Import-boundary checks: no global state, no production window bridge, no direct fetch outside `ApiClient`, no DOM in state/contracts, no cross-feature deep imports, and no eager heavy page imports.
- Initial application JS/CSS must not exceed the current baseline (151 KB JS, 123 KB CSS); Arrow, ChartGPU, and ECharts remain lazy-loaded.

A test may change only when a deliberate product behavior change is approved. Internal route, store, module, and lifecycle rewrites must keep the characterization suite green.
