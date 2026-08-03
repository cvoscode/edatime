# Backend and Backend/Frontend Contract Improvements

Reviewed against commit `2e5404877136a00d6fa258c61d9e76f3800b33b5` on 2026-08-03. The P0, P1, and P2 implementation passes described below were completed on 2026-08-03. Performance acceptance numbers remain a separate measurement pass because the implementation sandbox cannot bind a loopback listener or provide a live PostgreSQL service.

## P1 implementation ledger

- **P1.1 foundation implemented:** every production `spawn_blocking` path now
  enters `QueryExecutor`. Interactive CPU, background/materialization, and
  blocking-I/O classes have independent concurrency and bounded waiting slots,
  a queue timeout, structured `503` plus `Retry-After`, and cancellation-safe
  queued/running/rejected/cancelled metrics. Only the executor owns a production
  `spawn_blocking`; remaining occurrences are test helpers.
- **P1.2 foundation implemented:** composite limits cover scatter-matrix pairs
  and total points, rolling cells, spectrogram cells, causal work, cleaning
  stages, and database rows. JSON routes have a 2 MiB default body limit while
  multipart upload keeps its streaming upload limit. Effective admission and
  work limits are published by `GET /api/v1/capabilities`; over-budget work is
  rejected before its expensive worker starts with `work_budget_exceeded`.
- **P1.3 implemented:** data, aggregate, scatter points, and scatter matrix use
  cancellation-safe per-key single-flight. A cold 32-caller unit burst elects
  exactly one producer, and producer cancellation elects one retry. Active
  correlation matrices use revision-scoped single-flight. Aggregate now reads
  its cache and its key includes format and every reduction parameter. Cache
  policy is private and metrics expose entries, bytes, evictions, expirations,
  waiters, computes, and in-flight producers.
- **P1.4 complete:** small `/data` windows are
  exact after one bounded probe instead of count plus collection. Large windows
  use one shared multi-series/color time envelope with exact filtered counts,
  bounded candidates, aligned columns, extrema, and explicit approximation
  headers. Large windows perform a bounded early-exit probe followed by one
  shared source scan; this preserves exact small responses without an
  unbounded count scan. A custom Polars sink is intentionally deferred unless
  measurement shows the bounded probe is material.
- **P1.5 complete:** scatter matrix validates total pair/output
  work, projects the union of required columns once, and feeds all deterministic
  per-cell reservoirs from one streaming scan. Correlations project and extract
  each numeric column once, reuse aligned raw/difference buffers across pairs,
  and compute only the requested mode unless populating the revision cache.
- **P1.6 complete:** analytics DTOs reject unknown fields,
  spectral-filter bounds use a lazy scalar min/max query, rolling serializes
  once, rolling/spectrogram outputs are budgeted, and FFT/spectrogram/spectral
  filter use bounded block-mean anti-alias sampling with explicit sampling
  metadata. Large tabular `/data` and scatter responses remain Arrow; bounded
  nested analytics stay JSON to avoid a second frontend transport shape.
- **P1.7 complete:** immediate metadata is cached by immutable
  dataset fingerprint and display-time identity, completed profiles are bounded,
  cleaning preview collects scalar counts rather than full frames and removes
  its redundant final scan, and outlier bounds use lazy aggregate/quantile
  expressions instead of per-column resident vectors. Warm metadata performs
  zero scans; durable artifact provenance stores row count and column identity
  for recovery while the first post-restart metadata read repopulates the
  bounded cache.
- **P1.8 complete:** terminal jobs have finite count/TTL retention, completed
  profile/immediate-metadata caches have finite defaults, artifact storage has
  finite byte/version defaults when configured, and resident versions have
  pre-mutation count/byte admission plus active-lineage-safe eviction.
  Fingerprints stream Arrow IPC directly through the hasher instead of
  allocating a second frame-sized byte vector. Retained counts/bytes,
  expirations, rejections, and evictions are observable.
- **P1.9 complete:** explicit database row/byte/time limits are enforced
  before connection/load work, request DTOs reject unknown fields, frontend
  connect/status/table/column/load contracts are typed, and PostgreSQL ingestion
  streams rows directly into typed column accumulators rather than retaining a
  full `Vec<Row>` and then allocating a second copy. Pool acquisition and the
  whole ingestion request are timed out, PostgreSQL receives a statement
  timeout, stable database error codes distinguish configuration/unavailable/
  timeout/query failures, and connection/load publication is atomic. The
  deterministic `postgres_benchmark_fixture.sql` supports the live measurement
  pass; direct database-to-Parquet is reserved for snapshots larger than the
  configured in-memory byte budget.

## P2 implementation ledger

- **P2.1 complete:** one core metrics implementation now owns fixed
  low-cardinality per-route handler/body latency histograms and p50/p95/p99,
  status/error counts, response bytes, completed/abandoned streams, admission,
  cache, job, and retained-state metrics. Body telemetry wraps the actual HTTP
  body, so it ends on stream completion/drop rather than handler return.
  `GET /api/v1/metrics/prometheus` exports Prometheus text while the compact
  JSON snapshot remains available.
- **P2.2 complete:** the empty service DTO module, duplicate service metrics
  module, duplicate `ResponseMeta`, root metrics re-export, and stale route
  alias are removed. Aggregate logging uses the versioned path. The API
  reference is generated from `contracts/api-v1.json`; CI checks its snapshot,
  the 51-operation router/frontend contract, one binary/metrics owner, stale
  production paths, and exclusive `QueryExecutor` ownership of
  `spawn_blocking`.

### P1 benchmark entry points

```bash
# Admission sweep and bounded overload/cancellation recovery. Metrics now
# include cpu_admission.{queued,running,rejected_total,cancelled_total}.
for concurrency in 1 2 4 8 16 32; do
  node scripts/bench_http.mjs run --target http://127.0.0.1:3000 \
    --requests 1000 --concurrency "$concurrency" --seed 0x5eed \
    --out "benchmarks/p1-admission-c${concurrency}.json"
done

# Cold single-flight bursts: clear/restart between runs and assert
# response_cache.computes increases by one for each identical-key burst.
node scripts/bench_http.mjs run --target http://127.0.0.1:3000 \
  --requests 32 --concurrency 32 --seed 0x5eed \
  --out benchmarks/p1-cold-burst.json

# Boundary tests should set each capabilities budget to N and issue 0.9N, N,
# and 1.1N composite shapes. The 1.1N case must return work_budget_exceeded
# before cpu_admission.started_total increases.
curl -s http://127.0.0.1:3000/api/v1/capabilities | jq .

# Inner-loop and route-path comparisons.
cargo bench -p edatime-service --bench rolling_bands
cargo bench -p edatime-service --bench correlations
cargo bench -p edatime-service --bench scatter_sample
cargo bench -p edatime-query --bench multi_envelope
cargo bench -p edatime-service --bench scatter_matrix

# Deterministic fixture manifests include seed, shape, schema/null policy,
# byte count, and SHA-256. Set EDATIME_BENCH_LARGE=1 for 10M Criterion cases.
node scripts/bench_http.mjs csv --fixture long_1m --out /tmp/long_1m.csv
node scripts/bench_http.mjs csv --fixture wide_100k --out /tmp/wide_100k.csv
psql "$EDATIME_BENCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/postgres_benchmark_fixture.sql

# HTTP classes: steady/data/scatter/correlations/rolling/cold-burst/overload/soak.
BENCH_SCENARIO=cold-burst BENCH_CONCURRENCY=32 make bench-http
BENCH_CONCURRENCY=32 make bench-cancel
BENCH_SECONDS=1800 BENCH_CONCURRENCY=16 make bench-soak
```

The P1 pass is verified by the full Rust workspace tests and doctests, strict
Clippy, Rust formatting, all 1,342 frontend tests, TypeScript/architecture/
bundle/asset checks, the 51-operation API contract/reference check, backend
hygiene checks, and compilation of
every workspace benchmark target. The production release binary also builds.
The live HTTP run must be repeated outside the restricted implementation
sandbox because that environment denied a loopback listener (`EPERM`).

## P0 implementation ledger

- **P0.1 complete:** integration tests now use the live plan-aware `POST`
  contract and the production application stack. The HTTP driver obtains
  immutable identity from metadata, creates a valid empty cleaning plan,
  bounds concurrency, uses a seeded schedule, fails on every non-2xx,
  validates content type/provenance, reports status classes and error codes,
  and captures metric deltas. `--requests` provides repeatable fixed-count
  schedules. CI compiles the real workspace benchmark targets.
- **P0.2 complete:** [`contracts/api-v1.json`](contracts/api-v1.json) is the
  checked machine-readable v1 operation/header/error contract and is served by
  `GET /api/v1/contract`. `scripts/check_api_contract.mjs` checks all 50
  method/path pairs against the backend router and frontend route table in CI.
  Missing frontend routes and scatter size fields were added, and JSON
  transports reject non-container payloads at runtime while route-specific
  metadata/scatter guards continue to validate their detailed shapes.
- **P0.3 complete:** `edatime-bin` is the only executable; the duplicate root
  entry point was removed. Production and integration tests share
  `edatime_service::app::build_app`, including graceful shutdown and peer
  `ConnectInfo`. Make, dev, docs, Docker, benchmark, and CI paths name the exact
  `edatime` binary. `/build` plus response headers expose version, commit,
  profile, and contract identity.
- **P0.4 complete:** database configuration is read-only, redacted, and the
  misleading write route was removed. CORS defaults to same-origin and has an
  explicit origin allowlist with DELETE preflight support. Forwarded client IPs
  are accepted only from configured direct peers. Rate-limit state is capped
  and pruned periodically rather than scanned on every request. Non-loopback
  binding is refused unless `allow_insecure_public` is explicitly enabled.
- **P0.5 complete:** primary validation failures use typed core variants and
  stable public codes. Framework 4xx rejections are normalized into the same
  error envelope. Every response carries a request and build identity; valid
  caller IDs flow through tracing, errors, and background job records. Expected
  failures use appropriate log levels, and direct frontend transports use the
  shared structured error parser.

The implementation deliberately removes obsolete surfaces instead of adding
compatibility aliases: the root executable, legacy integration-test GET calls,
the nonexistent `/api/v1/export/parquet` assertion, and the fake database
configuration write path are gone.

The live smoke check uploaded a 1,000-row/4-value-column `wide_frame`, then
passed preflight on data, scatter points, correlations, and rolling with 2xx,
correct content types, and complete provenance. An eight-request seeded run at
concurrency two completed with zero errors and drained admission counters
(`queued=0`, `running=0`). These smoke timings are validation evidence, not the
performance baseline for the second pass.

## P0 verification and benchmark entry points

```bash
# Correctness and contract coverage
cargo test --workspace --lib --tests
npm run check:frontend
npm test -- frontend/src/services/api/__contract__.test.ts \
  frontend/src/contracts/api/v1/routes.test.ts \
  frontend/src/services/api/http.test.ts
npm run check:api-contract
cargo bench --workspace --no-run

# Build and start the exact production executable
EDATIME_BUILD_SHA=$(git rev-parse HEAD) EDATIME_BUILD_PROFILE=release \
  cargo build --release -p edatime-bin --bin edatime
EDATIME_FRONTEND_DIR=$(pwd)/crates/edatime-bin/frontend/dist \
  ./target/release/edatime

# After uploading either long_numeric or wide_frame, validate every measured
# request shape before collecting numbers.
node scripts/bench_http.mjs preflight --target http://127.0.0.1:3000 \
  --out benchmarks/preflight.json
# Equivalent: EDATIME_TARGET=http://127.0.0.1:3000 make bench-contract

# Repeatable fixed-count comparison (same seed => same route counts).
node scripts/bench_http.mjs run --target http://127.0.0.1:3000 \
  --requests 1000 --concurrency 8 --seed 0xA5A5A5A55A5A5A5A \
  --out benchmarks/run.http.json

# Time-based soak mode.
node scripts/bench_http.mjs run --target http://127.0.0.1:3000 \
  --seconds 600 --concurrency 16 --out benchmarks/soak.http.json
```

Run `long_numeric` and `wide_frame` in separate server sessions. Do not replace
the dataset during a timed interval. The driver exits non-zero if a route is
unmeasured, returns a non-2xx, has the wrong content type, or omits provenance.

## Executive summary

The first pass should not optimize the backend against the existing HTTP baseline. The live router has moved its dataset and analytics routes to plan-aware `POST` requests, while the HTTP benchmark and a substantial part of `tests/api_integration.rs` still send legacy `GET` requests. The benchmark counts only network errors and `5xx` responses as failures, so a fast `405 Method Not Allowed` is currently recorded as successful performance. A targeted check confirms the mismatch:

```text
cargo test --test api_integration data_returns_arrow_ipc -- --exact
expected 200, received 405
```

The highest-value sequence is therefore:

1. Repair the executable, contract tests, and benchmark harness so they exercise the application the frontend actually uses.
2. Establish one generated contract and one structured error/provenance model.
3. Put all CPU-heavy work behind bounded admission and add output/work budgets.
4. Remove repeated scans, cold-cache duplication, and unbounded retained state.
5. Benchmark cold, warm, concurrent, cancellation, and soak behavior separately.

## Priority key

- **P0**: prerequisite, correctness, security, or invalid measurement.
- **P1**: material latency, throughput, or memory improvement.
- **P2**: maintainability and operational visibility that makes later work safer.

## Findings and recommended improvements

### P0.1 — Repair the contract tests and HTTP benchmark before using their numbers

**Evidence**

- `crates/edatime-service/src/handlers/routes/mod.rs` exposes `/data`, scatter, correlations, drift, and all analytics routes as plan-aware `POST` endpoints.
- `scripts/bench_http.mjs` still builds query-string `GET` requests and does not send the required `cleaning_plan` envelope.
- The driver treats only `status >= 500` or transport failure as an error. All `4xx` responses, including `400`, `405`, `413`, `415`, `422`, and `429`, count as successful samples.
- The driver uses `Math.random()`, so the route mix is not repeatable.
- The documented workload needs both `long_numeric` and `wide_frame`, but the server has one active dataset. The current single mixed run uploads `wide_frame`, so it does not measure the documented million-row `/data` and rolling workload.
- The rundown loop calculates `pending = submitted - started - completed`; queue depth and running work are actually `submitted - started` and `started - completed` respectively.
- The script records only an end metrics snapshot even though `scripts/benchmark.md` calls for start/middle/end deltas.
- The checked-in July baseline predates the current POST contract and reports legacy `GET` request counts. It is useful historical evidence, but it is not a valid baseline for the current API.

**Improve**

- Make the benchmark obtain `/metadata`, build a valid empty cleaning-plan envelope from the returned immutable identity, and issue exactly the same method/body/header shapes as the frontend.
- Fail a run if any measured route has no `2xx` response, an unexpected content type, missing provenance headers, or a non-zero `4xx`/`5xx` rate.
- Record status classes separately and include a bounded sample of structured error codes.
- Use a seeded request schedule and record the seed.
- Run long-series and wide-frame scenarios separately, then report them together. Do not swap the active dataset inside a timed interval.
- Capture start and end metrics and report deltas. Measure queue depth and running work with the correct formulas.
- Update `tests/api_integration.rs` to construct the same plan-aware bodies as the frontend. Remove legacy GET assertions rather than adding compatibility aliases unless backwards compatibility is explicitly required.
- Replace the CI command `cargo bench --bench pipeline_bench --no-run`; no such bench target exists. Compile the actual workspace bench targets.

**Benchmark/verification**

- Add a fast `bench-contract` preflight that sends one request to every route in the workload and validates method, status, content type, error envelope, Arrow schema/JSON shape, and provenance.
- Gate every load run on `2xx == total`, `4xx == 0`, `5xx == 0`, and at least one sample per configured route.
- Run the driver twice with the same seed and require identical request counts per route.
- Required correctness commands after repair:

  ```bash
  cargo test --workspace --all-targets
  npm test -- frontend/src/services/api/__contract__.test.ts frontend/src/contracts/api/v1/routes.test.ts
  cargo bench --workspace --no-run
  ```

### P0.2 — Create one machine-readable API contract

**Evidence**

- `crates/edatime-service/src/dto.rs` is empty; request and response structs are distributed through large handler modules.
- The frontend maintains manual DTOs in `frontend/src/contracts/api/v1/*` and several transport-specific shapes elsewhere.
- `postJson<T>` and `getJson<T>` cast parsed JSON to `T` without validation. Runtime guards cover only part of metadata/scatter and do not validate analytics, drift, database, jobs, cleaning, or upload responses.
- The canonical frontend route table omits live backend routes including health, metrics, database columns, database config, and aggregate.
- `ScatterPointsResponse` on the backend includes size fields that are absent from the frontend contract.
- Naming is inconsistent across the same versioned API: metadata/analytics mostly use snake case, cleaning/jobs use camel case, and drift request fields use camel case.
- Column lists are sometimes comma-separated strings and sometimes arrays. A column name containing a comma is not round-trippable through the string form.

**Improve**

- Define public request/response/error/header schemas in a dedicated service contract module. Generate OpenAPI/JSON Schema from Rust and generate the TypeScript DTO/client layer from that artifact.
- Include methods, paths, request bodies, response content types, structured errors, provenance headers, cache/sampling headers, and job state enums.
- Prefer arrays for column selections. Keep comma-separated input only as a documented compatibility form if required.
- Select one casing convention for new v1 fields. Preserve existing wire names during the first implementation pass and use schema generation to stop further drift.
- Validate JSON responses at the frontend boundary. Keep Arrow schemas in explicit contract tests because OpenAPI alone cannot describe the IPC field-level contract well enough.
- Add a checked-in generated-contract snapshot and fail CI if Rust DTOs/routes change without regenerating it.

**Benchmark/verification**

- Run a router-to-schema coverage test: every Axum route/method must exist in the contract and every frontend route must resolve to one contracted operation.
- Round-trip representative and boundary payloads through Rust serialization and frontend runtime validation.
- Measure frontend validation overhead on 1 KB, 100 KB, 1 MB, and 10 MB JSON payloads. Gate common payload overhead to less than 2 ms or 5%, whichever is larger; large tabular payloads should remain Arrow.

### P0.3 — Consolidate to one executable and one production build path

**Evidence**

- There are two server entry points: `src/main.rs` and `crates/edatime-bin/src/main.rs`.
- The root binary installs graceful shutdown and `ConnectInfo<SocketAddr>`; `edatime-bin` does neither and ends with `axum::serve(...).await.unwrap()`.
- `make run` and `scripts/dev.mjs` run `edatime-bin`, while README and Docker instructions target the root `edatime` binary.
- `scripts/benchmark.md` builds `-p edatime-bin` but then executes `target/release/edatime`, which can run a stale or different binary.
- The Dockerfile copies only root-era paths, refers to a missing root `benches/` directory, does not copy the workspace crates, and pins a Rust image older than the toolchain assumptions recorded in `Cargo.toml`.

**Improve**

- Keep one thin binary crate and remove the duplicate root binary after compatibility callers are migrated.
- Put router/layer construction in a reusable library function so production, integration tests, and benchmarks use the identical stack.
- Preserve graceful shutdown and peer connection information in the canonical binary.
- Make Makefile, README, Dockerfile, dev script, benchmark procedure, and CI name and execute that exact binary.
- Add a build identity endpoint/header containing commit, profile, and contract version so benchmark artifacts prove which executable handled the run.

**Benchmark/verification**

- Build once, start the exact produced path, and assert its build identity before load begins.
- Add a container smoke test: build image, start it, upload a small fixture, execute one Arrow and one JSON request, send SIGTERM, and require clean exit within a fixed grace period.
- Compare startup time, idle RSS, and graceful-shutdown time before and after consolidation; behavior should improve or remain within 5%.

### P0.4 — Fix the network/security boundary

**Evidence**

- `GET /config/database` returns the configured database connection string. `POST` echoes it and says settings were saved even though `AppConfig` is immutable and nothing is persisted.
- CORS permits any origin but lists only GET and POST, even though the frontend contract includes DELETE for database disconnect. Cross-origin behavior is both broader and less functional than intended.
- Client IP extraction trusts forwarding headers from any peer. A client can choose a new `x-forwarded-for` value to bypass rate limits.
- When the `edatime-bin` entry point is used, peer `ConnectInfo` is absent, so direct clients without forwarding headers share the key `unknown`.
- `RateLimiter::check` locks one global map and performs `retain` over the whole client map for every request. Spoofed client keys make the map and per-request work grow.
- There is no authentication boundary. This is acceptable only while the server is guaranteed to bind locally; Docker explicitly binds `0.0.0.0`.

**Improve**

- Never return secrets. Return a redacted `configured: true/false` or credential source identifier.
- Either implement config persistence truthfully or remove/mark the write endpoint unsupported.
- Default CORS to same-origin/no CORS. If cross-origin mode is configurable, use an allowlist and include every contracted method/header.
- Trust proxy headers only when the direct peer is in a configured trusted-proxy range; otherwise use the TCP peer.
- Replace global per-request retention with sharded/bucketed expiry or a maintained expiry queue, and cap client entries.
- Refuse non-loopback binding unless an explicit insecure-public-mode flag or real authentication is configured. Protect database, upload, config, metrics, job, and dataset-mutating routes consistently.

**Benchmark/verification**

- Security tests: spoofed forwarding headers cannot evade a limit; an untrusted origin fails; DELETE preflight succeeds only for an allowed origin; responses never contain passwords or full DSNs.
- Rate-limiter microbench at 1, 1,000, 10,000, and 100,000 distinct clients. Track p95 check time and heap growth; target near-constant lookup cost and a hard memory bound.
- Run a 10-minute spoofed-IP load and require stable RSS after the configured expiry window.

### P0.5 — Make errors and request identity consistent end to end

**Evidence**

- `AppError` derives error codes by searching human-readable error strings for words such as `width`, `bucket`, and `column`. Wording changes can silently change the public code.
- Axum JSON, query, multipart, body-limit, unsupported-method, and not-found rejections can bypass `AppError`, so the frontend cannot rely on the documented error envelope.
- Direct Arrow helpers in `timeseries.ts` and `scatter.ts` build plain-text errors instead of using `readApiError`.
- Every error is logged at error level, including expected validation failures and rate limits.
- The correlation ID is created only when an error is constructed. It is not a request ID propagated through middleware, response headers, logs, jobs, or async work.

**Improve**

- Give core/query/store errors typed variants carrying a stable public code; map variants explicitly at the HTTP boundary.
- Normalize all framework rejections and 404/405 responses into the same versioned error schema.
- Create a request ID in middleware, accept a valid caller ID only under a documented policy, return it on every response, and propagate it through tracing spans and spawned jobs.
- Make every frontend transport use one structured error parser.
- Log validation/not-found at info or debug, conflicts/rate limits at warn, and unexpected failures at error.

**Benchmark/verification**

- Table-driven contract tests for malformed JSON, unknown fields, missing fields, bad content type, oversized body, stale plan, 404, 405, 409, 413, 415, 422, 429, and 500.
- Assert that status, code, kind, message, and request/correlation ID are stable and that the same ID appears in headers and captured logs.
- Measure middleware overhead with a no-op route at concurrency 1/32; target less than 2% throughput regression.

### P1.1 — Put all CPU-heavy work behind one bounded admission system

**Evidence**

- `QueryExecutor` has separate interactive/background semaphores, but many handlers call `tokio::task::spawn_blocking` directly.
- Direct paths include scatter points/matrix/correlations, rolling/anomaly/FFT/spectrogram/spectral filtering/causal work, aggregate reduction, upload parsing, metadata, and parts of state/version handling.
- Only a subset records CPU-admission metrics. Scatter matrix and several analytics operations are invisible to the current counters.
- Dropping an HTTP request does not stop an already-started blocking Polars or analytics task. A disconnected client can leave expensive work running.
- There is no request timeout or bounded queue wait at the service layer.

**Improve**

- Create one executor API for interactive CPU work, background work, materialization, and I/O-heavy blocking work. Each class needs a bounded queue, concurrency limit, queue timeout, metrics, and request/job identity.
- Route every `spawn_blocking` call through it. Avoid nested Rayon/Polars/Tokio oversubscription by documenting and enforcing the total worker budget.
- Reject overload predictably with a structured `503`/`429` and `Retry-After` rather than allowing unbounded queue growth.
- Add cooperative cancellation checkpoints where algorithms can support them. For non-cancellable Polars collections, keep the permit until actual completion and expose orphaned-after-disconnect work in metrics.

**Benchmark/verification**

- Concurrency sweep at 1, 2, 4, 8, 16, and 32 for each workload class and for a mixed workload.
- Record throughput, p50/p95/p99, queue wait, in-flight/queued/rejected counts, CPU utilization, and peak RSS.
- Cancellation test: cancel 50 large requests after 100 ms, then send a normal viewport request. Bound recovery latency and prove queue/in-flight counters return to zero.
- Gate: common-route p95 stays within 5%, overload RSS plateaus, queue depth is bounded, and the service recovers without restart.

### P1.2 — Add request work/output budgets instead of independent parameter clamps

**Evidence**

- Scatter matrix validates the per-pair point limit but does not cap pair count; total output can be `pairs × effective_limit`.
- Spectrogram independently allows up to 32,768 points, a 4,096-sample window, and hop size 1. Some combinations create tens of millions of JSON cells.
- Rolling returns an array for every input row and selected column with no response point/byte limit.
- Cleaning plans have no stage-count limit, and preview performs work for every stage.
- Database `limit`/`snapshot_limit` have large defaults but no configured upper-bound validation when explicitly supplied.
- The global 256 MiB body limit also applies to JSON endpoints, allowing unnecessarily large plan/request bodies.

**Improve**

- Estimate work and output before execution: rows × columns, pairs × points, STFT windows × frequency bins, rolling rows × bands, causal units, preview stages × scans, and estimated encoded bytes.
- Reject over-budget requests with a specific code and returned limits, or convert genuinely long operations into observable background jobs.
- Add small JSON/body limits per route family while preserving a separately configured streaming upload limit.
- Make all limits configuration-backed and publish effective limits through a capabilities endpoint/contract.

**Benchmark/verification**

- Boundary matrix at 0.9×, 1.0×, and 1.1× each work limit.
- Require valid boundary requests to finish within an agreed latency/RSS envelope and over-budget requests to reject before expensive CPU work starts.
- Use adversarial combinations, not only individual maximum values.

### P1.3 — Add server-side single-flight and correct cache behavior

**Evidence**

- `ResponseCache` stores completed bytes but has no per-key single-flight. Concurrent cold misses duplicate query, sampling, and serialization work.
- Correlation warmup has its own race behavior; the historical baseline records multiple misses around one cold start.
- The aggregate route creates and inserts a cached response but never calls `cache.get`, so it recomputes every request while consuming cache space.
- Cache observability lacks current entries/bytes, evictions, expired entries, per-route hit rate, and single-flight waiters.
- Cache invalidation clears everything on dataset changes even though plan-aware keys identify immutable source versions that can later be reselected.

**Improve**

- Add cancellation-safe per-key single-flight so one producer computes and waiters share the completed immutable bytes.
- Fix aggregate cache lookup or remove the unused insertion until aggregate becomes plan-aware.
- Make cache policy explicit per route and immutable version. Retain reusable versioned entries within byte/TTL limits rather than relying only on global invalidation.
- Expose entries, resident bytes, evictions, expirations, coalesced waiters, and compute counts.
- Do not advertise `public` cacheability for session/dataset-specific responses unless proxy semantics are deliberately supported. Prefer explicit ETags/identity and a safe private/no-store policy.

**Benchmark/verification**

- Cold-burst tests with 1/8/32 identical requests; the expensive compute counter must increase by exactly one while all callers receive byte-identical bodies and provenance.
- Warm-hit benchmark for data, aggregate, scatter points/matrix, and correlations. Record p95, allocations, and lock contention.
- Cancellation test where the producer disconnects but waiters still complete or receive a defined retryable failure.

### P1.4 — Make `/data` a single-pass, bounded, multi-series path

**Evidence**

- The route first performs a full filtered-row count and then executes a second plan to obtain candidates.
- The lazy bounded envelope is used only for one numeric series with no color. Multi-series and color requests materialize the entire filtered frame before LTTB despite a response target of `width × 2`.
- The route then converts the reduced frame to Arrow/JSON and caches the full serialized body.

**Improve**

- Produce count and bounded multi-series/color candidates in one scan where possible.
- Implement an aligned multi-series envelope/reservoir strategy that preserves time order, first/last points, extrema, null alignment, and color association.
- Keep exact behavior for small windows and explicitly label approximate overview behavior in the contract.
- Push projection, time filter, and reduction into the lazy plan before collection.

**Benchmark/verification**

- Criterion cases: 100 K, 1 M, and 10 M rows; 1/4/16 numeric series; with/without color; width 50/800/4,000; resident and scan-backed Parquet.
- End-to-end cold and warm HTTP measurements with cache disabled/enabled.
- Record scans/bytes read, p95 latency, peak RSS, candidate rows, response bytes, and Arrow decode time.
- Correctness gates: ordered timestamps, first/last preservation, bounded output, aligned columns, no loss of isolated extrema, and a documented visual-error metric against the exact reduction.

### P1.5 — Avoid one full scatter scan per matrix cell and improve wide correlations

**Evidence**

- Scatter matrix loops over normalized pairs, clones the lazy frame, filters, samples, and collects each pair independently.
- There is no pair-count cap, so both scan count and output grow linearly with requested cells.
- Correlation work is quadratic in numeric column count; the existing 16-column/5,000-row Criterion result already identifies the pair loop as dominant.
- Scatter matrix has no dedicated Criterion benchmark even though it is a separate hot path.

**Improve**

- Resolve and project the union of required columns once, apply the cleaning/time plan once, and derive all requested pairs from a shared bounded row sample or shared batches.
- Reuse column extraction/ranking work across correlation modes and pairs.
- Keep deterministic seeds and make sampling scope/version explicit so cached and repeated responses are stable.
- Cap pairs/output using the work-budget system.

**Benchmark/verification**

- Add `scatter_matrix` Criterion cases for 4, 16, 64, and 256 pairs at 10 K/100 K/1 M rows, with numeric and categorical color.
- Extend correlation benches to 32/64 columns and raw/difference/Spearman/Kendall modes.
- Track source scans, pair calculations, p95, peak RSS, response bytes, and sample determinism.
- Gate semantic equivalence of per-cell totals, point alignment, cardinality metadata, and correlation tolerances.

### P1.6 — Bound and encode analytics responses efficiently

**Evidence**

- Rolling serializes the payload once to measure response bytes and then `Json` serializes it again for the response.
- Rolling, FFT, spectral filter, and spectrogram use JSON arrays for large numeric vectors/matrices; historical rolling responses are about 1 MiB for only 5,000 rows.
- Analytics query structs are inconsistent about `deny_unknown_fields`; misspelled fields can silently fall back to defaults.
- Spectral filter resolves omitted time bounds by collecting the full planned dataset and scanning timestamps in memory.
- Several analytics operations downsample with simple stride, which can alias periodic data and lose peaks.

**Improve**

- Serialize once and send the resulting bytes, or record actual response-body bytes at a transport layer.
- Add `max_points`/output budgets to rolling and use Arrow for large aligned numeric results. Consider Arrow for spectrogram matrices or a compact typed binary representation.
- Validate unknown fields and semantic parameter combinations uniformly.
- Resolve time bounds with lazy min/max aggregation.
- Replace stride sampling with an analysis-appropriate anti-aliasing/aggregation strategy and expose sampling metadata.

**Benchmark/verification**

- Measure compute, serialization, compression, transfer, frontend parse/decode, response bytes, and peak RSS separately.
- Shapes: rolling 5 K/100 K/1 M rows × 1/8 columns; spectrogram boundary combinations; FFT/spectral filtering on multi-frequency fixtures with known peaks.
- Correctness gates: peak-frequency error, filtered-signal RMSE, rolling-band tolerance, STFT dimensions, and no non-finite JSON values.

### P1.7 — Reduce repeated scans in metadata, profiles, cleaning preview, and proposals

**Evidence**

- `/metadata` recomputes row count and time min/max on every request rather than using immutable version metadata/cache.
- Exact/sample profiles collect a complete/bounded DataFrame and then run another blocking profiling pass.
- Cleaning preview collects the source, then each enabled prefix plan, then the final plan: approximately `enabled stages + 2` collections.
- Outlier proposals collect the full planned frame and allocate a finite `Vec<f64>` per requested column.

**Improve**

- Store immediate row/time/schema facts with each immutable dataset version and serve them without rescanning.
- Cache profile results by version and algorithm with bounded retention.
- Compute preview impacts using optimized scalar lazy aggregations, reuse identical prefixes, and cap stage count. Consider a sampled fast preview plus an explicit exact background preview for large sources.
- Compute outlier aggregates/quantiles lazily or with bounded sketches rather than collecting every selected value.

**Benchmark/verification**

- Metadata cold/warm benchmark on 1 M/10 M rows and 8/64/256 columns; warm metadata should perform zero source scans.
- Cleaning preview at 1/5/20/100 stages, recording scans, bytes read, latency, and RSS.
- Profile and outlier cases with exact-vs-approximate error checks and cancellation.

### P1.8 — Bound dataset versions, jobs, profiles, and fingerprint memory

**Evidence**

- In in-memory mode, every uploaded root and materialized child is retained as a resident `LazyFrame`; there is no version count/byte cap.
- Artifact retention is optional and its default caps are `None`.
- `JobRegistry` never expires/removes terminal jobs, and the profile cache retains entries keyed by version/algorithm.
- `fingerprints_for_frame` serializes the whole resident frame to Arrow bytes before hashing, temporarily increasing allocation and upload/materialization latency.

**Improve**

- Add explicit session retention policies for resident versions, artifacts, profiles, and terminal jobs. Preserve the active lineage but make eviction/expiry observable.
- Use streaming/incremental fingerprints while ingesting or writing artifacts; avoid materializing a second full Arrow copy.
- Publish retained bytes/counts and rejection/eviction reasons.
- Choose safe finite defaults and allow operators to opt into larger retention.

**Benchmark/verification**

- Soak: repeatedly upload and materialize representative datasets for 30–60 minutes. RSS/disk/job counts must plateau at configured limits.
- Measure upload/materialization wall time and peak RSS with fingerprinting isolated.
- Verify selected/active lineages remain recoverable after eviction and restart.

### P1.9 — Stream database ingestion and make its contract typed

**Evidence**

- PostgreSQL ingestion uses `client.query`, retaining all `Row` values before constructing a second set of column vectors and then a DataFrame.
- Explicit request limits are not clamped to a configured maximum.
- Frontend database functions return `unknown`; database columns are absent from the canonical frontend route table.
- Connection and load failures are often mapped to internal errors even when they are authentication, timeout, configuration, or user-selection errors.

**Improve**

- Use a cursor/COPY/streaming protocol and write batches directly into Arrow/Parquet or chunked Polars structures.
- Apply configured row/byte/time limits and statement timeouts.
- Define typed connect/status/table/column/load contracts and stable error codes.
- Separate connection establishment from dataset mutation so failures cannot leave partially updated pool/info state.

**Benchmark/verification**

- Test PostgreSQL/Timescale fixtures at 100 K/1 M/10 M rows and 8/64 columns over local and latency-injected connections.
- Record database time-to-first-batch, rows/s, peak RSS, total bytes, cancellation latency, and active dataset atomicity on failure.

### P2.1 — Improve metrics so optimizations can be attributed

**Evidence**

- Runtime metrics provide totals and a global average but no request latency histogram/quantiles.
- CPU stage metrics cover only some direct blocking tasks.
- Cache size/eviction/single-flight, active requests, response bytes by route, version memory, job queue depth, and rejected work are not exposed.
- Middleware duration stops when the response object is returned, not when a streamed body has been consumed, so it is not equivalent to client-observed latency.
- There are two different metrics implementations: `edatime-core/src/metrics.rs` is used by state, while `edatime-service/src/metrics.rs` remains publicly exported by the root facade.

**Improve**

- Keep low-cardinality per-route histograms for handler time, queue time, serialization time, and body completion time.
- Add gauges/counters for admission, cache, retained state, jobs, streaming bodies, errors by stable code, and response bytes.
- Export one metrics implementation in Prometheus/OpenTelemetry-compatible form while retaining a compact JSON snapshot for local diagnostics.
- Document server-processing versus client full-body latency.

**Benchmark/verification**

- Compare a representative load with metrics disabled/enabled; target less than 2% throughput and p95 overhead.
- Cross-check request/status/byte counts against the external driver within 1%, allowing explicitly documented in-flight requests.

### P2.2 — Remove duplicate and stale surfaces

**Evidence**

- Duplicate server binaries, metrics implementations, and `ResponseMeta` types exist.
- Backend DTO ownership is unclear (`dto.rs` is empty while handlers own public types).
- Documentation still claims both `/api` and `/api/v1`, legacy GET methods, routes that no longer exist, and old source layout.
- Root facade re-exports the unused service metrics implementation, while live state uses core metrics.
- Aggregate query logs still label the route `/api/aggregate`.

**Improve**

- After the generated contract and one binary are in place, delete duplicate metrics/HTTP types and route DTO definitions.
- Make docs derive route tables/examples from the same contract artifact where practical.
- Add dead-code/dependency checks and keep compatibility re-exports time-bounded with removal notes.

**Benchmark/verification**

- Track clean release build time, binary size, duplicate dependencies (`cargo tree -d`), and public API docs before/after.
- Require documentation examples to pass as contract smoke tests.

## Implemented benchmark suite for the measurement pass

The driver validates the live build/contract and immutable dataset identity,
uses bounded concurrency and seeded schedules, consumes full response bodies,
and fails normal load runs on every non-2xx, content-type, or provenance error.

### Deterministic fixtures

| Fixture | Shape | Purpose |
| --- | --- | --- |
| `tiny_contract` | 100 rows, mixed dtypes/nulls/non-finite values | Fast contract and error tests |
| `long_1m` | 1,048,576 rows × 8 numeric columns | Data, rolling, FFT, upload |
| `long_10m` | 10,000,000 rows × 8; scan-backed when managed artifacts are enabled | Streaming and RSS stress |
| `wide_5k` | 5,000 rows × 16 numeric columns | Existing correlation comparison |
| `wide_100k` | 100,000 rows × 64 numeric columns | Wide correlation/matrix stress |
| `categorical_100k` | Numeric x/y plus 1,000 categories | Scatter color/cardinality |
| `postgres_1m` | 1,000,000 rows × 16 columns | Database streaming |

Every CSV fixture generator writes a sidecar manifest containing its seed,
row/column count, schema policy, null/non-finite policy, byte count, and SHA-256.
The PostgreSQL fixture is generated deterministically by
`scripts/postgres_benchmark_fixture.sql`.

### Scenario classes

1. **Contract preflight** — one valid and representative invalid request per route.
2. **Cold single request** — empty cache; captures actual computation and peak allocation.
3. **Warm single request** — populated cache; captures serialization/body/cache overhead.
4. **Cold burst** — 8 and 32 identical requests; validates single-flight.
5. **Concurrency sweep** — 1/2/4/8/16/32 clients; finds saturation and queue behavior.
6. **Mixed interactive load** — deterministic frontend-like route schedule per fixture.
7. **Cancellation/overload** — aborted expensive work followed by normal interactive traffic.
8. **Soak** — repeated uploads, versions, profiles, jobs, and requests for 30–60 minutes.

### Measurements

- Client: status class/code, p50/p95/p99 full-body latency, throughput, bytes, content type, contract validation result.
- Server: handler/queue/compute/serialize/body time, CPU utilization, queued/running/rejected work, cache compute/hit/miss/coalesced counts.
- Memory: idle, p95, peak RSS, and post-rundown RSS. For selected cases add allocator/heap profiling.
- Correctness: provenance identity, deterministic hashes, Arrow schema, JSON schema, row/point counts, numerical/visual error against exact output.
- Environment: commit, dirty diff, exact binary path/build identity, Rust/Node versions, release profile, configuration, CPU governor, host/container details.

### Target command surface

```bash
# Correctness and contract generation
make check-contract
make test-contract

# Deterministic inner-loop benchmarks
cargo bench -p edatime-query --bench downsample
cargo bench -p edatime-service --bench scatter_sample
cargo bench -p edatime-service --bench rolling_bands
cargo bench -p edatime-service --bench correlations
cargo bench -p edatime-service --bench scatter_matrix
cargo bench -p edatime-query --bench multi_envelope

# Against an already-running canonical release binary: generate/upload one
# fixture outside the timed interval, preflight, then select a scenario.
node scripts/bench_http.mjs upload --fixture long_1m --out /tmp/long_1m.csv \
  --target "$EDATIME_TARGET"
make bench-contract
BENCH_SCENARIO=data BENCH_CONCURRENCY=8 BENCH_SEED=1 make bench-http

node scripts/bench_http.mjs upload --fixture wide_100k --out /tmp/wide_100k.csv \
  --target "$EDATIME_TARGET"
BENCH_SCENARIO=cold-burst BENCH_CONCURRENCY=32 BENCH_SEED=1 make bench-http
BENCH_CONCURRENCY=32 make bench-cancel
BENCH_SECONDS=1800 BENCH_CONCURRENCY=16 BENCH_SEED=1 make bench-soak
```

### Comparison protocol and acceptance gates

- Use the same host, configuration, fixture bytes, binary profile, and seeded schedule for before/after runs.
- Run one warm-up plus at least five measured repetitions. Compare medians and retain every raw artifact; do not compare only one selected run.
- Correctness, contract, and bounded-resource gates pass before performance is considered.
- A performance change is accepted when it improves its named bottleneck materially (suggested target: at least 10% for CPU microbenches or 20% for p95/RSS of a specifically redesigned path) and common-workload p95/RSS do not regress by more than 5%.
- Reliability/security improvements may trade small performance regressions, but the tradeoff must be recorded with the measured amount.
- Queue/running counts must return to zero after rundown; retained-state soak metrics must plateau at configured caps.
- Never combine timings from the long and wide fixture runs into one percentile. Report each scenario and route independently, then provide a clearly weighted summary if needed.

## Suggested second-pass implementation order

1. P0.1 benchmark/test repair and a new current baseline.
2. P0.3 single executable/build path so all later measurements target one server.
3. P0.2 and P0.5 generated contract plus uniform errors/request IDs.
4. P0.4 security boundary.
5. P1.1 admission and P1.2 work budgets.
6. P1.3 single-flight/cache fixes.
7. P1.4–P1.9 path-specific performance work, one measured change at a time.
8. P2 observability and duplicate-surface cleanup.
