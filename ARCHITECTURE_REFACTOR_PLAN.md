# Backend Refactor Plan: High-Performance Modular Architecture

**Date:** 2026-05-19  
**Status:** Draft for review  
**Priority:** Architectural transformation — long-term maintainability

---

## 1. Architecture Review

### 1.1 Current State Analysis

```
src/
├── lib.rs                    # Flat module list, no feature gates
├── main.rs                   # Entry point + Axum router wiring
├── state.rs                  # AppState — god object with 9 fields
├── repository.rs             # InMemoryDataRepository — single impl
├── pipeline.rs               # filter_time_range + apply_reduction — decent
├── routes/
│   ├── mod.rs                # All route registration in one file
│   ├── data.rs               # GET /data — tightly coupled to pipeline
│   ├── scatter/points.rs     # ~400 lines — mixed concerns
│   └── *.rs                  # 12+ route files
├── analytics/
│   ├── mod.rs                # Re-exports only
│   ├── fft.rs, rolling.rs,  # Good separation
│   └── drift.rs, spectrogram.rs
├── downsample.rs             # MinMaxLTTB wrapper
├── arrow_export.rs           # Serialization
├── ingest.rs                 # CSV/Parquet loading
├── cache.rs, metrics.rs      # Cross-cutting concerns
└── error.rs, filters.rs, validation.rs, config.rs, ...
```

### 1.2 Identified Issues

| Category | Problem | Impact |
|---|---|---|
| **Coupling** | `AppState` is a god object with 9 heterogeneous fields | Hard to test, impossible to swap components |
| **Coupling** | Route handlers directly call `pipeline::filter_time_range` | Cannot reuse filtering logic without HTTP overhead |
| **Eager execution** | `filter_time_range` immediately calls `.collect()` | Materializes data before reduction — defeats lazy |
| **Duplication** | Scatter and data routes have identical time-filter + downsampling logic | Two code paths to maintain |
| **Memory** | `spawn_blocking` used for every Polars collect | Thread pool saturation under load |
| **Error propagation** | `AppError` is a catch-all enum — not composable | Each handler reinvents error mapping |
| **Serialization** | Arrow IPC and JSON are separate code paths with no abstraction | Adding MessagePack requires 3 file edits |
| **Async boundaries** | `tokio::task::block_in_place` inside `filter_time_range` | Undefined behavior risk with certain Polars operations |
| **Repository** | `DataRepository` trait has only one implementation | Trait adds indirection with zero flexibility |
| **Config** | `AppConfig` cloned into every handler via `State<AppState>` | No hot reload, no per-request config override |
| **Pipeline** | `Reduction` enum is a flat match — adding new strategies requires enum variant | Violates Open/Closed principle |
| **Caching** | `ResponseCache` is a flat `HashMap` | No cache invalidation on dataset revision changes |

### 1.3 Quantified Observations

- **Route handlers** (`routes/`) are 60–70% identical boilerplate: time parsing → validation → repo access → pipeline → serialize → cache
- **`filter_time_range` in `pipeline.rs` collects immediately**, making predicate pushdown impossible for downstream callers
- **LazyFrame is stored behind `Arc<RwLock<LazyFrame>>`** — read/write lock contention on every request
- **No streaming** — all endpoints buffer full results before serializing
- **`Analytics` modules** are well-separated at ~200–300 LOC each — the model works

---

## 2. Target Architecture

### 2.1 Crate Workspace Structure

```
edatime/
├── Cargo.toml                    # Workspace definition
├── crates/
│   ├── edatime-core/            # ZERO external I/O — pure data types + traits
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── error.rs         # Typed error hierarchy (no axum deps)
│   │   │   ├── types.rs         # DatasetMeta, TimeContext, ColumnProfile
│   │   │   ├── pipeline.rs     # Pipeline IR (stages as enums/structs)
│   │   │   └── cache.rs        # Cache trait + in-memory impl (no HTTP)
│   │
│   ├── edatime-query/           # LazyFrame query engine
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── executor.rs     # Execution contexts (sync/async)
│   │   │   ├── transforms.rs   # Composable LazyFrame transformations
│   │   │   ├── predicates.rs   # Predicate builders
│   │   │   ├── aggregations.rs # Aggregation composers
│   │   │   ├── downsampling.rs # LTTB + alternatives
│   │   │   └── optimization.rs # Explain, inspect, hint injection
│   │
│   ├── edatime-store/           # Data access + storage adapters
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── repository.rs   # Repository trait + in-memory impl
│   │   │   ├── parquet.rs     # Parquet adapter
│   │   │   ├── csv.rs         # CSV adapter
│   │   │   ├── arrow_ipc.rs   # Arrow IPC adapter
│   │   │   └── timescaledb.rs # TimescaleDB adapter
│   │
│   ├── edatime-ingest/          # Data ingestion + schema detection
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── loader.rs       # Unified loader (Parquet/CSV/Arrow)
│   │   │   ├── normalizer.rs   # Time column normalization
│   │   │   ├── profiler.rs    # Column profiling
│   │   │   └── slicer.rs      # Row/time slicing
│   │
│   ├── edatime-analytics/       # Analytics primitives (FFT, rolling, etc.)
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── fft.rs, rolling.rs, anomaly.rs, ...
│   │   │   └── shared.rs
│   │
│   ├── edatime-service/         # HTTP service layer (Axum)
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── router.rs       # Route assembly
│   │   │   ├── state.rs       # AppState (slim, DI-friendly)
│   │   │   ├── middleware/    # CORS, compression, rate limiting
│   │   │   ├── handlers/      # One file per endpoint group
│   │   │   └── dto/          # Request/response types (no domain logic)
│   │
│   └── edatime-bin/             # Binary crate
│       ├── Cargo.toml
│       └── src/main.rs
│
├── frontend/                   # SolidJS + Vite (unchanged)
├── tests/                      # Integration tests
└── Cargo.toml                  # Workspace root
```

**Rationale:** The critical insight is separating **pure computation** (`edatime-query`, `edatime-core`) from **I/O** (`edatime-store`, `edatime-service`). This enables unit testing of all domain logic without any HTTP stack, and allows the query engine to be reused in batch jobs or MCP server contexts.

### 2.2 Module Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                     edatime-service (Axum)                       │
│   router.rs → handlers/ → dto/ → edatime-query (pure)           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      edatime-query                              │
│  executor.rs ← transforms.rs ← predicates.rs ← aggregations.rs  │
│         ↓                                                     │
│  edatime-core (types.rs, pipeline.rs, error.rs)                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                       edatime-store                             │
│  repository.rs → parquet.rs / csv.rs / arrow_ipc.rs / timescaledb│
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      edatime-ingest                             │
│  loader.rs → normalizer.rs → profiler.rs → slicer.rs            │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Synchronous vs Asynchronous Components

| Component | Execution | Rationale |
|---|---|---|
| `edatime-core` | Sync-only | No I/O, no blocking — pure data structures |
| `edatime-query` transforms | Sync | Polars LazyFrame operations are CPU-bound |
| `edatime-query` executor | Both | `execute_sync()` for batch; `execute_async()` for streaming |
| `edatime-store` | Async I/O | Parquet/CSV reading should be offloaded to blocking thread pool |
| `edatime-ingest` | Async I/O | File scanning and schema inference |
| `edatime-service` | Async | Axum is async-first; handlers `await` query results |

**Key rule:** Polars `.collect()` is ALWAYS called inside `tokio::task::spawn_blocking` — never in an async context directly. Wrap this in `edatime-query/executor.rs` to enforce it centrally.

---

## 3. Polars LazyFrame Strategy

### 3.1 Core Principles

1. **Never collect prematurely** — keep data in LazyFrame until the transport layer requires a concrete result
2. **Predicate pushdown is non-negotiable** — time filters must be applied at scan time, not post-scan
3. **Projection pushdown** — always select only required columns before any expensive operation
4. **Use streaming mode** for large filtered results (`with_new_streaming(true).collect()`)
5. **Avoid `Arc<RwLock<LazyFrame>>` in the hot path** — clone LazyFrame (cheap) instead of locking

### 3.2 Composable LazyFrame Abstractions

```rust
// edatime-query/src/transforms.rs

/// A single composable pipeline stage.
/// Each stage is a function LazyFrame → LazyFrame (no collection).
pub trait PipelineStage: Send + Sync {
    fn apply(&self, lf: LazyFrame) -> LazyFrame;
    fn name(&self) -> &'static str;
}

/// Time-range filter stage — always pushed to scan level.
pub struct TimeFilterStage {
    pub start_ts: i64,
    pub end_ts: i64,
    pub ts_col: String,
}

impl PipelineStage for TimeFilterStage {
    fn apply(&self, lf: LazyFrame) -> LazyFrame {
        lf.filter(
            col(&self.ts_col).cast(DataType::Int64).gt_eq(lit(self.start_ts))
            & col(&self.ts_col).cast(DataType::Int64).lt_eq(lit(self.end_ts))
        )
    }
    fn name(&self) -> &'static str { "time_filter" }
}

/// Column projection stage — enables projection pushdown.
pub struct ProjectStage {
    pub columns: Vec<String>,
}

impl PipelineStage for ProjectStage {
    fn apply(&self, lf: LazyFrame) -> LazyFrame {
        let exprs: Vec<Expr> = self.columns.iter().map(|c| col(c)).collect();
        lf.select(exprs)
    }
    fn name(&self) -> &'static str { "project" }
}

/// Composed pipeline — ordered list of stages.
/// LazyFrame → [stage₀, stage₁, ...] → LazyFrame
pub struct Pipeline {
    stages: Vec<Box<dyn PipelineStage>>,
}

impl Pipeline {
    pub fn new() -> Self { Self { stages: Vec::new() } }
    
    pub fn then(mut self, stage: impl PipelineStage + 'static) -> Self {
        self.stages.push(Box::new(stage));
        self
    }
    
    /// Apply all stages in sequence. No collection.
    pub fn apply(&self, lf: LazyFrame) -> LazyFrame {
        let mut result = lf;
        for stage in &self.stages {
            result = stage.apply(result);
        }
        result
    }
    
    /// Describe the plan for debugging.
    pub fn explain(&self, lf: LazyFrame) -> String {
        self.apply(lf).explain().unwrap_or_default()
    }
}
```

### 3.3 Predicate Builder

```rust
// edatime-query/src/predicates.rs

/// Composable predicate builder with AND/OR/NOT support.
pub struct PredicateBuilder {
    conditions: Vec<Expr>,
}

impl PredicateBuilder {
    pub fn new() -> Self { Self { conditions: Vec::new() } }
    
    pub fn time_range(mut self, col: &str, start: i64, end: i64) -> Self {
        self.conditions.push(
            col(col).cast(DataType::Int64).gt_eq(lit(start))
            & col(col).cast(DataType::Int64).lt_eq(lit(end))
        );
        self
    }
    
    pub fn numeric_range(mut self, col: &str, min: f64, max: f64) -> Self {
        self.conditions.push(col(col).gt_eq(lit(min)) & col(col).lt_eq(lit(max)));
        self
    }
    
    pub fn in_values(mut self, col: &str, values: &[String]) -> Self {
        let vals: Vec<Expr> = values.iter().map(|v| lit(v.clone())).collect();
        self.conditions.push(col(col).is_in(lit(vals)));
        self
    }
    
    pub fn is_null(mut self, col: &str) -> Self {
        self.conditions.push(col(col).is_null());
        self
    }
    
    pub fn build(self) -> Option<Expr> {
        if self.conditions.is_empty() {
            None
        } else {
            Some(self.conditions.into_iter().reduce(|a, b| a & b).unwrap())
        }
    }
}
```

### 3.4 Query Composer

```rust
// edatime-query/src/lib.rs

/// Declarative time-series query builder.
/// Immutable — each `with_*` returns a new instance.
#[derive(Clone)]
pub struct TimeSeriesQuery {
    time_column: String,
    start_ts: i64,
    end_ts: i64,
    value_columns: Vec<String>,
    color_column: Option<String>,
    reduction: ReductionStrategy,
    output_format: OutputFormat,
}

#[derive(Clone)]
pub enum ReductionStrategy {
    None,
    Lttb { target_points: usize },
    BucketAgg { buckets: usize, agg: AggFn },
    TumblingWindow { window_ms: i64, agg: AggFn },
    SlidingWindow { window_ms: i64, step_ms: i64, agg: AggFn },
}

impl TimeSeriesQuery {
    pub fn new(time_column: String, start_ts: i64, end_ts: i64) -> Self {
        Self {
            time_column,
            start_ts,
            end_ts,
            value_columns: Vec::new(),
            color_column: None,
            reduction: ReductionStrategy::None,
            output_format: OutputFormat::Arrow,
        }
    }
    
    pub fn with_values(mut self, cols: Vec<String>) -> Self {
        self.value_columns = cols;
        self
    }
    
    pub fn with_color(mut self, col: Option<String>) -> Self {
        self.color_column = col;
        self
    }
    
    pub fn with_reduction(mut self, strategy: ReductionStrategy) -> Self {
        self.reduction = strategy;
        self
    }
    
    /// Build the LazyFrame pipeline (NO collection).
    pub fn to_lazy_frame(&self, source: LazyFrame) -> LazyFrame {
        let mut lf = source;
        
        // 1. Time filter at scan level
        lf = lf.filter(
            col(&self.time_column).cast(DataType::Int64).gt_eq(lit(self.start_ts))
            & col(&self.time_column).cast(DataType::Int64).lt_eq(lit(self.end_ts))
        );
        
        // 2. Projection (predicate pushdown)
        let mut cols: Vec<Expr> = vec![col(&self.time_column)];
        cols.extend(self.value_columns.iter().map(|c| col(c)));
        if let Some(ref cc) = self.color_column {
            cols.push(col(cc));
        }
        lf = lf.select(cols);
        
        lf
    }
    
    /// Execute with the configured reduction strategy.
    /// Returns (DataFrame, was_downsampled).
    pub fn execute(&self, source: LazyFrame) -> Result<(DataFrame, bool), AppError> {
        let lf = self.to_lazy_frame(source);
        let df = executor::collect_lazyframe_blocking(lf)?;
        
        // Apply reduction...
        Ok((df, false))
    }
}
```

### 3.5 Streaming Execution

```rust
// For large result sets (>100k rows), use streaming:
// edatime-query/src/executor.rs

pub fn collect_lazyframe_blocking(lf: LazyFrame) -> Result<DataFrame, AppError> {
    tokio::task::spawn_blocking(move || {
        lf.with_new_streaming(true)
            .collect()
            .map_err(|e| AppError::query(format!("Collect error: {}", e)))
    })
    .await
    .map_err(|e| AppError::internal(format!("Join error: {}", e)))?
}

/// For scatter/small-result queries — eager mode is fine.
pub fn collect_lazyframe_eager(lf: LazyFrame) -> Result<DataFrame, AppError> {
    tokio::task::spawn_blocking(move || {
        lf.collect()
            .map_err(|e| AppError::query(format!("Collect error: {}", e)))
    })
    .await
    .map_err(|e| AppError::internal(format!("Join error: {}", e)))?
}
```

### 3.6 Schema Enforcement

```rust
// edatime-core/src/types.rs

#[derive(Debug, Clone)]
pub struct DatasetSchema {
    pub columns: Vec<ColumnDef>,
    pub time_column: String,
}

#[derive(Debug, Clone)]
pub struct ColumnDef {
    pub name: String,
    pub dtype: PolarsDataType,
    pub nullable: bool,
}

impl DatasetSchema {
    /// Verify a set of columns exists and has compatible types.
    pub fn validate_columns(&self, cols: &[String]) -> Result<(), AppError> {
        for col in cols {
            if !self.columns.iter().any(|c| &c.name == col) {
                return Err(AppError::not_found(format!("Column '{}' not found", col)));
            }
        }
        Ok(())
    }
    
    /// Produce a projection list for LazyFrame select.
    pub fn projection_exprs(&self, cols: &[String]) -> Vec<Expr> {
        cols.iter().map(|c| col(c)).collect()
    }
}
```

---

## 4. Abstraction & Pipeline Design

### 4.1 Pipeline Stages (Current → Refactored)

| Current | Refactored | Benefit |
|---|---|---|
| `pipeline::filter_time_range` (eager) | `TimeFilterStage + Pipeline::apply` (lazy) | Predicate pushdown |
| `pipeline::apply_reduction` (match enum) | `ReductionStage` (trait + impls) | Open/Closed |
| `routes/data.rs` (direct calls) | `TimeSeriesQuery::execute()` | Single entry point |
| `routes/scatter/points.rs` (400 LOC) | `ScatterQuery` builder + handler | Testable in isolation |

### 4.2 Execution Context

```rust
// edatime-query/src/executor.rs

/// Execution context — defines HOW a query is run.
/// Allows swapping execution strategies without changing query logic.
pub enum ExecutionContext {
    /// Eager single-threaded collect — good for <100k rows.
    Eager,
    /// Streaming multi-threaded collect — good for large results.
    Streaming,
    /// Parallel collect using Rayon — good for CPU-bound transforms.
    Parallel,
}

pub struct QueryExecutor {
    ctx: ExecutionContext,
    thread_pool: Arc<ThreadPool>,
}

impl QueryExecutor {
    pub fn new(ctx: ExecutionContext) -> Self {
        let pool = Arc::new(
            rayon::ThreadPoolBuilder::new()
                .num_threads(4)
                .build()
                .unwrap()
        );
        Self { ctx, thread_pool: pool }
    }
    
    pub fn execute(&self, lf: LazyFrame) -> Result<DataFrame, AppError> {
        match self.ctx {
            ExecutionContext::Eager => self.collect_eager(lf),
            ExecutionContext::Streaming => self.collect_streaming(lf),
            ExecutionContext::Parallel => self.collect_parallel(lf),
        }
    }
    
    fn collect_eager(&self, lf: LazyFrame) -> Result<DataFrame, AppError> {
        let lf = lf; // move
        tokio::task::spawn_blocking(move || {
            lf.collect()
                .map_err(|e| AppError::query(format!("Eager collect: {}", e)))
        })
        .await
        .map_err(|e| AppError::internal(format!("Join: {}", e)))?
    }
}
```

### 4.3 Data Contract / Schema Evolution

```rust
// edatime-core/src/types.rs

/// Versioned dataset contract — enables schema evolution without breaking changes.
#[derive(Debug, Clone)]
pub struct DataContract {
    pub version: u32,
    pub schema: DatasetSchema,
    pub time_range: Option<(i64, i64)>,
    pub row_count: usize,
}

impl DataContract {
    /// Check if a incoming schema is compatible with the contract.
    pub fn is_compatible(&self, other: &DatasetSchema) -> bool {
        // All columns in contract exist in other with same dtype
        // New columns in other are allowed (forward compatible)
        // Missing columns in other are NOT allowed (backward incompatible)
        self.schema.columns.iter().all(|c| {
            other.columns.iter().any(|o| o.name == c.name && o.dtype == c.dtype)
        })
    }
}
```

---

## 5. Concurrency & Execution Model

### 5.1 CPU-Bound vs I/O-Bound Separation

```
┌─────────────────────────────────────────────────────┐
│  Axum Async Runtime (Tokio - IO-bound tasks)       │
│  Handler: await query_executor.execute(lf)         │
│         ↓ (spawn_blocking)                          │
│  Rayon Thread Pool (CPU-bound Polars ops)           │
│  Blocking pool (Tokio - file I/O)                   │
└─────────────────────────────────────────────────────┘
```

**Rules:**
1. **Handler layer** (`edatime-service`) is async — never calls Polars directly
2. **Query executor** runs on Rayon pool — Polars CPU work
3. **Storage adapters** use `tokio::task::spawn_blocking` for file I/O — never pollute the async executor
4. **Never use `block_in_place` inside a blocking closure** — causes thread pool starvation

### 5.2 Worker Pools

```rust
// edatime-bin/src/main.rs (or edatime-service)

use tokio::runtime::Builder;

fn main() {
    let rt = Builder::new()
        .multi_thread()
        .enable_all()
        .thread_name("edatime-io")
        .build()
        .unwrap();
        
    // Separate Rayon pool for CPU-bound work
    let _ = rayon::ThreadPoolBuilder::new()
        .num_threads(4)
        .thread_name("edatime-cpu")
        .build_global();
        
    rt.block_on(async run_server());
}
```

### 5.3 Backpressure

```rust
// edatime-query/src/executor.rs

/// Semaphore-based backpressure for concurrent query execution.
pub struct QuerySemaphore {
    sem: Arc<Semaphore>,
    max_concurrent: usize,
}

impl QuerySemaphore {
    pub fn new(max: usize) -> Self {
        Self {
            sem: Arc::new(Semaphore::new(max)),
            max_concurrent: max,
        }
    }
    
    pub async fn acquire(&self) -> QueryPermit {
        let permit = self.sem.acquire().await.unwrap();
        QueryPermit { sem: Arc::clone(&self.sem), permit }
    }
}

pub struct QueryPermit {
    sem: Arc<Semaphore>,
    _permit: tokio::sync::SemaphorePermit<'static>,
}

// In handler:
pub async fn get_data(...) -> Result<Response, AppError> {
    let _permit = state.query_semaphore.acquire().await;
    let result = state.query_executor.execute(lf).await?;
    // permit released on drop
}
```

### 5.4 Streaming Data Pipelines

For endpoints returning large Arrow IPC streams:

```rust
// edatime-query/src/streaming.rs

/// Streaming response builder — yields batches as they are computed.
pub struct StreamingQuery {
    lf: LazyFrame,
    batch_size: usize,
}

impl StreamingQuery {
    pub fn new(lf: LazyFrame, batch_size: usize) -> Self {
        Self { lf, batch_size }
    }
    
    /// Execute and yield batches. Uses Polars streaming.
    pub async fn execute_batches(
        &self,
    ) -> Result<
        impl Stream<Item = Result<Bytes, AppError>>,
        AppError,
    > {
        let lf = self.lf.clone();
        let batch_size = self.batch_size;
        
        let stream = StreamExt::into_async_stream(
            tokio::iter::from_generator(move || {
                let df = tokio::task::spawn_blocking(move || {
                    lf.clone()
                        .with_new_streaming(true)
                        .collect()
                        .expect("streaming collect")
                });
                for batch in df.iter_chunks(batch_size) {
                    yield Result::<Bytes, AppError>::Ok(batch);
                }
            })
        );
        Ok(stream)
    }
}
```

---

## 6. Data Layer & Storage

### 6.1 Repository Abstraction

```rust
// edatime-store/src/repository.rs

/// Repository trait — abstracts data access.
pub trait DataRepository: Send + Sync {
    /// Get current schema info.
    fn schema(&self) -> DatasetSchema;
    
    /// Get current revision (for cache invalidation).
    fn revision(&self) -> u64;
    
    /// Get a snapshot LazyFrame (clone-friendly — no lock needed for read).
    fn snapshot(&self) -> LazyFrame;
    
    /// Replace dataset (used after upload).
    fn replace(&self, df: DataFrame) -> Result<(), AppError>;
    
    /// Subscribe to revision changes (for cache invalidation callbacks).
    fn on_replace(&self, f: Arc<dyn Fn(u64) + Send + Sync>);
}

// In-memory implementation stays the same but:
// - REMOVE the Arc<RwLock<LazyFrame>> indirection
// - Store LazyFrame directly (cloning is cheap)
// - Use RwLock only for replace() operations (rare)
```

**Key change:** Remove `Arc<RwLock<LazyFrame>>` from `AppState`. Store `LazyFrame` by value, cloned on every request. This eliminates read contention entirely.

### 6.2 Storage Adapter Strategy

```rust
// edatime-store/src/parquet.rs

pub struct ParquetAdapter {
    path: PathBuf,
}

impl ParquetAdapter {
    pub fn scan(&self, time_filter: Option<TimeFilter>) -> Result<LazyFrame, AppError> {
        let args = ScanArgsParquet::default();
        let lf = LazyFrame::scan_parquet(&self.path, args)?;
        
        if let Some(tf) = time_filter {
            let lf = lf.filter(
                col(&tf.column).cast(DataType::Int64).gt_eq(lit(tf.start))
                & col(&tf.column).cast(DataType::Int64).lt_eq(lit(tf.end))
            );
            Ok(lf)
        } else {
            Ok(lf)
        }
    }
}

// For CSV — similar adapter with CSV scan options
// For Arrow IPC — streaming scan with predicate pushdown
```

### 6.3 TimescaleDB Integration

```rust
// edatime-store/src/timescaledb.rs

/// TimescaleDB hypertable scan adapter.
/// Applies predicate pushdown via WHERE clauses at the DB level.
pub struct TimescaleAdapter {
    pool: DbPool,
    schema: String,
    table: String,
    time_column: String,
}

impl TimescaleAdapter {
    /// Build a LazyFrame that pushes predicate to TimescaleDB.
    pub fn scan(
        &self,
        time_filter: Option<TimeFilter>,
        columns: &[String],
    ) -> Result<LazyFrame, AppError> {
        // Use pushdown predicates in SQL WHERE clause
        let sql = format!(
            "SELECT {} FROM {}.{} WHERE {} >= {} AND {} <= {}",
            columns.join(", "),
            self.schema, self.table,
            self.time_column, time_filter.map(|t| t.start).unwrap_or(i64::MIN),
            self.time_column, time_filter.map(|t| t.end).unwrap_or(i64::MAX),
        );
        
        LazyFrame::scan_sql(&self.pool, &sql)
            .map_err(|e| AppError::query(format!("SQL scan: {}", e)))
    }
}
```

---

## 7. API & Service Layer

### 7.1 DTO Boundaries

```
edatime-service/src/dto/
├── request/
│   ├── data_query.rs      # GET /data params
│   ├── scatter_query.rs   # POST /scatter/points body
│   ├── upload_query.rs    # POST /upload params
│   └── analytics_query.rs
├── response/
│   ├── data_response.rs   # Arrow IPC or JSON wrapper
│   ├── metadata_response.rs
│   ├── error_response.rs
│   └── health_response.rs
└── converters.rs          # DTO → domain query builders
```

**Rule:** DTOs only convert to domain types. No business logic in `dto/`. No Polars types in `dto/`.

### 7.2 Handler Simplicity Target

```rust
// edatime-service/src/handlers/data.rs

// BEFORE (current): 80+ lines of mixed concerns
// AFTER (target): 20 lines

pub async fn get_data(
    State(state): State<AppState>,
    Query(params): Query<DataQuery>,
) -> Result<Response, AppError> {
    // 1. Parse + validate (DTO layer)
    let query = params.into_time_series_query(&state.schema)?;
    
    // 2. Check cache
    if let Some(cached) = state.cache.get(&query.cache_key()).await {
        state.metrics.record_cache_hit();
        return Ok(cached.into_response());
    }
    
    // 3. Execute (pure — no I/O in handler)
    let lf = state.repo.snapshot();
    let (df, was_downsample) = query.execute(lf)?;
    
    // 4. Serialize + cache
    let cached = state.cache_and_serialize(query, df, was_downsample).await?;
    Ok(cached.into_response())
}
```

### 7.3 Error Handling

```rust
// edatime-core/src/error.rs

#[derive(Debug, Clone)]
pub enum AppErrorKind {
    Validation { code: ValidationCode, message: String },
    NotFound { resource: ResourceId },
    Query { hint: String },         // Polars-specific with explain
    Io { context: String },
    RateLimit { retry_after_secs: u64 },
    Internal { detail: String },
}

// No Axum dependency — error is pure domain
impl AppErrorKind {
    pub fn to_http_status(&self) -> StatusCode { ... }
    pub fn error_code(&self) -> &'static str { ... }
}

// edatime-service converts to HTTP:
impl IntoResponse for AppErrorKind {
    fn into_response(self) -> Response {
        (self.to_http_status(), Json(self.to_error_response())).into_response()
    }
}
```

### 7.4 Versioning

All routes already have `/api/v1/*` aliasing. The refactor standardizes:

```rust
// edatime-service/src/router.rs

pub fn api_router() -> Router<AppState> {
    let api_v1 = Router::new()
        .route("/data", get(data::get_data))
        // ... all v1 routes
        ;
    
    Router::new()
        .nest("/api/v1", api_v1.clone())
        .nest("/api", api_v1)  // /api aliases /api/v1 for backwards compat
}
```

---

## 8. Performance Optimization Strategy

### 8.1 Zero-Copy Operations

| Operation | Current | Optimized |
|---|---|---|
| Arrow IPC response | `dataframe_to_arrow_ipc` materializes to `Bytes` | Stream directly from batch iterator |
| Time column access | `df.column(ts_col)?` clones series | Use indices, not copies |
| Cache lookup | JSON serialize/deserialize | Zero-copy cache using `Arc<DataFrame>` |
| Scatter color arrays | Collect to Vec, iterate | LazyFrame row iteration with `get` |

### 8.2 Memory-Efficient Transformations

```rust
// Always prefer:
lf.select([
    col("timestamp"),
    col("value").map_alias("value"),
])
// Over materializing and re-selecting:

// For large DataFrames, use chunked iterators:
for chunk in df.iter_chunks(10_000) {
    // process chunk, yield result
    yield chunk_to_arrow_record_batch()?;
}
```

### 8.3 Benchmarking Plan

```rust
// benches/query_benchmark.rs

use criterion::{black_box, criterion_group, Criterion};

fn bench_filter_time_range(c: &mut Criterion) {
    let lf = // setup LazyFrame with 10M rows
    c.bench_function("filter_time_range/10M_rows", |b| {
        b.iter(|| {
            filter_time_range(
                black_box(lf.clone()),
                black_box(0_i64),
                black_box(1_000_000_i64),
                black_box(&["value".to_string()]),
                black_box("timestamp"),
            )
        })
    });
}

// Profile Polars query plans with:
// lf.explain().unwrap()  // Text plan
// lf.show_graph(true)   // Mermaid graph (if supported)
```

### 8.4 Recommended Profiling Tools

- `cargo flamegraph` — CPU profiling
- `tokio-console` — async task contention
- Polars `explain()` — query plan inspection
- `rfp` (Rust Flight Recorder) — allocation profiling

---

## 9. Error Handling & Observability

### 9.1 Structured Tracing

```rust
// edatime-core/src/tracing.rs (shared, no axum deps)

pub fn setup_tracing() -> tracing::Subscriber {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .with_target()
        .with_thread_ids()
        .with_file_and_line()
        .finish()
}

// Everywhere in query layer:
tracing::debug!(
    query_id = %query_id,
    rows_before = df.height(),
    rows_after = reduced.height(),
    "reduction applied"
);
```

### 9.2 LazyFrame Plan Inspection

```rust
// edatime-query/src/optimization.rs

/// Log the optimized query plan for debugging.
pub fn inspect_plan(lf: LazyFrame, label: &str) -> LazyFrame {
    match lf.explain() {
        Ok(plan) => {
            tracing::debug!(label = label, plan = %plan, "Polars query plan");
        }
        Err(e) => {
            tracing::warn!(label = label, error = %e, "Failed to get query plan");
        }
    }
    lf
}
```

### 9.3 Metrics

```rust
// edatime-core/src/metrics.rs

pub struct AppMetrics {
    pub query_duration: Histogram,
    pub cache_hit_ratio: Gauge,
    pub active_queries: Gauge,
    pub dataset_revision: Gauge,
    pub memory_estimated_mb: Gauge,
}
```

---

## 10. Developer Experience

### 10.1 Code Generation

```rust
// edatime-core/src/codegen.rs

// Generate pipeline stage implementations from a derive macro:
// #[derive(PipelineStage)]
// struct MyFilter { cols: Vec<String> }
// → impl PipelineStage for MyFilter { ... }
```

### 10.2 Testing Architecture

```
tests/
├── unit/
│   ├── query_transforms.rs    # Pure LazyFrame stage tests
│   ├── predicates.rs
│   ├── aggregations.rs
│   └── pipeline.rs            # Pipeline composition tests
├── integration/
│   ├── api_data.rs           # HTTP tests via axum-test
│   ├── api_scatter.rs
│   └── api_upload.rs
└── fixtures/
    ├── sample_10k.parquet
    └── sample_10M.parquet
```

**Key:** All `edatime-query` tests are pure — no I/O, no network, sub-second.

### 10.3 Property Testing

```rust
// property_tests/pipeline_invariant.rs

use proptest::prelude::*;

// Verify: pipeline.apply(source).collect() == source.collect() 
// after only time filtering and projection (no transform changes data)
proptest! {
    #[test]
    fn test_pipeline_preserves_row_count(
        timestamps in prop::collection::vec(any::<i64>(), 10..1000),
        values in prop::collection::vec(any::<f64>(), 10..1000),
        start in 0..i64::MAX,
        end in 0..i64::MAX,
    ) {
        let df = dataframe_from_timestamps_and_values(timestamps, values);
        let lf = df.lazy();
        let pipeline = Pipeline::new()
            .then(TimeFilterStage { start, end, ts_col: "ts".into() });
        
        let result = pipeline.apply(lf).collect().unwrap();
        let expected = lf.filter(
            col("ts").gt_eq(lit(start)) & col("ts").lt_eq(lit(end))
        ).collect().unwrap();
        
        assert_eq!(result.height(), expected.height());
    }
}
```

### 10.4 Linting

```toml
# .clippy.toml
[magic]
max-iterations = 50

[pedantic]
disallowed-names = ["foo", "bar", "baz"]
disallowed-macros = ["println!", "panic!"]
```

---

## 11. Migration Plan

### 11.1 Phases

```
Phase 1 (High Impact, Low Risk)
├── Extract edatime-core types (DatasetMeta, AppError, TimeContext)
├── Extract edatime-query executor + transforms.rs (pure, no I/O)
├── Write unit tests for pipeline stages
└── Benchmark before/after LazyFrame operations

Phase 2 (High Impact, Medium Risk)
├── Refactor repository trait (remove RwLock indirection)
├── Refactor pipeline.rs to Pipeline + stages
├── Extract storage adapters (parquet, csv, arrow_ipc)
└── Validate with integration tests

Phase 3 (Medium Impact, Medium Risk)
├── Refactor handlers to use TimeSeriesQuery builder
├── Implement backpressure with QuerySemaphore
├── Extract analytics module into edatime-analytics crate
└── Streaming execution for large result sets

Phase 4 (Medium Impact, High Risk)
├── Extract edatime-service crate
├── Full handler rewrite (dto → query → execute → serialize)
├── TimescaleDB adapter completion
└── End-to-end benchmarks + load tests

Phase 5 (Future / Optional)
├── Plugin system for custom pipeline stages
├── Distributed query execution (multi-node LazyFrame)
└── Arrow RPC transport (替代 HTTP for internal comms)
```

### 11.2 High-Impact First Targets

| Target | Why First | Validation |
|---|---|---|
| `filter_time_range` → `TimeFilterStage` | Most called function; clear interface | Bench: 10M row filter should be 2x faster |
| Remove `Arc<RwLock<LazyFrame>>` | Eliminates read contention | `tokio-console` shows ~0 lock contention |
| `Pipeline::apply_reduction` → trait | Open/Closed for new chart types | Add `HeatmapReduction` without touching enum |
| Handler slim-down | Each handler is 60% boilerplate | Lines of code per handler < 30 |

### 11.3 Rollback Strategy

- Keep `routes/` as parallel implementation during Phases 1–2
- Feature flag `EDATIME_USE_NEW_QUERY_ENGINE` to switch between old/new
- Benchmark both paths in production shadow mode before cutover
- Revert by removing feature flag + deleting new crate implementations

### 11.4 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Breaking LazyFrame API compatibility | Medium | High | Use feature flags; extensive integration tests |
| Thread pool starvation from `block_in_place` | High | High | Centralize blocking in `executor.rs` only |
| Performance regression from over-abstraction | Medium | Medium | Bench every phase; never merge without benchmarks |
| Handler rewrite bugs | High | Medium | Property test the query builder; keep old handlers as reference |

---

## 12. Deliverables Summary

### 12.1 Crate Structure

```
edatime/
├── Cargo.toml (workspace)
├── crates/
│   ├── edatime-core/      # 5 files — types, error, pipeline IR
│   ├── edatime-query/     # 8 files — executor, transforms, predicates
│   ├── edatime-store/      # 6 files — repository, parquet, csv, arrow
│   ├── edatime-ingest/     # 5 files — loader, profiler, slicer
│   ├── edatime-analytics/ # unchanged (already well-structured)
│   ├── edatime-service/    # 10 files — handlers, dto, middleware, router
│   └── edatime-bin/       # main.rs
```

### 12.2 Key Architecture Diagrams

**Query Execution Flow:**
```
HTTP Request
    ↓
DTO Layer (parse + validate)
    ↓
Query Builder (TimeSeriesQuery / ScatterQuery)
    ↓
Pipeline.compose() → LazyFrame (NO collection)
    ↓
QueryExecutor.execute() → spawn_blocking → Rayon pool
    ↓
Polars collect (streaming if large)
    ↓
Serialize (Arrow IPC / JSON)
    ↓
Cache
    ↓
HTTP Response
```

**Module Dependency Graph:**
```
edatime-service → edatime-query → edatime-core
edatime-service → edatime-core
edatime-query → edatime-core
edatime-store → edatime-core
edatime-ingest → edatime-core + edatime-store
```

### 12.3 Example LazyFrame Abstractions

All examples in Section 3 (Polars LazyFrame Strategy) are directly usable pseudocode.

### 12.4 Migration Checklist

```markdown
□ Phase 1a: Extract DatasetMeta, TimeContext, AppError to edatime-core
□ Phase 1b: Write unit tests for extracted types
□ Phase 2a: Implement PipelineStage trait + TimeFilterStage
□ Phase 2b: Benchmark filter_time_range vs new pipeline
□ Phase 2c: Remove RwLock from repository (snapshot returns LazyFrame by value)
□ Phase 3a: Implement ReductionStage trait
□ Phase 3b: Refactor GET /data handler to use TimeSeriesQuery
□ Phase 3c: Add QuerySemaphore for backpressure
□ Phase 4a: Extract storage adapters
□ Phase 4b: Integration tests pass for all endpoints
□ Phase 4c: Load test at 10x current traffic
□ Phase 5: (Future) Plugin system
```

### 12.5 Performance Benchmarking Plan

```bash
# 1. Baseline (current implementation)
cargo bench --no-run  # ensure benchmarks compile
cargo bench filter_time_range
cargo bench apply_reduction_lttb

# 2. After Phase 1 (new executor)
cargo bench filter_time_range_new
cargo bench pipeline_compose

# 3. Regression check
cargo bench  # all benchmarks must be within 5% of Phase N-1

# 4. Integration load test
cargo test integration -- --test-threads=1  # sequential to avoid contention
ab -n 10000 -c 10 http://localhost:3000/api/data?...  # ApacheBench
```

### 12.6 Implementation Priorities

1. **`edatime-core`** extraction (types + error) — foundation for everything else
2. **`TimeFilterStage`** + `Pipeline` composable — most impactful, lowest risk
3. **`QueryExecutor`** with proper thread pool separation — fixes concurrency issues
4. **Handler rewrite using `TimeSeriesQuery`** — reduces boilerplate 60%
5. **`ReductionStage` trait** — Open/Closed principle for chart types

---

## Appendix: Key Trade-offs

| Decision | Trade-off | Rationale |
|---|---|---|
| Separate crates vs single crate | More boilerplate (Cargo.toml per crate) but true separation + faster incremental compilation | Worth it for long-term maintainability |
| Remove `Arc<RwLock<LazyFrame>>` | Cloning LazyFrame is cheap but not free (~microseconds) | Eliminating lock contention outweighs cloning cost |
| Trait-based PipelineStage | Requires heap allocation per stage | Necessary for Open/Closed; use `Box<dyn Stage>` only where needed |
| Rayon vs Tokio for Polars | Rayon is better for CPU-bound parallelism but can't await | Use Rayon for `.collect()` + transforms; Tokio for I/O |
| Keep analytics as single crate | Already well-structured; extraction adds complexity without benefit | Follows Principle of Orthogonal Persistence |