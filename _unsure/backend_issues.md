# Backend review

Reviewed 2026-09-24 at `a0a08387`. Scope: the Rust routes, query operations, ingestion, profiles, source versions, and caches serving Overview, Data source, Signals, Preparation, Correlation matrix, and Pair plot. Standards: `rust_style.md`, especially explicit units and numerical semantics, validated boundaries, bounded work, short lock lifetimes, and deliberate materialization.

Priority: **P1** = incorrect analytical results, a broken core workflow, or a serious capacity risk; **P2** = significant edge-case correctness/reliability issue; **P3** = smaller improvement. Evidence distinguishes executed reproductions from static findings and proposals requiring measurement. Frontend consequences and fixes are in `frontent_issues.md`.

## Findings, ordered by priority

### B01 — P1: Valid fill and resample plans cannot be previewed

**Locations:** `crates/edatime-service/src/handlers/routes/cleaning.rs:957`, `crates/edatime-query/src/cleaning.rs:391`, `crates/edatime-query/src/cleaning.rs:503`.

The preview compiles each stage as a new one-stage plan. Compilation revalidates prerequisites against that truncated plan, so a fill or resample stage cannot see its preceding time-sort stage. Having already sorted the input LazyFrame does not satisfy the plan validator.

**Reproduced:** Both `sort(date ascending) → fillNull(HUFL, forward)` and `sort(date ascending) → resample(1h, mean HUFL)` return HTTP 200 from `/cleaning/validate`, then HTTP 400 from `/cleaning/preview`, claiming the earlier sort is missing. Preparation requires a successful preview before enabling “Create prepared dataset.”

**Correction:** Validate the complete plan once, then apply stages through an internal compiler that carries validated ordering/schema context. Do not weaken public validation. Add route tests covering successful preview and marginal impacts for both sequences, including disabled and reordered sort stages.

### B02 — P1: A valid Preparation sort breaks Signals downsampling

**Locations:** `crates/edatime-service/src/handlers/routes/data.rs:149`, `crates/edatime-service/src/handlers/routes/data.rs:168`, `crates/edatime-query/src/pipeline.rs:135`.

The time-envelope path requires ascending timestamps, but it consumes the cleaned frame without establishing that order. The canonical plan legitimately allows descending time sorts and sorts by other columns. This makes chart success depend on whether the viewport crosses the envelope threshold.

**Reproduced:** On the existing 69,680-row source, an otherwise valid descending `date` sort followed by `/data` with `width=50` returns HTTP 500: `group_by_dynamic` reports unsorted input.

**Correction:** Establish a stable ascending time order in the chart query after the canonical transformations and before the probe/envelope/LTTB path. Keep this presentation ordering separate from the saved plan's transformation semantics. Test ascending, descending, non-time sorts, duplicates, and both sides of the sampling threshold.

### B03 — P1: Signals mixes milliseconds, microseconds, and Date units

**Locations:** `crates/edatime-service/src/handlers/routes/data.rs:85`, `crates/edatime-service/src/handlers/routes/data.rs:169`, `crates/edatime-query/src/pipeline.rs:109`, `crates/edatime-core/src/temporal.rs:99`, `crates/edatime-store/src/db.rs:563`.

The route converts viewport bounds into native ticks, computes a bucket width in those ticks, then passes it to a helper interpreting its argument as **milliseconds**. Database timestamps are microsecond datetimes, so these buckets are 1,000 times too wide. Separately, multiplying epoch milliseconds by the Date multiplier of 1 compares milliseconds with physical day counts and excludes valid rows.

**Reproduced against the current route in an isolated AppState:** A 1,000-row microsecond source becomes four envelope points at `width=50`. A three-row Date source covering January 1–3 returns zero rows for January 1–4. A query-level comparison produced 101 buckets for milliseconds and one bucket for the same interval in microseconds/nanoseconds.

**Correction:** Compute envelope durations from epoch-millisecond bounds; use the existing dtype-aware `epoch_ms_to_native` conversion for filter bounds. Document units in parameter types/names. Test database Date and microsecond inputs as well as upload-normalized milliseconds.

### B04 — P1: Metadata can attach the wrong time range to the selected time column

**Locations:** `crates/edatime-service/src/handlers/routes/metadata.rs:618`, `crates/edatime-service/src/handlers/routes/metadata.rs:871`, `crates/edatime-service/src/handlers/routes/metadata.rs:921`, `crates/edatime-service/src/handlers/routes/metadata.rs:1142`, `crates/edatime-store/src/versions.rs:20`, `crates/edatime-store/src/state.rs:681`.

Immediate metadata and the full profiler autodetect a time column, then treat the selected name as an alias for `ts`. Ingestion now preserves real column names. If a source contains both `ts` and a different selected time column, metadata can rename `ts` to an already existing column and use the wrong column's bounds. The selected name also lives in mutable repository state rather than the immutable version; source switching and profile jobs can therefore use another source's name.

**Reproduced in an isolated AppState:** With `ts=[0,1000,2000]` and selected `event_time=[100000,101000,102000]`, `/metadata` returns two columns named `event_time`, `time_column="event_time"`, and range `0..2000`.

**Correction:** Store the actual selected time column with each source version. Pass it explicitly to immediate and full profiling instead of cosmetically renaming an autodetected column. Capture this metadata before asynchronous work and restore it with version selection. Test two temporal columns, a literal `ts` column, switching versions, and a source change during profiling.

### B05 — P1: Correlation work has no per-request size budget and collects unused columns

**Locations:** `crates/edatime-service/src/handlers/scatter/correlations.rs:124`, `crates/edatime-service/src/handlers/scatter/correlations.rs:521`, `crates/edatime-service/src/handlers/scatter/correlations.rs:600`, `crates/edatime-core/src/config.rs:151`, `crates/edatime-store/src/cache.rs:28`.

**Static capacity finding:** Both matrix and Pair plot correlation requests materialize the full working frame, including nonnumeric columns, extract every numeric column, and compute every pair. The route does not enforce the configured selected-column/analytics limits or an equivalent row-by-pair budget. A bounded executor limits concurrent jobs, but not the memory or CPU required by one wide request. The working correlation cache is limited to 24 entries, without a byte limit; each result contains quadratic matrices and counts.

**Impact:** Opening Pair plot on a wide source can initiate an all-column matrix even when only two axes are visible. Large string columns unnecessarily increase collection size. Rank metrics and concurrent metric requests increase the cost further.

**Correction:** Project required columns before collection; expose and enforce explicit correlation column/row/pair or byte budgets. Return a useful limit error or an explicitly disclosed sampled mode. Allow pair/base-only work when a full suggestion matrix is unnecessary, and cap retained result bytes. Measure peak RSS and latency across narrow/tall and wide sources; no throughput improvement is claimed here.

### B06 — P2: Envelope-reduced data can be reported as exact

**Locations:** `crates/edatime-service/src/handlers/routes/data.rs:193`, `crates/edatime-service/src/handlers/routes/data.rs:207`, `crates/edatime-service/src/handlers/routes/data.rs:265`, `crates/edatime-query/src/pipeline.rs:314`.

`was_downsampled` describes only the final LTTB pass. If the envelope already has fewer rows than the target, that pass returns false even though most original observations were removed. The response then advertises `x-edatime-downsampled: 0` alongside `x-edatime-approximate: 1`. Signals currently uses the first field to show “Exact.”

**Reproduced:** A 1,000-row source with duplicate millisecond timestamps returns four rows, 996 dropped rows, `approximate=1`, and `downsampled=0`. This is independent of B03.

**Correction:** Derive the reduction/exactness contract from the whole pipeline, for example `envelope_used || was_downsampled`, and make the frontend honor approximation metadata. Test a single occupied bucket, duplicate timestamps, ordinary envelopes, and truly exact windows. See F05.

### B07 — P2: Undefined self-correlations are published as 1

**Locations:** `crates/edatime-service/src/handlers/scatter/correlations.rs:564`, plus the corresponding diagonal initialization in `compute_correlation_matrix` at `:600`.

Every diagonal is assigned `Some(1.0)` and a full-frame count without inspecting finite values or variance. Constant, all-null, and empty columns consequently get a valid-looking perfect coefficient. A linear ramp also has constant first differences, for which the difference correlation is undefined.

**Reproduced:** Adding a constant derived column returns diagonal `1.0` while its correlations with other columns are null. The isolated probe confirms the same behavior in first-difference mode.

**Correction:** Use the same eligibility/variance rules for diagonal and off-diagonal coefficients, with counts from eligible observations. If a diagonal is intentionally a navigation placeholder, represent that separately from a numerical coefficient. Add constant, empty, all-invalid, singleton, and constant-difference cases.

### B08 — P2: Explicit time selection removes statistics from an “exact” preview

**Locations:** `crates/edatime-service/src/handlers/routes/metadata.rs:357`, `crates/edatime-service/src/handlers/routes/metadata.rs:236`, `crates/edatime-service/src/handlers/routes/metadata.rs:496`.

A preview with no time-column override uses the full profiler. Supplying any override switches to a different aggregate implementation that leaves quantiles, histograms, zero/distinct information, and time quality unavailable, but still labels the result `exact`.

**Reproduced:** For the same three-row CSV, auto-detection returns median `2`, a histogram, and zero count `0`; explicitly choosing the same `date` column returns none of those fields. The frontend therefore loses distributions merely by changing a time selector.

**Correction:** Share one profiling implementation with an explicit time-column argument. If a reduced report is intentional, expose its coverage accurately rather than presenting it as the same completed report. Test auto-detection and explicit selection for equivalent statistics.

### B09 — P2: An invalid explicit time column silently falls back to another column

**Locations:** `crates/edatime-service/src/handlers/routes/metadata.rs:132`, `crates/edatime-service/src/handlers/routes/metadata.rs:377`.

`detect_time_column` falls through to automatic detection when an override is absent from the schema. The later validation sees the fallback column and accepts the request.

**Reproduced:** Previewing a CSV containing `date,x` with `time_column=missing_time` returns HTTP 200 and `time_column=date`.

**Correction:** Distinguish “no override supplied” from “invalid override supplied,” and return a field-specific 400 for the latter. This also prevents the wrong-file frontend bug in F09 from looking successful.

### B10 — P2: Malformed upload constraints silently expand the loaded dataset

**Locations:** `crates/edatime-service/src/handlers/routes/upload.rs:300`.

**Static finding:** Invalid `n_rows` becomes unlimited, invalid `skip_rows` becomes zero, malformed time bounds become absent, and invalid column JSON becomes no projection. Field-read failures are also converted to defaults. In addition, the catch-all multipart branch treats any unrecognized field as file bytes and can append multiple files into one temporary file.

**Impact:** A client typo or partial request can ingest substantially more data than requested or produce a confusing parse failure after concatenating unrelated fields.

**Correction:** Parse present fields into validated request types; return 400 on malformed values or conflicting limits. Accept exactly one named file field and reject unknown/duplicate fields. Test absent versus malformed values without using the live dataset as a fixture.

### B11 — P2: Heavy work still runs directly in async request futures

**Locations:** `crates/edatime-service/src/handlers/routes/data.rs:180`, `crates/edatime-service/src/handlers/routes/data.rs:193`, `crates/edatime-service/src/handlers/routes/data.rs:207`, `crates/edatime-service/src/handlers/routes/upload.rs:352`, `crates/edatime-service/src/handlers/routes/upload.rs:420`, `crates/edatime-store/src/state.rs:371`, `crates/edatime-store/src/state.rs:533`, `crates/edatime-store/src/versions.rs:128`.

**Static scheduling finding:** Collection is admitted to the executor, but envelope expansion, LTTB, and Arrow/JSON serialization run afterward in the Tokio future. Uploads synchronously write each multipart chunk to a filesystem file. Eager dataset replacement/materialization synchronously computes a content fingerprint by serializing the entire frame before its admitted Parquet-writing task; the resident registration path also fingerprints synchronously.

**Correction:** Use the existing bounded executor for the substantial CPU stages and an asynchronous or admitted writer for upload spooling. Keep permits with the actual worker, including after caller cancellation. Measure event-loop responsiveness and p95/p99 latency with concurrent upload, chart, and profile traffic; the review did not load-test scheduler stalls.

### B12 — P2: Selecting a retained Parquet version eagerly loads the whole dataset

**Locations:** `crates/edatime-store/src/state.rs:681`, `crates/edatime-store/src/versions.rs:47`.

**Static finding:** `select_dataset_version` resolves the retained source as a LazyFrame, immediately collects all of it, and installs a resident DataFrame into the repository. A version originally backed by a lazy managed Parquet artifact therefore becomes a full resident copy just by being selected from Preparation.

**Correction:** Restore a scan-backed repository snapshot and its stored metadata/provenance for artifact sources. Keep eager behavior only where required for a resident source, with the same memory accounting as ingestion. Validate version switching using an artifact larger than the intended resident-memory budget; that large-data scenario was not executed here.

### B13 — P2: “Exact” distinct/constant checks lose large-integer identity

**Locations:** `crates/edatime-service/src/handlers/routes/metadata.rs:684`, `crates/edatime-service/src/handlers/routes/metadata.rs:726`, `crates/edatime-service/src/handlers/routes/metadata.rs:761`.

The profiler casts every numeric column to `Float64` before deriving distinct values, extrema, and constant status. Distinct integers beyond the exact floating-point integer range can collapse to one value; for example, `9007199254740992` and `9007199254740993` convert to the same float.

**Reproduced in the current-code profiler:** A two-row `i64` column containing those values reports `distinct_count=1`, `is_constant=true`, and identical minimum/maximum under `profile_status="exact"`.

**Correction:** Compute exact distinct/constant checks and integer extrema in the native dtype, converting only metrics that require floating-point arithmetic. Define how large integer extrema are serialized to JavaScript without implying exact numeric precision. Test signed/unsigned 64-bit boundary values and preserve the distinction between exact identity and approximate numerical summaries.

## Analytical contract requiring an explicit decision

### B14 — P2: First differences bridge missing observations and use saved row order

**Locations:** `crates/edatime-service/src/handlers/scatter/correlations.rs:388`, `crates/edatime-service/src/handlers/scatter/correlations.rs:426`, `crates/edatime-service/src/handlers/scatter/correlations.rs:476`, `frontend/src/utils/correlationModes.ts:38`.

**Verified behavior; the intended policy needs clarification in the product contract.** The code removes pairwise-missing observations and then differences the compacted pairs. Thus a delta can span a missing interval, and different variable pairs can measure different elapsed steps. It also uses canonical row order, including a user sort by a non-time column. The UI describes “step-to-step changes” without exposing this distinction. The backend comment explicitly describes adjacent *aligned* observations, so this report does not assume the implementation accidentally deviates from its own comment.

**Numerical probe:** `x=[0,null,100,101,103]`, `y=[0,3,-100,-99,-97]` produces difference Pearson approximately `-0.99985`. Differencing original adjacent rows first and then dropping incomplete deltas leaves `[1,1]` and `[2,2]`, giving `+1`. This is a materially different question, not rounding noise.

**Correction:** Choose and document chronological adjacency and gap handling. For consecutive-row changes, difference aligned nullable columns before excluding invalid deltas and report their actual count. If compressed valid-observation changes are intended, label them and disclose the gap/order policy. Add tests with asymmetric missingness, masked values, and non-time sorting.

## Improvement opportunities — measure before claiming speedups

### B15 — P2: Reduce work and lock scope in plan compilation/preview

**Locations:** `crates/edatime-service/src/handlers/routes/cleaning.rs:893`, `crates/edatime-service/src/handlers/routes/cleaning.rs:953`.

The working-plan cache mutex stays locked while a source is resolved and the plan/schema is compiled. Preview separately executes a row count for each enabled stage and then collects examples from source and result. This is a useful target on remote/large Parquet sources or longer plans.

**Proposal:** Release the cache lock after lookup, compile outside it, and recheck on insertion. After fixing B01, reuse justified intermediate work or skip row recounts for operations proven not to change row count. Compare optimized Polars plans and scan counts before adding materialized caches; do not trade away lazy execution or exact stage attribution without measurement.

### B16 — P3: Avoid parallel full-size numeric structures in exact profiling

**Location:** `crates/edatime-service/src/handlers/routes/metadata.rs:684`.

Each numeric column currently allocates both a full finite-value vector and a distinct-value HashSet, then sorts the vector for quantiles. After preserving native integer identity as in B13, consider native distinct aggregation or counting transitions in an already sorted representation. Preserve signed-zero/non-finite semantics. Benchmark peak RSS and profile duration on high-cardinality columns; streaming quantiles would change the exact-report contract and need a separate mode.

### B17 — P3: Simplify route ownership and remove unreachable correlation paths

**Locations:** `crates/edatime-service/src/handlers/routes/cleaning.rs`, `crates/edatime-service/src/handlers/scatter/correlations.rs:291`, `crates/edatime-service/src/handlers/scatter/correlations.rs:885`.

The cleaning route module combines HTTP orchestration, plan validation, stage-impact execution, language emitters, manifests, and archive/export assembly. Correlation handlers retain fallback branches for identities without a plan hash, although their current required-envelope resolver always supplies one.

**Proposal:** Extract cohesive preview, handoff/code-generation, and execution-context helpers as affected code changes. Remove unreachable HTTP branches only after checking remaining bench/warmup consumers, retaining their independent numerical targets where needed. Prefer typed resolved plan/source context over repeatedly optional values. This is a maintainability opportunity, not a request for a broad rewrite.

## Validation and limits

- Read the requested standards and traced frontend callers to their Rust handlers, shared plan compiler, source registry, profiling code, sampling, correlation computation, and caches.
- `cargo fmt --all -- --check` passed on the reviewed tree.
- `cargo test -p edatime-query cleaning --offline --lib`: **18 passed**.
- Ran read-only live API reproductions for valid-plan preview failures, descending-sort Signals failure, constant-column correlation, and explicit-time preview behavior. Upload probes used `/upload/preview`; they did not ingest or replace the active source.
- Compiled and ran temporary query/service examples against the current code using isolated in-memory sources. These reproduced native timestamp errors, contradictory sampling headers, wrong selected-time metadata, large-integer profile collapse, and missing-gap correlation behavior. Probe sources are removed from the repository after review.
- The already running API reports an unknown build SHA; live results were checked against the source and, for the central numerical/metadata findings, current-code isolated probes. No claim that the live executable is cryptographically tied to this commit.
- No full-workspace Clippy/test run, real database round trip, large-data RSS/load benchmark, or export execution in external Python/Rust environments. Capacity improvements above have no measured speedup claim. Passing existing tests does not cover the reproduced boundary cases.

Suggested repair order: B01–B04, the analytical/exactness contract B06–B09/B13–B14, then B05/B10–B12. Measure B15–B16 before selecting an optimization.
