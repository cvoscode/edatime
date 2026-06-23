# Rust Style, Performance, and Service Engineering Knowledge Base

This is a broad reference for Rust services, data pipelines, and numerical workloads. It is organized around the language, standard-library, tooling, idiomatic-Rust, performance, async, and unsafe topics in [cheats.rs](https://cheats.rs/), then applies those ideas to Axum, Tokio, Polars, Arrow, Rayon, ndarray, and RustFFT.

It is deliberately larger than an individual repository style guide. The final **edatime profile** distinguishes verified local conventions from reusable guidance. Do not read a recommendation tagged **measure first** as a mandate or as evidence that a dependency/configuration already exists.

## Contents

1. [Principles](#principles)
2. [Language constructs and APIs](#language-constructs-and-apis)
3. [Idiomatic Rust and common traps](#idiomatic-rust-and-common-traps)
4. [Memory, layout, allocation, and ownership](#memory-layout-allocation-and-ownership)
5. [Performance workflow](#performance-workflow)
6. [Polars, Arrow, and Parquet](#polars-arrow-and-parquet)
7. [Async, Tokio, and concurrency](#async-tokio-and-concurrency)
8. [Numerical work](#numerical-work)
9. [Errors, observability, and unsafe](#errors-observability-and-unsafe)
10. [Cargo, tooling, and profiles](#cargo-tooling-and-profiles)
11. [edatime profile](#edatime-profile)
12. [Review checklists](#review-checklists)

## Principles

1. Make invalid states difficult to construct: enums, newtypes, validated request types, explicit units, and finite ranges beat strings, sentinels, and boolean combinations.
2. Keep work close to the abstraction that can optimize it. Use iterator pipelines for in-memory sequences and lazy expressions for columnar data before writing row loops.
3. Treat every allocation, clone, lock, thread, and task as an ownership decision. None is inherently bad; all need a reason.
4. Keep synchronous CPU, file, and blocking-library work out of async futures.
5. Measure before optimizing. The right metric is usually p95/p99 latency, peak RSS, rows/s, payload bytes, or CPU cost under representative load—not a micro-optimization in isolation.
6. Prefer safe code. `unsafe` is a narrowly scoped proof obligation, not a way around the borrow checker.
7. Preserve context at boundaries: validate inputs, add structured tracing, return stable external errors, and retain causes internally.

## Language constructs and APIs

### Data structures, enums, and visibility

- Prefer named-field structs for requests, responses, configuration, and domain state. Tuple structs are ideal for newtypes: `struct TimestampNs(i64);`.
- Use enums for mutually exclusive states and errors. A `match` that must cover every variant is a useful correctness check.
- Use `const` for values without identity or interior mutability; reserve `static` for genuine process-wide state such as a metric or immutable lookup table.
- Default items and fields to private. Expose the smallest useful API with `pub(crate)` or `pub` only when a consumer needs it.
- Use `#[non_exhaustive]` for a public enum only when external consumers must not rely on its full set of variants. It makes downstream matching more constrained.

### References, pointers, and ownership

| Need | Prefer | Avoid |
| --- | --- | --- |
| Read a sequence | `&[T]` | `&Vec<T>` |
| Read text | `&str` | `&String` |
| Mutate caller-owned data | `&mut T` / `&mut [T]` | cloning to obtain mutability |
| Transfer one owner | `T` | `Box<T>` unless indirection is needed |
| Shared immutable ownership | `Arc<T>` | `Arc<Mutex<T>>` by default |
| Single-thread shared ownership | `Rc<T>` | `Rc` across threads |
| Runtime polymorphism | `dyn Trait` at a boundary | trait objects in a hot inner loop without evidence |

The key aliasing rule is many `&T` readers or one `&mut T` writer. When the compiler rejects a mixed borrow, reduce the borrow's scope, split the data with a safe API such as `split_at_mut`, or move/copy the small value needed after mutation. Do not reach for `unsafe` to suppress it.

### Functions, control flow, and patterns

- Prefer expression-oriented code: let the final expression return the value; use `?`, `if`, `match`, and `loop` as expressions.
- Use `let Some(x) = value else { return ... };` when an early exit is the clear happy-path shape.
- Use `if let` for one interesting variant and `match` where exhaustiveness or multiple arms makes the cases clearer.
- Use `match` guards sparingly. They can make logic harder to audit and do not participate in exhaustiveness in the same way as explicit variants.
- Prefer `impl Trait` or generics when the caller can choose a concrete type and static dispatch is useful. Use `dyn Trait` when a heterogeneous runtime collection or plugin boundary is the actual requirement.
- Do not invent generic bounds just to look flexible. `T: AsRef<Path>` is often right for paths; accepting `Into<String>` is right only when the function actually takes ownership of the converted string.

### Strings, conversion, and macros

- Take `&str` when reading; create `String` when transferring or building owned text. Use `Cow<'_, str>` only when both borrowed and owned return paths materially avoid copying.
- Do not index a `str` by byte offset without an established UTF-8 boundary. Use character-aware methods or operate on bytes only when the protocol is explicitly byte-oriented.
- Use `format!("{name}: {value}")` for a fresh string and `write!(&mut output, ...)` when appending to an existing buffer.
- Derive ordinary traits (`Debug`, `Clone`, `PartialEq`, `Serialize`, `Deserialize`) when they accurately represent the type. Do not derive `Copy` for a type whose inexpensive-looking copies hide meaningful semantics.
- Prefer targeted attributes such as `#[allow(clippy::...)]` immediately beside a justified exception. Avoid blanket lint suppression.

## Idiomatic Rust and common traps

### Think in iterator pipelines, not automatically in loops

```rust
// A single allocation at the output boundary.
let labels: Vec<_> = samples
    .iter()
    .filter(|sample| sample.is_valid())
    .map(|sample| sample.label())
    .collect();
```

Iterator chains communicate transformation, preserve fusion opportunities, and avoid temporary collections. A `for` loop is still appropriate when it is clearer, needs early mutation, or has control flow that would obscure an iterator chain. Do not use iterators as a style contest.

Avoid collecting in the middle of a pipeline unless ownership, reuse, or an API boundary requires it:

```rust
// Prefer one pass.
let total: f64 = values.iter().filter(|v| v.is_finite()).sum();
```

### Common smells

| Smell | Why it hurts | Better approach |
| --- | --- | --- |
| Clone to satisfy the borrow checker | Can change semantics and create allocation/copy cost | Shorten the borrow, move ownership, or change the API. |
| `unwrap` on request data | Converts input errors into process panics | Return `Result` or handle `Option` explicitly. |
| Interior mutability by default | Hides mutation and adds runtime locking/borrow checks | Use `&mut self`; add `Mutex`, `RwLock`, or `RefCell` only for a real sharing constraint. |
| `Arc`/`Rc` by default | Adds allocation and reference-counting | Start with owned fields or borrowing. |
| Trait object for known concrete types | Can prevent inlining and add indirection | Use generics or an enum where the type set is static. |
| Shared mutable global cache | Couples unrelated work and retains memory | Use bounded, revision-aware state with a clear owner. |
| Manual string concatenation in a loop | Reallocates and can be quadratic | Reserve capacity or use `write!`. |
| Eager row materialization of columnar data | Loses vectorization and pushdown | Keep work in Polars/Arrow expressions until a boundary. |

### Modules and documentation

- Modules should describe a capability, not merely a technical mechanism. A route should orchestrate HTTP; validation, query planning, export, and numerical algorithms should have independently testable homes.
- Keep `mod.rs`/module roots focused on public API and submodule wiring. Avoid putting implementation bodies there once the module grows.
- Public types and behaviour-changing functions need docs that state units, null/NaN rules, order requirements, allocation/ownership expectations, and error conditions.
- Examples in docs should compile when practical. For non-compiling pseudocode, label it as such.

## Memory, layout, allocation, and ownership

### Size and representation

- Use `std::mem::size_of::<T>()` when layout is central to a performance claim. Do not estimate from field sizes when padding, alignment, niches, or platform differences matter.
- Use `#[repr(C)]` at a genuine C/FFI boundary and document the peer layout. Do not add it as a general optimization flag.
- Use `#[repr(align(N))]` only for a measured alignment or false-sharing problem. It can increase object size and cache pressure.
- `#[repr(packed)]` makes field references potentially unaligned; reserve it for controlled wire-format interop and deserialize into a normal Rust type promptly.
- `Option<NonZeroU32>`, `Option<NonNull<T>>`, and similar niche optimizations can help compact representations, but are rarely worth contorting a public model around without a memory measurement.

### Allocation discipline

- Reserve `Vec` and `String` capacity when there is a reliable upper bound. Do not fabricate a huge estimate that keeps memory resident unnecessarily.
- Reuse buffers inside one owner/task for repeated operations. Pool shared buffers only after observing allocation pressure and after defining capacity limits, reset rules, and contention behaviour.
- Keep borrowed data borrowed through a pipeline. A clone of `Arc`, a Polars `Series`, or a `DataFrame` can be cheap at one layer but still extend retention or trigger work elsewhere; understand the API before relying on it.
- Store compact wire values in the representation that preserves the required meaning: timestamps often as `i64` plus documented unit, categorical/status values as compact codes, and display-only values as lower precision only after an accuracy decision.

### Locks, atomics, and caches

- Lock late and unlock early. Snapshot the owned data or lightweight handles needed for expensive work; never hold a lock while awaiting or computing a large query.
- Use atomics for counters, flags, and sequence values—not as a substitute for a coherent state model. Pick memory ordering from a documented synchronisation need, not habit.
- Separate cache identity from cache storage. Keys must include data revision, filters, units, algorithm/version, and output-shaping parameters that affect correctness.
- Bound caches by entries and bytes, define eviction, and record hit/miss/eviction metrics. An unbounded cache is a delayed memory outage.

## Performance workflow

### Measure first

1. Define the hypothesis and user-visible metric: p99 latency, rows/s, peak RSS, upload time, payload bytes, or CPU per request.
2. Use a representative dataset, request distribution, concurrency level, and build profile.
3. Record a baseline: p50/p95/p99, throughput, CPU, RSS, allocations, response size, errors, and the hardware/toolchain.
4. Change one independent variable; rerun enough samples to separate a trend from noise.
5. Keep the change only when its gain is worth the portability, compile-time, complexity, and regression cost.

### High-value questions before low-level tuning

- Can the service scan fewer rows, columns, files, or row groups?
- Can it send fewer bytes or avoid format conversion?
- Is work duplicated by cache misses, eager collection, repeated parsing, or a bad request shape?
- Is concurrency bounded at the right layer, or are parallel runtimes oversubscribing CPUs?
- Is the time dominated by allocation, serialization, I/O, lock waiting, or computation?

Only after those answers should you evaluate an allocator, manual SIMD, `get_unchecked`, cache-line padding, or CPU-specific compiler flags.

### Profiling and benchmarks

- Use Criterion for small, deterministic kernels. Feed dynamic inputs through `black_box` and benchmark realistic size distributions, not one toy input.
- Use a CPU profiler for end-to-end CPU time and an allocation profiler for repeated allocation/retention. Flame graphs identify where time goes; domain metrics tell why.
- Track stage timings such as `rows_scanned`, `rows_returned`, `polars_collect_ms`, `downsample_ms`, `fft_ms`, `serialize_ms`, and `response_bytes`.
- A benchmark is a regression guard only when it has a stable workload and a recorded threshold/baseline. Do not fail CI on noisy timing data without controlling the runner.

### Bad examples: high-impact mistakes

Recognizable bad examples make review comments concrete. The problem is not that these snippets fail to compile; it is that they can look reasonable while breaking latency, memory, or correctness guarantees.

The route snippets below are pseudocode; adapt state extraction and error mapping to the service's handler contract.

```rust
// Bad: synchronous Polars work directly in an async handler can occupy a
// Tokio worker for the duration of the query.
async fn query_handler(...) -> Result<Json<Response>, AppError> {
    let frame = expensive_polars_query()?;
    Ok(Json(to_response(frame)))
}

// Better: bounded admission plus blocking execution; copy/snapshot only the
// state needed by the closure before it starts.
let permit = state.cpu_gate.clone().acquire_owned().await?;
let response = tokio::task::spawn_blocking(move || {
    let _permit = permit;
    expensive_polars_query().map(to_response)
})
.await??;
```

```rust
// Bad: materializes every row before a selective filter can be pushed down.
let frame = scan_parquet_all_files()?.collect()?;
let filtered = frame.lazy().filter(col("ts").gt(lit(start))).collect()?;

// Better: retain the lazy plan through the filter and projection.
let filtered = scan_parquet_all_files()?
    .filter(col("ts").gt(lit(start)))
    .select([col("ts"), col("series_id"), col("value")])
    .collect()?;
```

```rust
// Bad: one dataset can have many distinct downsample outputs.
cache.insert(dataset_id, downsampled);

// Better: cache identity includes every correctness-defining parameter.
cache.insert(
    CacheKey {
        dataset_id,
        revision,
        series_id,
        start,
        end,
        width_px,
        algorithm,
        value_column,
    },
    downsampled,
);
```

## Polars, Arrow, and Parquet

### Lazy first

The central data-engineering shape is:

```text
scan -> filter -> select -> transform/aggregate -> downsample -> collect
```

- Use a lazy scan when data resides in Parquet/CSV and predicate/projection pushdown can reduce work.
- Filter selective predicates and project required columns before collection. Inspect the optimized plan when query cost is surprising.
- Build Polars expressions rather than iterating `DataFrame` rows for transforms that Polars can express.
- Do not collect, call `.lazy()`, and collect again without an intentional materialization boundary.
- Treat streaming execution, common-subplan elimination, and performance feature flags as **measure first** options. Availability and API details vary by Polars release and by operation.

### Chunking, schema, and values

- Concatenation can create many chunks. Rechunk at controlled ingest/cache boundaries only when profiling shows chunk overhead; rechunking copies data.
- Document timestamp unit, timezone policy, sortedness, duplicate handling, null handling, NaN/infinity policy, and interpolation semantics before windows, joins, FFTs, or downsampling.
- Keep Arrow schemas stable across an API. Column type/name changes are protocol changes; test consumers and use versioning if compatibility matters.
- JSON is suitable for metadata and small structured responses. Prefer Arrow IPC for large typed tables and Parquet for durable/export data when consumers support them.

### Arrow IPC and binary transport

- Build a schema deliberately and return the matching content type. Do not mix incompatible schemas in one stream.
- Prefer `Bytes`, `BytesMut`, or a streaming body for binary data. Avoid `Vec<u8> -> String -> Vec<u8>` conversions.
- Do not automatically compress all binary output. JSON/CSV often benefit; Arrow IPC needs measurement; Parquet is already compressed.
- Validate upload size before collecting it and stream large responses when the framework and client contract support it.

## Async, Tokio, and concurrency

### Async rules

- Calling an `async fn` creates a future; it does not run until awaited, polled, or spawned.
- Do not call `std::thread::sleep`, blocking file/database clients, large synchronous parsers, Polars collection, or heavy numerical loops in a request future.
- Use `tokio::time::sleep(...).await` for timers and `spawn_blocking` for finite synchronous work. Tokio documents that its blocking pool has a large default upper bound; limit CPU-heavy submissions with a semaphore or dedicated executor. [Tokio `spawn_blocking`](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html)

```rust
// `cpu_gate` is shared service state, not allocated per request.
let permit = state.cpu_gate.clone().acquire_owned().await?;
let output = tokio::task::spawn_blocking(move || {
    let _permit = permit;
    execute_cpu_bound_query(params)
})
.await??;
```

### Parallelism and cancellation

- Avoid nested full-width parallelism: Tokio requests, Tokio blocking threads, Rayon, Polars, BLAS, and database workers can multiply runnable work far beyond core count.
- Choose a concurrency budget, test it under load, and configure Rayon/Polars only with a documented benchmark result. Rayon’s global pool configuration is one-shot; use a local pool when isolation is required.
- Spawn tasks for independent work that benefits from concurrency. Do not spawn thousands of tasks merely to perform trivial sequential work.
- `spawn_blocking` tasks cannot generally be aborted after starting. For long-lived jobs, use dedicated workers and cooperative cancellation; define shutdown behaviour explicitly.
- Bounded channels express backpressure. Unbounded queues trade a fast producer for unpredictable memory growth and tail latency.

### Parallelism design

Parallelism is useful only when independent work is large enough to amortize scheduling, synchronization, cache, and merge costs. Start with the sequential, profiled version; then choose one parallel axis:

| Work shape | Default tool | Main risk |
| --- | --- | --- |
| Async request/I/O orchestration | Tokio tasks | Blocking an executor worker. |
| Finite synchronous CPU task | Bounded `spawn_blocking` / Rayon | Oversubscribing CPUs. |
| Pure, independent slice/window work | Rayon iterator or scoped workers | Nested parallelism and uneven chunks. |
| Long-running job | Dedicated worker and bounded queue | Shutdown/cancellation and memory growth. |
| Shared mutable state | Narrow lock or message passing | Contention and unclear ownership. |

- Batch work so each task has enough useful computation. A task per element, tiny chunk, or trivial closure usually loses to a sequential loop.
- Keep the fan-out/fan-in shape visible: partition input, compute independently, then merge deterministically. Make result order, error propagation, and partial failure policy explicit.
- Avoid a mutex in the inner loop. Prefer per-worker local state followed by a reduction, or partition output so workers write disjoint regions.
- Profile wall-clock time, CPU utilization, lock wait, queue depth, and p99 latency together. Higher total CPU usage can coexist with worse throughput or tail latency.
- Safe parallelism avoids data races; it does not remove logical races, stale cache reads, duplicate work, or resource exhaustion. The Rust Performance Book recommends Rayon and Crossbeam as starting points for thread-based designs. [Parallelism](https://nnethercote.github.io/perf-book/parallelism.html)

### Crossbeam: use the smallest relevant primitive

Crossbeam provides synchronous concurrency tools such as MPMC channels, bounded/unbounded queues, work-stealing deques, scoped threads, atomic cells, and cache padding. [Crossbeam](https://github.com/crossbeam-rs/crossbeam)

- Prefer Tokio channels for async task coordination. Consider `crossbeam-channel` when communicating among synchronous worker threads needs MPMC semantics or `select`-style coordination.
- Prefer a bounded channel or `ArrayQueue` when backpressure is part of the design. `SegQueue` and unbounded channels defer pressure to memory.
- Use `crossbeam-deque` only when building a scheduler or work-stealing system; Rayon already solves that problem for most data-parallel workloads.
- Use `crossbeam_utils::scope` when stack-borrowing scoped threads make ownership clearer than cloning into `'static` threads.
- `CachePadded`, epoch reclamation, custom atomics, lock-free queues, and sharded locks are advanced tools. Introduce them only for a measured contention or false-sharing problem and document the concurrency invariant.

## Numerical work

### FFT and spectral analysis

- Reuse `FftPlanner` and plans for repeated lengths; reuse per-task complex buffers for repeated windows. The planner selects algorithms and available SIMD paths. [RustFFT](https://docs.rs/rustfft/latest/rustfft/)
- Define input sampling rate, timestamp regularity policy, window function, overlap, detrending, normalization, output units, and handling of missing/non-finite values as part of the API.
- Avoid manual scalar FFT algorithms unless measurement proves they beat the planner for a constrained deployment.
- Cache reusable plans and immutable preprocessed inputs with bounded, revision-aware keys. Do not cache result data whose identity omits transform parameters.

### ndarray and Rayon

- Prefer contiguous memory for repeated kernels. Use `as_slice_memory_order` to detect a fast path; if needed, copy once into standard layout at a deliberate boundary.
- Use `Zip`, in-place operations, and preallocated output arrays to avoid chains of large temporary arrays.
- Parallelize one meaningful dimension: independent requests, independent windows, or within a kernel—not all of them at once.
- Validate numerical invariants in tests: lengths, units, tolerances, NaNs, zero variance, constant input, empty input, and boundary windows.

### SIMD: an escalation ladder

SIMD is data parallelism, not a default code style. Its benefit depends on the operation, dtype, memory layout, compiler, target CPU, and numerical contract. Use this order:

1. Write simple, contiguous, bounds-check-friendly loops and benchmark compiler auto-vectorization.
2. Restructure data and loops only when the profile shows a numeric kernel is dominant; inspect generated assembly with a tool such as `cargo-show-asm` if vectorization is the question.
3. If explicit SIMD remains justified, choose an abstraction that matches the toolchain and deployment contract.
4. Use raw intrinsics only for constrained hardware and a proven gain that outweighs per-architecture implementations, dispatch, and testing cost.

Current SIMD constraints matter:

- `std::simd` is still nightly-only. It is powerful and portable across LLVM-supported targets, but it cannot be the default choice for a stable-only project.
- Autovectorization is the least invasive option, but it is sensitive to code shape and compiler version. Floating-point reassociation rules can prevent or limit automatic vectorization.
- On x86, advanced extensions are not universally available. Distributing `target-cpu=native` or an AVX2-only binary to unknown machines is unsafe; use a compatible baseline or explicit runtime-dispatched multiversioning.
- AArch64 has NEON as a baseline; WebAssembly typically requires separate SIMD/non-SIMD artifacts and runtime selection by the host.
- Stable portable-SIMD crates such as `wide`, and multiversioning-oriented crates such as `pulp`, are dependencies with their own supported architectures and ergonomics. Evaluate them against the supported deployment targets, not only a developer workstation.

Preserve numerical semantics. Explicit SIMD can change reduction order or expose different floating-point edge behaviour; test tolerances, NaNs, infinities, denormals where relevant, and scalar/SIMD equivalence. For the current ecosystem trade-offs, see [The state of SIMD in Rust in 2025](https://shnatsel.medium.com/the-state-of-simd-in-rust-in-2025-32c263e5f53d).

## Errors, observability, and unsafe

### Errors and logging

- Use a typed domain error in libraries, usually with `thiserror`; translate it into HTTP/CLI/job errors at the outer boundary.
- Return `Result<impl IntoResponse, AppError>`-style signatures in an Axum service when the application error type owns response policy.
- Do not lose causes. Add request-safe context to external errors and retain source chains, operation names, and structured fields in logs.
- Prefer `tracing` with structured fields over `println!`. Record request identifiers, dataset revision, operation, bounded cardinality fields, durations, and byte/row counts.
- Do not put raw records, sensitive identifiers, or unbounded lists into logs or metric labels.

### Unsafe and unchecked APIs

`unsafe` may be appropriate for FFI boundaries, carefully proven in-place initialization, or a genuinely measured inner-loop bound elimination. It is not appropriate for bypassing aliases, lifetimes, or thread-safety markers.

Every unsafe block must:

1. Be small and isolated behind a safe interface where practical.
2. Have a nearby `// SAFETY:` comment stating the exact invariant.
3. Establish bounds, alignment, aliasing, initialization, and lifetime requirements before entering the block.
4. Have boundary tests and, for FFI, a documented layout/ownership contract.

Before `get_unchecked`, show a profile where bounds checks matter and write a checked reference implementation for tests. Never use `transmute` without an explicit, tested layout contract. Never write `unsafe impl Send` or `Sync` without a complete thread-safety argument.

## Cargo, tooling, and profiles

### Feature policy

- New crate features need an actual call site and an explanation of the capability they enable.
- A new Polars feature must name the query or operator that needs it, plus its expected compile-time, binary-size, and workload effect.
- Avoid broad feature sets in low-level crates. Keep feature-heavy dependencies behind implementation crates instead of making foundational crates such as `edatime-core` carry them without a direct need.
- Run `cargo tree -e features` whenever changing Polars, Arrow, Tokio, or Axum features; review transitive features as well as direct ones.
- Remove a feature only after verifying all target platforms, optional paths, examples, benchmarks, and packaged binaries that rely on it.

### Dependency and workspace hygiene

- Put shared versions/features in `[workspace.dependencies]`; use `{ workspace = true }` in members unless a member deliberately needs a different feature set.
- State `resolver = "3"` in a Rust 2024 workspace when the manifest should make its intended resolver explicit.
- Keep feature lists minimal and capability-driven. Add Polars performance features only after checking their compile-time, binary-size, and workload effect.
- Run `cargo tree` when resolving duplicate versions/features; treat dependency drift as maintenance and reproducibility work, not a presumed runtime win.

### Profiles and verification

```toml
[profile.profiling]
inherits = "release"
debug = "line-tables-only"
strip = "none"
```

Evaluate `lto`, `codegen-units = 1`, `panic = "abort"`, dependency profile overrides, allocators, and `target-cpu` flags separately. They have real trade-offs in compile time, portability, binary size, diagnostic quality, and unwind behaviour. Cargo profile configuration belongs at the workspace root. [Cargo profiles](https://doc.rust-lang.org/cargo/reference/profiles.html)

Never distribute `-C target-cpu=native` binaries to unknown CPUs. It is suitable for controlled deployments and local profiling only.

For a typical Rust change, run the narrowest relevant test first, then use this local/CI matrix. A repository may intentionally omit a row when its feature model or benchmark targets do not support it; document that decision rather than silently treating it as green.

```bash
# Required style and correctness baseline.
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features

# Feature-minimal compatibility, when no-default-features is a supported build.
cargo test --workspace --no-default-features

# Benchmark a known target; substitute the project's actual bench target.
cargo bench --bench downsample_lttb

# Dependency and feature inspection.
cargo tree -d
cargo tree -e features

# Optional dependency-hygiene tools; install/configure them explicitly in CI.
cargo +nightly udeps
cargo machete
cargo deny check
```

## edatime profile

### Current facts and conventions

- edatime is a self-hosted browser-based time-series exploratory data-analysis tool. Its backend uses Axum, Tokio, Polars, Arrow IPC, Rayon, and numerical crates.
- The workspace separates core types/utilities, store, query, ingest, service, and binary crates.
- Use `tracing`, not `println!`; avoid `unwrap`/`expect` on production request paths; return `AppError::bad_request(...)` for invalid client input.
- Keep filtering/projection lazy where possible. Keep expensive collection, ingestion, serialization, FFT, and statistics work off the async executor.
- Reuse `edatime-query` downsampling and Arrow-export code rather than duplicating algorithms in route handlers.
- The workspace currently enables Polars lazy/temporal/CSV/Parquet/IPC support, Arrow IPC, Tokio, Rayon, RustFFT, and Criterion. It does not currently promise Polars `performant`, `cse`, or execution-streaming features, a global allocator, `DashMap`, `ArcSwap`, or a universal CPU target.

### Candidate improvements to evaluate, not assume

1. Bounded CPU admission around concurrent Polars, FFT, and downsampling work.
2. Thread budgets across Tokio, Rayon, and Polars under representative concurrent requests.
3. Polars feature additions or execution modes for concrete query plans.
4. FFT-plan/buffer reuse for repeated spectral workload sizes.
5. A profiling profile plus stable Criterion coverage for the observed hot kernels.
6. Centralizing duplicated root dependency declarations through workspace dependencies.

## Review checklists

### Endpoint or pipeline change

- [ ] Input sizes, ranges, units, and semantic constraints are validated.
- [ ] Null/NaN/empty/boundary data behaviour is tested.
- [ ] Large data stays lazy/columnar until its deliberate execution or transport boundary.
- [ ] CPU-heavy work has bounded admission and does not retain locks across compute or `.await`.
- [ ] The response schema/transport contract is explicit and consumer-compatible.
- [ ] Errors preserve context, and tracing gives enough information to investigate cost.
- [ ] Caches include all correctness-defining parameters and are bounded.

### Performance change

- [ ] A representative baseline exists.
- [ ] The target metric and expected trade-off are stated.
- [ ] The profile identifies the bottleneck rather than intuition.
- [ ] Only one meaningful independent variable changed.
- [ ] Correctness tests cover a serial/reference path where feasible.
- [ ] The final result records workload, machine, command, and regression risks.

### References

- [cheats.rs](https://cheats.rs/) — language, standard library, tooling, idioms, performance, async, and unsafe navigation.
- [Tokio `spawn_blocking`](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html)
- [Polars Parquet guide](https://docs.pola.rs/user-guide/io/parquet/)
- [Polars streaming guide](https://docs.pola.rs/user-guide/concepts/streaming/)
- [RustFFT](https://docs.rs/rustfft/latest/rustfft/)
- [Cargo profiles](https://doc.rust-lang.org/cargo/reference/profiles.html)
- [Criterion](https://bheisler.github.io/criterion.rs/book/getting_started.html)
- [Rust Performance Book](https://nnethercote.github.io/perf-book/profiling.html)
- [Rust Performance Book: parallelism](https://nnethercote.github.io/perf-book/parallelism.html)
- [State of SIMD in Rust in 2025](https://shnatsel.medium.com/the-state-of-simd-in-rust-in-2025-32c263e5f53d)
- [Crossbeam](https://github.com/crossbeam-rs/crossbeam)
- [mosioc Rust cheat sheet](https://gist.github.com/mosioc/c262ddca49c52fcf07eebb7a9bdf4bc2) — supplementary introductory examples; defer to official documentation for language guarantees.
