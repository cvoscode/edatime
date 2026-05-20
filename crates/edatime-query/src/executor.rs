//! Query executor with proper thread pool separation.
//! CPU-bound Polars work runs on Rayon pool via spawn_blocking.
//! Async handler awaits the blocking handle.

use edatime_core::error::AppError;
use edatime_core::types::LazyFrame;
use std::sync::Arc;
use rayon::ThreadPool;

#[derive(Clone)]
pub enum ExecutionContext {
    Eager,
    Streaming,
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
                .thread_name(|i| format!("edatime-cpu-{}", i))
                .build()
                .unwrap(),
        );
        Self { ctx, thread_pool: pool }
    }

    pub async fn execute_async(&self, lf: LazyFrame) -> Result<edatime_core::types::DataFrame, AppError> {
        let pool = Arc::clone(&self.thread_pool);
        let ctx = self.ctx.clone();
        tokio::task::spawn_blocking(move || {
            pool.install(|| {
                match ctx {
                    ExecutionContext::Eager => lf.collect(),
                    ExecutionContext::Streaming | ExecutionContext::Parallel => {
                        lf.with_new_streaming(true).collect()
                    }
                }
            })
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
