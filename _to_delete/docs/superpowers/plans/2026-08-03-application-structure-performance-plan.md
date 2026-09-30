# Application Structure, Performance, and Cleanup Plan

Reviewed on 2026-08-03 against commit `ab6a6d9`. This is a review and
implementation plan only; no application code is changed by this pass.

The completed work in `backend_improvments.md` remains the backend correctness
and request-performance baseline. This plan does not reopen those items. It
focuses on ownership boundaries, application startup, deploy contents, large
modules, and stale or unused files.

## Current baseline

The repository is healthy enough to refactor from a known-good point:

- `npm run check:frontend:all` passes.
- `npm run check:api-contract` passes for 51 operations.
- `npm run check:backend-hygiene` passes.
- Initial application JavaScript is 204,813 bytes against a 224,000-byte
  budget.
- Initial blocking CSS is 169,479 bytes against a 170,000-byte budget. This is
  only 521 bytes of headroom.
- Heavy chunks are 1,045,045 bytes for ECharts, 261,989 bytes for ChartGPU,
  and 209,899 bytes for Arrow.
- The built frontend directory is about 20 MB because source maps and a second
  complete ChartGPU distribution are packaged with the Vite output.
- `frontend/index.html` is 2,714 lines and 163,548 bytes. It creates the DOM for
  nearly every page before those page controllers are loaded.
- There are 312 production TypeScript modules in the app-root reachability
  scan. The largest production modules include `cleaning/panel.ts` (1,345
  lines), `chart/DataChart.ts` (923), and `features/prepare/index.ts` (689).
- The largest Rust modules include `routes/cleaning.rs` (1,953 lines),
  `analytics/drift.rs` (1,603), `edatime-query/cleaning.rs` (1,575),
  `routes/metadata.rs` (1,550), and `scatter/correlations.rs` (1,442).

## Good structure to preserve

- `app.ts` is a composition root rather than a general-purpose global module.
- Advanced pages are registered through feature indexes and deferred page
  descriptors.
- `services/api` owns frontend transport calls, and the architecture check
  enforces this boundary.
- `WorkspaceStore` is already the intended cross-feature workspace contract.
- Backend CPU work is admitted through `QueryExecutor`; route and retention
  limits are already observable and benchmarkable.
- Vite owns hashed frontend assets and the asset graph is checked.

## P0 — Clean the repository and establish one owner for every artifact

### P0.1 Remove checked-in generated and temporary files

The following are generated state or scratch output, not application source:

| Path | Tracked files | Current tracked bytes | Action |
| --- | ---: | ---: | --- |
| `.playwright-mcp/` | 132 | 792,075 | Untrack logs/snapshots and retain the existing ignore rule. |
| `.repowise/state.json`, `.repowise/wiki.db` | 2 of 3 | about 9.7 MB | Untrack generated state/database, preserve `.repowise/mcp.json` only if it is intentional shared configuration, and ignore generated state. |
| `tmp/` | 19 | 3,488,203 | Delete tracked diffs, screenshots, and response captures; keep runtime scratch outside Git. |
| `docs/_build/` | 101 | 4,047,567 | Untrack generated Sphinx HTML and build it in documentation jobs. |
| `crates/edatime-bin/frontend/dist/` | 143 | 1,737,291 | Stop versioning Vite output after build/run/release workflows guarantee that it is generated first. |
| `issue.md.bak` and tracked `*.bak` files | 2 | small | Delete. |

The production binary serves a directory at runtime; it does not embed this
frontend at Rust compile time. Therefore checked-in packaged frontend output is
not required if `npm run build:prod` is an explicit packaging prerequisite.

Implementation steps:

1. Update Make, Docker, release, documentation, and CI workflows so every path
   that packages or starts the full app builds the frontend first.
2. Untrack the generated paths while preserving useful local tool state on the
   developer machine where appropriate.
3. Make Vite source maps development-only, or emit hidden maps to a separate
   release/debug-symbol upload. `vite.config.ts` currently sets `sourcemap:
   true` for production, which contributes several of the largest files in the
   20 MB package without being needed by the runtime asset graph.
4. Add `scripts/check-repo-hygiene.mjs` and a CI command that rejects tracked
   files under `tmp/`, `.playwright-mcp/`, `docs/_build/`, and packaged `dist/`,
   plus backup suffixes such as `.bak`, `.orig`, and `~`.
5. Do not delete `docs/superpowers/plans/` merely because plans are old. They
   are authored documentation; archive them only under a separately agreed
   documentation-retention policy.

Acceptance:

- A fresh clone can run the complete build and tests without any generated
  output being committed.
- `git ls-files` finds none of the denied generated paths.
- Production deploy output contains no browser source maps; retained debug
  maps are stored outside the served frontend directory.
- `npm run build:prod` followed by the release binary serves all Vite-manifest
  assets successfully.
- The tracked working-tree payload falls materially from its current 41.5 MB;
  the paths above alone account for roughly 18 MB.

### P0.2 Make ChartGPU a single dependency and deploy it once

ChartGPU currently has three representations:

- `chartgpu@0.3.2` in `package.json` and `node_modules`;
- a modified copy in `frontend/libs/chartgpu` imported by production source;
- that entire vendored distribution copied to packaged `/libs/chartgpu` even
  though Vite also emits a 261,989-byte ChartGPU chunk.

The vendored `dist/index.js` is not byte-identical to the npm package. It
contains at least a Windows adapter-selection change, so it must not be
silently replaced with the registry version.

Preferred implementation:

1. Preserve the local fix as a documented local package/fork, for example a
   `file:` dependency under `vendor/chartgpu`, or upstream the fix and pin the
   released version.
2. Change application imports to the package name `chartgpu`; do not use deep
   relative imports into a copied `dist` tree.
3. Remove `copyRuntimeAssets()` and the packaged `/libs/chartgpu` copy after
   confirming that Vite emits any worker assets required by ChartGPU.
4. Remove the redundant npm or vendored authority, whichever was not selected.
5. Record the fork commit/patch and add a focused Windows adapter test so the
   behavior is not hidden inside compiled vendor output.

Acceptance:

- Exactly one ChartGPU source is declared and exactly one runtime ChartGPU
  chunk/worker graph is deployed.
- No application import references `frontend/libs/chartgpu/dist`.
- Packaged output contains no `.d.ts`, package README, CJS bundle, or vendor
  source map.
- Chart initialization, fallback behavior, zoom, export, and the Windows
  adapter case pass.

### P0.3 Remove dead frontend entry surfaces and add reachability checking

An app-root import traversal found these production files unreachable from
`frontend/src/app.ts`:

- barrel candidates: `contracts/api/v1/index.ts`, `services/chart/index.ts`,
  `types/index.ts`, `ui/composites/index.ts`, and `ui/primitives/index.ts`;
- implementation candidates: `ui/metaBar.ts`, `ui/modalUtils.ts`, and
  `ui/shell/createDrawerController.ts`;
- `__mocks__/apache-arrow.ts`, which is a test fixture and should be declared as
  an allowed non-production entry rather than deleted.

`metaBar.ts` is referenced only by its own test, while the other implementation
candidates have no current consumers. Because barrel files can be intended
external entry points, verify that no package export or documentation promises
them. There is currently no published frontend package, so deletion is the
preferred outcome rather than retaining compatibility barrels.

Implementation steps:

1. Add a source reachability checker with explicit roots for `app.ts`, workers,
   service worker code, test mocks, build scripts, and any public package entry.
2. Delete each candidate after an exact import search and a production build.
3. Delete or relocate tests that only test deleted code.
4. Run a dependency audit for npm and every Cargo crate; remove dependencies
   that have no source or build-script use.

Confirmed dependency cleanup candidate: `edatime-query` declares `axum`, but no
source in that crate imports Axum.

Acceptance:

- The reachability checker reports no unexplained production source files.
- The production build and all tests pass after deletion.
- CI rejects newly unreachable production modules and unused direct
  dependencies.

### P0.4 Remove the root Rust facade package if it remains internal-only

The root `edatime` library only re-exports workspace crates, and its only
observed consumer is `tests/unit_tests.rs`. The root manifest repeats a large
dependency list even though there is already one canonical executable in
`edatime-bin`.

Implementation steps:

1. Move each unit test to the crate that owns the behavior. Move full-router
   tests to `edatime-service` or a dedicated workspace integration-test crate.
2. Replace `use edatime::...` with direct owner-crate imports.
3. Convert the workspace root to a virtual manifest and delete `src/lib.rs` and
   stale root dependencies.
4. If an external library API is intentionally required, keep a deliberately
   small facade with a documented public contract instead; do not retain it
   only as a test convenience.

Acceptance:

- The workspace has one executable and no internal-only facade package.
- `cargo test --workspace`, doctests, Clippy, and benchmark compilation pass.
- `cargo tree -d` and clean build timings are captured before and after.

## P1 — Clarify runtime ownership and backend/frontend contracts

### P1.1 Give cross-feature state one owner

`WorkspaceStore` is the canonical persisted dataset/selection/filter/viewport
contract, but runtime code still reads or writes overlapping state in
`datasetState`, `chartState`, `analyticsState`, `uiState`, and `scatterState`.
Dataset bootstrap, for example, commits the workspace and then separately
publishes metadata, revision, numeric columns, and adaptive-filter state.

Several features also keep module-level singleton state, including scatter,
FFT, guided workflow, provenance, and causal graph/selection modules. This
prevents isolated multiple mounts and makes disposal correctness dependent on
global mutation.

Target ownership:

- `WorkspaceStore`: persisted, cross-feature user intent and dataset identity;
- feature controller instance: ephemeral request/render/selection state;
- chart adapter instance: chart handles and renderer resources;
- no module-level mutable workspace/chart/controller singleton.

Implementation steps:

1. Write an ownership table for every field in the focused stores.
2. Add temporary invariants that fail tests when overlapping workspace/store
   fields diverge.
3. Migrate dataset identity and selection/filter consumers to the workspace.
4. Replace feature globals with `create...Controller()` or `mount...()`
   instances whose lifetime is owned by the feature registry.
5. Delete duplicate fields and setters immediately after their last consumer;
   no compatibility mirror is needed.
6. Add two-mount and mount/dispose/remount tests for scatter, FFT, causal,
   provenance, and guided workflow.

Acceptance:

- Each state field has exactly one writer/owner.
- Feature disposal removes subscriptions, listeners, requests, and chart
  resources without resetting unrelated features.
- Two isolated controller instances can coexist in tests without state bleed.

### P1.2 Generate the actual backend/frontend data contract

`contracts/api-v1.json` currently validates the method/path table, header names,
and response type names. It does not describe request or response fields, so
Rust request types, frontend TypeScript types, and runtime shape guards can
still drift while the 51-operation route check remains green.

Implementation steps:

1. Create a transport-only contract owner: either a small
   `edatime-contract` crate or feature-scoped contract modules with no Axum,
   Polars, DOM, or renderer dependencies.
2. Generate OpenAPI/JSON Schema from the Rust transport structs, including the
   structured error envelope, discriminated response formats, nullability,
   bounds, and unknown-field policy.
3. Generate TypeScript request/response types and route metadata into
   `frontend/src/contracts/api/v1/generated/`.
4. Keep handwritten runtime decoders only at untrusted JSON boundaries and
   test them using schema-derived fixtures.
5. Make generation deterministic and fail CI on a dirty generated diff.
6. Delete superseded handwritten contract types as each feature migrates.

Acceptance:

- Every JSON operation has a real request/response schema, not only a type
  name.
- Backend examples validate against the schema and frontend fixtures compile
  against generated types.
- A deliberate field rename fails contract CI before application tests.

### P1.3 Remove HTTP concerns from storage and narrow `AppState`

`edatime-store/src/cache.rs` imports Axum body, headers, response, and status
types. Its `CachedResponse::into_response` constructs HTTP responses. This
makes the storage crate depend on the web framework and mixes cache residency
with transport policy.

`edatime-store::AppState` also contains repository/version/artifact services,
query execution, jobs, response cache, metrics, configuration, database state,
correlation/profile/metadata caches, and query-log state in one struct.

Implementation steps:

1. Make the store cache retain a framework-neutral payload: bytes, media type,
   result metadata, and safe header metadata.
2. Move HTTP response construction and cache headers into
   `edatime-service`.
3. Group `AppState` into cohesive capabilities such as `datasets`,
   `execution`, `analysis_cache`, `integrations`, and `observability`.
4. Give handlers the narrowest practical capability or service method instead
   of reaching through a flat bag of public fields.
5. Remove Axum from `edatime-store` after the last transport type is gone.

Acceptance:

- `edatime-store` and `edatime-query` have no Axum dependency.
- Cache hit/miss headers and cached JSON/Arrow responses remain byte- and
  metadata-equivalent in integration tests.
- Cache Criterion results and HTTP warm-cache throughput do not regress beyond
  the benchmark tolerance below.

### P1.4 Move pure analytics out of the HTTP service crate

Substantial pure computation currently lives under `edatime-service`, notably
drift, rolling/spectrogram analytics, and causal algorithms. This makes the
service crate both transport adapter and analytics library.

Implementation steps:

1. Classify functions as transport mapping, orchestration/admission, or pure
   computation.
2. Move pure algorithms into `edatime-query` where they fit, or create one
   `edatime-analytics` crate if that keeps dependency direction clearer.
3. Keep request validation/admission and response serialization in service
   handlers.
4. Move Criterion benches beside the pure algorithms and replace router-heavy
   unit tests with small algorithm tests plus a thin integration layer.

Acceptance:

- The analytics crate has no Axum dependency.
- Handler functions visibly follow validate -> admit -> compute -> map response.
- Existing deterministic analytics and route-contract tests pass unchanged at
  the boundary.

## P2 — Reduce startup work and split oversized modules

### P2.1 Defer the cleaning workbench until it is requested

`app.ts` dynamically imports `cleaning/panel.ts`, but awaits that 1,345-line
feature unconditionally during startup. The emitted panel chunk is therefore
downloaded and initialized even when the user never opens the Plan workbench.

Implementation steps:

1. Register a small Plan-trigger loader during shell startup.
2. Import and mount the cleaning panel on first trigger or first Prepare-page
   use, cache the mounted controller, and dispose it with the app.
3. Split `cleaning/panel.ts` into a controller, preview/apply service adapter,
   tab views, stage-editor registry, history/graph view, and export view.
4. Keep pure plan transformations DOM-free and unit-testable.

Acceptance:

- A cold Home, Upload, or Signals load makes no request for the cleaning-panel
  chunk.
- First Plan open loads it once; later opens reuse the mounted feature.
- Cleaning plan behavior and exports pass the existing tests.

### P2.2 Instantiate page DOM and CSS with the page feature

`index.html` contains markup for all advanced pages, and the initial stylesheet
is effectively at its budget ceiling. Large CSS contributors include
`toolbar.css` (64,117 bytes), `workspace.css` (26,864), and `upload.css`
at 19,241 bytes, even though several associated subsystems are deferred.

Implementation steps:

1. Keep only the app shell, navigation, route outlet, global live regions, and
   initial-page skeleton in `index.html`.
2. Move each page's markup to a typed template/render function owned by its
   feature. Mount on first navigation and dispose or retain according to an
   explicit route-cache policy.
3. Split `toolbar.css` into a small shared toolbar primitive and page-owned
   styles. Lazy-load upload, modal/subsystem, provenance, and advanced-page CSS
   with their owners.
4. Keep design tokens and layout primitives in the initial stylesheet.
5. Add per-route CSS and DOM-node budgets rather than only one global CSS
   ceiling.

Acceptance:

- Initial HTML bytes and initial DOM nodes fall by at least 40% without a
  regression in accessible navigation or deep links.
- Initial blocking CSS falls by at least 20% from 169,479 bytes.
- Navigating to every page produces no flash of unstyled content and no missing
  element errors.

### P2.3 Split frontend modules by controller, domain, and view responsibilities

Do this after state ownership is settled so file splitting does not merely move
global coupling into more files.

Priority targets:

- `cleaning/panel.ts`: controller, plan-domain operations, stage editors,
  preview/apply, history/graph, and exports;
- `chart/DataChart.ts`: ChartGPU adapter/lifecycle, data mapping, overlays,
  interactions, export, and fallback selection;
- `features/prepare/index.ts`: pure preparation policies/selectors, view model,
  DOM view, job/profile controller, and plan integration;
- scatter/FFT/heatmap/drift pages: controller instance, state reducer/view
  model, rendering adapter, and DOM bindings.

Avoid a blanket line-count rewrite. Split only at ownership seams and keep
feature internals private behind explicit feature indexes.

Acceptance:

- Page entry modules primarily compose dependencies and lifecycle.
- Pure transformations can be tested without DOM or network mocks.
- No new wildcard feature exports or cross-feature internal imports appear.

### P2.4 Split backend handler families without changing route behavior

Priority targets and proposed boundaries:

- `routes/cleaning.rs`: contract/validation, preview, proposal, apply,
  data/plan/code/manifest/bundle export;
- `routes/metadata.rs`: immediate metadata, profile jobs, quality/profile
  construction, and response mapping;
- `scatter/correlations.rs`: extraction, pair computation, matrix cache,
  suggestion ranking, and HTTP mapping;
- `routes/analytics.rs`: one handler module per analytics operation after pure
  algorithms move out of the service crate.

Keep DTOs close to their contract owner and tests beside the smallest unit they
exercise. Do not create a new giant `dto.rs`, `utils.rs`, or `common.rs` file.

Acceptance:

- Route registration and public request/response shapes are unchanged.
- The 51-operation contract check and all integration tests pass.
- No replacement module becomes another multi-domain dumping ground.

### P2.5 Optimize workspace publication only after measuring it

`WorkspaceStore.getSnapshot()` clones the complete selection/filter snapshot,
and every update clones/publishes the complete snapshot to every listener.
This is simple and safe, but cost grows with adaptive filters and subscribers.

Implementation steps:

1. Add a microbenchmark for 0/10/100/1,000 adaptive filters and 1/10/100
   listeners across reads, viewport updates, and filter updates.
2. If material, store immutable snapshots with structural sharing and expose
   selector/slice subscriptions with equality checks.
3. Publish a revision/change-kind so viewport-only updates do not rerender
   filter-only consumers.
4. Keep defensive immutability at the public boundary; do not expose mutable
   arrays merely to avoid copies.

Acceptance:

- The 100-filter/10-listener rapid-viewport case allocates and dispatches
  materially less work than baseline.
- No-op or unrelated-slice updates do not invoke consumers.
- Dataset-session cancellation and stale-commit protection remain correct.

### P2.6 Reduce the ECharts cold chunk if modular imports prove worthwhile

Several adapters import the full `echarts` package, producing a 1,045,045-byte
cold chunk. Migrate to `echarts/core` with an explicit shared registration list
for the chart/series/component/renderer types actually used.

Treat this as measurement-led: retain the current import if modular registration
does not reduce shipped bytes or materially complicates lazy feature ownership.

Acceptance:

- Every ECharts-backed page renders and disposes correctly.
- The ECharts chunk shrinks by at least 25%, or the experiment is documented
  and reverted.
- First-navigation latency to drift/causal/spectrogram does not regress.

## Benchmark and verification harness for the implementation pass

### Capture one baseline before P0

Save the commit, dirty state, toolchain, CPU/memory, and runtime configuration
using the environment procedure in `scripts/benchmark.md`. Use a clean release
build and keep the raw result files under an ignored local benchmark-results
directory unless a curated result is intentionally committed.

Add `scripts/bench_app_structure.mjs` with these modes:

1. `artifacts`: report tracked bytes by category, production dist bytes with
   and without maps, manifest-reachable bytes, duplicate content hashes,
   initial HTML/CSS/JS, and per-chunk raw/gzip/Brotli sizes.
2. `startup`: use Playwright with a fresh browser context and cache disabled;
   collect navigation timing, first contentful paint, loaded resource URLs and
   transfer sizes, main-thread long tasks, initial DOM-node count, and heap
   usage for Home, Upload, Signals, and direct deep links.
3. `navigation`: measure first and warm navigation to Plan, scatter, drift,
   causal, FFT, spectrogram, and heatmap; assert that unrelated chunks are not
   requested.
4. `workspace`: run the filter/listener matrix from P2.5 and report operations
   per second, allocations/heap delta, and callback counts.

Run at least 10 cold browser iterations and report median and p95. Compare on
the same machine and browser version. Do not use a single Lighthouse score as
the acceptance signal.

### Backend and build non-regression

Structure-only backend changes should be performance neutral. Use:

```bash
cargo bench -p edatime-service --bench rolling_bands
cargo bench -p edatime-service --bench correlations
cargo bench -p edatime-service --bench scatter_sample
cargo bench -p edatime-query --bench multi_envelope
cargo bench -p edatime-service --bench scatter_matrix

BENCH_SCENARIO=steady BENCH_CONCURRENCY=8 make bench-http
BENCH_SCENARIO=cold-burst BENCH_CONCURRENCY=32 make bench-http
```

For each phase, require Criterion confidence intervals to overlap or investigate
any regression over 5%. For HTTP, flag p95/p99 latency regressions over 5%,
throughput losses over 3%, or higher peak RSS. A structure change may proceed
with a measured regression only when the tradeoff is explicitly recorded.

Capture clean-build impact with `/usr/bin/time -v cargo build --workspace` and
`cargo build --timings`; use `cargo tree -d` and per-crate dependency trees to
verify that facade/Axum cleanup really reduces dependency surfaces.

### Required correctness gate after every implementation slice

```bash
npm run check:frontend:all
npm test
npm run check:api-contract
npm run check:api-docs
npm run check:backend-hygiene
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo test --workspace --doc
cargo bench --workspace --no-run
```

For P2.1 and P2.2, also run the complete Playwright suite against the production
build. For P1.2, regenerate the schema and TypeScript client in a clean tree and
require `git diff --exit-code`.

## Recommended execution order

1. Capture baseline; implement P0.1 and P0.2 together because artifact cleanup
   and ChartGPU deduplication share the build pipeline.
2. Implement P0.3 and P0.4, then lock repository/source/dependency hygiene in
   CI.
3. Implement P1.1 before splitting frontend files.
4. Implement P1.2 before moving handler DTOs.
5. Implement P1.3 and P1.4, then split backend handler families in P2.4.
6. Implement P2.1 and P2.2, measure startup, then split the large frontend
   modules in P2.3.
7. Run the P2.5 and P2.6 experiments only with before/after data; keep only
   changes that meet their acceptance criteria.
