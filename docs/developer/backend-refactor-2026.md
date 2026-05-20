# Backend Refactoring Plan — edatime

**Date:** 2026-05-20  
**Goal:** Transform the backend into a high-performance, modular, maintainable Rust architecture centered on Polars LazyFrame as the core data-processing engine.

---

## 1. Architecture Review

### 1.1 Current State

The codebase has a **hybrid architecture**:

- **Monolithic `src/`** (~25 modules) holding all route handlers, pipeline logic, repository, state, and domain types.
- **Partial crate separation** (`crates/edatime-{core,store,query,ingest,service,bin}`) — the crates exist but most business logic still lives in `src/`.
- **Dual transport**: Arrow IPC for series data; JSON for metadata/scatter.
- **Repository**: `InMemoryDataRepository` wraps `Arc<RwLock<LazyFrame>>` behind a `DataRepository` trait.
- **Query executor**: `edatime-query::executor::QueryExecutor` with Rayon thread pool and `spawn_blocking`.
- **Pipeline IR**: `edatime-core::pipeline::Pipeline` with `TimeFilterStage`, `ProjectStage`, `SortStage` — partially wired in `data.rs` routes but **not used consistently** across all endpoints.

### 1.2 Tightly Coupled Modules

| Module | Coupling Issue |
|---|---|
| `src/routes/*.rs` | Handlers directly call `state.ts_context()`, `query_executor.execute_async()`, cache, metrics — everything bundled in every handler. |
| `src/pipeline.rs` | `filter_time_range` uses eager `collect()` instead of returning a lazy `LazyFrame`, preventing predicate pushdown across pipeline stages. |
| `src/temporal.rs` | Duplicated 3-line TsContext extraction pattern across handlers; not centralized in repository or query layer. |
| `src/downsample.rs` | LTTB operates on `DataFrame` (post-collection) rather than on lazy-sampled rows — forces full materialization before downsampling. |
| `src/state.rs` | `AppState` holds all concerns: repository, executor, cache, metrics, config, db_pool, drift_cache, query_log — violates SRP. |
| `src/cache.rs` | Response cache embedded in state, not abstracted as a middleware or separate service layer. |
| `src/validation.rs` | Validation logic scattered between handlers and validation module. |
| `src/routes/scatter/points.rs` | `collect_filtered_scatter_frame` + `collect_sampled_xyc_rows` inline in route handler — no separation between lazy filtering and row-level processing. |

### 1.3 Duplicated Transformation Logic

- **Time-context extraction**: Every route handler that deals with time series duplicates:
  ```rust
  let ts_col = state.time_column_display_name_sync().unwrap_or_else(|| "ts".to_string());
  let ctx = crate::temporal::ts_context(&lf, &ts_col)?;
  let start_ts = params.start.timestamp_millis() * ctx.multiplier;
  ```
- **Column parsing**: `query::parse_columns` exists but `routes/scatter/points.rs` re-implements its own column filter logic.
- **Filter building**: `parse_scatter_filters` and `parse_scatter_line_filters` are scatter-specific but could use a generic predicate builder.
- **Reduction application**: `pipeline::apply_reduction` handles LTTB, bucket, window, none — but is not composable with the `Pipeline` IR.

### 1.4 Inefficient Data Pipelines

1. **`filter_time_range` collects eagerly**:
   ```rust
   // Current: returns DataFrame immediately
   pub fn filter_time_range(...) -> Result<DataFrame, AppError> {
       lf.filter(...).select(...).with_new_streaming(true).collect()  // ← eager!
   }
   ```
   Should return `LazyFrame` so downstream stages (projection, sort) fuse before collection.

2. **LTTB runs post-collection**: Downsampling happens after the full filtered `DataFrame` is materialized in memory. For wide time ranges, this causes memory spikes.

3. **No streaming for small result sets**: The query executor always uses `with_new_streaming(true)` even when the result fits in memory, adding overhead for small datasets.

### 1.5 Eager Execution Bottlenecks

- Every handler that needs data calls `execute_async` or `execute` → triggers immediate `collect()`.
- Scatter endpoints iterate row-by-row over materialized DataFrames instead of using Polars expressions for group-level aggregations.
- Metadata endpoint collects the full DataFrame just to get schema stats.

### 1.6 Memory Inefficiencies

- **Cloning `LazyFrame`**: While `LazyFrame::clone` is shallow, repeated `snapshot()` calls across concurrent requests can accumulate reference counts.
- **No memory budgets**: No per-query memory limits or cancellation tokens.
- **Response cache**: Stores serialized bytes but cache invalidation is revision-based only (coarse-grained).

### 1.7 Poor Error Propagation

- `AppError` uses `thiserror` but handlers mix `?` with inline error construction.
- No `miette` for user-facing error messages.
- Correlation IDs are generated but not propagated to tracing spans.

### 1.8 Concurrency Limitations

- `tokio::sync::RwLock` on `LazyFrame` write path — only one writer at a time.
- No request-level cancellation via `AbortHandle`.
- Rayon pool is fixed at 4 threads — not configurable.

### 1.9 Serialization Overhead

- Arrow IPC encoding happens in-process after collection; no zero-copy path from storage to network.
- JSON fallback for scatter payloads bypasses Arrow entirely — different code paths.

### 1.10 Where Polars LazyFrame Can Replace Manual Processing

| Current Manual Pattern | LazyFrame Replacement |
|---|---|
| Row iteration in `collect_sampled_xyc_rows` | `group_by`, `agg`, `pipe` with expressions |
| Eager `filter → collect → select → collect` chain | Single lazy pipeline with `Pipeline::then()` |
| Inline time-range filter in handlers | `TimeFilterStage` composed with other stages |
| Scatter color dtype dispatch (if/else on series) | Polars expression-based dispatch |
| Manual NaN/null handling | `fill_null`, `drop_nulls` expressions |
- **`Reduction` enum** in `pipeline.rs` — good abstraction for downsampling strategies
- **`AppError` structure** — typed errors with correlation IDs
- **`analytics/` submodules** — well-organized FFT, rolling, anomaly, drift, spectrogram
- **Axum router structure** — clean `api_router()` with nested routes

---

## 2. Target Architecture

### 2.1 Proposed Crate Structure

```
crates/
├── edatime-core/          # Shared types, no I/O, no async
│   ├── src/
│   │   ├── lib.rs
│   │   ├── types.rs       # DataFrame, LazyFrame, Series wrappers
│   │   ├── error.rs      # Core error types (AppErrorcore)
│   │   ├── expr.rs       # Expression builder helpers
│   │   └── schema.rs     # Schema definitions, column contracts
│   └── Cargo.toml
│
├── edatime-store/         # Data access + storage adapters
│   ├── src/
│   │   ├── lib.rs
│   │   ├── repository.rs # InMemoryDataRepository (canonical)
│   │   ├── adapters/     # Storage backends
│   │   │   ├── arrow_adapter.rs
│   │   │   ├── parquet_adapter.rs
│   │   │   └── csv_adapter.rs
│   │   └── cache.rs      # Optional caching layer
│   └── Cargo.toml
│
├── edatime-query/         # LazyFrame query engine
│   ├── src/
│   │   ├── lib.rs
│   │   ├── query.rs      # TimeSeriesQuery, ScatterQuery builders
│   │   ├── predicates.rs # Filter expression builders
│   │   ├── transforms.rs # Column transformations
│   │   ├── aggregations.rs
│   │   ├── executor.rs   # QueryExecutor (canonical)
│   │   └── pipeline.rs   # Composable pipeline stages
│   └── Cargo.toml
│
├── edatime-service/       # Business logic, orchestration
│   ├── src/
│   │   ├── lib.rs
│   │   ├── handlers/     # Axum handler adapters
│   │   ├── middleware.rs
│   │   ├── router.rs
│   │   └── dto.rs        # Request/response DTOs
│   └── Cargo.toml
│
├── edatime-ingest/        # Data ingestion pipeline
│   ├── src/
│   │   ├── lib.rs
│   │   ├── loaders.rs    # File loading (CSV, Parquet, Arrow)
│   │   ├── parsers.rs    # Time column detection, type inference
│   │   └── validators.rs
│   └── Cargo.toml
│
└── edatime-bin/           # Binary crate — thin main.rs only
    ├── src/
    │   └── main.rs
    └── Cargo.toml
```

**Key principle:** `edatime-core` has zero dependencies on async runtimes, I/O, or web frameworks. All crates above it depend only on `edatime-core` and `polars`.

### 2.2 Module Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│                        edatime-service (axum)                       │
│   Handlers → DTOs → dispatch to query/ingest/store                 │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                      │
         ▼                    ▼                      ▼
┌─────────────────┐  ┌─────────────────┐   ┌─────────────────┐
│  edatime-query  │  │  edatime-ingest │   │  edatime-store  │
│  LazyFrame ops  │  │  File loading   │   │  Repository     │
│  No I/O         │  │  Parsing        │   │  Adapters      │
└─────────────────┘  └─────────────────┘   └─────────────────┘
         │
         ▼
┌─────────────────┐
│  edatime-core  │
│  Types, Errors │
│  Expr helpers  │
└─────────────────┘
```

### 2.3 Synchronous vs Asynchronous Components

| Component | Sync/Async | Rationale |
|---|---|---|
| `edatime-core` | Sync | Pure computation, no I/O |
| `edatime-query` pipeline | Sync | CPU-bound; runs on Rayon via `spawn_blocking` |
| `edatime-store` repository | Sync reads | `RwLock` read clones are microseconds |
| `edatime-store` adapters | Sync | File I/O via `std::fs`, not async |
| `edatime-ingest` loaders | Sync | File I/O, CPU-bound parsing |
| `edatime-service` handlers | `async` | Axum requirement; dispatches to sync query engine |

**Critical rule:** All Polars/Rayon CPU work stays sync. Async only at the Axum handler boundary via `tokio::task::spawn_blocking`.

---

## 3. Polars LazyFrame Strategy

### 3.1 Lazy-First Execution Policy

**All data processing begins and remains lazy as long as possible.**

```
Request → Handler (async)
  └─→ spawn_blocking {
        query.to_lazy_frame(repository.snapshot())
          .filter(...)
          .with_new_streaming(true)   ← streaming for large results
          .collect()                  ← ONLY point of materialization
      }
  └─→ serialize response
```

**Anti-pattern to eliminate:**
```rust
// BAD: eager intermediate frame
let df = lf.collect()?;           // materialize
let filtered = filter_time_range_df(&df, ...)?;  // work on DataFrame
```

**Target pattern:**
```rust
// GOOD: fully lazy until serialization
let lf = base
    .filter(time_predicate(start, end))
    .select(columns)
    .with_new_streaming(true)
    .collect()?;
// Now df is materialized once, at serialization boundary
```

### 3.2 Composable LazyFrame Abstractions

```rust
// edatime-query/src/pipeline.rs

/// A single stage in a composable pipeline.
/// Each stage is a LazyFrame → LazyFrame transformation.
pub trait PipelineStage: Send + Sync {
    fn apply(&self, lf: LazyFrame) -> LazyFrame;
    fn name(&self) -> &'static str;
}

/// Time range filter stage
pub struct TimeRangeFilter {
    pub ts_col: String,
    pub start: i64,
    pub end: i64,
}

impl PipelineStage for TimeRangeFilter {
    fn apply(&self, lf: LazyFrame) -> LazyFrame {
        lf.filter(
            col(&self.ts_col).cast(DataType::Int64).gt_eq(lit(self.start))
                .and(col(&self.ts_col).cast(DataType::Int64).lt_eq(lit(self.end)))
        )
    }
    fn name(&self) -> &'static str { "time_range_filter" }
}

/// Column projection stage with predicate pushdown
pub struct ProjectColumns {
    pub cols: Vec<String>,
}

impl PipelineStage for ProjectColumns {
    fn apply(&self, lf: LazyFrame) -> LazyFrame {
        let exprs: Vec<Expr> = self.cols.iter().map(|c| col(c)).collect();
        lf.select(exprs)
    }
    fn name(&self) -> &'static str { "project" }
}

/// Compose stages left-to-right
pub struct Pipeline {
    stages: Vec<Box<dyn PipelineStage>>,
}

impl Pipeline {
    pub fn new() -> Self { Self { stages: Vec::new() } }
    pub fn add(mut self, stage: Box<dyn PipelineStage>) -> Self {
        self.stages.push(stage);
        self
    }
    pub fn execute(&self, lf: LazyFrame) -> LazyFrame {
        self.stages.iter().fold(lf, |acc, s| s.apply(acc))
    }
    pub fn collect(self, lf: LazyFrame) -> Result<DataFrame, AppError> {
        self.execute(lf)
            .with_new_streaming(true)
            .collect()
            .map_err(|e| AppError::Query(e.to_string()))
    }
}
```

### 3.3 Predicate Pushdown Requirements

Every filter expression **must** be pushed as early as possible in the chain:

```rust
// ✅ GOOD — filter before select
lf.filter(ts_predicate).select(columns).collect()

// ❌ BAD — select then filter (defeats projection pushdown)
lf.select(columns).filter(ts_predicate).collect()
```

### 3.4 Streaming Execution

Enable streaming for all large result sets:

```rust
lf.with_new_streaming(true).collect()
```

This processes data in chunks, reducing peak memory. Use when:
- Result set may exceed available RAM
- Processing time-series with many rows
- Scatter plots with >100k points

### 3.5 Avoiding Unnecessary Materialization

| Operation | Lazy | Eager | When to Switch |
|---|---|---|---|
| `filter` | ✅ | — | Always keep lazy |
| `select` | ✅ | — | Always keep lazy |
| `with_columns` | ✅ | — | Always keep lazy |
| `sort` | ✅ | — | Only collect if output order matters |
| `join` | ✅ | — | Keep lazy until join result is consumed |
| `group_by` + `agg` | ✅ | — | Keep lazy; collect after aggregation |
| `sort` + head | ⚠️ | ✅ | If you need `head` after sort, collect first |
| `collect` | — | ✅ | Only at serialization boundary |

---

## 4. Abstraction & Pipeline Design

### 4.1 Query Builder Pattern

```rust
// edatime-query/src/query.rs

/// Base query — immutable, composable
#[derive(Clone)]
pub struct BaseQuery {
    pub time_column: String,
    pub start_ts: i64,
    pub end_ts: i64,
    pub columns: Vec<String>,
}

impl BaseQuery {
    pub fn filter_time(mut self, start: i64, end: i64) -> Self {
        self.start_ts = start;
        self.end_ts = end;
        self
    }
    pub fn select_columns(mut self, cols: Vec<String>) -> Self {
        self.columns = cols;
        self
    }
    pub fn to_lazy_frame(&self, source: LazyFrame) -> LazyFrame {
        let lf = source
            .filter(time_predicate(&self.time_column, self.start_ts, self.end_ts))
            .select(self.columns.iter().map(|c| col(c)).collect::<Vec<_>>());
        lf
    }
}

/// Time series query with downsampling
#[derive(Clone)]
pub struct TimeSeriesQuery {
    base: BaseQuery,
    pub target_points: Option<usize>,
    pub reduction: Reduction,
}

impl TimeSeriesQuery {
    pub fn with_lttb(self, target: usize) -> Self { ... }
    pub fn with_bucket_agg(self, buckets: usize, agg: AggFn) -> Self { ... }
}

/// Scatter query with filters
#[derive(Clone)]
pub struct ScatterQuery {
    base: BaseQuery,
    pub x: String,
    pub y: String,
    pub color: Option<String>,
    pub filters: Vec<Expr>,
}
```

### 4.2 Reduction Strategy (Existing, Keep)

```rust
// edatime-query/src/aggregations.rs

pub enum Reduction {
    Lttb { target_points: usize },
    BucketAgg { buckets: usize, agg: AggFn },
    WindowAgg { window_ms: i64, step_ms: i64, agg: AggFn },
    None,
}

pub trait Reduce {
    fn apply(&self, df: &DataFrame, ts_col: &str) -> Result<DataFrame, AppError>;
}

impl Reduce for Reduction {
    fn apply(&self, df: &DataFrame, ts_col: &str) -> Result<DataFrame, AppError> {
        match self {
            Reduction::Lttb { target_points } => downsample_lttb(df, ts_col, *target_points),
            Reduction::BucketAgg { buckets, agg } => bucket_aggregate(df, ts_col, *buckets, *agg),
            Reduction::WindowAgg { window_ms, step_ms, agg } => window_aggregate(df, ts_col, *window_ms, *step_ms, *agg),
            Reduction::None => Ok(df.clone()),
        }
    }
}
```

### 4.3 Expression Builder Helpers

```rust
// edatime-core/src/expr.rs

use polars::prelude::*;

/// Build a time predicate: ts_col in [start, end]
pub fn time_predicate(ts_col: &str, start: i64, end: i64) -> Expr {
    col(ts_col)
        .cast(DataType::Int64)
        .gt_eq(lit(start))
        .and(col(ts_col).cast(DataType::Int64).lt_eq(lit(end)))
}

/// Build a numeric range filter: col in [min, max]
pub fn range_predicate(col: &str, min: f64, max: f64) -> Expr {
    col(col).gt_eq(lit(min)).and(col(col).lt_eq(lit(max)))
}

/// Build a categorical IN filter
pub fn in_predicate(col: &str, values: &[String]) -> Expr {
    col(col).is_in(values.iter().map(|s| lit(s.as_str())).collect::<Vec<_>>())
}

/// Build a rolling aggregation expression
pub fn rolling_expr(col: &str, window_size: i64, agg: Expr) -> Expr {
    col(col).rolling_agg(agg, Options::Rolling { .. })
}
```

### 4.4 Schema Enforcement

```rust
// edatime-core/src/schema.rs

use polars::prelude::*;

#[derive(Debug, Clone)]
pub struct DatasetSchema {
    pub time_column: String,
    pub numeric_columns: Vec<String>,
    pub categorical_columns: Vec<String>,
    pub all_columns: Vec<String>,
}

impl DatasetSchema {
    pub fn from_df(df: &DataFrame) -> Self { ... }
    pub fn validate_columns(&self, cols: &[String]) -> Result<(), AppError> {
        for c in cols {
            if !self.all_columns.contains(c) {
                return Err(AppError::validation(format!("column not found: {}", c)));
            }
        }
        Ok(())
    }
    pub fn time_dtype(&self, df: &DataFrame) -> DataType {
        df.column(&self.time_column).map(|c| c.dtype()).unwrap_or(DataType::Null)
    }
}
```

---

## 5. Concurrency & Execution Model

### 5.1 Thread Pool Strategy

```
┌─────────────────────────────────────────────────────────┐
│                    Tokio Runtime                        │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │ HTTP Workers│  │ spawn_block │  │  Long-running │  │
│  │  (async)    │──│ ing (CPU)   │──│  background   │  │
│  └─────────────┘  └─────────────┘  └──────────────┘  │
│                          │                              │
│                          ▼                              │
│                 ┌─────────────────┐                    │
│                 │   Rayon Pool    │                    │
│                 │  (CPU-bound)    │                    │
│                 │  4-8 threads    │                    │
│                 └─────────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

**Rules:**
1. All Polars/Rayon work is **sync** — wrapped in `spawn_blocking`
2. Tokio async tasks wait on the blocking handle
3. Never do CPU work directly in async tasks
4. Background jobs (causal analysis, drift computation) run on separate thread pool

### 5.2 QueryExecutor (Canonical Version)

```rust
// edatime-query/src/executor.rs

use rayon::ThreadPool;
use std::sync::Arc;

pub struct QueryExecutor {
    thread_pool: Arc<ThreadPool>,
    execution_mode: ExecutionMode,
}

#[derive(Clone, Copy)]
pub enum ExecutionMode {
    /// Standard lazy — good for small/medium datasets
    Lazy,
    /// Streaming — for large results, minimizes peak memory
    Streaming,
    /// Parallel — forces parallel query execution
    Parallel,
}

impl QueryExecutor {
    pub fn new(num_threads: usize) -> Self {
        let thread_pool = Arc::new(
            rayon::ThreadPoolBuilder::new()
                .num_threads(num_threads)
                .thread_name(|i| format!("edatime-cpu-{}", i))
                .build()
                .unwrap(),
        );
        Self { thread_pool, execution_mode: ExecutionMode::Streaming }
    }

    pub fn with_mode(mut self, mode: ExecutionMode) -> Self {
        self.execution_mode = mode;
        self
    }

    /// Execute a LazyFrame to DataFrame — called from spawn_blocking
    pub fn execute(&self, lf: LazyFrame) -> Result<DataFrame, AppError> {
        let _guard = self.thread_pool.install(|| {});
        let lf = match self.execution_mode {
            ExecutionMode::Lazy => lf,
            ExecutionMode::Streaming | ExecutionMode::Parallel => {
                lf.with_new_streaming(true)
            }
        };
        lf.collect().map_err(|e| AppError::Query(e.to_string()))
    }

    /// Async wrapper — for use in Axum handlers
    pub async fn execute_async(&self, lf: LazyFrame) -> Result<DataFrame, AppError> {
        let pool = Arc::clone(&self.thread_pool);
        let mode = self.execution_mode;
        tokio::task::spawn_blocking(move || {
            pool.install(|| {
                let lf = match mode {
                    ExecutionMode::Lazy => lf,
                    ExecutionMode::Streaming | ExecutionMode::Parallel => lf.with_new_streaming(true),
                };
                lf.collect().map_err(|e| AppError::Query(e.to_string()))
            })
        })
        .await
        .map_err(|e| AppError::Internal(format!("join error: {}", e)))?
    }
}
```

### 5.3 Backpressure Handling

- Use `ScanArgsParquet::with_n_rows` for bounded scans
- Streaming execution automatically throttles memory usage
- Scatter point limits enforced at query level before collect
- Upload size limit enforced at Axum body limit layer

### 5.4 Concurrency Limits

```rust
// edatime-service/src/config.rs

pub struct ConcurrencyConfig {
    /// Max concurrent analytical queries (time series, scatter, etc.)
    pub max_concurrent_queries: usize,
    /// Max concurrent uploads
    pub max_concurrent_uploads: usize,
    /// Max concurrent analytics jobs (FFT, causal, etc.)
    pub max_concurrent_analytics: usize,
    /// CPU threads for Rayon pool (default: num_cpus::get() - 1)
    pub cpu_threads: usize,
}

impl Default for ConcurrencyConfig {
    fn default() -> Self {
        let ncpus = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
        Self {
            max_concurrent_queries: ncpus * 2,
            max_concurrent_uploads: 2,
            max_concurrent_analytics: 2,
            cpu_threads: ncpus.saturating_sub(1).max(1),
        }
    }
}
```

---

## 6. Data Layer & Storage

### 6.1 Repository (Canonical)

```rust
// edatime-store/src/repository.rs

use std::sync::{Arc, atomic::{AtomicU64, Ordering}};
use std::sync::RwLock;
use polars::prelude::{DataFrame, IntoLazy, LazyFrame};
use edatime_core::types::DatasetMeta;

/// Thread-safe LazyFrame repository.
/// 
/// Read path: snapshot() clones LazyFrame (microseconds, shallow).
/// Write path: replace_dataset() acquires write lock (blocks only during ingest).
/// Revision: atomic counter — lock-free reads.
pub struct DataRepository {
    lf: Arc<RwLock<LazyFrame>>,
    meta: Arc<RwLock<DatasetMeta>>,
    revision: AtomicU64,
}

impl DataRepository {
    pub fn new(df: DataFrame) -> Self {
        let meta = DatasetMeta::from_df(&df);
        Self {
            lf: Arc::new(RwLock::new(df.lazy())),
            meta: Arc::new(RwLock::new(meta)),
            revision: AtomicU64::new(0),
        }
    }

    /// Get a snapshot of the current LazyFrame.
    /// Cloning LazyFrame is microseconds (shallow).
    pub fn snapshot(&self) -> LazyFrame {
        self.lf.read().unwrap().clone()
    }

    /// Get metadata snapshot.
    pub fn meta(&self) -> DatasetMeta {
        self.meta.read().unwrap().clone()
    }

    pub fn revision(&self) -> u64 {
        self.revision.load(Ordering::Relaxed)
    }

    pub fn replace(&self, df: DataFrame) -> u64 {
        let mut lf_guard = self.lf.write().unwrap();
        let meta = DatasetMeta::from_df(&df);
        *lf_guard = df.lazy();
        *self.meta.write().unwrap() = meta;
        self.revision.fetch_add(1, Ordering::Relaxed)
    }
}

// The old src/repository.rs should be removed after migration
```

### 6.2 Storage Adapters

```rust
// edatime-store/src/adapters/parquet_adapter.rs

pub struct ParquetAdapter;

impl ParquetAdapter {
    pub fn scan(path: &Path) -> Result<LazyFrame, AppError> {
        LazyFrame::scan_parquet(path, ScanArgsParquet::default())
            .map_err(|e| AppError::Io(format!("parquet scan: {e}")))
    }
    pub fn write(df: &DataFrame, path: &Path) -> Result<(), AppError> {
        df.write_parquet(path)
            .map_err(|e| AppError::Io(format!("parquet write: {e}")))
    }
}

// edatime-store/src/adapters/arrow_adapter.rs

pub struct ArrowAdapter;

impl ArrowAdapter {
    pub fn scan_ipc(path: &Path) -> Result<LazyFrame, AppError> {
        LazyFrame::scan_ipc(path, Default::default())
            .map_err(|e| AppError::Io(format!("arrow scan: {e}")))
    }
    pub fn write_ipc(df: &DataFrame, path: &Path) -> Result<(), AppError> {
        let file = std::fs::File::create(path)
            .map_err(|e| AppError::Io(format!("arrow file create: {e}")))?;
        let writer = IPCWriter::new(file);
        // ... write
        Ok(())
    }
}
```

### 6.3 Caching Strategy

```rust
// edatime-store/src/cache.rs

use std::collections::HashMap;
use std::sync::RwLock;
use std::hash::Hash;

/// Key: query fingerprint (time range + columns + reduction)
/// Value: (DataFrame, generation_id)
pub struct QueryCache {
    store: RwLock<HashMap<CacheKey, (DataFrame, u64)>>,
    generation: AtomicU64,
    max_entries: usize,
}

#[derive(Clone, Hash, Eq, PartialEq)]
pub struct CacheKey {
    pub start: i64,
    pub end: i64,
    pub columns: Vec<String>,
    pub reduction: String,
}

impl QueryCache {
    pub fn get(&self, key: &CacheKey) -> Option<DataFrame> {
        self.store.read().unwrap()
            .get(key)
            .map(|(df, gen)| {
                if *gen == self.generation.load(Ordering::Relaxed) {
                    Some(df.clone())
                } else {
                    None
                }
            })
            .flatten()
    }

    pub fn put(&self, key: CacheKey, df: DataFrame) {
        let mut store = self.store.write().unwrap();
        if store.len() >= self.max_entries {
            store.clear(); // Simple eviction: clear all
        }
        store.insert(key, (df, self.generation.load(Ordering::Relaxed)));
    }

    /// Invalidate all entries (call after dataset replace)
    pub fn invalidate(&self) {
        self.generation.fetch_add(1, Ordering::Relaxed);
    }
}
```

**Cache invalidation:** When `DataRepository::replace()` is called, the cache is invalidated via generation counter.

---

## 7. API & Service Layer

### 7.1 DTO Boundaries

```rust
// edatime-service/src/dto.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct TimeSeriesRequest {
    pub start: Option<i64>,
    pub end: Option<i64>,
    pub columns: Option<String>,       // comma-separated
    pub width: Option<usize>,
    pub reduction: Option<String>,    // "none", "lttb", "bucket"
}

#[derive(Debug, Serialize)]
pub struct TimeSeriesResponse {
    pub columns: Vec<String>,
    pub rows: usize,
    pub reduction_applied: bool,
}

#[derive(Debug, Deserialize)]
pub struct ScatterRequest {
    pub x: String,
    pub y: String,
    pub color: Option<String>,
    pub size: Option<String>,
    pub start: Option<i64>,
    pub end: Option<i64>,
    pub filters: Option<String>,
    pub limit: Option<usize>,
}
```

### 7.2 Handler Pattern

```rust
// edatime-service/src/handlers/data.rs

use axum::{extract::Query, Json, extract::State};
use edatime_core::error::AppError;
use edatime_query::{TimeSeriesQuery, QueryExecutor};
use edatime_store::DataRepository;

pub async fn get_time_series(
    State(state): State<AppState>,
    Query(req): Query<TimeSeriesRequest>,
) -> Result<Json<TimeSeriesResponse>, AppError> {
    let repo = state.repository();
    let executor = state.query_executor();

    let query = TimeSeriesQuery::new(
        repo.meta().time_column.clone(),
        req.start.unwrap_or(i64::MIN),
        req.end.unwrap_or(i64::MAX),
    )
    .with_values(parse_columns(req.columns))
    .with_lttb_target(req.width.map(|w| w * 2).unwrap_or(2000));

    let lf = query.to_lazy_frame(repo.snapshot());
    let df = executor.execute_async(lf).await?;
    
    Ok(Json(TimeSeriesResponse { ... }))
}
```

### 7.3 Error Propagation Between Crates

```rust
// edatime-core/src/error.rs

#[derive(Debug, Clone, thiserror::Error)]
pub enum CoreError {
    #[error("validation: {0}")]
    Validation(String),
    #[error("query: {0}")]
    Query(String),
    #[error("io: {0}")]
    Io(String),
    #[error("schema: {0}")]
    Schema(String),
}

// edatime-service/src/error.rs maps CoreError → AppError (HTTP status)
```

---

## 8. Performance Optimization Strategy

### 8.1 Zero-Copy Operations

- **LazyFrame cloning** is shallow — always pass `Arc<LazyFrame>` not `DataFrame` until collect
- **Repository snapshot** returns cloned `LazyFrame` (microseconds)
- **Arrow IPC** for transport — zero-copy deserialization via `apache-arrow`

### 8.2 Memory Optimization

| Technique | Where | Benefit |
|---|---|---|
| Streaming collect | Large queries | O(chunksize) vs O(total) |
| Projection pushdown | All queries | Skip unneeded columns entirely |
| Predicate pushdown | Filter early | Reduces rows before expensive ops |
| Column pruning | Repository read path | Only fetch requested columns |
| `with_new_streaming(true)` | Time series, scatter | Chunked processing |

### 8.3 Benchmarking Plan

```rust
// benches/ query_benchmark.rs

use criterion::{black_box, criterion_group, Criterion};

fn bench_lazy_vs_eager(c: &mut Criterion) {
    let df = // load test DataFrame
    let lf = df.lazy();
    
    c.bench_function("lazy_filter_collect", |b| {
        b.iter(|| {
            lf.clone()
                .filter(col("ts").gt_eq(lit(black_box(0))))
                .filter(col("ts").lt_eq(lit(black_box(i64::MAX))))
                .with_new_streaming(true)
                .collect()
        })
    });
}
```

Run with:
```bash
cargo bench --package edatime-query
```

### 8.4 Query Plan Inspection

```rust
// Debug: log the optimized query plan
let lf = query.to_lazy_frame(source);
let plan = lf.explain(true).unwrap();
tracing::debug!("optimized plan:\n{}", plan);
let df = executor.execute(lf)?;
```

---

## 9. Error Handling & Observability

### 9.1 Error Hierarchy

```
AppError (src/error.rs)
  ├── kind: ErrorKind (Validation | Internal | RateLimit | NotFound)
  ├── code: ErrorCode (variant per error type)
  ├── message: String
  └── correlation_id: String

CoreError (edatime-core/src/error.rs)
  ├── Validation(String)
  ├── Query(String)
  ├── Io(String)
  └── Schema(String)
```

**Rule:** `CoreError` crosses crate boundaries; `AppError` is the Axum-facing conversion.

### 9.2 Tracing Integration

```rust
// Every handler
#[tracing::instrument(skip(state, executor), fields(revision = %state.repository().revision()))]
pub async fn get_time_series(...) -> Result<...> {
    tracing::debug!("request: start={}, end={}", req.start, req.end);
    let df = executor.execute_async(lf).await?;
    tracing::debug!(rows = %df.height(), "query completed");
    Ok(Json(resp))
}
```

### 9.3 Metrics

```rust
// edatime-core/src/metrics.rs (re-exported in edatime-service)

metrics::counter!("edatime_queries_total", "type" => "timeseries");
metrics::counter!("edatime_queries_total", "type" => "scatter");
metrics::histogram!("edatime_query_duration_ms", "type" => "timeseries");
metrics::gauge!("edatime_dataset_rows", state.repository().meta().row_count as f64);
metrics::gauge!("edatime_dataset_revision", state.repository().revision() as f64);
```

---

## 10. Developer Experience

### 10.1 Code Organization

```
每crate/
├── src/
│   ├── lib.rs         # Public re-exports only
│   ├── error.rs       # Crate-specific errors (if needed)
│   ├── [domain].rs    # Domain logic (max 300 lines per file)
│   └── ...
├── benches/           # Criterion benchmarks
├── tests/             # Integration tests
└── Cargo.toml
```

### 10.2 Testing Architecture

```rust
// edatime-query/tests/test_pipeline.rs

#[test]
fn test_time_range_filter_pushdown() {
    let df = // create test DataFrame
    let lf = df.lazy();
    
    let filtered = TimeRangeFilter {
        ts_col: "ts".into(),
        start: 1000,
        end: 2000,
    }.apply(lf);
    
    // Verify predicate pushdown in plan
    let plan = filtered.explain(false).unwrap();
    assert!(plan.contains("FILTER"));
}

// Property test: filter then collect = collect then filter
#[test]
fn test_lazy_equivalence(DF in arb_dataframe()) {
    let lf = DF.lazy();
    let filtered = lf.filter(col("x").gt(lit(0)));
    let result = filtered.clone().collect().unwrap();
    // compare with eager equivalent...
}
```

### 10.3 Linting

```toml
# Cargo.toml [package]
clippy_asserts = true
```

Add to `Makefile`:
```make
check:
    cargo clippy --all-targets -- -D warnings
    cargo check --workspace
```

---

## 11. Migration Plan

### Phase 1: Scaffold & Verify (Week 1)
**Goal:** Verify new crate structure compiles and basic data flow works.

1. ✅ `edatime-core` — types.rs, error.rs, expr.rs (already scaffolded)
2. ✅ `edatime-store` — repository.rs (canonical, replacing `src/repository.rs`)
3. ✅ `edatime-query` — query.rs, executor.rs, pipeline.rs (already scaffolded)
4. Integrate crates into workspace `Cargo.toml`
5. Point `AppState` at new `DataRepository` from `edatime-store`
6. Verify `make check` passes

**Risk:** Low. Pure refactor, no behavioral change.

### Phase 2: Migrate Time-Series Path (Week 2)
**Goal:** `/api/data` uses fully lazy pipeline through `edatime-query`.

1. Migrate `routes/data.rs` handler to use `TimeSeriesQuery` builder
2. Replace `filter_time_range` in `pipeline.rs` with `TimeRangeFilter` stage
3. Add `QueryExecutor::execute_async` to `AppState`
4. Verify streaming mode for large datasets
5. Remove eager intermediate `collect()` calls

**Risk:** Medium — behavioral changes to downsampling behavior need verification.

### Phase 3: Migrate Scatter Path (Week 3)
**Goal:** `/api/scatter/points` uses `ScatterQuery` builder + lazy execution.

1. Migrate `routes/scatter/points.rs` to use `edatime-query` pipeline
2. Move `collect_filtered_scatter_frame` into `edatime-query`
3. Ensure Arrow IPC transport is preserved
4. Verify color-column behavior unchanged

**Risk:** Medium — scatter color-by-column is the known unreliable feature; proceed with caution.

### Phase 4: Migrate Analytics (Week 4)
**Goal:** Analytics handlers use lazy execution where applicable.

1. Migrate `routes/analytics.rs` FFT, rolling, anomaly to lazy pipelines
2. Keep causal analysis on separate thread pool
3. Verify streaming for spectrogram

**Risk:** Low — analytics already modular.

### Phase 5: Remove Legacy Code (Week 5)
**Goal:** Delete duplicated modules from `src/`.

1. Delete `src/repository.rs` (replaced by `edatime-store::repository`)
2. Delete `src/pipeline.rs` (replaced by `edatime-query::pipeline`)
3. Delete `src/query.rs` (replaced by `edatime-query::query`)
4. Inline `src/state.rs` repository access through `edatime-store`
5. Update `src/lib.rs` to re-export from new crates

**Risk:** Low if Phase 1-4 verified.

### Phase 6: Performance Validation (Week 6)
**Goal:** Benchmarking suite confirms improvements.

1. Add criterion benchmarks for time-series, scatter queries
2. Compare memory usage: before vs after
3. Profile streaming vs eager for large datasets
4. Document results in `docs/developer/performance.md`

---

## 12. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Breaking scatter color-by-column | Medium | High | Phase 3 has dedicated verification; rollback to JSON transport |
| Repository clone performance | Low | Medium | Benchmark confirms microsecond clones |
| Cache invalidation bugs | Medium | Medium | Generation counter is simple and robust |
| New crate circular dependencies | Low | High | Architecture enforces acyclic deps |
| Async/sync boundary bugs | Medium | Medium | `spawn_blocking` wrapper in `QueryExecutor` |
| LazyFrame predicate pushdown gaps | Medium | Medium | Query plan inspection in debug mode |

---

## 13. Implementation Priorities

1. **`edatime-core`** — types, errors, expr builders (foundation)
2. **`edatime-store`** — canonical repository, cache
3. **`edatime-query`** — pipeline stages, query builders, executor
4. **`edatime-service`** — handlers wiring to new crates
5. **Remove legacy** `src/` modules
6. **Benchmark & validate** performance improvements

---

## Appendix: Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend (Browser)                          │
│   ChartGPU / Scatter / Upload / Analytics UI                    │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTP/WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   edatime-service (Axum)                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Handlers: data, scatter, metadata, analytics, upload    │   │
│  │  DTOs, middleware, rate limiting, CORS                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ spawn_blocking
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    edatime-query                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐      │
│  │ QueryBuilders│ │  Pipeline    │ │  QueryExecutor       │      │
│  │ TimeSeriesQ  │ │  Stages     │ │  (Rayon thread pool) │      │
│  │ ScatterQuery │ │  LazyFrame→ │ │  collect() once      │      │
│  └──────────────┘ └──────────────┘ └──────────────────────┘      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌─────────────────┐ ┌───────────────┐ ┌──────────────────┐
│  edatime-store  │ │ edatime-ingest│ │  edatime-core   │
│  Repository     │ │  File loading │ │  Types          │
│  DataRepository │ │  Parsers      │ │  Errors         │
│  Cache          │ │  Validators   │ │  Expr helpers   │
│  Adapters       │ │               │ │  Schema         │
└─────────────────┘ └───────────────┘ └──────────────────┘
         │
         ▼
┌─────────────────┐
│  Arrow IPC      │
│  Parquet        │
│  In-memory DF   │
└─────────────────┘
```
