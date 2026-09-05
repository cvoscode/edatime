# EDATime: Remaining Implementation Review

Date: 2026-09-05

This document tracks remaining work and frontend delivery after commits `39e59d4a`,
`2d78ce9b`, and `875e3ef`. Historical findings and superseded recommendations have been removed.

## Quality assessment of the current changes

The implemented changes are generally good quality and preserve the existing
architecture and contracts.

- Workspace filter comparison avoids serialization allocations, and nested
  range objects are copied at input and snapshot boundaries. This closes the
  concrete mutation and equality problems without a generic deep-equality dependency.
- API error handling validates the complete v1 payload and reports invalid JSON
  or an invalid content type while retaining the server body for diagnosis.
- Causal requests use request-owned cooperative cancellation. PC-stable checks
  between condition combinations, and the other engines check major phase boundaries.
- Data and scatter metrics retain cumulative totals and add Prometheus histogram
  buckets, counts, and sums with fixed-cardinality labels.
- Dormant Solid dependencies are removed, including from the lockfile.
- The OpenAPI generator covers all 51 operations, and important request schemas
  contain useful bounds and enumerations.

The following limitations should not be mistaken for completed guarantees:

- ChartGPU tests prove wrapper calls to `dispose()` on injected instances. They
  do not measure browser GPU allocations or prove third-party resource release.
- Causal pre-cancellation tests prove early rejection. They do not measure how
  quickly every running MCI, FullCI, BivCI, PCMCI+, or LPCMCI inner loop stops.
- The current uncommitted upload gate prevents concurrent parser/dataframe peaks.
  It does not impose a byte-accurate cap on decoded Polars allocations.
- Several response schemas and the cleaning-plan body remain permissive placeholders.

## What should still be implemented

### 1. Finish upload admission control

The shared upload/preview semaphore in `AppState` now waits for a bounded
interval, returns the existing structured unavailable response (with the
service-wide `Retry-After` header), records admission lifecycle metrics, and is
documented in the README and configuration reference.

Remaining work:

- Test permit release on success, parse failure, cancellation, and handler drop.
- The focused timeout, release, and capacity test is now covered in the upload route unit suite.

Acceptance criteria:

- Only the configured number of sessions enter multipart extraction and parsing.
- Excess sessions wait only for the configured timeout or receive the documented response.
- No permit remains held after any exit path.
- Rejected or failed uploads do not replace the active dataset.

A strict decoded-memory quota is not required yet. Polars allocations, parser
buffers, decompression, and string cardinality make an upload-size multiplier
misleading. Add byte enforcement only if realistic CSV and compressed-Parquet
RSS measurements show that concurrency control and resident-version limits are insufficient.

### 2. Frontend state ownership — implemented

Workspace state now owns committed dataset metadata, viewport, selection,
filters, chart text, and series colors. Upload previews and transient timeseries
controls stay within their features; renderer references use a disposable chart
resource rather than a duplicate domain-state store.

- Migrated upload, timeseries, scatter, prepare, FFT, spectrogram, and shared UI
  consumers; removed `chartState`, `datasetState`, `uiState`, and their emitters.
- The architecture checker rejects production imports of the removed stores,
  including dynamic imports.
- Dataset commits own their metadata and reject foreign or disposed sessions.
  Dataset replacement cancels pending timeseries queries and clears cached data
  and zoom history; late responses cannot publish results for the old dataset.
- Upload previews cannot replace committed workspace metadata. Preview, upload,
  bootstrap, and chart initialization paths guard against disposal and late work.
- Shared controls release subscriptions/listeners on teardown, and session
  persistence reads and restores workspace-owned appearance and viewport state.

Regression coverage includes late query responses, preview response ordering,
preview disposal, session ownership, immutable metadata, and control cleanup.
Validation: all 1,442 frontend tests pass, as do TypeScript, architecture,
reachability, bundle budgets, packaged assets, and the production build.
Browser GPU allocation measurements remain part of the evidence gate below.

### 3. Complete high-value API schemas

Dataset metadata, scatter points, and upload response schemas are now explicit. Continue incrementally rather than attempting every operation in one change.

Implementation order:

1. Replace the permissive cleaning-plan object with schemas for every supported
   stage and its discriminated configuration.
2. Define response schemas for dataset identity, metadata, data JSON, scatter,
   causal, drift, cleaning validation, and job status.
3. Generate TypeScript DTOs and remove equivalent handwritten interfaces only
   after each generated type is adopted.
4. Validate shared contract fixtures with JSON Schema and Rust deserialization tests.

Acceptance criteria:

- Migrated operations contain no permissive placeholder for request or response DTOs.
- Contract bounds and Rust validation agree for strings, arrays, ranges, defaults,
  and unknown fields.
- Contract, OpenAPI, TypeScript, documentation, frontend consumers, and Axum
  routes remain synchronized by one check.

## Work that requires evidence before implementation

### Remaining causal cancellation points

Measure cancellation-to-worker-exit latency for MCI, FullCI, BivCI, PCMCI+, and
LPCMCI. Add inner-loop probes only where latency is material. Polling intervals
should follow benchmark results because every probe adds branching to numerical loops.

### Accessibility and mobile layout

Audit screenshots, keyboard behavior, and a screen reader at 320, 375, 768, and
desktop widths. Implement fixes tied to observed failures: focus order, meaningful
chart summaries, 44 px touch targets, overflow, and collapsible controls.

### Browser and GPU lifecycle

Add a real-browser lifecycle smoke test only if CI has a stable WebGPU runner.
Track instances across mount, replacement, initialization failure, and teardown.
Fork ChartGPU only if profiling shows retained resources after wrapper disposal.

## Recommendations that should not be implemented now

- Do not move LTTB to a browser worker. Reduction already happens on the backend,
  and no application-side LTTB hot path was found.
- Do not stream Arrow IPC yet. Data and scatter endpoints have configured output
  and work bounds. Streaming complicates caching and late error handling without
  evidence that bounded payloads cause harmful memory peaks.
- Do not add a GPU buffer pool. Zoom does not create new chart instances, and no
  buffer-churn evidence supports the complexity.
- Do not split `toolbar.css` for performance or tree shaking. Splitting alone does
  not reduce emitted CSS and risks changing cascade order. Extract owned sections
  only while actively changing them.
- Do not split `cleaning.rs` and `metadata.rs` solely because of file size. Extract
  cohesive units during functional changes where the boundary reduces coupling or
  enables focused tests.

## Delivery plan

| Phase | Scope | Exit condition |
|---|---|---|
| 1 | Finish upload admission | Stable retry behavior, metrics, docs, and concurrency coverage |
| 2 | Frontend state ownership — implemented | Legacy stores removed; architecture rule enforced; regression coverage added |
| 3 | Complete high-value schemas incrementally | Generated types adopted and cross-layer fixtures pass |
| 4 | Run causal, memory, browser, accessibility, and mobile measurements | Follow-up work has reproducible evidence and explicit thresholds |

Only phases 1–3 are implementation work recommended by this review. Phase 4 is
an evidence-gathering gate and may conclude that no further change is necessary.
