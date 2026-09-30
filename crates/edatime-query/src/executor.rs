//! Query executor with proper thread pool separation.
//! CPU-bound Polars work runs on Rayon pool via spawn_blocking.
//! Async handler awaits the blocking handle.

use edatime_core::cancellation::{CancellationHandle, CancellationProbe, cancellation_pair};
use edatime_core::error::DomainError;
use edatime_core::metrics::{AppMetrics, CpuStage};
use edatime_core::types::LazyFrame;
use rayon::ThreadPool;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

const DEFAULT_QUERY_WORKER_CAP: usize = 8;
const QUERY_THREADS_ENV: &str = "EDATIME_QUERY_THREADS";

#[derive(Clone)]
struct AdmissionLane {
    running: Arc<Semaphore>,
    waiting: Arc<Semaphore>,
}

impl AdmissionLane {
    async fn acquire_queued(&self) -> Result<OwnedSemaphorePermit, DomainError> {
        if let Ok(permit) = Arc::clone(&self.running).try_acquire_owned() {
            return Ok(permit);
        }
        let _queued = Arc::clone(&self.waiting)
            .try_acquire_owned()
            .map_err(|_| DomainError::overloaded("background work queue is full"))?;
        Arc::clone(&self.running)
            .acquire_owned()
            .await
            .map_err(|_| DomainError::internal("background work admission closed"))
    }

    fn new(max_running: usize, max_waiting: usize) -> Self {
        Self {
            running: Arc::new(Semaphore::new(max_running.max(1))),
            waiting: Arc::new(Semaphore::new(max_waiting.max(1))),
        }
    }

    async fn acquire(
        &self,
        queue_timeout: Duration,
        label: &'static str,
    ) -> Result<OwnedSemaphorePermit, DomainError> {
        if let Ok(permit) = Arc::clone(&self.running).try_acquire_owned() {
            return Ok(permit);
        }

        let queued = Arc::clone(&self.waiting)
            .try_acquire_owned()
            .map_err(|_| DomainError::overloaded(format!("{label} work queue is full")))?;
        let permit = tokio::time::timeout(queue_timeout, Arc::clone(&self.running).acquire_owned())
            .await
            .map_err(|_| DomainError::overloaded(format!("{label} work queue timed out")))?
            .map_err(|_| DomainError::internal(format!("{label} work admission closed")))?;
        drop(queued);
        Ok(permit)
    }
}

/// Bounded admission lanes for all blocking work. CPU-heavy interactive and
/// background jobs use the shared Rayon pool; blocking I/O has its own lane so
/// filesystem/parser stalls cannot occupy every CPU worker.
#[derive(Clone)]
struct QueryAdmission {
    interactive: AdmissionLane,
    background: AdmissionLane,
    blocking_io: AdmissionLane,
    queue_timeout: Duration,
}

impl QueryAdmission {
    fn new(
        max_interactive: usize,
        max_background: usize,
        max_blocking_io: usize,
        max_queued_per_class: usize,
        queue_timeout: Duration,
    ) -> Self {
        Self {
            interactive: AdmissionLane::new(max_interactive, max_queued_per_class),
            background: AdmissionLane::new(max_background, max_queued_per_class),
            blocking_io: AdmissionLane::new(max_blocking_io, max_queued_per_class),
            queue_timeout,
        }
    }

    async fn acquire_interactive(&self) -> Result<OwnedSemaphorePermit, DomainError> {
        self.interactive
            .acquire(self.queue_timeout, "interactive")
            .await
    }

    async fn acquire_background(&self) -> Result<OwnedSemaphorePermit, DomainError> {
        self.background
            .acquire(self.queue_timeout, "background")
            .await
    }

    async fn acquire_blocking_io(&self) -> Result<OwnedSemaphorePermit, DomainError> {
        self.blocking_io
            .acquire(self.queue_timeout, "blocking I/O")
            .await
    }
}

#[derive(Clone, Copy)]
enum WorkClass {
    Interactive,
    Background,
    BackgroundQueued,
    BackgroundExternal,
    BlockingIo,
}

struct AdmissionMetricsGuard {
    metrics: Option<Arc<AppMetrics>>,
    stage: CpuStage,
    started: bool,
    finished: bool,
}

impl AdmissionMetricsGuard {
    fn submitted(metrics: Option<Arc<AppMetrics>>, stage: CpuStage) -> Self {
        if let Some(metrics) = metrics.as_ref() {
            metrics.record_cpu_submit(stage);
        }
        Self {
            metrics,
            stage,
            started: false,
            finished: false,
        }
    }

    fn started(&mut self, queue_wait_ns: u64) {
        if let Some(metrics) = self.metrics.as_ref() {
            metrics.record_cpu_started(self.stage, queue_wait_ns);
        }
        self.started = true;
    }

    fn rejected(mut self) {
        if let Some(metrics) = self.metrics.as_ref() {
            metrics.record_cpu_rejected(self.stage);
        }
        self.finished = true;
    }

    fn cancelled_after_start(mut self) {
        if let Some(metrics) = self.metrics.as_ref() {
            metrics.record_cpu_cancelled_running(self.stage);
        }
        self.finished = true;
    }
}

impl Drop for AdmissionMetricsGuard {
    fn drop(&mut self) {
        if self.finished {
            return;
        }
        if let Some(metrics) = self.metrics.as_ref() {
            if self.started {
                metrics.record_cpu_completed(self.stage);
            } else {
                metrics.record_cpu_cancelled(self.stage);
            }
        }
        self.finished = true;
    }
}

/// Cancels a request-owned CPU worker when its awaiting handler future is
/// dropped. This does not forcibly terminate the worker; the worker must poll
/// the paired `CancellationProbe` at documented bounded intervals.
struct CancelOnDrop(CancellationHandle);

impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        self.0.cancel();
    }
}

/// How a lazy plan is collected. Both run on the shared, admission-bounded
/// worker pool; `Streaming` uses Polars' streaming engine to cap peak memory.
#[derive(Clone)]
pub enum ExecutionContext {
    Streaming,
    Parallel,
}

pub struct QueryExecutor {
    ctx: ExecutionContext,
    thread_pool: Arc<ThreadPool>,
    /// Phase 0.1: optional metrics handle used to record `Query` CPU
    /// admission/submit/started/completed lifecycle events. `None` keeps
    /// the executor usable from tests or embedded callers without the
    /// full metrics stack.
    metrics: Option<Arc<AppMetrics>>,
    /// Optional bounded lanes configured by `AppState`. Tests and embedded
    /// callers retain the previous unbounded behavior unless they opt in.
    admission: Option<QueryAdmission>,
}

impl QueryExecutor {
    pub fn new(ctx: ExecutionContext) -> Self {
        Self {
            ctx,
            thread_pool: build_default_pool(),
            metrics: None,
            admission: None,
        }
    }

    /// Attach a metrics handle so the executor records `Query` CPU
    /// admission lifecycle events around every `execute_async` call.
    pub fn with_metrics(mut self, metrics: Arc<AppMetrics>) -> Self {
        self.metrics = Some(metrics);
        self
    }

    /// Bound executor-owned interactive collection separately from durable
    /// materialization/export work. Zero is clamped to one at this boundary so
    /// an invalid deployment value cannot permanently deadlock a workload.
    pub fn with_admission(
        mut self,
        max_interactive: usize,
        max_background: usize,
        max_blocking_io: usize,
        max_queued_per_class: usize,
        queue_timeout: Duration,
    ) -> Self {
        self.admission = Some(QueryAdmission::new(
            max_interactive,
            max_background,
            max_blocking_io,
            max_queued_per_class,
            queue_timeout,
        ));
        self
    }

    async fn run_admitted<T, F>(
        &self,
        class: WorkClass,
        stage: CpuStage,
        cancellation: Option<CancellationProbe>,
        work: F,
    ) -> Result<T, DomainError>
    where
        T: Send + 'static,
        F: FnOnce(Option<CancellationProbe>) -> T + Send + 'static,
    {
        let queue_start = std::time::Instant::now();
        let mut metrics_guard = AdmissionMetricsGuard::submitted(self.metrics.clone(), stage);
        let permit = if let Some(admission) = &self.admission {
            let acquired = match class {
                WorkClass::Interactive => admission.acquire_interactive().await,
                WorkClass::Background | WorkClass::BackgroundExternal => {
                    admission.acquire_background().await
                }
                WorkClass::BackgroundQueued => admission.background.acquire_queued().await,
                WorkClass::BlockingIo => admission.acquire_blocking_io().await,
            };
            match acquired {
                Ok(permit) => Some(permit),
                Err(error) => {
                    metrics_guard.rejected();
                    return Err(error);
                }
            }
        } else {
            None
        };
        let pool = Arc::clone(&self.thread_pool);
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            metrics_guard.started(queue_start.elapsed().as_nanos() as u64);
            let worker_probe = cancellation.clone();
            let result = match class {
                WorkClass::BlockingIo | WorkClass::BackgroundExternal => work(worker_probe),
                WorkClass::Interactive | WorkClass::Background | WorkClass::BackgroundQueued => {
                    pool.install(|| work(worker_probe))
                }
            };
            if cancellation.is_some_and(|probe| probe.is_cancelled()) {
                metrics_guard.cancelled_after_start();
                return Err(DomainError::Cancelled(
                    "interactive request cancelled".to_string(),
                ));
            }
            Ok(result)
        })
        .await
        .map_err(|error| DomainError::internal(format!("Blocking worker join error: {error}")))?
    }

    pub async fn run_interactive<T, F>(&self, stage: CpuStage, work: F) -> Result<T, DomainError>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        self.run_admitted(WorkClass::Interactive, stage, None, move |_| work())
            .await
    }

    /// Run cooperative interactive CPU work tied to the lifetime of the
    /// awaiting request. Dropping the returned future signals cancellation;
    /// the closure must poll the provided probe and stop without publishing a
    /// partial result. Opaque work such as a Polars collect cannot use this
    /// mechanism and must remain governed by admission/work budgets.
    pub async fn run_interactive_cancellable<T, F>(
        &self,
        stage: CpuStage,
        work: F,
    ) -> Result<T, DomainError>
    where
        T: Send + 'static,
        F: FnOnce(CancellationProbe) -> T + Send + 'static,
    {
        let (handle, probe) = cancellation_pair();
        let _cancel_on_drop = CancelOnDrop(handle);
        let worker_probe = probe.clone();
        self.run_admitted(WorkClass::Interactive, stage, Some(probe), move |_| {
            work(worker_probe)
        })
        .await
    }

    pub async fn run_background<T, F>(&self, stage: CpuStage, work: F) -> Result<T, DomainError>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        self.run_admitted(WorkClass::Background, stage, None, move |_| work())
            .await
    }

    /// Observable session jobs may wait behind other background work without
    /// the short HTTP admission deadline. Both running and waiting counts
    /// remain bounded; dropping the future releases its waiting slot.
    pub async fn run_queued_background<T, F>(
        &self,
        stage: CpuStage,
        work: F,
    ) -> Result<T, DomainError>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        self.run_admitted(WorkClass::BackgroundQueued, stage, None, move |_| work())
            .await
    }

    pub async fn execute_queued_background_async(
        &self,
        lf: LazyFrame,
    ) -> Result<edatime_core::types::DataFrame, DomainError> {
        let ctx = self.ctx.clone();
        self.run_queued_background(CpuStage::Query, move || collect_plan(&ctx, lf))
            .await?
            .map_err(|e| DomainError::Query(format!("Collect: {}", e)))
    }

    pub async fn run_blocking_io<T, F>(&self, stage: CpuStage, work: F) -> Result<T, DomainError>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        self.run_admitted(WorkClass::BlockingIo, stage, None, move |_| work())
            .await
    }

    /// Run background work that owns its own parallel runtime without nesting
    /// it inside the shared Rayon pool.
    pub async fn run_external_background<T, F>(
        &self,
        stage: CpuStage,
        work: F,
    ) -> Result<T, DomainError>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        self.run_admitted(WorkClass::BackgroundExternal, stage, None, move |_| work())
            .await
    }

    pub async fn execute_async(
        &self,
        lf: LazyFrame,
    ) -> Result<edatime_core::types::DataFrame, DomainError> {
        let ctx = self.ctx.clone();
        self.run_interactive(CpuStage::Query, move || collect_plan(&ctx, lf))
            .await?
            .map_err(|e| DomainError::Query(format!("Collect: {}", e)))
    }

    /// Collect a durable/background workload through the independent bounded
    /// admission lane. Exact profiling uses this so it cannot occupy every
    /// interactive viewport-query permit.
    pub async fn execute_background_async(
        &self,
        lf: LazyFrame,
    ) -> Result<edatime_core::types::DataFrame, DomainError> {
        let ctx = self.ctx.clone();
        self.run_background(CpuStage::Query, move || collect_plan(&ctx, lf))
            .await?
            .map_err(|e| DomainError::Query(format!("Collect: {}", e)))
    }

    /// Execute a lazy query directly into a Parquet file through Polars' new
    /// streaming sink. The returned frame is intentionally discarded: the
    /// durable file is the output boundary.
    pub async fn sink_parquet_async(
        &self,
        lf: LazyFrame,
        path: PathBuf,
    ) -> Result<(), DomainError> {
        self.sink_parquet_with_resources(lf, path, ()).await
    }

    /// Retain input files and admission guards until the sink worker exits,
    /// including when the awaiting request is dropped.
    pub async fn sink_parquet_with_resources<R: Send + 'static>(
        &self,
        lf: LazyFrame,
        path: PathBuf,
        resources: R,
    ) -> Result<(), DomainError> {
        use polars::lazy::dsl::{FileWriteFormat, SinkDestination, SinkTarget, UnifiedSinkArgs};
        use polars::prelude::{ParquetWriteOptions, PlRefPath};

        let target = PlRefPath::try_from_path(&path)
            .map_err(|error| DomainError::Io(format!("Invalid Parquet sink path: {error}")))?;
        let sink = lf
            .sink(
                SinkDestination::File {
                    target: SinkTarget::Path(target),
                },
                FileWriteFormat::Parquet(Arc::new(ParquetWriteOptions::default())),
                UnifiedSinkArgs::default(),
            )
            .map_err(|error| DomainError::Query(format!("Build Parquet sink: {error}")))?;
        let pool = Arc::clone(&self.thread_pool);
        self.run_external_background(CpuStage::Materialization, move || {
            let _resources = resources;
            // Polars' file sink owns an async IO runtime internally. Run it on
            // a plain child thread so it is not nested inside Tokio's runtime
            // context inherited by `spawn_blocking`.
            std::thread::spawn(move || pool.install(|| sink.with_new_streaming(true).collect()))
                .join()
                .map_err(|_| DomainError::internal("Parquet sink thread panicked"))?
                .map(|_| ())
                .map_err(|error| DomainError::Query(format!("Write Parquet sink: {error}")))
        })
        .await?
    }
}

fn collect_plan(
    ctx: &ExecutionContext,
    lf: LazyFrame,
) -> polars::prelude::PolarsResult<edatime_core::types::DataFrame> {
    match ctx {
        ExecutionContext::Parallel => lf.collect(),
        ExecutionContext::Streaming => lf.with_new_streaming(true).collect(),
    }
}

fn build_default_pool() -> Arc<ThreadPool> {
    let workers = configured_worker_count(
        std::env::var(QUERY_THREADS_ENV).ok().as_deref(),
        std::thread::available_parallelism()
            .map(|parallelism| parallelism.get())
            .unwrap_or(1),
    );
    // Pool construction only fails when the OS refuses to spawn threads. That
    // happens once while building `AppState` at startup, where there is no
    // request to fail and no useful way to continue.
    #[allow(clippy::expect_used)]
    Arc::new(
        rayon::ThreadPoolBuilder::new()
            .num_threads(workers)
            .thread_name(|i| format!("edatime-cpu-{i}"))
            .build()
            .expect("failed to start the query worker pool"),
    )
}

/// Resolve a bounded default that follows the host size while leaving an
/// explicit deployment override. A single shared pool prevents each request
/// from creating its own CPU workers; the cap avoids saturating a large host
/// by default when Polars or other handlers also perform parallel work.
fn configured_worker_count(configured: Option<&str>, available: usize) -> usize {
    let available = available.max(1);
    configured
        .and_then(|value| value.trim().parse::<usize>().ok())
        .filter(|workers| *workers > 0)
        .map(|workers| workers.min(available))
        .unwrap_or_else(|| available.min(DEFAULT_QUERY_WORKER_CAP))
}

#[cfg(test)]
mod tests;
