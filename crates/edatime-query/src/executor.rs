//! Query executor with proper thread pool separation.
//! CPU-bound Polars work runs on Rayon pool via spawn_blocking.
//! Async handler awaits the blocking handle.

use edatime_core::error::AppError;
use edatime_core::metrics::{AppMetrics, CpuStage};
use edatime_core::types::LazyFrame;
use rayon::ThreadPool;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

const DEFAULT_QUERY_WORKER_CAP: usize = 8;
const QUERY_THREADS_ENV: &str = "EDATIME_QUERY_THREADS";

/// Bounded admission lanes for executor-owned work. Interactive collections
/// and sink-backed materialization/export intentionally do not compete for the
/// same permit: a long durable write must not consume every viewport slot.
#[derive(Clone)]
struct QueryAdmission {
    interactive: Arc<Semaphore>,
    background: Arc<Semaphore>,
}

impl QueryAdmission {
    fn new(max_interactive: usize, max_background: usize) -> Self {
        Self {
            interactive: Arc::new(Semaphore::new(max_interactive.max(1))),
            background: Arc::new(Semaphore::new(max_background.max(1))),
        }
    }

    async fn acquire_interactive(&self) -> Result<OwnedSemaphorePermit, AppError> {
        Arc::clone(&self.interactive)
            .acquire_owned()
            .await
            .map_err(|_| AppError::internal("Interactive query admission closed"))
    }

    async fn acquire_background(&self) -> Result<OwnedSemaphorePermit, AppError> {
        Arc::clone(&self.background)
            .acquire_owned()
            .await
            .map_err(|_| AppError::internal("Background query admission closed"))
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
    pub fn with_admission(mut self, max_interactive: usize, max_background: usize) -> Self {
        self.admission = Some(QueryAdmission::new(max_interactive, max_background));
        self
    }

    pub async fn execute_async(
        &self,
        lf: LazyFrame,
    ) -> Result<edatime_core::types::DataFrame, AppError> {
        let pool = Arc::clone(&self.thread_pool);
        let ctx = self.ctx.clone();
        let metrics = self.metrics.clone();
        let admission = self.admission.clone();
        let queue_start = std::time::Instant::now();
        if let Some(metrics) = metrics.as_ref() {
            metrics.record_cpu_submit(CpuStage::Query);
        }
        // Move the permit into the blocking task. Dropping an HTTP future does
        // not cancel Tokio's blocking task, so the permit remains held until
        // Polars has safely finished and cannot admit an unbounded replacement.
        let permit = match admission {
            Some(admission) => Some(admission.acquire_interactive().await?),
            None => None,
        };
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            if let Some(metrics) = metrics.as_ref() {
                let queue_wait_ns = queue_start.elapsed().as_nanos() as u64;
                metrics.record_cpu_started(CpuStage::Query, queue_wait_ns);
            }
            let result = pool.install(|| match ctx {
                ExecutionContext::Eager | ExecutionContext::Parallel => lf.collect(),
                ExecutionContext::Streaming => lf.with_new_streaming(true).collect(),
            });
            if let Some(metrics) = metrics.as_ref() {
                metrics.record_cpu_completed(CpuStage::Query);
            }
            result
        })
        .await
        .map_err(|e| AppError::Internal(format!("Join error: {}", e)))?
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
        let metrics = self.metrics.clone();
        let admission = self.admission.clone();
        let queue_start = std::time::Instant::now();
        if let Some(metrics) = metrics.as_ref() {
            metrics.record_cpu_submit(CpuStage::Materialization);
        }
        let permit = match admission {
            Some(admission) => Some(admission.acquire_background().await?),
            None => None,
        };
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            if let Some(metrics) = metrics.as_ref() {
                metrics.record_cpu_started(
                    CpuStage::Materialization,
                    queue_start.elapsed().as_nanos() as u64,
                );
            }
            // Polars' file sink owns an async IO runtime internally. Run it on
            // a plain child thread so it is not nested inside Tokio's runtime
            // context inherited by `spawn_blocking`.
            let result = std::thread::spawn(move || {
                pool.install(|| sink.with_new_streaming(true).collect())
            })
            .join()
            .map_err(|_| AppError::internal("Parquet sink thread panicked"))?
            .map(|_| ())
            .map_err(|error| AppError::Query(format!("Write Parquet sink: {error}")));
            if let Some(metrics) = metrics.as_ref() {
                metrics.record_cpu_completed(CpuStage::Materialization);
            }
            result
        })
        .await
        .map_err(|error| AppError::internal(format!("Join Parquet sink: {error}")))?
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
    use super::{QueryAdmission, configured_worker_count};

    #[test]
    fn query_worker_count_is_capped_by_available_parallelism() {
        assert_eq!(configured_worker_count(Some("12"), 6), 6);
        assert_eq!(configured_worker_count(Some("0"), 6), 6);
        assert_eq!(configured_worker_count(Some("invalid"), 16), 8);
        assert_eq!(configured_worker_count(None, 2), 2);
    }

    #[tokio::test]
    async fn admission_has_independent_bounded_interactive_and_background_lanes() {
        let admission = QueryAdmission::new(0, 0);
        let interactive = admission
            .acquire_interactive()
            .await
            .expect("interactive permit");
        assert!(admission.interactive.clone().try_acquire_owned().is_err());

        let background = admission
            .acquire_background()
            .await
            .expect("background permit");
        assert!(admission.background.clone().try_acquire_owned().is_err());

        drop(interactive);
        assert!(admission.interactive.clone().try_acquire_owned().is_ok());
        drop(background);
        assert!(admission.background.clone().try_acquire_owned().is_ok());
    }
}
