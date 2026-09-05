# Full System Code Review: Frontend, API Contract, and Rust Backend

## 1. Executive Summary

This document provides a comprehensive code review of the **EDATime** application across its three primary architectural pillars: the **Frontend** (`frontend/src`), the **API Contract** (`contracts/api-v1.json`), and the **Rust Backend Service** (`crates/*`).

EDATime is a high-performance, real-time time-series exploratory data analysis (EDA) platform. It pairs a modular, high-concurrency Rust backend (using Axum, Polars, Arrow, and Tokio) with a responsive vanilla TypeScript frontend featuring WebGPU acceleration (`chartgpu`), ECharts fallbacks, and Apache Arrow IPC binary streaming.

### System Health & Quality Gate Verification
- **Frontend Quality**: 1,421 passing unit & integration tests across 251 test suites, 0 TypeScript errors (`tsc --noEmit`), budget-enforced bundle sizes (`check-frontend-budgets.mjs`), and strict reachability validation (`check-frontend-reachability.mjs`).
- **Backend Quality**: 252 passing Rust unit & API integration tests across all 6 crates (`edatime-core`, `edatime-ingest`, `edatime-query`, `edatime-store`, `edatime-service`, `edatime-bin`), with clean static analysis (`cargo check-all`).
- **API Contract Verification**: Synchronized 3-way validation connecting `contracts/api-v1.json`, backend Axum routing (`crates/edatime-service/src/handlers/routes/mod.rs`), and TypeScript routes (`frontend/src/contracts/api/v1/routes.ts`).

---

## 2. Unused File Triage (Completed Action)

An audit of the root workspace identified 19 diagnostic, screenshot, prototype, and log dump files that are not part of the active application, build system, or Sphinx documentation (`docs/`). These files were moved into `tmp/` for triage:

| File / Artifact | Category | Reason for Triage |
| :--- | :--- | :--- |
| `chip-smoke.png` | Screenshot | Diagnostic capture from past test run |
| `edatime-home-after-make-dev.png` | Screenshot | Standalone UI capture |
| `initial-drift-1920.png` | Screenshot | Standalone UI capture |
| `scatter-marginal-live.png` | Screenshot | Standalone UI capture |
| `timeseries-3000-current.png` | Screenshot | Standalone UI capture |
| `timeseries-after-fix.png` | Screenshot | Standalone UI capture |
| `heatmap-page.png` | Screenshot | Standalone root screenshot copy |
| `edatime-homepage-v2.html` | Prototype HTML | Historical static HTML mockup |
| `edatime-homepage-v3.html` | Prototype HTML | Historical static HTML mockup |
| `drift-console.txt` | Debug Dump | Console log text snapshot |
| `drift-network.txt` | Debug Dump | Network response text snapshot |
| `tmp-network.txt` | Debug Dump | Network payload snippet |
| `.tmp_grep.txt` | Temporary Output | Grep search output |
| `all-requests.txt` | Debug Dump | HTTP request log |
| `notes.md` | Temporary Note | Benchmark model scratch note |
| `get_logs.mjs` | Debug Script | Standalone log fetch script |
| `test_api.mjs` | Debug Script | Standalone endpoint test script |
| `test_api2.mjs` | Debug Script | Standalone endpoint test script |
| `profile_upload.sh` | Debug Script | Shell cURL test script |

*Note: All core dataset samples (`ETTm2.csv`), build scripts, test suites, and Sphinx documentation (`docs/`) were preserved in place.*

---

## 3. Frontend Architecture & Second-Pass Review

### 3.1 Architecture & State Ownership
- **Feature Ownership Model**: The frontend is organized cleanly into feature domains (`features/timeseries`, `features/scatter`, `features/heatmap`, `features/causal`, `features/drift`, `features/fft`, `features/spectrogram`). Dynamic loading through `createFeatureRegistry()` keeps initial bundle sizes low (`app.js` ~208 KB).
- **Dual-Store Migration (Legacy vs WorkspaceStore)**:
  - *Observation*: State handling is undergoing a migration from legacy mutable singletons (`store/chartState.ts`, `store/datasetState.ts`, `store/uiState.ts`) to the immutable `createWorkspaceStore()`.
  - *Risk*: Having custom store event emitters (`emitStoreEvent`) run alongside `WorkspaceStore` selector subscriptions can cause transient state mismatches during rapid viewport updates or filter toggles.
  - *Recommendation*: Finalize the elimination of `store/*.ts` modules so all page controllers draw state exclusively from `WorkspaceStore`.
- **Change Detection Efficiency**:
  - *Observation*: `workspaceStore.ts` checks filter equality via `JSON.stringify(left) === JSON.stringify(right)` during snapshot publication.
  - *Recommendation*: Replace `JSON.stringify` with a deep structural equality check for `columnRanges` and `adaptiveLines` to eliminate temporary object allocations during interactive range scrubbing.

### 3.2 Visualization & Memory Lifecycle
- **WebGPU Resource Management (`chartgpu`)**:
  - *Observation*: Vertex buffers and index buffers in `chartgpu` are instantiated dynamically. When dataset sizes change or viewport resolution updates, unmanaged buffers can lead to VRAM fragmentation.
  - *Recommendation*: Introduce an explicit buffer disposal pattern (`GPUBuffer.destroy()`) on chart teardown and implement a GPU buffer pool for frequent zoom operations.
- **Offloading Downsampling (LOD) to Web Workers**:
  - *Observation*: Downsampling algorithms (LTTB / MinMax) currently execute on the browser main thread during Arrow IPC data ingestion.
  - *Recommendation*: Move downsampling computation to a dedicated Web Worker, transferring binary `Float64Array` buffers directly via `postMessage(data, [data.buffer])` to guarantee steady 60 FPS interactions.

### 3.3 CSS Architecture & Micro-Interactions
- **Toolbar CSS Monolith**: `toolbar.css` is over **64 KB** in size. Splitting it into scoped modules (`toolbar-zoom.css`, `toolbar-actions.css`, `toolbar-overflow.css`) will improve maintainability and tree-shaking clarity.
- **Mobile Ergonomics**: Multi-panel layouts (Scatter Matrix, Causal Graph Editor) require improved touch targets (minimum `44x44px`) and collapsible bottom sheet drawers for viewports `< 768px`.
- **Accessibility (a11y)**: HTML5 Canvas and WebGPU rendering layers should generate hidden `<table class="sr-only">` or `aria-live` regions to expose statistical summaries to assistive technologies.

---

## 4. API Contract Review (`/api/v1`)

The API contract defined in `contracts/api-v1.json` establishes a strict interface between the Rust service and TypeScript consumers.

### 4.1 Strengths of the Contract Design
- **Single Source of Truth with 3-Way Automated Validation**: `scripts/check_api_contract.mjs` enforces that all 51 contract operations match backend Axum handlers and frontend route constants.
- **Binary Arrow IPC Transport**: Endpoints like `/api/v1/data` and `/api/v1/scatter/points` support `application/vnd.apache.arrow.stream`, enabling zero-copy memory reads into WebGL/WebGPU typed arrays.
- **Plan-Aware Endpoints**: Endpoints marked with `"planAware": true` explicitly accept cleaning plan parameters, allowing server-side data sanitation without mutating underlying raw datasets.
- **Standardized Header Policy**: Mandatory correlation (`x-request-id`) and build tracking (`x-edatime-build`, `x-edatime-contract`) headers enable tracing across distributed services.

### 4.2 Improvement Options for Contract & API
1. **OpenAPI 3.1 Specification Export**:
   - *Observation*: `contracts/api-v1.json` is a custom JSON Schema representation.
   - *Recommendation*: Add a generator script to output standard OpenAPI 3.1 YAML/JSON specs to enable automatic Swagger UI documentation rendering and client SDK generation.
2. **Strict Request Payload Boundaries**:
   - *Observation*: Several complex JSON request bodies (e.g. `CausalGraphRequest`, `DriftInvestigateRequest`) rely on implicit default handling in Rust deserializers when optional fields are omitted.
   - *Recommendation*: Annotate explicit min/max array lengths, numeric range bounds, and non-empty string constraints in `api-v1.json` schemas.
3. **Unified Error Payload Schema**:
   - *Observation*: The contract requires `{ "error", "message", "kind", "code", "correlation_id", "request_id" }` on 4xx/5xx responses.
   - *Recommendation*: Enforce automated TS response interceptor validation in `frontend/src/services/api/http.ts` so non-compliant error payloads produce clear developer-facing diagnostic messages.

---

## 5. Backend Architecture & Code Review (Rust Crates)

The Rust backend is structured as a multi-crate workspace under `crates/`:

```
crates/
├── edatime-core       # Domain primitives, timestamps, errors, time series types
├── edatime-ingest     # Data ingestion (CSV, Parquet, streaming, schema inference)
├── edatime-query      # Compute algorithms (FFT, Spectrogram, Causal, Drift, Rolling)
├── edatime-store      # Dataset lineage, resident state, catalog, job state, artifact storage
├── edatime-service    # Axum HTTP web server, routing, handlers, middleware
└── edatime-bin        # Application entrypoint & static frontend asset embedding
```

### 5.1 Backend Strengths
- **Lock-Free / Low-Contention State**: State management in `edatime-store` and `edatime-service` uses atomic counters, single-producer cold-burst cache locks, and immutable dataset lineage snapshots.
- **High-Performance Streaming**: `streaming_export.rs` streams Parquet and Arrow binary streams directly over HTTP without materializing complete result payloads in heap memory.
- **Comprehensive Error Architecture**: `crates/edatime-service/src/error.rs` maps core computational, ingestion, and storage errors to structured Axum response tuples with HTTP status codes and correlation IDs.

### 5.2 Improvement Options for Backend Architecture

1. **Decomposition of Monolithic Handler Modules**:
   - *Observation*: `crates/edatime-service/src/handlers/routes/cleaning.rs` is **74 KB** (approx. 2,100 lines) and `metadata.rs` is **55 KB**.
   - *Recommendation*: Refactor `cleaning.rs` into sub-modules (`cleaning/validate.rs`, `cleaning/apply.rs`, `cleaning/export.rs`, `cleaning/propose.rs`) to improve code navigation, isolate unit test coverage, and reduce compile times during handler edits.

2. **Cancellation Token Propagation for Compute Jobs**:
   - *Observation*: Long-running analytical tasks (e.g., Causal Discovery via Tigramite or complex 2D Spectrogram transforms) execute in background Tokio tasks. If an HTTP request is aborted by the client, the compute kernel continues executing until completion.
   - *Recommendation*: Pass `tokio_util::sync::CancellationToken` or check Axum client disconnect signals (`req.into_body()`) inside compute loops in `edatime-query` to abort cancelled compute tasks immediately.

3. **Memory Quota & Chunk Boundary Enforcement**:
   - *Observation*: Ingesting large CSV/Parquet files allocates Polars dataframes in heap memory.
   - *Recommendation*: Enforce a strict configurable max-memory budget per streaming session in `edatime-ingest` to prevent Out-Of-Memory (OOM) panics when processing high-cardinality multi-gigabyte files on memory-constrained servers.

4. **Detailed Prometheus Metric Histograms**:
   - *Observation*: `crates/edatime-service/src/rates.rs` records handler request counters and total execution latency.
   - *Recommendation*: Add fine-grained histogram metrics separating **Compute Latency** (algorithm execution time) from **Serialization Latency** (Arrow IPC / JSON encoding time) for `/api/v1/data` and `/api/v1/scatter/points`.

---

## 6. Actionable Implementation Roadmap

```mermaid
flowchart TD
    subgraph Phase 1 [Phase 1: High Priority - Core Hygiene & Memory]
        P1_1[Frontend: Complete Store Unification to WorkspaceStore]
        P1_2[Frontend: Implement GPUBuffer.destroy in ChartGPU]
        P1_3[Backend: Add Cancellation Tokens to Compute Handlers]
    end

    subgraph Phase 2 [Phase 2: Medium Priority - Performance & Modularization]
        P2_1[Frontend: Web Worker Offloading for Downsampling]
        P2_2[Frontend: Modularize toolbar.css into Sub-modules]
        P2_3[Backend: Refactor monolithic cleaning.rs & metadata.rs]
        P2_4[Contract: Export OpenAPI 3.1 Spec Generator]
    end

    subgraph Phase 3 [Phase 3: Long Term - Polish & Ergonomics]
        P3_1[Frontend: Accessible Canvas Summary Tables]
        P3_2[Frontend: Mobile Collapsible Drawer Polish]
        P3_3[Backend: Fine-grained Serialization vs Compute Prometheus Metrics]
    end

    Phase 1 --> Phase 2 --> Phase 3
```

### Milestone Checklist

#### High Priority (Phase 1)
- [ ] **Unified Workspace Store**: Complete deprecation of legacy `store/*.ts` emitters in favor of `WorkspaceStore`.
- [ ] **VRAM Teardown**: Enforce explicit `.destroy()` on WebGPU vertex/index buffers during chart disposal.
- [ ] **Request Cancellation**: Wire `CancellationToken` into heavy backend compute loops in `edatime-query`.

#### Medium Priority (Phase 2)
- [ ] **Worker-Based LOD**: Move time-series downsampling (LTTB) into a Web Worker thread.
- [ ] **Toolbar CSS Modularization**: Split 64 KB `toolbar.css` into modular stylesheet imports.
- [ ] **Rust Handler Decomposition**: Break down 74 KB `cleaning.rs` and 55 KB `metadata.rs` into sub-handlers.
- [ ] **OpenAPI 3.1 Spec Generator**: Create OpenAPI 3.1 exporter script from `contracts/api-v1.json`.

#### Enhancements & Polish (Phase 3)
- [ ] **Accessible Chart Fallbacks**: Provide automated screen-reader statistical table summaries for canvas/WebGPU charts.
- [ ] **Mobile Drawer Ergonomics**: Improve Scatter Matrix and Causal Graph layout on viewports `< 768px`.
- [ ] **Metrics Observability**: Expose distinct compute vs serialization latency histogram buckets in Prometheus endpoint.


---

## 7. Corrections & Factual Audit

This section is **additive** — the original review above is preserved verbatim. The corrections below document each factual inaccuracy, the verified truth, and concrete remediation for the action plan.

### 7.1 Wrong Claims (must be corrected)

#### W1 — crates/edatime-service/src/rates.rs is NOT a metrics module

- **Claim**: crates/edatime-service/src/rates.rs records handler request counters and total execution latency.
- **Reality**: rates.rs is a token-bucket **HTTP rate limiter** (RateLimiter with max_requests, window, ClientWindow, tokio::sync::Mutex). It contains no counters, no histograms, and no latency tracking.
- **Where the actual metrics live**: crates/edatime-service/src/handlers/routes/metrics.rs (get_metrics and get_prometheus) backed by state.metrics.snapshot().
- **Fix**: Replace all references to rates.rs with handlers/routes/metrics.rs (and state.metrics) in section 5.2.4 and the Phase 3 / Metrics Observability checklist item.

#### W2 — Causal Discovery is a pure-Rust reimplementation, not Tigramite

- **Claim**: Long-running analytical tasks (e.g., Causal Discovery via Tigramite or complex 2D Spectrogram transforms) execute in background Tokio tasks.
- **Reality**: The production causal engine is crates/edatime-service/src/causal/ — its mod.rs declares: pure-Rust reimplementation of tigramite algorithms. The vendored Python tigramite/ directory and scripts/tigramite_worker.py are **not referenced** from any Rust crate, the Makefile, the frontend, or any other script. They are dormant prototype artifacts.
- **Fix**: Reword section 5.2.2 to Wire CancellationToken into the Rust causal discovery engine in crates/edatime-service/src/causal/ (PCMCI/PC/PCMCIplus/LPCMCI) and clarify that the cancellation story is about the Rust kernels, not the unused Python worker.

#### W3 — tigramite/ directory and tigramite_worker.py are dead prototype code

- **Reality**: Neither is invoked from the build pipeline, the request path, or the frontend.
- **Recommendation**: Add to the Phase 1 triage list:
  - tigramite/ (vendored upstream Python package, ~7000 lines, unused)
  - scripts/tigramite_worker.py (stdin/stdout JSON helper, no caller)

#### W4 — Solid.js IS still wired in (legacy dependency)

- **Claim (implied)**: Frontend is framework-free TypeScript.
- **Reality**: package.json declares solid-js, @solidjs/router, @solidjs/testing-library, babel-preset-solid, and vite-plugin-solid. vitest.config.ts registers vite-plugin-solid() and matches *.test.tsx. **No production source under frontend/src/ imports Solid**, so the runtime path is framework-free in practice — but the test build pulls Solid in.
- **Fix**: Add a new Phase 1 item: **Remove dormant Solid.js stack**. Concrete steps:
  1. Remove solid-js, @solidjs/router, @solidjs/testing-library, babel-preset-solid, vite-plugin-solid from package.json devDependencies.
  2. Remove solid() plugin and *.test.tsx glob from vitest.config.ts.
  3. Re-run npm install, npm test, and npm run check:frontend:all to confirm no breakage.

#### W5 — GPUBuffer.destroy() is not the public API

- **Claim**: Introduce an explicit buffer disposal pattern (GPUBuffer.destroy()) on chart teardown and implement a GPU buffer pool.
- **Reality**: The vendored chartgpu library exposes ChartGPUInstance.dispose(), destroyGPUContext(), and destroyRenderScheduler(). Raw GPUBuffer instances are not part of the public surface; building a buffer pool would require forking the library. DataChart.destroy() and FftChart.destroy() already call .destroy() on owned overlays/legends.
- **Fix**: Replace Phase 1 item **VRAM Teardown: Enforce explicit .destroy() on WebGPU vertex/index buffers during chart disposal** with **Verify every ChartGPUInstance reaches dispose(): add a leak guard test that mounts each chart type, triggers unmount, and asserts no GPU contexts remain registered**.

#### W6 — Triage list count is 18, not 19

- **Claim**: 19 diagnostic/prototype files moved to tmp/.
- **Reality**: tmp/ contains **18** entries. .tmp_grep.txt (listed in section 2) is not present. Either it was never moved or it was removed; section 2 should be updated to reflect 18 files.

### 7.2 Partially Correct / Over-Stated Claims

#### P1 — Streaming claim is only half true

- **Claim**: streaming_export.rs streams Parquet and Arrow binary streams directly over HTTP without materializing complete result payloads in heap memory.
- **Reality**:
  - **Parquet** (streaming_export.rs): genuinely streamed via temp file + ReaderStream. Correct.
  - **Arrow IPC**: produced via edatime_query::arrow_export::dataframe_to_arrow_ipc(...) (handlers/scatter/points.rs:429, handlers/scatter/matrix.rs:273). This builds the full IPC payload in memory before responding. Not streamed.
- **Fix**: Reword to: *Parquet is streamed via a temp-file pipeline in streaming_export.rs; Arrow IPC responses (/data, /scatter/points, /scatter/matrix) currently materialize the full payload in memory before write.* Add a Phase 3 item to investigate streaming Arrow IPC with a chunked writer.

#### P2 — WorkspaceStore is the only owner contradicts the dual-store observation

- **Observation**: frontend/src/workspace/workspaceStore.ts is the intended owner, but **40** feature files still import legacy stores (store/chartState, store/datasetState, store/uiState) versus **39** importing workspaceStore. The dual-store risk in 3.1 is real and in-progress; the only owner language should be softened to intended owner.

#### P3 — Line/size rounding errors

| Claim | Stated | Verified | Action |
|---|---|---|---|
| cleaning.rs size | 74 KB (~2,100 lines) | 74,712 B (73.0 KB), **1,953 lines** | Update to 73 KB / ~1,950 lines |
| metadata.rs size | 55 KB | 55,501 B (54.2 KB) | Update to ~54 KB |
| toolbar.css size | 64 KB | 64,117 B (62.6 KB) | Update to ~63 KB |

#### P4 — Test counts are not independently verifiable

- **Claim**: 1,421 passing unit & integration tests across 251 test suites (frontend) and 252 passing Rust unit & API integration tests (backend).
- **Reality (frontend)**: 246 *.test.ts files in frontend/src/, 251 across the repo (including scripts/*.test.ts). The exact test count of 1,421 requires running npm test.
- **Reality (backend)**: One Rust integration test directory (crates/edatime-service/tests/, 3 files: unit_tests.rs, api_integration.rs, audit_verification.rs). Per-crate #[cfg(test)] unit tests are not enumerated statically. The 252 figure cannot be confirmed from a static scan.
- **Fix**: Re-run the suites to confirm or correct the counts. Until then, replace exact counts with 246 frontend test files across the repo; suite counts require re-running npm test and cargo test --workspace.

#### P5 — Causal Graph Editor appears to be a misnomer

- **Claim**: Multi-panel layouts (Scatter Matrix, Causal Graph Editor) require improved touch targets.
- **Reality**: frontend/src/features/causal/ contains PCMCI-driven charts but no editable graph surface. The feature is causal analysis, not Causal Graph Editor.
- **Fix**: Reword to Causal Analysis page or whichever label features/causal/page.ts uses.

#### P6 — Buffer-pool claim is speculative

- **Claim**: Implement a GPU buffer pool for frequent zoom operations.
- **Reality**: Chart zoom in DataChart.ts / FftChart.ts is handled via axis interactions, not by creating new chart instances. A buffer pool would only matter under evidence of buffer churn; none is presented.
- **Fix**: Drop the buffer-pool recommendation unless profiling evidence is added.

### 7.3 Updated Phase 1 / Phase 3 Checklist Items

The following are the corrected/replacement checklist items (additive — original items remain untouched in section 6):

#### High Priority (Phase 1) — additions
- [ ] **Remove dormant Solid.js stack**: Drop solid-js, @solidjs/router, @solidjs/testing-library, babel-preset-solid, vite-plugin-solid; remove solid() plugin and *.test.tsx glob from vitest.config.ts.
- [ ] **Triage unused Tigramite artifacts**: Remove or document tigramite/ Python package and scripts/tigramite_worker.py (no callers).
- [ ] **ChartGPU disposal audit**: Add a leak-guard test asserting every ChartGPUInstance reaches dispose() after unmount; do **not** introduce raw GPUBuffer.destroy() (not part of the public API).

#### Phase 2 — additions
- [ ] **Reconcile rate/metrics terminology**: Section 5.2.4 should target handlers/routes/metrics.rs (and state.metrics), not rates.rs.

#### Phase 3 — additions
- [ ] **Stream Arrow IPC responses**: Investigate chunked Arrow IPC writer for /data, /scatter/points, /scatter/matrix so memory stays bounded for large result sets (Parquet already streams via streaming_export.rs).
- [ ] **Cancellation in Rust causal engine**: Wire CancellationToken into crates/edatime-service/src/causal/ (PCMCI/PC/PCMCIplus/LPCMCI loops). Note: this is a pure-Rust reimplementation; the Python tigramite_worker.py is unused.

### 7.4 Items That Were Correct (preserved)

For the record, the following original claims are accurate and require no change:

- 51 contract operations, 14 planAware endpoints.
- 3-way validation via scripts/check_api_contract.mjs.
- Mandatory x-request-id, x-edatime-build, x-edatime-build-sha, x-edatime-build-profile, x-edatime-contract headers.
- Required error payload fields {error, message, kind, code, correlation_id, request_id}.
- Workspace structure: 6 crates (core, store, query, ingest, service, bin).
- Bundle budgets enforced via scripts/check-frontend-budgets.mjs (cap 224 KB for app.js).
- JSON.stringify(left) === JSON.stringify(right) equality check in workspaceStore.ts:75.
- Dual-store migration in progress (40 legacy imports vs 39 workspaceStore imports).
- error.rs structured IntoResponse with correlation IDs.
- Crate layouts: analytics/{anomaly,drift,fft,rolling,shared,spectrogram}.rs, causal/{data,graph,independence,lpcmci,pc,pcmci,pcmciplus}.rs, query modules aggregations,arrow_export,cleaning,derived,downsample,executor,filters,predicates,query,temporal,transforms,validation.
- get_metrics and get_prometheus route handlers exist at /api/v1/metrics and /api/v1/metrics/prometheus.

### 7.5 Net Verdict on review.md

The document overall direction is sound — store unification, handler modularization, contract tightening, and richer metrics are all real, worthwhile improvements. However:

- **section 5.2.4 (Prometheus histograms) cites the wrong source file** (rates.rs is a rate limiter, not a metrics module).
- **section 5.2.2 mischaracterizes the causal engine** as Tigramite; it is a pure-Rust reimplementation, and the Python worker is dead code.
- **the Phase 1 VRAM item recommends a non-existent API** (GPUBuffer.destroy() is not exposed by the vendored chartgpu library).
- **the framework-free claim is contradicted by dormant Solid.js dependencies** that the review failed to surface, and these should be removed per the team decision to drop legacy Solid.
- **the 19-file triage count is 18** in reality.

Apply the corrections above before circulating the document externally.
