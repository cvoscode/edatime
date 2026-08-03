//! Query executor with proper thread pool separation.
//! CPU-bound Polars work runs on Rayon pool via spawn_blocking.
//! Async handler awaits the blocking handle.

use edatime_core::error::AppError;
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
    ) -> Result<OwnedSemaphorePermit, AppError> {
        if let Ok(permit) = Arc::clone(&self.running).try_acquire_owned() {
            return Ok(permit);
        }

        let queued = Arc::clone(&self.waiting)
            .try_acquire_owned()
            .map_err(|_| AppError::overloaded(format!("{label} work queue is full")))?;
        let permit = tokio::time::timeout(queue_timeout, Arc::clone(&self.running).acquire_owned())
            .await
            .map_err(|_| AppError::overloaded(format!("{label} work queue timed out")))?
            .map_err(|_| AppError::internal(format!("{label} work admission closed")))?;
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

    async fn acquire_interactive(&self) -> Result<OwnedSemaphorePermit, AppError> {
        self.interactive
            .acquire(self.queue_timeout, "interactive")
            .await
    }

    async fn acquire_background(&self) -> Result<OwnedSemaphorePermit, AppError> {
        self.background
            .acquire(self.queue_timeout, "background")
            .await
    }

    async fn acquire_blocking_io(&self) -> Result<OwnedSemaphorePermit, AppError> {
        self.blocking_io
            .acquire(self.queue_timeout, "blocking I/O")
            .await
    }
}

#[derive(Clone, Copy)]
enum WorkClass {
    Interactive,
    Background,
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

#[derive(Clone)]
pub enum ExecutionContext {
    Eager,
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
        work: F,
    ) -> Result<T, AppError>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        let queue_start = std::time::Instant::now();
        let mut metrics_guard = AdmissionMetricsGuard::submitted(self.metrics.clone(), stage);
        let permit = if let Some(admission) = &self.admission {
            let acquired = match class {
                WorkClass::Interactive => admission.acquire_interactive().await,
                WorkClass::Background | WorkClass::BackgroundExternal => {
                    admission.acquire_background().await
                }
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
            match class {
                WorkClass::BlockingIo | WorkClass::BackgroundExternal => work(),
                WorkClass::Interactive | WorkClass::Background => pool.install(work),
            }
        })
        .await
        .map_err(|error| AppError::internal(format!("Blocking worker join error: {error}")))
    }

    pub async fn run_interactive<T, F>(&self, stage: CpuStage, work: F) -> Result<T, AppError>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        self.run_admitted(WorkClass::Interactive, stage, work).await
    }

    pub async fn run_background<T, F>(&self, stage: CpuStage, work: F) -> Result<T, AppError>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        self.run_admitted(WorkClass::Background, stage, work).await
    }

    pub async fn run_blocking_io<T, F>(&self, stage: CpuStage, work: F) -> Result<T, AppError>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        self.run_admitted(WorkClass::BlockingIo, stage, work).await
    }

    /// Run background work that owns its own parallel runtime without nesting
    /// it inside the shared Rayon pool.
    pub async fn run_external_background<T, F>(
        &self,
        stage: CpuStage,
        work: F,
    ) -> Result<T, AppError>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        self.run_admitted(WorkClass::BackgroundExternal, stage, work)
            .await
    }

    pub async fn execute_async(
        &self,
        lf: LazyFrame,
    ) -> Result<edatime_core::types::DataFrame, AppError> {
        let ctx = self.ctx.clone();
        self.run_interactive(CpuStage::Query, move || match ctx {
            ExecutionContext::Eager | ExecutionContext::Parallel => lf.collect(),
            ExecutionContext::Streaming => lf.with_new_streaming(true).collect(),
        })
        .await?
        .map_err(|e| AppError::Query(format!("Collect: {}", e)))
    }

    /// Collect a durable/background workload through the independent bounded
    /// admission lane. Exact profiling uses this so it cannot occupy every
    /// interactive viewport-query permit.
    pub async fn execute_background_async(
        &self,
        lf: LazyFrame,
    ) -> Result<edatime_core::types::DataFrame, AppError> {
        let ctx = self.ctx.clone();
        self.run_background(CpuStage::Query, move || match ctx {
            ExecutionContext::Eager | ExecutionContext::Parallel => lf.collect(),
            ExecutionContext::Streaming => lf.with_new_streaming(true).collect(),
        })
        .await?
        .map_err(|e| AppError::Query(format!("Collect: {}", e)))
    }

    /// Execute a lazy query directly into a Parquet file through Polars' new
    /// streaming sink. The returned frame is intentionally discarded: the
    /// durable file is the output boundary.
    pub async fn sink_parquet_async(&self, lf: LazyFrame, path: PathBuf) -> Result<(), AppError> {
        use polars::lazy::dsl::{FileWriteFormat, SinkDestination, SinkTarget, UnifiedSinkArgs};
        use polars::prelude::{ParquetWriteOptions, PlRefPath};

        let target = PlRefPath::try_from_path(&path)
            .map_err(|error| AppError::Io(format!("Invalid Parquet sink path: {error}")))?;
        let sink = lf
            .sink(
                SinkDestination::File {
                    target: SinkTarget::Path(target),
                },
                FileWriteFormat::Parquet(Arc::new(ParquetWriteOptions::default())),
                UnifiedSinkArgs::default(),
            )
            .map_err(|error| AppError::Query(format!("Build Parquet sink: {error}")))?;
        let pool = Arc::clone(&self.thread_pool);
        self.run_external_background(CpuStage::Materialization, move || {
            // Polars' file sink owns an async IO runtime internally. Run it on
            // a plain child thread so it is not nested inside Tokio's runtime
            // context inherited by `spawn_blocking`.
            std::thread::spawn(move || pool.install(|| sink.with_new_streaming(true).collect()))
                .join()
                .map_err(|_| AppError::internal("Parquet sink thread panicked"))?
                .map(|_| ())
                .map_err(|error| AppError::Query(format!("Write Parquet sink: {error}")))
        })
        .await?
    }

    pub fn execute(&self, lf: LazyFrame) -> Result<edatime_core::types::DataFrame, AppError> {
        match self.ctx {
            ExecutionContext::Eager => self.collect_eager(lf),
            ExecutionContext::Streaming => self.collect_streaming(lf),
            ExecutionContext::Parallel => self.collect_parallel(lf),
        }
    }

    fn collect_eager(&self, lf: LazyFrame) -> Result<edatime_core::types::DataFrame, AppError> {
        std::thread::scope(|s| {
            s.spawn(|| {
                lf.collect()
                    .map_err(|e| AppError::Query(format!("Eager collect: {}", e)))
            })
            .join()
            .map_err(|e| AppError::Internal(format!("Thread join error: {:?}", e)))?
        })
    }

    fn collect_streaming(&self, lf: LazyFrame) -> Result<edatime_core::types::DataFrame, AppError> {
        std::thread::scope(|s| {
            s.spawn(|| {
                lf.with_new_streaming(true)
                    .collect()
                    .map_err(|e| AppError::Query(format!("Streaming collect: {}", e)))
            })
            .join()
            .map_err(|e| AppError::Internal(format!("Thread join error: {:?}", e)))?
        })
    }

    fn collect_parallel(&self, lf: LazyFrame) -> Result<edatime_core::types::DataFrame, AppError> {
        self.thread_pool.install(|| {
            lf.collect()
                .map_err(|e| AppError::Query(format!("Parallel collect: {}", e)))
        })
    }
}

fn build_default_pool() -> Arc<ThreadPool> {
    let workers = configured_worker_count(
        std::env::var(QUERY_THREADS_ENV).ok().as_deref(),
        std::thread::available_parallelism()
            .map(|parallelism| parallelism.get())
            .unwrap_or(1),
    );
    Arc::new(
        rayon::ThreadPoolBuilder::new()
            .num_threads(workers)
            .thread_name(|i| format!("edatime-cpu-{i}"))
            .build()
            .unwrap(),
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
mod tests {
    use super::{AdmissionMetricsGuard, QueryAdmission, configured_worker_count};
    use edatime_core::error::AppError;
    use edatime_core::metrics::{AppMetrics, CpuStage};
    use std::sync::Arc;
    use std::time::Duration;

    #[test]
    fn query_worker_count_is_capped_by_available_parallelism() {
        assert_eq!(configured_worker_count(Some("12"), 6), 6);
        assert_eq!(configured_worker_count(Some("0"), 6), 6);
        assert_eq!(configured_worker_count(Some("invalid"), 16), 8);
        assert_eq!(configured_worker_count(None, 2), 2);
    }

    #[tokio::test]
    async fn admission_has_independent_bounded_interactive_and_background_lanes() {
        let admission = QueryAdmission::new(1, 1, 1, 1, Duration::from_millis(50));
        let interactive = admission
            .acquire_interactive()
            .await
            .expect("interactive permit");
        assert!(
            admission
                .interactive
                .running
                .clone()
                .try_acquire_owned()
                .is_err()
        );

        let background = admission
            .acquire_background()
            .await
            .expect("background permit");
        assert!(
            admission
                .background
                .running
                .clone()
                .try_acquire_owned()
                .is_err()
        );

        drop(interactive);
        assert!(
            admission
                .interactive
                .running
                .clone()
                .try_acquire_owned()
                .is_ok()
        );
        drop(background);
        assert!(
            admission
                .background
                .running
                .clone()
                .try_acquire_owned()
                .is_ok()
        );
    }

    #[tokio::test]
    async fn admission_rejects_when_the_bounded_waiting_room_is_full() {
        let admission = QueryAdmission::new(1, 1, 1, 1, Duration::from_secs(1));
        let running = admission
            .acquire_interactive()
            .await
            .expect("running permit");
        let queued_admission = admission.clone();
        let queued = tokio::spawn(async move { queued_admission.acquire_interactive().await });
        tokio::task::yield_now().await;

        let rejected = admission
            .acquire_interactive()
            .await
            .expect_err("second waiter must be rejected");
        assert!(matches!(rejected, AppError::Overloaded(_)));

        drop(running);
        assert!(queued.await.expect("queued task join").is_ok());
    }

    #[tokio::test]
    async fn admission_times_out_a_queued_worker() {
        let admission = QueryAdmission::new(1, 1, 1, 1, Duration::from_millis(5));
        let _running = admission
            .acquire_interactive()
            .await
            .expect("running permit");
        let rejected = admission
            .acquire_interactive()
            .await
            .expect_err("queued worker must time out");
        assert!(matches!(rejected, AppError::Overloaded(_)));
    }

    #[test]
    fn cancelled_admission_guard_balances_queue_metrics() {
        let metrics = Arc::new(AppMetrics::new());
        drop(AdmissionMetricsGuard::submitted(
            Some(Arc::clone(&metrics)),
            CpuStage::Analytics,
        ));
        let snapshot = metrics.snapshot(0, 0).cpu_admission;
        assert_eq!(snapshot.submitted_total, 1);
        assert_eq!(snapshot.cancelled_total, 1);
        assert_eq!(snapshot.queued, 0);
        assert_eq!(snapshot.running, 0);
    }
}
