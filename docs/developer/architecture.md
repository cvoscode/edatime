# Backend Refactor Plan — 2026-05-21

> **Status**: Draft — awaiting team review
> **Scope**: Full backend restructuring in the `edatime` Rust workspace
> **Driver**: Analytical workloads, LazyFrame-first pipeline architecture, long-term maintainability

---

## 1. Current Architecture Assessment

### 1.1 Crate Boundaries Are Ignored

The workspace defines six crates (`edatime-bin`, `edatime-core`, `edatime-query`, `edatime-store`, `edatime-service`, `edatime-ingest`) but the `src/` directory at the repo root contains duplicate modules: `state.rs`, `query.rs`, `pipeline.rs`, `filters.rs`, `repository.rs`, `cache.rs`. These live in the **binary crate** rather than in the crates they're named after. Handlers still live in `src/routes/` instead of `edatime-service`. The `edatime-service` crate exists but is unused.

**Impact**: Impossible to publish or test the service layer independently. Every change requires recompiling the binary. No clean dependency graph.

### 1.2 Tightly Coupled State (`src/state.rs`)

`AppState` is a 9-field struct with 7 different `Arc` types, including a `Mutex<HashMap<...>>` for drift cache and a `Mutex<VecDeque<...>>` for query logging. All of it threaded through every handler via `State<AppState>`. Adding any new capability requires modifying the central struct and every handler that touches it.

**Architectural smell**: The God Object anti-pattern applied to application state. Every route depends on every field even when it only needs one.

### 1.3 Repository Double-Wrapping

```rust
// Current: double lock wrapper
struct InMemoryDataRepository {
    lf: Arc<tokio::sync::RwLock<LazyFrame>>,  // async lock wrapping LazyFrame
    meta: Arc<RwLock<DatasetMeta>>,
    ...
}
```

The `LazyFrame` is wrapped in a `tokio::sync::RwLock` from an async context, then accessed via `blocking_read()`. This is necessary but obscure. The inner type (`LazyFrame`) has no interior mutability — it could use a plain `std::sync::RwLock` without the async wrapper. Additionally, `time_column_display_name` is wrapped in a second `StdRwLock<Option<String>>` inside an `Arc`.

**Impact**: `blocking_read()` on every snapshot call. The double-wrapping adds latency without providing value.

### 1.4 LazyFrame Snapshot Per Request

```rust
// repository.rs
fn snapshot(&self) -> LazyFrame {
    self.lf.read().unwrap().clone()  // clones the control board
}
```

`LazyFrame::clone()` is cheap (clones the plan node tree, not the data), but the control board carries accumulated optimizations and column references. Cloning it per-request at the transport layer is the correct pattern — but the repeated `collect_schema()` calls on each clone in hot paths accumulate.

**Impact**: Repeated schema resolution in every handler instead of cached once per dataset revision.

### 1.5 Blocking in Async via `spawn_blocking` Proliferation

Every handler that does Polars work (LTTB downsampling, `collect()`, Arrow IPC serialization) spawns a `spawn_blocking` task. This is the correct escape hatch for CPU-bound work, but:

1. The blocking closures capture handler-local state (filters, query params) — making the execution flow hard to trace
2. No span propagation from the handler's tracing span into the `spawn_blocking` closure
3. Thread pool usage is implicit — no named pools for different workload types

**Impact**: Observability gaps. Unbounded parallelism if many requests arrive simultaneously.

### 1.6 Full Collection for Count

```rust
// state.rs — dataset_rows()
pub fn dataset_rows(&self) -> PolarsResult<usize> {
    self.snapshot()
        .select([len()])
        .collect()?
        .get_row(0)?
        .0[0]
        .try_into()
        .unwrap()
}
```

A full `collect()` just to count rows. Polars supports `lf.select([len()]).with_new_streaming(true).collect()` for streaming-friendly count without materialization.

**Impact**: Memory spike on large datasets for a metadata operation.

### 1.7 Cache Keyed by Revision with No Invalidation

Cache entries are keyed by `(revision, start, end, width, columns, color_column, format)`. When `replace_dataset` is called, the revision bumps. But if the same query parameters are requested before the TTL expires, and the cache still contains an entry for the old revision, the **cached response for the old revision** is returned — because the cache key includes the revision at write time, not read time.

**Impact**: Stale data served after dataset replacement.

### 1.8 Error Handling — Non-Uniform Responses

`AppError` is a typed enum, but each handler constructs its own JSON error shape:

```rust
// some handlers
Err(AppError::BadRequest(format!("column not found: {}", col)))

// others
Err(AppError::Internal(e.to_string())).map_err(|e| {
    AppError::io(format!("column selection failed: {}", e))
})?
```

No consistent `{"error": ..., "code": ..., "request_id": ...}` structure.

**Impact**: Client error handling is fragmented. No machine-readable error codes.

### 1.9 Missing Observability

- No request ID propagation across async boundaries
- No span propagation into `spawn_blocking` closures
- No JSON structured logging — just text_fmt
- No query plan inspection / explain
- No execution timing histograms (only counter-based metrics)

**Impact**: Debugging production issues requires ad-hoc logging.

### 1.10 Schema Resolution Per Handler

Every handler that needs column dtypes does:
```rust
let schema = lf.clone().collect_schema();
```

This clones the LazyFrame (cheap) and calls `collect_schema()` (walks the plan). Repeated per handler per request.

**Impact**: Unnecessary plan traversal overhead on hot paths.

### 1.11 Giant Flat Router

All routes registered in a single flat router in `src/routes/mod.rs`. No logical grouping (e.g., scatter sub-router, analytics sub-router).

```rust
// current — flat list
api_router
    .route("/data", get(data_handler))
    .route("/metadata", get(metadata_handler))
    .route("/aggregate", get(aggregate_handler))
    .route("/scatter/points", post(scatter_points_handler))
    // ... 30+ routes
```

**Impact**: No clear ownership boundaries. Hard to apply route-specific middleware.

---

## 2. Refactor Goals

### 2.1 Modular Analytical Pipelines

All Polars transformations compose as reusable `LazyFrame` stages. Business logic lives in pure functions on `LazyFrame`, not in handlers. Testable without IO.

**Why**: Current pipeline logic is scattered between `pipeline.rs`, `filters.rs`, and handler closures. Extracting a new transformation requires copy-paste.

### 2.2 Declarative LazyFrame Transformations

All data selection, filtering, projection, and aggregation expressed as `LazyFrame` plans. Eager collection only at the transport boundary.

**Why**: Enables predicate pushdown, projection pushdown, and query optimization. Current work mixes lazy (filter/projection) with eager (LTTB, bucketing) in ways that prevent full optimization.

### 2.3 Scalable Execution Boundaries

CPU-bound Polars work runs in `spawn_blocking` on a dedicated thread pool. Async IO runs on the async executor. No blocking on the async thread pool.

**Why**: Current `spawn_blocking` proliferation is ad-hoc — no separation between heavy analytical work and light IO.

### 2.4 Composable Query Architecture

Query components (time filter, column projection, reduction, aggregation) are independently composable and replaceable. New query types add new compositions, not new monolithic handlers.

**Why**: Adding a new query pattern requires a new handler today. Composability enables a query DSL.

### 2.5 Strict Domain Separation

Transport → Application Services → Domain Logic → Query Engine → Repository → Storage. No cross-boundary leaking (no `LazyFrame` in API responses, no domain types in storage).

**Why**: Currently handlers directly construct LazyFrame plans. Domain logic should be isolated from transport concerns.

### 2.6 Minimal Data Copying

Arrow-native zero-copy where possible. `ArrayRef` passed through pipeline stages without deserialization. Columnar access patterns throughout.

**Why**: Current data flow materializes intermediates unnecessarily (e.g., full `collect()` for row counts).

### 2.7 Streaming-First Execution

`with_new_streaming(true)` used by default for operations that can be streamed. Bounded memory usage for large datasets.

**Why**: Current implementation uses streaming execution in `QueryExecutor` but mixed with eager operations (LTTB) that require full materialization.

### 2.8 Predictable Async Orchestration

Clear async boundaries. Tokio tasks used for IO. `spawn_blocking` used for CPU work. No nested block_on. No oversized async contexts.

**Why**: Async context violations are the primary cause of runtime deadlocks and performance degradation in analytical Rust services.

### 2.9 Extensible Plugin Systems

New analytical operations (new aggregation types, new export formats) plug into the pipeline without modifying core logic.

**Why**: Currently adding a new aggregation requires modifying the pipeline module and handler.

### 2.10 Strong Typing and Schema Guarantees

Schema propagated through the pipeline as a strongly typed struct, not `HashMap<String, DataType>`. Compile-time column existence checks where possible.

**Why**: Current handlers do runtime column existence checks with error responses at runtime.

### 2.11 Simplified Debugging and Observability

Every pipeline stage emits structured traces. Request IDs propagate through all async boundaries. Query plans inspectable in development and production.

**Why**: Current tracing has gaps at `spawn_blocking` boundaries.

---

## 3. Proposed Backend Architecture

### 3.1 Workspace Organization

```
edatime/
├── Cargo.toml                  # workspace
├── crates/
│   ├── edatime-bin/            # binary entry point only
│   ├── edatime-core/            # shared types, temporal, config, no analytics deps
│   ├── edatime-query/           # query executor, LazyFrame pipelines, execution engine
│   ├── edatime-store/           # repository trait, storage adapters, cache
│   ├── edatime-service/         # HTTP service layer (handlers, DTOs, middleware, router)
│   └── edatime-ingest/          # ingestion logic, parsing, validation
├── src/                         # REMOVE — move all to respective crates
├── tests/                       # integration tests
├── fixtures/                    # test data
└── docs/developer/
```

**Dependency direction:**
```
edatime-service → edatime-query → edatime-store → edatime-core
                  ↗ edatime-ingest ↗ (circular ingestion via service)
edatime-bin → edatime-service
```

**Rule**: Crates must not depend on the binary crate (`edatime-bin`). No `edatime-service` depending on anything in `src/`.

**Feature-first vs layer-first**: Organize each crate around **features/capabilities** (e.g., `scatter`, `aggregate`, `upload`) rather than layers (e.g., `handlers`, `models`, `middleware`). Shared infrastructure (error types, tracing, config) lives in `edatime-core`.

### 3.2 Crate Boundaries

#### `edatime-core`
Types, temporal helpers, configuration structs, error enum, statistics utilities. Zero analytical dependencies (no Polars). Downstream crates depend only on this.

```
edatime-core/
└── src/
    ├── lib.rs
    ├── error.rs           # AppError, Result<T>
    ├── config.rs          # AppConfig, ConfigLoader
    ├── temporal.rs        # TsContext, time column detection, formatting
    ├── stats.rs           # basic statistics (percentile, etc.)
    └── types.rs           # DatasetMeta, SeriesMeta, ColumnProfile, DTOs
```

#### `edatime-store`
Repository trait, storage adapters, caching layer. Depends only on `edatime-core`.

```
edatime-store/
└── src/
    ├── lib.rs
    ├── repository.rs      # DataRepository trait, InMemoryDataRepository
    ├── cache.rs           # ResponseCache, CacheKey, CacheConfig
    └── storage/           # ParquetAdapter, ArrowAdapter, CsvAdapter
```

#### `edatime-query`
LazyFrame pipeline execution engine. Depends on `edatime-core` + Polars.

```
edatime-query/
└── src/
    ├── lib.rs
    ├── executor.rs        # QueryExecutor, ExecutionContext, streaming/batched
    ├── pipeline/          # Pipeline stages as composable LazyFrame builders
    │   ├── mod.rs
    │   ├── time_filter.rs
    │   ├── projection.rs
    │   ├── reduction.rs   # LTTB, BucketAgg, WindowAgg
    │   ├── aggregation.rs
    │   └── scatter.rs
    ├── filters.rs         # NumericRangeFilter, AdaptiveFilter, Expr composition
    └── optimizer.rs       # Query plan inspection, optimization hints
```

#### `edatime-service`
HTTP handlers, DTOs, middleware, router. Depends on `edatime-query` and `edatime-store`.

```
edatime-service/
└── src/
    ├── lib.rs
    ├── router.rs          # ApiRouter, sub-routers (scatter, analytics, data)
    ├── handlers/          # One file per handler group
    │   ├── data.rs
    │   ├── metadata.rs
    │   ├── aggregate.rs
    │   ├── scatter.rs    # Split into points.rs, correlations.rs
    │   ├── upload.rs
    │   └── health.rs
    ├── dto/               # Request/Response types, serde with validation
    │   ├── data.rs
    │   ├── scatter.rs
    │   └── upload.rs
    ├── middleware/         # CORS, RateLimit, RequestId, Compression
    └── error.rs           # Service-level error handling, map AppError → Response
```

#### `edatime-ingest`
Parsing, preview, partial ingestion. Depends on `edatime-core` + `edatime-store`.

```
edatime-ingest/
└── src/
    ├── lib.rs
    ├── parser.rs          # file type detection, CSV/Parquet/Arrow parsing
    ├── preview.rs         # dataset metadata + column profiles
    ├── ingest.rs          # DataFrame ingestion into repository
    └── validation.rs      # Schema validation during ingestion
```

#### `edatime-bin`
`main.rs` only. Wires together all crates with a shared tokio runtime.

```
edatime-bin/
└── src/
    └── main.rs            # server bootstrap, runtime setup, graceful shutdown
```

### 3.3 Dependency Inversion

Repository accessed via trait objects (dyn `DataRepository`) injected into service constructors. Query executor accessed via trait as well. This enables test doubles and future storage backends.

```rust
// Service layer only knows the trait
pub struct DataService<R: DataRepository> {
    repo: Arc<R>,
    executor: Arc<QueryExecutor>,
}

impl<R: DataRepository> DataService<R> {
    pub async fn query(&self, req: DataRequest) -> Result<DataResponse, AppError> { ... }
}
```

### 3.4 Architectural Patterns

**Pipeline Composition Pattern**: Each transformation stage returns a function `Fn(LazyFrame) -> LazyFrame`. Stages compose left-to-right.

```rust
pub trait PipelineStage: Send + Sync {
    fn apply(&self, lf: LazyFrame) -> LazyFrame;
    fn name(&self) -> &str;
}

// Composable pipeline
pub struct QueryPipeline {
    stages: Vec<Box<dyn PipelineStage>>,
}

impl QueryPipeline {
    pub fn with_stage(mut self, stage: Box<dyn PipelineStage>) -> Self { ... }
    pub fn execute(&self, lf: LazyFrame) -> LazyFrame {
        self.stages.iter().fold(lf, |acc, stage| stage.apply(acc))
    }
}
```

**Execution Context Pattern**: `QueryExecutor` receives a `ExecutionContext` (streaming vs. batched) and a `ThreadPool` reference. It decides whether to use `with_new_streaming(true)` or batched collection. Async boundary managed by `execute_async()` which returns a future resolved on the blocking thread pool.

**Repository Adapter Pattern**: `DataRepository` is the trait. `InMemoryDataRepository` implements it with `Arc<RwLock<LazyFrame>>`. A `ParquetDataRepository` can be added later without changing service code.

**Transport Isolation Pattern**: Handlers deserialize requests to DTOs, validate, then call service methods with DTOs. Responses are DTOs, never Polars types. No `LazyFrame` crosses the service boundary.

### 3.5 Anti-Patterns to Avoid

1. **Utility dumping grounds**: No `utils.rs` files with unrelated helpers. Each helper belongs near the code that uses it or in a clearly named module.

2. **Oversized shared crates**: `edatime-core` must not grow to include query logic or service logic. If a module grows too large, split the crate.

3. **Weak type boundaries**: Domain types (e.g., `TimeSeriesSlice`) must not leak into storage. Storage types (e.g., raw `DataFrame`) must not leak into service.

4. **Macro overuse**: Prefer `fn` + `trait` over macros for abstraction. Macros acceptable for boilerplate reduction (e.g., `app_error!` macro for error construction) but not for business logic.

5. **Hidden magic abstractions**: Every abstraction must have a clear name and documented purpose. No `do_the_thing()` methods.

6. **Unclear ownership**: Each crate has a designated owner. Cross-crate changes require review from owners of both crates.

### 3.6 Over-Abstraction Risks

- **Too many traits**: Not every module needs a trait. Use traits only when there are multiple implementations or test doubles are needed.
- **Excessive indirection**: A single `dyn PipelineStage` vector is fine. Four layers of `Box<dyn>` in the hot path adds vtable lookup overhead.
- **Premature generalization**: Build concrete implementations first, then extract interfaces when a second implementation appears.

---

## 4. Polars LazyFrame Architecture

### 4.1 Query Builder Pattern

```rust
// edatime-query/src/pipeline/builder.rs

use polars::prelude::*;
use crate::error::Result;

#[derive(Clone)]
pub struct QueryPlan {
    time_filter: Option<Expr>,
    column_projection: Vec<String>,
    reduction: Option<ReductionSpec>,
    aggregation: Option<AggregationSpec>,
    filters: Vec<Expr>,
    limit: Option<usize>,
}

pub struct QueryBuilder {
    lf: LazyFrame,
    plan: QueryPlan,
}

impl QueryBuilder {
    pub fn new(lf: LazyFrame) -> Self {
        Self { lf, plan: QueryPlan::default() }
    }

    pub fn with_time_range(mut self, start: i64, end: i64, ts_col: &str) -> Self {
        self.plan.time_filter = Some(
            col(ts_col).gt(lit(start)).and(col(ts_col).lt(lit(end)))
        );
        self.lf = self.lf.filter(self.plan.time_filter.as_ref().unwrap().clone());
        self
    }

    pub fn with_columns(mut self, cols: Vec<String>) -> Self {
        self.plan.column_projection = cols.clone();
        self.lf = self.lf.select(cols);
        self
    }

    pub fn with_reduction(mut self, spec: ReductionSpec) -> Self {
        self.plan.reduction = Some(spec);
        self
    }

    pub fn with_filters(mut self, filters: Vec<Expr>) -> Self {
        self.plan.filters = filters.clone();
        for f in filters { self.lf = self.lf.filter(f); }
        self
    }

    pub fn build(self) -> (LazyFrame, QueryPlan) { (self.lf, self.plan) }
}
```

### 4.2 Reduction Stage (LazyFrame-First)

```rust
// edatime-query/src/pipeline/reduction.rs

pub enum ReductionSpec {
    Lttb { target_points: usize },
    MinMaxLttb { target_points: usize },
    BucketAgg { bucket_ms: i64, agg: AggregationFunction },
    TimeWindow { window_ms: i64, agg: AggregationFunction },
}

pub struct ReductionStage {
    spec: ReductionSpec,
}

impl ReductionStage {
    pub fn new(spec: ReductionSpec) -> Self { Self { spec } }
}

impl super::PipelineStage for ReductionStage {
    fn apply(&self, lf: LazyFrame) -> LazyFrame {
        match &self.spec {
            ReductionSpec::Lttb { target_points } => {
                // Cannot apply LTTB lazily — it requires look-ahead
                // Mark as "requires eager" in execution plan
                lf  // returns lazy; executor handles eager collection + LTTB
            }
            ReductionSpec::BucketAgg { bucket_ms, agg } => {
                // Can express as groupby dynamically — lazy-compatible
                lf.group_by([col("__bucket")])
                  .agg(agg.to_expr())
            }
            _ => lf,
        }
    }

    fn name(&self) -> &str { "reduction" }
}
```

**Key insight**: LTTB is inherently a look-ahead algorithm and cannot be expressed as a pure `LazyFrame` plan. Instead, it is handled as a **post-execution refinement** after the LazyFrame is collected in streaming mode. The pipeline marks such stages in the `QueryPlan` and the executor handles the eager step:

```rust
impl QueryExecutor {
    pub async fn execute(&self, lf: LazyFrame, plan: QueryPlan) -> Result<DataFrame> {
        let mut df = self.collect_streaming(lf).await?;

        if let Some(reduction) = plan.reduction {
            df = match reduction {
                ReductionSpec::Lttb { target_points } => {
                    downsample_dataframe_multi(df, target_points, &self.ts_col)?
                }
                _ => df,
            };
        }
        Ok(df)
    }
}
```

### 4.3 Transformation Stage Isolation

```rust
// Each stage is a pure function — testable without IO
pub fn apply_time_filter(lf: LazyFrame, start: i64, end: i64, ts_col: &str) -> LazyFrame {
    lf.filter(col(ts_col).gt(lit(start)).and(col(ts_col).lt(lit(end)))
}

pub fn apply_numeric_filter(lf: LazyFrame, filter: &NumericRangeFilter) -> LazyFrame {
    let expr = col(&filter.column)
        .gt(lit(filter.min))
        .and(col(&filter.column).lt(lit(filter.max)));
    lf.filter(expr)
}

#[cfg(test)]
mod tests {
    use super::*;
    use polars::df;
    use polars::prelude::*;

    #[test]
    fn test_time_filter_applies() {
        let lf = df! {
            "ts" => [1i64, 2, 3, 4, 5],
            "val" => [10.0, 20.0, 30.0, 40.0, 50.0]
        }.unwrap().lazy();

        let result = apply_time_filter(lf, 2, 4, "ts");
        let collected = result.collect().unwrap();
        assert_eq!(collected.shape().0, 1); // only row with ts=3
    }
}
```

### 4.4 Schema Contract Pattern

```rust
// edatime-core/src/types/schema.rs

use polars::prelude::*;

#[derive(Clone, Debug)]
pub struct Schema {
    columns: Vec<ColumnDef>,
}

#[derive(Clone, Debug)]
pub struct ColumnDef {
    pub name: String,
    pub dtype: DataType,
    pub nullable: bool,
}

impl Schema {
    pub fn from_lf(lf: &LazyFrame) -> Self {
        let schema = lf.collect_schema().unwrap();
        let columns = schema.iter().map(|(n, dt)| ColumnDef {
            name: n.clone(),
            dtype: dt.clone(),
            nullable: true,
        }).collect();
        Self { columns }
    }

    pub fn get(&self, name: &str) -> Option<&ColumnDef> {
        self.columns.iter().find(|c| c.name == name)
    }

    pub fn numeric_columns(&self) -> Vec<&ColumnDef> {
        self.columns.iter()
            .filter(|c| matches!(c.dtype, DataType::Float64 | DataType::Float32 | DataType::Int64))
            .collect()
    }

    pub fn temporal_column(&self) -> Option<&ColumnDef> {
        self.columns.iter()
            .filter(|c| matches!(c.dtype, DataType::Datetime(_, _) | DataType::Int64))
            .find(|c| is_temporal_name(&c.name))
    }
}
```

**Cached schema**: `DatasetMeta` holds the schema. `InMemoryDataRepository` updates schema on `replace_from_dataframe`. Handlers query `meta.schema()` instead of calling `collect_schema()` repeatedly.

### 4.5 Streaming Execution

```rust
pub async fn collect_streaming(lf: LazyFrame) -> Result<DataFrame> {
    // Uses with_new_streaming(true) to avoid memory spikes
    tokio::task::spawn_blocking(move || {
        lf.with_new_streaming(true).collect()
    }).await.map_err(|e| AppError::Internal(e.to_string()))?
}

// If streaming fails (single partition), fall back to batched
pub async fn collect_batched(lf: LazyFrame) -> Result<DataFrame> {
    tokio::task::spawn_blocking(move || lf.collect())
        .await.map_err(|e| AppError::Internal(e.to_string()))?
}
```

### 4.6 Anti-Patterns and Smells

**Premature materialization**:
```rust
// BAD — eager in hot path
let df = lf.clone().collect().unwrap();
let filtered = df.filter(...)?;

// GOOD — lazy filter before collection
let filtered = lf.clone().filter(predicate).collect().unwrap();
```

**Transformation duplication**:
```rust
// BAD — same filter written in handler and in pipeline module
handler: lf.clone().filter(col("ts").gt(lit(start)))
pipeline: lf.filter(col("ts").gt(lit(start)))

// GOOD — single source of truth in pipeline stage
// Handler calls pipeline.apply_time_filter(lf, start, end)
```

**collect() abuse**:
```rust
// BAD — collect in a loop, materializing on every iteration
for chunk in chunks {
    let df = process(LazyFrame::from(chunk)).collect()?; // N collections
}

// GOOD — collect once at the end
let lf = LazyFrame::from(chunks.concat());
lf.filter(predicate).collect()
```

**Mutation-heavy transformations**:
```rust
// BAD — building up a df by appending rows
let mut result = DataFrame::new();
for row in data { result.vstack(...) } // copies everywhere

// GOOD — build column vectors, construct df at once
let mut col1 = Vec::new();
let mut col2 = Vec::new();
for row in data { col1.push(row.val1); col2.push(row.val2); }
DataFrame::new([col1.into_series(), col2.into_series()])
```

**Giant monolithic pipelines**:
```rust
// BAD — single 200-line pipeline function with 15 stages
pub fn full_pipeline(lf: LazyFrame, req: &DataRequest) -> LazyFrame {
    // time filter, column selection, 5 aggregations, 3 joins, 4 reductions...
}

// GOOD — pipeline composed of named stages
QueryPipeline::new()
    .with_stage(TimeFilterStage::new(start, end, ts_col))
    .with_stage(ColumnProjectionStage::new(cols))
    .with_stage(AggregationStage::new(aggs))
    .with_stage(ReductionStage::new(reduction))
    .execute(lf)
```

**Schema ambiguity**:
```rust
// BAD — column type assumed at runtime
let col = df.column("value")?;
if col.dtype() == DataType::Float64 { ... }  // runtime branch

// GOOD — schema known at construction time
let schema = DatasetMeta::from_lf(&lf);
let col_def = schema.get("value").expect("value column must exist");
match col_def.dtype {
    DataType::Float64 => { /* typed branch */ }
    _ => Err(AppError::BadRequest("expected float64")),
}
```

---

## 5. Concurrency & Async Execution Architecture

### 5.1 CPU-Bound vs IO-Bound Separation

**Tokio async executor**: Handles HTTP requests, network IO, cache reads.
**Rayon thread pool**: Handles CPU-bound Polars operations (collect, LTTB, joins, serialization).
**Dedicated blocking pool**: For Rust stdlib blocking IO (file reads for Parquet/Arrow).

```rust
// main.rs
let runtime = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .unwrap();

// Rayon is initialized globally via its own thread pool
// Polars uses Rayon by default for collect() and parallel operations

// spawn_blocking uses the Tokio blocking thread pool (separate from async)
tokio::task::spawn_blocking(|| {
    // CPU-bound Polars work — runs on the blocking pool, not the async threads
    lf.collect()
})
```

### 5.2 Worker Orchestration

```rust
// edatime-service/src/executor.rs

pub struct AppExecutor {
    runtime_pool: Arc<ThreadPool>,  // Rayon for Polars collect
    blocking_pool: Arc<blocking::Pool>,  // Tokio blocking pool
}

impl AppExecutor {
    pub fn execute_query<F, R>(&self, lf: LazyFrame, f: F) -> impl Future<Output = R> + Send
    where
        F: FnOnce(DataFrame) -> R + Send + 'static,
        R: Send + 'static,
    {
        let pool = self.runtime_pool.clone();
        async move {
            tokio::task::spawn_blocking(move || {
                // Polars collect runs on Rayon via polars' own thread pool
                let df = lf.with_new_streaming(true).collect().unwrap();
                f(df)
            }).await.unwrap()
        }
    }
}
```

### 5.3 Backpressure Handling

```rust
// Bounded channel for work queue
let (tx, rx) = tokio::sync::mpsc::channel::<QueryTask>(1000);

pub async fn query_worker(mut rx: Receiver<QueryTask>) {
    while let Some(task) = rx.recv().await {
        let result = AppExecutor::execute_query(task.lf, task.process).await;
        task.response_channel.send(result).await;
    }
}

// On the handler side
pub async fn handle_query(lf: LazyFrame) -> Result<Response> {
    let permit = semaphore.acquire().await
        .map_err(|_| AppError::ServiceUnavailable("backpressure"))?;

    let result = executor.execute_query(lf, process_result).await;
    drop(permit); // release permit
    result
}
```

### 5.4 Cancellation Handling

Every async query task checks for cancellation at key points:

```rust
impl QueryExecutor {
    pub async fn execute_cancellable(&self, lf: LazyFrame) -> Result<DataFrame> {
        // Poll the cancellation token at each stage
        tokio::select! {
            result = self.execute(lf) => result,
            _ = self.cancellation_token.cancelled() => {
                tracing::info!("Query cancelled");
                Err(AppError::Cancelled)
            }
        }
    }
}
```

### 5.5 Parallel Query Execution

For scatter/density queries that need multiple independent LazyFrame operations:

```rust
pub async fn parallel_scatter_queries(
    x_lf: LazyFrame,
    y_lf: LazyFrame,
) -> Result<(DataFrame, DataFrame)> {
    let (rx_x, rx_y) = tokio::join!(
        tokio::task::spawn_blocking(move || x_lf.with_new_streaming(true).collect()),
        tokio::task::spawn_blocking(move || y_lf.with_new_streaming(true).collect()),
    );
    Ok((rx_x?, rx_y?))
}
```

### 5.6 Anti-Patterns

**Blocking CPU work in async tasks**:
```rust
// BAD — Polars work on the async thread
async fn handler(req: Request) -> Result<Response> {
    let df = lf.collect().unwrap(); // BLOCKS the async thread
    Ok(response(df))
}

// GOOD — offload to blocking thread pool
async fn handler(req: Request) -> Result<Response> {
    let df = tokio::task::spawn_blocking(move || lf.collect().unwrap()).await?;
    Ok(response(df))
}
```

**Unbounded task spawning**:
```rust
// BAD — no limit on concurrent tasks
async fn handler(req: Request) -> Result<Response> {
    let futures = columns.iter().map(|col| {
        tokio::task::spawn_blocking(move || process_column(lf.clone(), col))
    });
    let results = futures::future::join_all(futures).await; // unbounded
    Ok(Response(results))
}

// GOOD — bounded semaphore
let sem = Arc::new(Semaphore::new(10));
let futures = columns.iter().map(|col| {
    let permit = sem.clone().acquire().await;
    async move {
        let result = tokio::task::spawn_blocking(move || process_column(lf.clone(), col)).await;
        drop(permit);
        result
    }
});
```

**Oversized async contexts**:
```rust
// BAD — large struct held across await point
struct LargeState { df: DataFrame, cache: Vec<...> } // 10MB+

async fn handler(req: Request) -> Result<Response> {
    let state = LargeState::load().await; // large allocation on async stack
    do_io().await; // await point — state still live
    process(state.df) // large copy
}

// GOOD — keep large data on the heap, not async stack
let state = Arc::new(State::load().await);
let df = state.df.clone(); // cheap Arc clone
```

---

## 6. Data Layer & Storage Architecture

### 6.1 Repository Trait

```rust
// edatime-store/src/repository.rs

use edatime_core::types::{DatasetMeta, Schema};
use polars::prelude::LazyFrame;

pub trait DataRepository: Send + Sync {
    fn snapshot(&self) -> LazyFrame;
    fn meta(&self) -> Arc<RwLock<DatasetMeta>>;
    fn revision(&self) -> u64;
    fn replace_from_dataframe(&self, df: DataFrame) -> u64;
    fn time_column_display_name(&self) -> Option<String>;

    // Optional: for incremental / streaming ingestion
    fn append(&self, df: DataFrame) -> Result<u64, AppError> { todo!() }
}
```

### 6.2 Storage Adapters

```rust
// edatime-store/src/storage/mod.rs

pub trait StorageAdapter: Send + Sync {
    fn read(&self, path: &Path) -> Result<LazyFrame, AppError>;
    fn write(&self, lf: LazyFrame, path: &Path) -> Result<(), AppError>;
    fn exists(&self, path: &Path) -> bool;
}

pub struct ParquetAdapter;
pub struct ArrowAdapter;
pub struct CsvAdapter;

impl StorageAdapter for ParquetAdapter {
    fn read(&self, path: &Path) -> Result<LazyFrame, AppError> {
        let lf = LazyFrame::scan_parquet(path, Default::default())
            .map_err(|e| AppError::Io(e.to_string()))?;
        Ok(lf)
    }

    fn write(&self, lf: LazyFrame, path: &Path) -> Result<(), AppError> {
        let df = lf.with_new_streaming(true).collect()
            .map_err(|e| AppError::Io(e.to_string()))?;
        let mut file = std::fs::File::create(path)?;
        ParquetWriter::new(&mut file).finish(&df)
            .map_err(|e| AppError::Io(e.to_string()))?;
        Ok(())
    }
}
```

### 6.3 Cache Layer

```rust
// edatime-store/src/cache.rs

#[derive(Clone, Hash)]
pub struct CacheKey {
    pub revision: u64,
    pub start: Option<i64>,
    pub end: Option<i64>,
    pub width: Option<u32>,
    pub columns: Vec<String>,
    pub color_column: Option<String>,
    pub format: String,
}

pub struct ResponseCache {
    inner: tokio::sync::RwLock<HashMap<CacheKey, CachedResponse>>,
    ttl: Duration,
    max_entries: usize,
}

impl ResponseCache {
    pub async fn get(&self, key: &CacheKey) -> Option<Response> {
        let guard = self.inner.read().await;
        match guard.get(key) {
            Some(entry) if !entry.is_expired() => Some(entry.response.clone()),
            _ => None,
        }
    }

    pub async fn insert(&self, key: CacheKey, response: Response) {
        if guard.len() > self.max_entries {
            // evict oldest by timestamp
        }
        guard.insert(key, CachedResponse { response, timestamp: Instant::now(), ttl: self.ttl });
    }

    pub async fn invalidate_revision(&self, revision: u64) {
        // Remove all entries for this revision — fixes the stale cache bug
        let mut guard = self.inner.write().await;
        guard.retain(|k, _| k.revision != revision);
    }
}
```

### 6.4 Partitioning Strategy

For time-series data, partition by time ranges:

```rust
pub struct TimePartition {
    pub start: i64,
    pub end: i64,
    pub lf: LazyFrame,
}

impl InMemoryDataRepository {
    // Partition by non-overlapping time ranges
    // Enables partition pruning: only load partitions that overlap with query range
}
```

### 6.5 Anti-Patterns

**Row-oriented abstractions for analytical systems**:
```rust
// BAD — repository returns row-by-row iterator
pub trait DataRepository {
    fn rows(&self) -> Box<dyn Iterator<Item = Row>>;
}

// GOOD — repository returns columnar LazyFrame
pub trait DataRepository {
    fn snapshot(&self) -> LazyFrame;
}
```

**Transport-aware repositories**:
```rust
// BAD — repository knows about HTTP response types
impl DataRepository for InMemoryDataRepository {
    fn get_cached_response(&self, req: &DataRequest) -> Option<Response> { ... }
}

// GOOD — repository only manages data, cache is separate
impl DataRepository {
    fn snapshot(&self) -> LazyFrame { ... }
}
```

**Eager deserialization**:
```rust
// BAD — read entire file into memory
fn read_parquet(path: &Path) -> DataFrame {
    let bytes = std::fs::read(path)?;
    parquet::read(bytes)?  // materializes all
}

// GOOD — lazy scan with predicate pushdown
fn read_parquet(path: &Path) -> LazyFrame {
    LazyFrame::scan_parquet(path, Default::default())?
        .filter(col("time").gt(lit(start)).and(col("time").lt(lit(end))))
}
```

---

## 7. API & Service Layer Architecture

### 7.1 DTO Boundaries

```rust
// edatime-service/src/dto/data.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct DataRequest {
    pub start: Option<i64>,
    pub end: Option<i64>,
    pub width: Option<u32>,
    pub columns: Option<Vec<String>>,
    pub color_column: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DataResponse {
    pub revision: u64,
    pub rows: usize,
    pub columns: Vec<String>,
    pub timestamp_range: (i64, i64),
}

pub type Result<T, E = AppError> = std::result::Result<T, E>;
```

### 7.2 Validation Layer

```rust
impl DataRequest {
    pub fn validate(&self, meta: &DatasetMeta) -> Result<(), AppError> {
        if let Some(ref cols) = self.columns {
            for col in cols {
                if !meta.schema().has_column(col) {
                    return Err(AppError::BadRequest(format!("unknown column: {}", col)));
                }
            }
        }
        if let Some(w) = self.width {
            if w == 0 || w > 100_000 {
                return Err(AppError::BadRequest(format!("invalid width: {}", w)));
            }
        }
        Ok(())
    }
}
```

### 7.3 Router Organization

```rust
// edatime-service/src/router.rs

pub struct ApiRouter {
    data: Router<DataHandler>,
    scatter: Router<ScatterHandler>,
    analytics: Router<AnalyticsHandler>,
    upload: Router<UploadHandler>,
}

impl ApiRouter {
    pub fn new(executor: Arc<QueryExecutor>, repo: Arc<dyn DataRepository>) -> Self {
        Self {
            data: Router::new(DataHandler::new(executor.clone(), repo.clone())),
            scatter: Router::new(ScatterHandler::new(executor.clone(), repo.clone())),
            analytics: Router::new(AnalyticsHandler::new(executor.clone(), repo.clone())),
            upload: Router::new(UploadHandler::new(repo.clone())),
        }
    }

    pub fn into_router(self) -> Router {
        Router::new()
            .nest("/api/data", self.data.routes())
            .nest("/api/scatter", self.scatter.routes())
            .nest("/api/analytics", self.analytics.routes())
            .nest("/api", self.upload.routes())  // /api/upload
            .route("/api/health", get(health_handler))
    }
}
```

### 7.4 Streaming Responses

```rust
// For large responses, stream Arrow IPC directly
pub async fn stream_data(req: DataRequest) -> Result<Response> {
    let (lf, plan) = build_query_pipeline(&req, &meta).await?;
    let stream = AppExecutor::execute_streaming(lf, plan).await?;

    Ok(Response::builder()
        .header("Content-Type", "application/vnd.apache.arrow.stream")
        .header("X-Revision", meta.revision().to_string())
        .body(stream))
}
```

### 7.5 Service Composition Pattern

```rust
pub struct DataService<R: DataRepository> {
    repo: Arc<R>,
    executor: Arc<QueryExecutor>,
    cache: Arc<ResponseCache>,
}

impl<R: DataRepository> DataService<R> {
    pub async fn query(&self, req: DataRequest) -> Result<DataResponse> {
        // 1. Validate against current meta
        let meta = self.repo.meta().read().unwrap();
        req.validate(&meta)?;

        // 2. Check cache
        let cache_key = CacheKey::from_request(&req, meta.revision());
        if let Some(cached) = self.cache.get(&cache_key).await {
            return Ok(cached);
        }

        // 3. Build and execute pipeline
        let (lf, plan) = self.build_pipeline(&req, &meta)?;
        let df = self.executor.execute(lf, plan).await?;

        // 4. Serialize and cache
        let response = self.serialize_response(df, &meta)?;
        self.cache.insert(cache_key, response.clone()).await;
        Ok(response)
    }
}
```

### 7.6 Anti-Patterns

**Transport-aware domain logic**:
```rust
// BAD — domain knows about axum extractors
async fn data_handler(State(state): State<AppState>, Query(params): Query<DataParams>) {
    // handler directly builds LazyFrame — domain logic in transport
}

// GOOD — handler only deserializes and delegates
async fn data_handler(State(state): State<AppState>, Json(req): Json<DataRequest>) {
    let response = DataService::query(state.repo, state.executor, req).await?;
    Ok(Json(response))
}
```

**Oversized service layers**:
```rust
// BAD — single service with 50 methods handling all concerns
struct AppService { /* data, scatter, upload, config, metrics... */ }

// GOOD — split by bounded context
struct DataService { /* data queries */ }
struct ScatterService { /* scatter queries */ }
struct UploadService { /* ingest */ }
```

---

## 8. State, Caching & Execution Contexts

### 8.1 Execution Context Isolation

```rust
pub struct QueryContext {
    pub request_id: RequestId,
    pub revision: u64,
    pub time_range: Option<(i64, i64)>,
    pub thread_pool: Arc<ThreadPool>,
    pub cancellation_token: CancellationToken,
}

impl QueryContext {
    pub fn spawn_cancellable<F>(&self, f: F) -> JoinHandle<Result<DataFrame>>
    where
        F: FnOnce(CancellationToken) -> Result<DataFrame> + Send + 'static,
    {
        let token = self.cancellation_token.clone();
        tokio::task::spawn_blocking(move || f(token))
    }
}
```

### 8.2 Cache Invalidation on Replace

```rust
impl<R: DataRepository> DataService<R> {
    pub async fn replace_dataset(&self, df: DataFrame) -> Result<u64> {
        let revision = self.repo.replace_from_dataframe(df);
        // Invalidate all cache entries for old revisions
        self.cache.invalidate_all().await;
        Ok(revision)
    }
}
```

### 8.3 Deterministic Pipeline Patterns

```rust
pub struct PipelineConfig {
    pub ts_column: String,
    pub default_width: Option<u32>,
    pub max_rows: Option<usize>,
}

impl PipelineConfig {
    pub fn apply_defaults(&self, mut plan: QueryPlan) -> QueryPlan {
        if plan.time_filter.is_none() {
            // apply full time range
        }
        plan
    }
}
```

### 8.4 Anti-Patterns

**Global mutable execution state**:
```rust
// BAD — global mutable state in a static
static CURRENT_DATASET: LazyFrame = LazyFrame::new_lazy();

// GOOD — explicit state passed through
fn process(lf: LazyFrame, ctx: &QueryContext) -> Result<DataFrame> { ... }
```

**Cache incoherence**:
```rust
// BAD — cache updated but not invalidated on dataset replace
// GOOD — invalidate on any data mutation
```

---

## 9. Performance Optimization Strategy

### 9.1 Zero-Copy Arrow Operations

```rust
// edatime-store/src/storage/arrow.rs

pub fn read_arrow_ipc(path: &Path) -> Result<LazyFrame> {
    let file = std::fs::File::open(path)?;
    let reader = FileReader::new(file);
    // Zero-copy: Arrow IPC reader directly maps memory to Arrow arrays
    // No deserialization to Java objects or Rust structs
    Ok(LazyFrame::from_arrowIPC_reader(reader))
}
```

### 9.2 Projection Pushdown

```rust
// Build projection immediately so Parquet reader skips unneeded columns
let lf = LazyFrame::scan_parquet(path, Default::default())?
    .select(["ts", "value", "quality"]);  // only 3 columns loaded from disk
```

### 9.3 Predicate Pushdown

```rust
// Time filter pushed to Parquet scan — partition pruning
let lf = LazyFrame::scan_parquet(path, Default::default())?
    .filter(col("ts").gt(lit(start_ms)).and(col("ts").lt(lit(end_ms))));
```

### 9.4 Memory-Aware Transformations

```rust
// Use streaming collection to cap memory at ~(width * n_columns * 8 bytes)
lf.with_new_streaming(true).collect()  // streaming
lf.collect()  // batched — can spike to full dataset

// For very large datasets, chunk the collection
fn collect_chunked(lf: LazyFrame, chunk_size: usize) -> DataFrame {
    // stream in chunks, concatenate at the end
    let chunks: Vec<DataFrame> = lf.into_chunks(chunk_size)
        .map(|c| c.collect())
        .collect();
    DataFrame::new(chunks)
}
```

### 9.5 Efficient Batching

```rust
// Scatter/density aggregation — batch over time windows
fn batch_aggregate(lf: LazyFrame, window_ms: i64) -> DataFrame {
    lf.with_column(
        (col("ts") / lit(window_ms)).floor().alias("bucket"),
    ).group_by(["bucket"])
     .agg([
         col("x").mean().alias("x"),
         col("y").mean().alias("y"),
         col("x").count().alias("count"),
     ]).collect()
}
```

### 9.6 LazyFrame Clone Optimization

```rust
// Current: every handler clones
let lf = repo.snapshot(); // clone
let schema = lf.clone().collect_schema(); // second clone

// Optimized: single clone per handler
let lf = repo.snapshot();
let schema = lf.collect_schema(); // collects schema from the plan without cloning
```

### 9.7 KPIs

| Operation | Metric | Target |
|-----------|--------|--------|
| Data query (10M rows) | P50 latency | < 200ms |
| Scatter query (1M points) | P50 latency | < 500ms |
| Upload (100MB CSV) | P50 latency | < 2s |
| Memory per query | Resident set | < 512MB |
| Cache hit rate | Hit ratio | > 70% |
| CPU utilization | % Rayon threads busy | > 80% |

### 9.8 Anti-Patterns

**Excessive cloning**:
```rust
// BAD — clone per column
for col_name in &columns {
    let s = lf.clone().column(col_name)?.clone();
}

// GOOD — single projection
let lf = lf.clone().select(columns.clone());
```

**Repeated schema resolution**:
```rust
// BAD — schema resolved on every call
fn get_dtype(lf: &LazyFrame, col: &str) -> DataType {
    lf.clone().collect_schema().get(col).unwrap().dtype()
}

// GOOD — schema cached in DatasetMeta
fn get_dtype(meta: &DatasetMeta, col: &str) -> DataType {
    meta.schema.get(col).unwrap().dtype()
}
```

---

## 10. Error Handling & Observability

### 10.1 Typed Error Hierarchy

```rust
// edatime-core/src/error.rs

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("validation failed: {0}")]
    Validation(String),

    #[error("upstream error: {0}")]
    Upstream(String),

    #[error("internal: {0}")]
    Internal(String),

    #[error("io: {0}")]
    Io(String),

    #[error("cancelled")]
    Cancelled,
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::BadRequest(_) => "BAD_REQUEST",
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::Validation(_) => "VALIDATION_ERROR",
            AppError::Upstream(_) => "UPSTREAM_ERROR",
            AppError::Internal(_) => "INTERNAL_ERROR",
            AppError::Io(_) => "IO_ERROR",
            AppError::Cancelled => "CANCELLED",
        }
    }
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: &'static str,
    pub request_id: Option<RequestId>,
}
```

### 10.2 Request ID Propagation

```rust
// edatime-service/src/middleware/request_id.rs

pub async fn request_id_middleware<B>(
    mut request: Request<B>,
    next: Next<B>,
) -> Result<Response, AppError> {
    let request_id = request
        .headers()
        .get("X-Request-ID")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let span = tracing::info_span!("request", request_id = %request_id);
    let _guard = span.enter();

    request.extensions_mut().insert(RequestId(request_id.clone()));

    let response = next.run(request).await;

    let mut resp = response.into_response();
    resp.headers_mut().insert("X-Request-ID", request_id.parse().unwrap());
    Ok(resp)
}

// In spawn_blocking — propagate the request ID
tokio::task::spawn_blocking(move || {
    let span = tracing::info_span!("collect", request_id = %request_id);
    let _guard = span.enter();
    lf.collect()
})
```

### 10.3 Query Plan Inspection

```rust
// Debug mode: expose query plan
#[cfg(debug_assertions)]
pub fn explain_query(lf: LazyFrame) -> String {
    lf.explain().unwrap()
}

// Production: log optimized plan hash for correlation
pub fn log_query_plan(lf: &LazyFrame, request_id: &str) {
    let plan_hash = lf.sum().to_string(); // simple fingerprint
    tracing::debug!(request_id = %request_id, plan_hash = %plan_hash, "query plan");
}
```

### 10.4 Structured Logging

```rust
// Current: unstructured
tracing::info!("query completed in {} ms", elapsed_ms);

// Better: structured
tracing::info!(
    request_id = %request_id,
    elapsed_ms = %elapsed_ms,
    rows_returned = %rows,
    cache_hit = %cache_hit,
    "data query completed"
);
```

### 10.5 Anti-Patterns

**String-based errors**:
```rust
// BAD
Err(AppError::Internal(format!("failed because {} and {}", reason1, reason2)))

// GOOD
Err(AppError::Internal("query execution failed".into()))
```

**Swallowed errors**:
```rust
// BAD — error lost
if let Err(e) = self.cache.invalidate(revision) {
    // do nothing
}

// GOOD
if let Err(e) = self.cache.invalidate(revision) {
    tracing::warn!(revision = %revision, error = %e, "cache invalidation failed");
}
```

---

## 11. Developer Experience Improvements

### 11.1 Coding Standards

- **Clippy**: `cargo clippy --all-targets -- -D warnings` in CI
- **FMT**: `cargo fmt --all` check in CI
- **Miri**: for unsafe code verification in `edatime-core`
- **Feature gates**: each crate has a ` Cargo.toml` with explicit dependencies

### 11.2 Module Ownership Conventions

Each crate has an owner (team member or role). Cross-crate changes require sign-off from owners of both crates.

### 11.3 Abstraction Rules

1. No `dyn Trait` in hot paths without benchmarking evidence
2. No public `Arc<Mutex<T>>` — use `RwLock` for read-heavy workloads
3. No `unwrap()` in production code paths
4. Every `pub` item has a doc comment
5. No `todo!()` in production paths

### 11.4 Crate Dependency Rules

```
edatime-core      → no external analytical deps
edatime-store     → edatime-core, polars (for LazyFrame)
edatime-query     → edatime-core, edatime-store, polars
edatime-service   → edatime-core, edatime-query, edatime-store, edatime-ingest
edatime-ingest    → edatime-core, edatime-store
edatime-bin       → all of the above
```

### 11.5 Maintainability Patterns

**Facade for complex subsystems**:
```rust
// edatime-query/src/lib.rs
pub use pipeline::QueryPipeline;
pub use executor::QueryExecutor;
pub use filters::{NumericRangeFilter, AdaptiveFilter};
```

**Builder pattern for complex construction**:
```rust
// Instead of 10-argument constructors
let pipeline = QueryPipeline::builder()
    .time_range(start, end)
    .columns(cols)
    .reduction(ReductionSpec::Lttb { target_points })
    .build();
```

---

## 12. Testing Strategy

### 12.1 Unit Tests for Pipeline Stages

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_time_filter_bounds() {
        let lf = make_test_lf();
        let result = apply_time_filter(lf, 1000, 2000, "ts");
        let df = result.collect().unwrap();

        let ts = df.column("ts").unwrap().i64().unwrap();
        assert!(ts.iter().all(|v| v >= 1000 && v <= 2000));
    }

    #[test]
    fn test_numeric_filter_out_of_bounds() {
        let lf = make_test_lf();
        let filter = NumericRangeFilter {
            column: "value".into(),
            min: 100.0,
            max: 200.0,
        };
        let result = apply_numeric_filter(lf, &filter);
        let df = result.collect().unwrap();
        let val = df.column("value").unwrap().f64().unwrap();
        assert!(val.iter().all(|v| v >= 100.0 && v <= 200.0));
    }
}
```

### 12.2 LazyFrame Property Tests

```rust
#[cfg(test)]
mod property_tests {
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn test_time_filter_idempotent(start: i64, end: i64) {
            let lf = make_test_lf();
            let filtered1 = apply_time_filter(lf.clone(), start, end, "ts");
            let filtered2 = apply_time_filter(filtered1, start, end, "ts");

            let df1 = filtered1.collect().unwrap();
            let df2 = filtered2.collect().unwrap();
            assert_eq!(df1.shape(), df2.shape());
        }
    }
}
```

### 12.3 Integration Tests

```rust
#[tokio::test]
async fn test_data_endpoint_full_flow() {
    let (app, _) = build_test_app().await;

    // Upload a dataset
    let upload = TestUpload::small();
    let response = app.post("/api/upload", upload).await;
    assert_eq!(response.status(), 200);

    // Query it
    let response = app.get("/api/data?start=0&end=1000").await;
    assert_eq!(response.status(), 200);
    let body: DataResponse = response.json().await;
    assert!(body.rows > 0);
}
```

### 12.4 Concurrency Tests

```rust
#[tokio::test]
async fn test_concurrent_queries_do_not_interfere() {
    let repo = InMemoryDataRepository::new();
    let executor = QueryExecutor::new();

    // Spawn 10 concurrent queries
    let handles: Vec<_> = (0..10).map(|i| {
        let lf = repo.snapshot();
        tokio::spawn(async move {
            let filtered = apply_time_filter(lf, i * 100, (i+1) * 100, "ts");
            executor.execute(filtered).await
        })
    }).collect();

    let results = futures::future::join_all(handles).await;
    for result in results {
        assert!(result.is_ok());
    }
}
```

### 12.5 Benchmark Suite

```rust
// benches/data_query.rs

fn criterion_benchmark(c: &mut Criterion) {
    c.bench_function("data_query_10M_rows", |b| {
        b.iter(|| {
            let lf = make_lazydata(10_000_000);
            let filtered = apply_time_filter(lf, 0, 1_000_000, "ts");
            let result = filtered.with_new_streaming(true).collect();
            black_box(result)
        })
    });
}
```

### 12.6 Test Isolation

- Unit tests: pure functions, no IO, no async
- Integration tests: real repository, in-memory storage
- E2E tests: actual HTTP endpoints with test database

---

## 13. Migration & Incremental Refactor Plan

### Phase 1: Crate Boundaries First (Weeks 1-2)

**Goal**: Establish the crate structure so that new code lives in the right places.

1. Create all crate `Cargo.toml` files with correct dependency declarations
2. Move `src/lib.rs` types → `edatime-core::types`
3. Move `src/error.rs` → `edatime-core::error`
4. Move `src/temporal.rs` → `edatime-core::temporal`
5. Move `src/state.rs` (AppState, InMemoryDataRepository) → `edatime-store`
6. Move `src/repository.rs` (DataRepository trait) → `edatime-store`
7. Move `src/cache.rs` → `edatime-store::cache`
8. Move `src/query.rs` (QueryExecutor) → `edatime-query`
9. Move `src/pipeline.rs` → `edatime-query::pipeline`
10. Move `src/filters.rs` → `edatime-query::filters`
11. Move `src/routes/` → `edatime-service::handlers`
12. Delete `src/` (old location) — everything now in crates

**Validation**: `cargo check --workspace` passes at every step.

**Risk**: Low. Pure file moves, no logic changes.

### Phase 2: Fix Critical Bugs (Week 3)

**Goal**: Fix observable issues that affect correctness.

1. Fix cache invalidation on `replace_dataset` (Section 1.7)
2. Fix `dataset_rows()` to use streaming count (Section 1.6)
3. Add request ID propagation to all `spawn_blocking` closures
4. Remove double-wrapping in `InMemoryDataRepository` — use `StdRwLock` directly
5. Add structured error responses in all handlers

**Validation**: Add integration test that replaces a dataset and verifies subsequent queries return new data.

### Phase 3: LazyFrame Pipeline Refactor (Weeks 4-6)

**Goal**: All analytical processing composes as LazyFrame stages.

1. Implement `QueryPipeline` builder (Section 4.1)
2. Implement `PipelineStage` trait and compose existing filters into stages
3. Implement `ReductionStage` with lazy-compatible reductions (Section 4.2)
4. Add schema caching on `DatasetMeta` — remove repeated `collect_schema()` calls
5. Add `QueryPlan::explain()` for debug mode

**Validation**: Existing API tests pass. New tests for pipeline composition.

### Phase 4: Service Layer Cleanup (Weeks 7-8)

**Goal**: Handlers become thin transport adapters.

1. Create `DataService<R>` with full pipeline orchestration (Section 7.5)
2. Create `ScatterService`, `UploadService`, `AggregateService`
3. Implement `ApiRouter` with sub-routers (Section 7.3)
4. Implement DTO validation layer (Section 7.2)
5. Remove direct LazyFrame construction from handlers

**Validation**: All integration tests pass. No handler calls Polars directly.

### Phase 5: Observability (Weeks 9-10)

**Goal**: Full structured tracing and metrics.

1. Add request ID to all spans, propagate through `spawn_blocking`
2. Add query plan hash logging
3. Add structured JSON logging (via `tracing` + `tracing-json`)
4. Add histogram metrics for query latency, cache latency, collection time
5. Add query plan inspection endpoint in debug mode

**Validation**: Correlate a request from HTTP through to Polars collect using request ID.

### Phase 6: Performance Optimization (Weeks 11-12)

**Goal**: Measurable latency and memory improvements.

1. Benchmark baseline: data query P50, scatter P50, upload P50, memory RSS
2. Implement projection pushdown on all query paths
3. Optimize cache key computation
4. Add `with_new_streaming(true)` everywhere streaming is safe
5. Add connection pooling for any external services

**Validation**: Metrics show improvement over Phase 1 baseline. No regression.

### 13.1 Rollback Strategy

Each phase produces a working system. If Phase N introduces regressions:
1. Revert crate changes for the phase
2. Continue with Phase N+1 only after stabilization
3. No long-running feature branches — integrate early, test often

### 13.2 Shadow Execution Strategy

During Phase 3-4, run both old and new pipeline for the same request and compare outputs (debug mode only). Log any divergence for 2 weeks before removing the old code path.

---

## 14. Patterns, Anti-Patterns & Code Smells Reference

### Recommended Patterns

#### Declarative LazyFrame Pipelines

```rust
// GOOD — stages compose declaratively
let pipeline = QueryPipeline::new()
    .with_stage(TimeFilterStage::new(start, end, "ts"))
    .with_stage(ColumnProjectionStage::new(cols))
    .with_stage(NumericFilterStage::new(filter))
    .with_stage(ReductionStage::new(ReductionSpec::Lttb { target_points: 1000 }));

let (lf, plan) = pipeline.build(lf);
let df = executor.execute(lf, plan).await?;
```

**Why**: Composable, testable in isolation, query optimizer sees all stages.

#### Schema-First Design

```rust
// GOOD — schema known before data flows
fn process(lf: LazyFrame, meta: &DatasetMeta) -> Result<DataFrame> {
    let ts_col = meta.schema().temporal_column()
        .ok_or_else(|| AppError::BadRequest("no time column".into()))?;
    // ... rest of processing is typed
}
```

#### Typed Query DSL

```rust
// GOOD — request is typed, validated before processing
struct DataQuery {
    time_range: TimeRange,
    columns: Vec<String>,
    reduction: Option<Reduction>,
}

impl DataQuery {
    fn plan(&self, meta: &DatasetMeta) -> QueryPlan { ... }
}
```

#### Repository Adapter

```rust
// GOOD — storage behind a trait
pub trait DataRepository: Send + Sync {
    fn snapshot(&self) -> LazyFrame;
    fn revision(&self) -> u64;
}

struct InMemoryDataRepository { ... }
struct ParquetDataRepository { path: PathBuf, ... }
```

#### Bounded Concurrency

```rust
// GOOD — semaphore limits concurrent tasks
let sem = Arc::new(Semaphore::new(10));
let results = sem.acquire_many(10).await?;
```

#### Execution Context Isolation

```rust
// GOOD — context carries everything needed, no globals
fn execute(lf: LazyFrame, ctx: &QueryContext) -> Result<DataFrame> {
    let span = tracing::info_span!("collect", request_id = %ctx.request_id);
    let _guard = span.enter();
    lf.with_new_streaming(true).collect()
}
```

#### Event-Driven Ingestion

```rust
// GOOD — ingest events drive repository update
enum IngestEvent {
    Replace(DataFrame),
    Append(DataFrame),
    PartialReplace { start: i64, end: i64, df: DataFrame },
}
```

#### Arrow-Native Processing

```rust
// GOOD — Arrow IPC streaming, zero-copy
let reader = FileReader::from_path(path)?;
let lf = LazyFrame::from_arrow_batches(reader)?;
```

#### Deterministic Transformations

```rust
// GOOD — same input always produces same output, no hidden state
fn normalize(lf: LazyFrame, center: f64, scale: f64) -> LazyFrame {
    lf.with_column(((col("value") - lit(center)) / lit(scale)).alias("value"))
}
```

#### Dependency Inversion

```rust
// GOOD — service depends on trait, not concrete implementation
impl<R: DataRepository> DataService<R> {
    fn query(&self, req: DataRequest) -> impl Future<Output = Result<DataResponse>> { ... }
}
```

---

### Anti-Patterns

#### Imperative DataFrame Mutation Pipelines

```rust
// BAD — mutating df in place, hard to test
fn process(mut df: DataFrame) -> DataFrame {
    df = df.filter(...);       // intermediate allocation
    df = df.rename(...);       // another allocation
    df = df.sort(...);         // third allocation
    df
}

// GOOD — single plan, single allocation
fn process(lf: LazyFrame) -> LazyFrame {
    lf.filter(predicate).rename(...).sort([...])
}
```

#### collect()-Driven Architecture

```rust
// BAD — collect everywhere, no lazy optimization
fn query(lf: LazyFrame) -> DataFrame {
    lf.filter(...).collect().unwrap()  // full materialization
}

// GOOD — collect only at the end of the pipeline
fn query(lf: LazyFrame) -> DataFrame {
    lf.filter(...).with_new_streaming(true).collect().unwrap()
}
```

#### Oversized Service Layers

```rust
// BAD — one service knows everything
struct AppService {
    data_handler: DataHandler,
    scatter_handler: ScatterHandler,
    upload_handler: UploadHandler,
    ingest_handler: IngestHandler,
    config_handler: ConfigHandler,
    metrics_handler: MetricsHandler,
}

// GOOD — one service per bounded context
struct DataService { ... }
struct ScatterService { ... }
struct UploadService { ... }
```

#### Blocking Analytical Execution in Async Runtimes

```rust
// BAD — CPU work on async thread
async fn handler(req: Request) -> Result<Response> {
    let df = lf.collect().unwrap(); // blocks async thread
    Ok(Json(df))
}

// GOOD — offload to blocking thread pool
async fn handler(req: Request) -> Result<Response> {
    let df = tokio::task::spawn_blocking(move || lf.collect().unwrap()).await?;
    Ok(Json(df))
}
```

#### Giant Shared State Managers

```rust
// BAD — global mutable state
static STATE: LazyLock<Arc<AppState>> = LazyLock::new(|| Arc::new(AppState::new()));

// GOOD — explicit state threaded through handlers
async fn handler(State(state): State<AppState>) -> Result<Response> { ... }
```

#### Transport-Aware Domain Logic

```rust
// BAD — handler directly builds query
async fn scatter_handler(Query(params): Query<ScatterParams>) {
    let lf = repo.snapshot().filter(...).select(...);
    // ... more query construction
}

// GOOD — handler only deserializes, service builds query
async fn scatter_handler(Json(req): Json<ScatterRequest>) {
    let resp = ScatterService::query(repo, executor, req).await?;
    Ok(Json(resp))
}
```

#### Runtime Schema Guessing

```rust
// BAD — type checked at runtime
let dtype = lf.clone().collect_schema().get("ts")?.dtype();
if matches!(dtype, DataType::Int64) { ... }

// GOOD — schema known at construction, compile-time option
fn process(meta: &DatasetMeta) -> Result<()> {
    let ts_col = meta.temporal_column().ok_or(...)?;
    // ts_col.dtype is known
}
```

#### Query Orchestration Spaghetti

```rust
// BAD — no clear query construction pattern
async fn handler(req: Request) -> Result<Response> {
    let lf = repo.snapshot();
    let lf = if req.has_time_filter() { lf.filter(...) } else { lf };
    let lf = if req.has_columns() { lf.select(...) } else { lf };
    let lf = if req.has_reduction() { apply_reduction(lf, &req.reduction)? } else { lf };
    let df = lf.collect()?;
    // ...
}

// GOOD — clear pipeline builder
async fn handler(req: Request) -> Result<Response> {
    let plan = QueryPlan::from_request(req);
    let lf = QueryPipeline::from_plan(plan).execute(repo.snapshot());
    let df = executor.execute(lf, plan).await?;
    // ...
}
```

#### Utility Monoliths

```rust
// BAD — catch-all utils module
pub mod utils {
    pub fn format_timestamp(), pub fn parse_filter(), pub fn validate_col(),
    pub fn build_cache_key(), pub fn estimate_memory(), pub fn ... // 30 functions
}

// GOOD — each utility near its use site
// time formatting → temporal.rs
// filter parsing → filters.rs
// cache key → cache.rs
```

#### Clone-Heavy Processing

```rust
// BAD — clone in hot loop
for col_name in columns {
    let series = lf.clone().column(col_name)?.clone();
    results.push(process(series));
}

// GOOD — single projection, process columns from df
let lf = lf.select(columns.clone());
let df = lf.collect()?;
for col_name in columns {
    let series = df.column(col_name)?;
    results.push(process(series));
}
```

---

### Code Smells

#### Repeated Transformation Chains

**Smell**: `lf.clone().filter(...).select(...).filter(...)` appears in multiple handlers with minor variations.

**Detection**: `grep -r "lf.clone().filter" src/` — count unique chains.

**Fix**: Extract to `QueryPipeline::from_request()` — one place to build query from request.

#### Excessive collect() Calls

**Smell**: Multiple `collect()` calls on overlapping data in same handler.

**Detection**: Count `collect()` occurrences in a single file. More than 2 is a smell.

**Fix**: Keep lazy, collect once at the end.

#### Oversized LazyFrame Pipelines

**Smell**: A single function or module builds the entire query — 200+ lines.

**Detection**: Module exceeds 200 lines and builds a query with >10 stages.

**Fix**: Split into named pipeline stages. Each stage is a struct implementing `PipelineStage`.

#### Duplicated Schema Logic

**Smell**: `lf.clone().collect_schema()` appears in more than 3 files.

**Fix**: Cache schema in `DatasetMeta`. Handlers call `meta.schema()` instead.

#### Nested Async Orchestration

**Smell**: `tokio::join!` with 5+ futures, or `select!` with deep nesting.

**Detection**: Cyclomatic complexity in handler > 15.

**Fix**: Extract to service methods. Handler is 5 lines.

#### Opaque Query Builders

**Smell**: Query construction uses raw strings or complex `Expr` chains with no comments.

**Fix**: Name each expression stage. Add builder methods with typed parameters.

#### Hidden IO Inside Transformations

**Smell**: A function called `transform` does network IO (cache lookup, config fetch).

**Detection**: `cargo bench` shows high variance in "fast" functions.

**Fix**: IO must be explicit in async functions. Transformers are pure.

#### Mutable Global Caches

**Smell**: `static mut CACHE` or `LazyLock<Mutex<HashMap>>`.

**Fix**: Use `Arc<RwLock<Cache>>` threaded through app state. Better: use scoped cache in `QueryContext`.

#### Unstable Execution Ordering

**Smell**: Results vary between runs with same input (non-determinism).

**Detection**: Flaky tests. `RUST_LOG=trace` shows different ordering.

**Fix**: Ensure `collect()` order is deterministic. Use `sort()` before `collect()` for non-ordered sources.

#### Ad-Hoc Serialization Flows

**Smell**: Serialization logic duplicated across handlers (same `to_arrow_ipc()` code repeated 3+ times).

**Detection**: Code search for `to_arrow_ipc` returns >3 results in handlers.

**Fix**: Single `ArrowExporter` service.

---

## 15. Deliverables

### 15.1 Proposed Crate Structure

```
edatime/
├── Cargo.toml                           # workspace
├── crates/
│   ├── edatime-bin/                     # main.rs only
│   │   ├── Cargo.toml
│   │   └── src/
│   │       └── main.rs
│   ├── edatime-core/                    # shared types, no analytical deps
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── error.rs                 # AppError enum
│   │       ├── config.rs
│   │       ├── temporal.rs
│   │       └── types/
│   │           ├── mod.rs
│   │           ├── dataset_meta.rs
│   │           ├── schema.rs
│   │           ├── dto.rs               # cross-crate DTOs
│   │           └── pipeline.rs          # QueryPlan, ReductionSpec
│   ├── edatime-store/                   # repository + storage + cache
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── repository.rs            # DataRepository trait
│   │       ├── inmemory.rs              # InMemoryDataRepository
│   │       ├── cache.rs                 # ResponseCache
│   │       └── storage/
│   │           ├── mod.rs
│   │           ├── parquet.rs
│   │           └── arrow.rs
│   ├── edatime-query/                   # execution engine + LazyFrame pipelines
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── executor.rs              # QueryExecutor
│   │       ├── pipeline/
│   │       │   ├── mod.rs
│   │       │   ├── builder.rs           # QueryPipeline builder
│   │       │   ├── time_filter.rs
│   │       │   ├── projection.rs
│   │       │   ├── reduction.rs        # LTTB, bucket agg
│   │       │   ├── aggregation.rs
│   │       │   └── scatter.rs
│   │       ├── filters.rs               # NumericRangeFilter, AdaptiveFilter
│   │       └── optimizer.rs
│   ├── edatime-service/                 # HTTP handlers + middleware + router
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── router.rs                # ApiRouter with sub-routers
│   │       ├── handlers/
│   │       │   ├── data.rs
│   │       │   ├── metadata.rs
│   │       │   ├── aggregate.rs
│   │       │   ├── scatter/
│   │       │   │   ├── mod.rs
│   │       │   │   ├── points.rs
│   │       │   │   └── correlations.rs
│   │       │   ├── upload.rs
│   │       │   └── health.rs
│   │       ├── dto/
│   │       │   ├── mod.rs
│   │       │   ├── data.rs
│   │       │   ├── scatter.rs
│   │       │   └── upload.rs
│   │       ├── middleware/
│   │       │   ├── mod.rs
│   │       │   ├── request_id.rs
│   │       │   ├── rate_limit.rs
│   │       │   └── compression.rs
│   │       └── error.rs                 # ServiceError, ErrorResponse
│   └── edatime-ingest/                  # ingestion logic
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── parser.rs
│           ├── preview.rs
│           ├── ingest.rs
│           └── validation.rs
├── src/                                  # REMOVE — replaced by crates/
├── tests/
│   ├── api_integration.rs
│   └── unit/
│       ├── pipeline_tests.rs
│       ├── filter_tests.rs
│       └── schema_tests.rs
└── fixtures/
    └── sample.csv
```

### 15.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    edatime-bin                          │
│                      main.rs                            │
└──────────────┬──────────────────────────┬───────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────────┐  ┌────────────────────────────┐
│     edatime-service      │  │      edatime-ingest        │
│  Router → Handlers → DTO │  │   Parser → Preview → INGEST│
└──────────────┬───────────┘  └──────────────┬─────────────┘
               │                             │
               ▼                             ▼
┌──────────────────────────┐  ┌────────────────────────────┐
│     edatime-query        │  │      edatime-store         │
│  QueryPipeline          │  │  DataRepository (trait)    │
│  QueryExecutor          │  │  ResponseCache             │
│  LazyFrame Stages       │  │  StorageAdapter (trait)    │
│  Filters                │  └──────────────┬─────────────┘
└──────────────┬───────────┘                │
               │                            │
               ▼                            ▼
┌──────────────────────────────────────────────────────────┐
│                      edatime-core                        │
│  AppError  ·  Config  ·  Temporal  ·  DatasetMeta  ·  Schema │
└──────────────────────────────────────────────────────────┘
```

### 15.3 Query Lifecycle Diagram

```
HTTP Request
    │
    ▼
RequestId Middleware ──► tracing::info_span!(request_id)
    │
    ▼
Handler ──► DTO Validation
    │
    ▼
Service::query(DTO)
    │
    ├──► Meta::schema()        (cached, not collect_schema())
    │
    ├──► Cache::get(cache_key) (async read)
    │
    └──► QueryPipeline::from_request(DTO, meta)
            │
            ├── TimeFilterStage
            ├── ProjectionStage
            ├── FilterStage (NumericRange, Adaptive)
            └── ReductionStage (marked eager/lazy)
            │
            ▼
        QueryExecutor::execute(lf, plan)
            │
            ├── spawn_blocking ──► lf.with_new_streaming(true).collect()
            │                          │
            │                          ▼
            │                     ReductionSpec::apply(df)  (LTTB if needed)
            │
            └──► ArrowExporter::to_ipc(df)  (spawn_blocking)
                    │
                    ▼
                Response + headers (X-Request-ID, X-Revision)
    │
    ▼
Cache::insert(cache_key, response)  (async write)
    │
    ▼
HTTP Response
```

### 15.4 LazyFrame Pipeline Composition Diagram

```
                    ┌─────────────────────────────────┐
                    │       QueryRequest (DTO)        │
                    └──────────────┬──────────────────┘
                                   │
                                   ▼
              ┌────────────────────────────────────────┐
              │         QueryPipeline::builder()        │
              │                                        │
              │  ┌─────────────────────────────────┐   │
              │  │ TimeFilterStage (start, end)    │   │
              │  │ col(ts).gt(start).and(col.ts.lt(end))│
              │  └──────────────┬──────────────────┘   │
              │                 │                     │
              │                 ▼                     │
              │  ┌─────────────────────────────────┐   │
              │  │  ColumnProjectionStage (cols)     │   │
              │  │  lf.select(columns)              │   │
              │  └──────────────┬──────────────────┘   │
              │                 │                     │
              │                 ▼                     │
              │  ┌─────────────────────────────────┐   │
              │  │  NumericFilterStage (filters)  │   │
              │  │  lf.filter(predicates...)       │   │
              │  └──────────────┬──────────────────┘   │
              │                 │                     │
              │                 ▼                     │
              │  ┌─────────────────────────────────┐   │
              │  │  ReductionStage (spec)           │   │
              │  │  marks eager/lazy in plan        │   │
              │  └──────────────┬──────────────────┘   │
              └─────────────────┼─────────────────────┘
                                │
                                ▼
                         (LazyFrame, QueryPlan)
                                │
                    ┌───────────┴───────────┐
                    │                       │
             QueryPlan::is_eager()    QueryPlan::is_lazy()
                    │                       │
                    ▼                       ▼
         lf.collect() → DataFrame    lf.with_new_streaming(true).collect()
         → apply reduction               → apply reduction (if needed)
```

### 15.5 Cache Ownership Diagram

```
Write Path (replace_dataset):
    UploadService::replace(df)
        │
        ├──► DataRepository::replace_from_dataframe(df)
        │         │
        │         └──► revision.increment()
        │                    │
        └──► ResponseCache::invalidate_all()
                    │
                    ▼
              All cache entries removed

Read Path (query):
    DataService::query(req)
        │
        ├──► CacheKey::new(req, revision)  ◄── revision from meta, not request
        │
        ├──► ResponseCache::get(cache_key)?
        │         │
        │         │ YES ──► return cached Response
        │         │
        │         NO  ──► execute pipeline
        │                    │
        │                    ▼
        │              QueryExecutor::execute()
        │                    │
        │                    ▼
        │              ResponseCache::insert(key, response)
        │                    │
        │                    ▼
        │              return response
```

### 15.6 Migration Checklist

- [ ] Phase 1: Create crate directory structure and Cargo.toml files
- [ ] Phase 1: Move types/temporal/error/config to edatime-core
- [ ] Phase 1: Move state/repository/cache to edatime-store
- [ ] Phase 1: Move query/pipeline/filters to edatime-query
- [ ] Phase 1: Move routes/handlers/dto/middleware to edatime-service
- [ ] Phase 1: Delete src/ directory
- [ ] Phase 1: `cargo check --workspace` passes
- [ ] Phase 2: Fix cache invalidation bug
- [ ] Phase 2: Fix dataset_rows streaming count
- [ ] Phase 2: Request ID propagation in spawn_blocking
- [ ] Phase 2: Remove repository double-wrapping
- [ ] Phase 2: Structured error responses
- [ ] Phase 3: Implement QueryPipeline builder
- [ ] Phase 3: Implement PipelineStage trait
- [ ] Phase 3: Add schema caching in DatasetMeta
- [ ] Phase 3: Add QueryPlan::explain() debug endpoint
- [ ] Phase 4: Create DataService, ScatterService, UploadService
- [ ] Phase 4: Implement ApiRouter with sub-routers
- [ ] Phase 4: Handlers become thin transport adapters
- [ ] Phase 5: Structured JSON logging
- [ ] Phase 5: Histogram metrics
- [ ] Phase 5: Query plan hash logging
- [ ] Phase 6: Benchmark baseline established
- [ ] Phase 6: Projection pushdown on all query paths
- [ ] Phase 6: Verify P50 latency improvements

### 15.7 Technical Debt Matrix

| Debt Item | Current Severity | Impact | Effort | Priority |
|-----------|-----------------|--------|--------|---------|
| Cache not invalidated on replace | High | Data staleness | Low | P1 |
| dataset_rows() full collect | High | Memory spike | Low | P1 |
| Double lock in repository | Medium | Latency overhead | Medium | P2 |
| Repeated collect_schema() calls | Medium | CPU overhead | Medium | P2 |
| Flat router, no grouping | Medium | Maintainability | Low | P2 |
| No structured error responses | Medium | Client DX | Low | P2 |
| No request ID in spawn_blocking | Medium | Observability | Medium | P3 |
| Giant AppState struct | Low | Maintainability | High | P3 |
| No query plan inspection | Low | Debugging | Medium | P3 |
| Duplicate module in src/ vs crates | High | Build confusion | High | P1 |

### 15.8 Implementation Roadmap

```
Week 1-2:   Phase 1 — Crate boundaries (file moves, correct deps)
Week 3:     Phase 2 — Critical bug fixes (cache, count, locks)
Week 4-6:   Phase 3 — LazyFrame pipeline refactor
Week 7-8:   Phase 4 — Service layer cleanup
Week 9-10:  Phase 5 — Observability additions
Week 11-12: Phase 6 — Performance optimization + benchmarks
```

### 15.9 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Workspace build broken during migration | Medium | High | Validate at each file move step |
| Regression in query results | Low | Critical | Shadow execution + integration test suite |
| Performance regression from abstraction | Medium | Medium | Benchmark before/after each phase |
| Team resistance to new structure | Low | Medium | Early team review of plan |
| Scope creep | High | Medium | Strict phase boundaries, no Phase 7 |

### 15.10 Performance Benchmark Plan

**Baseline metrics** (before Phase 1):
```bash
# Data query latency
cargo run --release --bin edatime-bin &
wrk -t4 -c100 -d30s http://localhost:8080/api/data?start=0\&end=1000000

# Scatter query latency
wrk -t4 -c50 -d30s -s scatter_post.lua http://localhost:8080/api/scatter/points

# Memory usage under load
ps aux | grep edatime | awk '{print $6}'

# Cache hit rate (metrics endpoint)
curl http://localhost:8080/api/metrics | jq '.cache_hit_rate'
```

**Post-Phase benchmarks**:
- Phase 3 baseline for query latency, memory
- Phase 6 target: P50 data query < 200ms (from baseline)