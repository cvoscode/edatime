# Benchmark Procedure

This document defines the reproducible local benchmark procedure for the
Rust/Axum/Polars backend. It is required reading before running any of
the optimization phases in `backend_plan.md`. It is **not** wired into
ordinary CI: timing thresholds depend on runner variance and host
hardware, so the CI gate that consumes this data is intentionally
deferred.

## Goals

1. Capture a **baseline** of p50/p95/p99 latency, throughput, peak RSS,
   and cache-hit rate for the four hot routes before any optimization.
2. Establish a **reproducible procedure** so before/after comparisons
   from different machines and toolchains remain defensible.
3. Provide **Crate-level Criterion benches** for deterministic inner
   loops (scatter sampler, rolling bands, correlation matrix) so the
   per-request telemetry can be cross-referenced with raw function cost.

## Two required artifact classes

| Class | Source | Purpose |
| --- | --- | --- |
| Criterion bench | `cargo bench` on `crates/edatime-service` and the local `edatime-bench` crate | Deterministic inner-loop measurement; reproducible on any host. |
| HTTP driver | `node scripts/bench_http.mjs --target http://localhost:3000` | End-to-end latency under realistic concurrency against a release build. |

Both are required because Criterion does not exercise the full request
lifecycle (cache, response headers, trace layer, runtime admission), and
the HTTP driver does not isolate a single inner loop.

## Environment capture

Run this snippet before any benchmark and save the output alongside the
result file. It is the "who, what, when" of the run:

```bash
{
  echo "=== rustc ==="
  rustc --version
  echo "=== git ==="
  git rev-parse HEAD
  git status --porcelain
  echo "=== host ==="
  uname -a
  grep -E '^model name|^cpu cores' /proc/cpuinfo | head -2
  free -h | head -2
  echo "=== release profile ==="
  grep -A6 '\[profile.release\]' Cargo.toml
  echo "=== runtime env vars (EDATIME_*) ==="
  env | grep '^EDATIME_' | sort
  echo "=== started ==="
  date -Iseconds
} > benchmarks/$(date -u +%Y%m%dT%H%M%SZ).env
```

The file is the first entry in the result log. If `git status` shows
uncommitted changes, label the run "dirty" and report the diff alongside.
The `EDATIME_*` env capture makes runtime overrides (e.g. rate-limit
caps) reproducible between hosts and tools — without it, a future
re-run may silently use different parameters than the captured one.

## Synthetic fixtures

Two fixtures are required so every hot path exercises a representative
shape:

| Fixture | Shape | Used by |
| --- | --- | --- |
| `long_numeric` | 1 ms-spaced time series, 1 048 576 rows, one numeric column with 1 % null / non-finite seeding | `/api/v1/data`, `/api/v1/analytics/rolling` |
| `wide_frame`   | 1 s-spaced time series, 5 000 rows, 16 numeric columns, no nulls | `/api/v1/scatter/points`, `/api/v1/scatter/correlations` |

Both builders live in `edatime-bench/src/fixtures.rs` and are
deterministic — same `(rows, columns, seed)` always yields the same
bytes. Do **not** commit generated `.parquet`/`.csv` files; the
builders regenerate them on every run.

A reproducible way to ship fixtures to a separate host is to vendor the
same random seed and rebuild with `scripts/bench_http.mjs --fixture
long_numeric`. Sending the fixture bytes across the wire is unnecessary
because the builder is cheap enough to run inline.

## HTTP driver

`scripts/bench_http.mjs` drives a single host with concurrency and a
request mix. The mix is intentionally NOT left to operator choice:
**70 % `/api/v1/data`, 20 % `/api/v1/scatter/points`, 10 %
`/api/v1/scatter/correlations`** plus a steady low-rate
`/api/v1/analytics/rolling` request. This matches the `backend_plan.md`
"PGO workload" recommendation so this driver doubles as the PGO
reference when we get to that phase.

The driver must collect, for every request:

- Latency (full handshake → last byte), in ms.
- Status code.
- Process RSS of the server, sampled once per second (via `/proc/<pid>`
  on Linux; documented limitation on macOS / Windows).
- `/api/v1/metrics` snapshot taken at the start, middle, and end of the
  run so we can pull `scatter_stages.*`, `correlations_stages.*`,
  `rolling_stages.*`, and `cpu_admission.*` aggregates.

Output is JSON written to `benchmarks/<env>.http.json`. Do not print to
stdout.

### Running the driver

```bash
# 1. Build and start the server in release mode.
cargo build --release -p edatime-bin
EDATIME_FRONTEND_DIR=$(pwd)/crates/edatime-bin/frontend/dist \
    ./target/release/edatime \
    &

SERVER_PID=$!
# 2. Upload the wide fixture so correlation and scatter endpoints have
# data to operate on.
node scripts/bench_http.mjs upload --fixture wide_frame
# 3. Run the timed workload for 60 s at concurrency 16.
node scripts/bench_http.mjs run --seconds 60 --concurrency 16
# 4. **Drain the spawn_blocking queue.** The metrics snapshot will be
# taken on the next step; if we snapshot immediately, in-flight
# `record_cpu_submit` calls (synchronous in the HTTP handler) will have
# been counted but their matching `record_cpu_started` (inside the
# closure) will not yet have fired. This produces a misleading
# `submitted > started` ratio. The `run` subcommand already waits 15 s
# for the rundown, but the spawn_blocking pool can be backed up further
# under high concurrency; wait until
# `pending = submitted - started - completed` is stable.
# 5. Snapshot /api/v1/metrics and shut down the server.
node scripts/bench_http.mjs snapshot --out benchmarks/run.metrics.json
kill "$SERVER_PID"
```

### What to record (write into the result file)

- **`latency_ms`** — p50, p95, p99 per route and aggregated.
- **`throughput_rps`** — total successful requests per second.
- **`peak_rss_mib`** — max `/proc/<pid>/status` `VmRSS` during the run.
- **`error_rate`** — fraction of requests with status >= 500.
- **`cache_hit_rate`** — `/api/v1/metrics` `scatter_stages.cache_hit_total
  / (cache_hit_total + cache_miss_total)` ratio at the end of the run
  (use this only for routes whose snapshots expose those counters —
  currently scatter; treat others as 0 until Phase 1 finishes).
- **`stage_breakdown_ns`** — `collect_ns_total / sample_ns_total /
  serialize_ns_total` for scatter, `collect_ns_total /
  pair_calc_ns_total` for correlations, `compute_ns_total` for rolling.
  Use the *delta* between snapshot at start and snapshot at end, do not
  totalise.
- **`cpu_admission`** — `submitted_total`, `started_total`,
  `completed_total` per stage (query, scatter, correlations,
  analytics). Stage imbalance (started - submitted growing under load)
  is the leading indicator for thread-pool saturation.

### cpu_admission snapshot-timing caveat

`record_cpu_submit` runs synchronously in the HTTP handler (before
`spawn_blocking` returns a `JoinHandle`). `record_cpu_started` and
`record_cpu_completed` run **inside** the spawned closure on a worker
thread. The metrics snapshot is taken at a single point in time, so
under high concurrency you will routinely see:

```
submitted_total > started_total   (jobs in queue)
started_total   ≥ completed_total (jobs in flight or done)
```

This is **not a bug** and not double-counting — every call site calls
`record_cpu_submit` exactly once. The 2× ratio that appears in early
baselines (e.g. `Query: submitted=150, started=75, completed=75`) means
75 spawn_blocking jobs were still in the queue at snapshot time. The
correctness invariant to gate on is:

```
pending = submitted - started - completed ≈ 0   at end of run
started + completed ≈ request_count            per stage
```

If `pending` is non-zero at end of run, the run was either truncated
early or the spawn_blocking pool is saturated. Use the `--rundown`
flag on the driver to wait longer, or check `pair_calc_ns_total` /
`compute_ns_total` for per-stage cost.

The `correlations.requests_total` counter also has a documented
imbalance against `request_counts["GET /api/v1/scatter/correlations
200"]`: the warmup path (`record_correlation_warmup_dispatched`)
contributes to `cpu_admission` but not to HTTP `request_counts`, and
the first cold-cache request that races the warmup counts in
`requests_total` but may not return 200. Net difference observed in
the 2026-07-14 baseline: `+2` (1 warmup + 1 cold-cache race). This is
expected and is **not** a gating signal.

## Criterion benches

`cargo bench` drives:

- `crates/edatime-service/benches/scatter_sample.rs` — measures
  `collect_sampled_xyc_rows` against the `wide_frame` fixture at row
  counts `{10_000, 100_000, 500_000}`.
- `crates/edatime-service/benches/rolling_bands.rs` — measures
  `compute_rolling_bands` against the `long_numeric` fixture at
  windows `{50, 200, 2_000}`.
- `crates/edatime-service/benches/correlations.rs` — measures
  `compute_correlation_matrix` against the `wide_frame` fixture at
  numeric-column counts `{4, 8, 16}`.

All three bench files use `criterion::Criterion` with a single sample
size and a wall-clock measurement; do not add memory/throughput
assertions because host allocator behavior varies. Save Criterion's
HTML output alongside the HTTP result:

```bash
cargo bench -- --output-format bencher | tee benchmarks/<env>.bench.txt
```

## Phase 0.3 — baseline gates

A change is accepted only if **all three** of these hold against the
representative workload:

1. Contract tests in `tests/api_integration.rs` and the targeted
   per-phase service tests pass.
2. The change improves the named bottleneck in
   `backend_plan.md`'s "Current evidence" table on the representative
   workload, **or** it supplies a material reliability or memory benefit
   with an explicitly recorded tradeoff.
3. p95 latency and peak RSS on the small/common workload (`long_numeric`
   at default limits) do not regress by more than 5 %.

Record each accepted phase as a new section in `benchmarks/<env>.bench.md`
that points at the matching `*.http.json`, `*.bench.txt`, and
`*.metrics.json` artefacts.

## Things to NOT do during this work

- **Do not** add a CI gate based on these numbers until runner variance
  is characterised. CI cold-start noise can produce 2× swings.
- **Do not** commit generated `.parquet`/`.csv`/`.arrow` fixture files;
  the deterministic builders regenerate them.
- **Do not** profile against `/api/v1/health` — its single-byte response
  is dominated by the trace layer and gives misleading p99s.
- **Do not** use `wrk` against the server while another `cargo test`
  is running — the locks held by tests will skew scatter sampler
  microbenchmark numbers.

## Reference artefacts (filled in during a run)

- `benchmarks/<env>.env` — host, toolchain, profile.
- `benchmarks/<env>.http.json` — HTTP driver output.
- `benchmarks/<env>.bench.txt` — Criterion human-readable summary.
- `benchmarks/<env>.metrics.json` — `/api/v1/metrics` end-of-run
  snapshot for cross-referencing with telemetry counters.
- `benchmarks/<env>.bench.md` — human-written pass/fail against the
  Phase 0.3 gates.
