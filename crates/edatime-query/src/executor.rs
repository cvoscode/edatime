//! Query executor with proper thread pool separation.
//! CPU-bound Polars work runs on Rayon pool via spawn_blocking.
//! Async handler awaits the blocking handle.

use edatime_core::cancellation::{CancellationHandle, CancellationProbe, cancellation_pair};
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
    async fn acquire_queued(&self) -> Result<OwnedSemaphorePermit, AppError> {
        if let Ok(permit) = Arc::clone(&self.running).try_acquire_owned() {
            return Ok(permit);
        }
        let _queued = Arc::clone(&self.waiting)
            .try_acquire_owned()
            .map_err(|_| AppError::overloaded("background work queue is full"))?;
        Arc::clone(&self.running)
            .acquire_owned()
            .await
            .map_err(|_| AppError::internal("background work admission closed"))
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
        cancellation: Option<CancellationProbe>,
        work: F,
    ) -> Result<T, AppError>
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
                return Err(AppError::Cancelled(
                    "interactive request cancelled".to_string(),
                ));
            }
            Ok(result)
        })
        .await
        .map_err(|error| AppError::internal(format!("Blocking worker join error: {error}")))?
    }

    pub async fn run_interactive<T, F>(&self, stage: CpuStage, work: F) -> Result<T, AppError>
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
    ) -> Result<T, AppError>
    where
        T: Send + 'static,
        F: FnOnce(CancellationProbe) -> T + Send + 'static,
    {
        let (handle, probe) = cancellation_pair();
        let _cancel_on_drop = CancelOnDrop(handle);
        self.run_admitted(WorkClass::Interactive, stage, Some(probe), move |probe| {
            work(probe.expect("cancellable work always receives a probe"))
        })
        .await
    }

    pub async fn run_background<T, F>(&self, stage: CpuStage, work: F) -> Result<T, AppError>
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
    pub async fn run_queued_background<T, F>(&self, stage: CpuStage, work: F) -> Result<T, AppError>
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
    ) -> Result<edatime_core::types::DataFrame, AppError> {
        let ctx = self.ctx.clone();
        self.run_queued_background(CpuStage::Query, move || match ctx {
            ExecutionContext::Eager | ExecutionContext::Parallel => lf.collect(),
            ExecutionContext::Streaming => lf.with_new_streaming(true).collect(),
        })
        .await?
        .map_err(|e| AppError::Query(format!("Collect: {}", e)))
    }

    pub async fn run_blocking_io<T, F>(&self, stage: CpuStage, work: F) -> Result<T, AppError>
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
    ) -> Result<T, AppError>
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
        self.sink_parquet_with_resources(lf, path, ()).await
    }

    /// Retain input files and admission guards until the sink worker exits,
    /// including when the awaiting request is dropped.
    pub async fn sink_parquet_with_resources<R: Send + 'static>(
        &self,
        lf: LazyFrame,
        path: PathBuf,
        resources: R,
    ) -> Result<(), AppError> {
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
            let _resources = resources;
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
    use super::{
        AdmissionMetricsGuard, ExecutionContext, QueryAdmission, QueryExecutor,
        configured_worker_count,
    };
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
    async fn session_jobs_wait_past_http_deadline_with_bounded_queue() {
        let admission = QueryAdmission::new(1, 1, 1, 1, Duration::from_millis(5));
        let running = admission.acquire_background().await.expect("running job");
        let waiting = admission.background.acquire_queued();
        tokio::pin!(waiting);
        assert!(
            tokio::time::timeout(Duration::from_millis(20), &mut waiting)
                .await
                .is_err()
        );
        assert!(matches!(
            admission.background.acquire_queued().await,
            Err(AppError::Overloaded(_))
        ));
        drop(running);
        let admitted = waiting.await.expect("session job remains queued");
        assert_eq!(admission.background.waiting.available_permits(), 1);
        drop(admitted);
        assert_eq!(admission.background.running.available_permits(), 1);
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

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn cancelled_request_keeps_interactive_permit_until_worker_exits() {
        let executor = Arc::new(
            QueryExecutor::new(ExecutionContext::Parallel).with_admission(
                1,
                1,
                1,
                1,
                Duration::from_millis(10),
            ),
        );
        let (started_tx, started_rx) = std::sync::mpsc::sync_channel(1);
        let (cancelled_tx, cancelled_rx) = std::sync::mpsc::sync_channel(1);
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let (finished_tx, finished_rx) = std::sync::mpsc::sync_channel(1);
        let worker = Arc::clone(&executor);
        let request = tokio::spawn(async move {
            worker
                .run_interactive_cancellable(CpuStage::Scatter, move |probe| {
                    started_tx.send(()).expect("signal worker start");
                    while !probe.is_cancelled() {
                        std::thread::sleep(Duration::from_millis(1));
                    }
                    cancelled_tx.send(()).expect("signal cancellation");
                    release_rx.recv().expect("wait for worker release");
                    finished_tx.send(()).expect("signal worker finish");
                })
                .await
        });

        started_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("worker started");
        request.abort();
        let _ = request.await;
        cancelled_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("worker observed caller cancellation");
        assert!(matches!(
            executor.run_interactive(CpuStage::Scatter, || ()).await,
            Err(AppError::Overloaded(_))
        ));

        release_tx.send(()).expect("release worker");
        finished_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("worker finished");
        executor
            .run_interactive(CpuStage::Scatter, || ())
            .await
            .expect("worker released its admission permit");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn concurrent_interactive_work_keeps_tokio_tasks_responsive() {
        let executor = Arc::new(
            QueryExecutor::new(ExecutionContext::Parallel).with_admission(
                2,
                1,
                1,
                1,
                Duration::from_secs(1),
            ),
        );
        let heartbeat_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let heartbeat_counter = Arc::clone(&heartbeat_count);
        let heartbeat = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(2));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                interval.tick().await;
                heartbeat_counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            }
        });
        let first_executor = Arc::clone(&executor);
        let second_executor = Arc::clone(&executor);
        let first_counter = Arc::clone(&heartbeat_count);
        let second_counter = Arc::clone(&heartbeat_count);
        let work = async move {
            tokio::join!(
                first_executor.run_interactive(CpuStage::Scatter, move || {
                    wait_for_heartbeat(first_counter)
                }),
                second_executor.run_interactive(CpuStage::Scatter, move || {
                    wait_for_heartbeat(second_counter)
                }),
            )
        };
        let results = tokio::time::timeout(Duration::from_secs(2), work)
            .await
            .expect("interactive workers should finish");
        heartbeat.abort();
        assert!(results.0.expect("first worker") >= 3);
        assert!(results.1.expect("second worker") >= 3);
    }

    fn wait_for_heartbeat(counter: Arc<std::sync::atomic::AtomicUsize>) -> usize {
        let deadline = std::time::Instant::now() + Duration::from_secs(1);
        while counter.load(std::sync::atomic::Ordering::Relaxed) < 3
            && std::time::Instant::now() < deadline
        {
            std::thread::sleep(Duration::from_millis(1));
        }
        counter.load(std::sync::atomic::Ordering::Relaxed)
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn dropping_cancellable_work_signals_its_worker_and_records_cancellation() {
        let metrics = Arc::new(AppMetrics::new());
        let executor = Arc::new(
            QueryExecutor::new(ExecutionContext::Parallel).with_metrics(Arc::clone(&metrics)),
        );
        let (started_tx, started_rx) = std::sync::mpsc::sync_channel(1);
        let (cancelled_tx, cancelled_rx) = std::sync::mpsc::sync_channel(1);
        let worker = Arc::clone(&executor);
        let task = tokio::spawn(async move {
            worker
                .run_interactive_cancellable(CpuStage::Analytics, move |probe| {
                    started_tx.send(()).expect("signal worker start");
                    loop {
                        if probe.is_cancelled() {
                            cancelled_tx.send(()).expect("signal cancellation");
                            break;
                        }
                        std::thread::sleep(Duration::from_millis(1));
                    }
                })
                .await
        });

        started_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("worker started");
        task.abort();
        let _ = task.await;
        cancelled_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("worker observed cancellation");

        tokio::time::timeout(Duration::from_secs(1), async {
            loop {
                if metrics.snapshot(0, 0).cpu_admission.cancelled_total == 1 {
                    return;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("worker cancellation metric recorded");
        let snapshot = metrics.snapshot(0, 0).cpu_admission;
        assert_eq!(snapshot.cancelled_total, 1);
        assert_eq!(snapshot.running, 0);
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
