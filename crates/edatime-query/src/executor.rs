//! Query executor with proper thread pool separation.
//! CPU-bound Polars work runs on Rayon pool via spawn_blocking.
//! Async handler awaits the blocking handle.

use edatime_core::error::AppError;
use edatime_core::metrics::{AppMetrics, CpuStage};
use edatime_core::types::LazyFrame;
use rayon::ThreadPool;
use std::sync::Arc;

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
}

impl QueryExecutor {
    pub fn new(ctx: ExecutionContext) -> Self {
        Self {
            ctx,
            thread_pool: build_default_pool(),
            metrics: None,
        }
    }

    /// Attach a metrics handle so the executor records `Query` CPU
    /// admission lifecycle events around every `execute_async` call.
    pub fn with_metrics(mut self, metrics: Arc<AppMetrics>) -> Self {
        self.metrics = Some(metrics);
        self
    }

    pub async fn execute_async(
        &self,
        lf: LazyFrame,
    ) -> Result<edatime_core::types::DataFrame, AppError> {
        let pool = Arc::clone(&self.thread_pool);
        let ctx = self.ctx.clone();
        let metrics = self.metrics.clone();
        let queue_start = std::time::Instant::now();
        if let Some(metrics) = metrics.as_ref() {
            metrics.record_cpu_submit(CpuStage::Query);
        }
        tokio::task::spawn_blocking(move || {
            if let Some(metrics) = metrics.as_ref() {
                let queue_wait_ns = queue_start.elapsed().as_nanos() as u64;
                metrics.record_cpu_started(CpuStage::Query, queue_wait_ns);
            }
            let result = pool.install(|| match ctx {
                ExecutionContext::Eager => lf.collect(),
                ExecutionContext::Streaming | ExecutionContext::Parallel => {
                    lf.with_new_streaming(true).collect()
                }
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
    Arc::new(
        rayon::ThreadPoolBuilder::new()
            .num_threads(4)
            .thread_name(|i| format!("edatime-cpu-{i}"))
            .build()
            .unwrap(),
    )
}
