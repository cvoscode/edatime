use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::AtomicUsize;

use chrono::Utc;
use polars::prelude::{DataFrame, DataType, LazyFrame, ScanArgsParquet, SchemaExt, len};
use serde::Serialize;
use serde_json::Value;
use tokio::sync::{RwLock, Semaphore};

use crate::artifacts::{
    ArtifactStorageUsage, DatasetArtifactDescriptor, DatasetArtifactProvenance,
    DatasetArtifactStore,
};
use crate::cache::{CorrelationMatrixCacheEntry, ResponseCache, WorkingCorrelationCache};
use crate::db::DbPool;
use crate::jobs::{JobHandle, JobRegistry};
use crate::repository::{DataRepository, DatasetMeta, InMemoryDataRepository};
use crate::versions::{
    DatasetVersionRecord, DatasetVersionRegistry, ResidentVersionIdentity,
    VersionRetentionSnapshot, fingerprints_for_frame,
};
use edatime_core::config::AppConfig;
use edatime_core::error::AppError;
use edatime_core::metrics::{AppMetrics, CpuStage};
use edatime_core::temporal::{TsContext, ts_context};
use edatime_query::executor::{ExecutionContext, QueryExecutor};
use edatime_query::query::QueryEntry;

/// Own the pending/final file until activation. Keeping this guard with the
/// worker result also removes an unpublished artifact if its caller is
/// cancelled during fingerprinting or while waiting for source metadata.
struct UnpublishedArtifactCleanup {
    store: Arc<DatasetArtifactStore>,
    version_id: Option<String>,
}

impl UnpublishedArtifactCleanup {
    fn preserve(&mut self) {
        self.version_id = None;
    }
}

impl Drop for UnpublishedArtifactCleanup {
    fn drop(&mut self) {
        if let Some(version_id) = &self.version_id {
            self.store.discard_unpublished_lazy_parquet(version_id);
        }
    }
}

/// Live database connection state, set after a successful `/api/v1/database/connect`.
#[derive(Clone, Debug)]
pub struct DbConnectionInfo {
    pub schema: String,
    pub table: String,
    pub time_column: Option<String>,
}

/// A version-keyed completed or in-progress profile. The data payload stays
/// JSON at the store boundary so `edatime-store` does not depend on the HTTP
/// DTO crate that owns the profile schema.
#[derive(Clone, Debug)]
pub struct ProfileCacheEntry {
    pub job_id: String,
    pub result: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetainedStateSnapshot {
    pub versions: VersionRetentionSnapshot,
    pub artifacts: ArtifactStorageUsage,
    pub jobs: crate::jobs::JobRegistrySnapshot,
    pub profile_entries: usize,
    pub immediate_metadata_entries: usize,
}

#[allow(clippy::clone_on_ref_ptr)]
pub struct AppState {
    pub repository: Arc<dyn DataRepository>,
    pub dataset_versions: Arc<DatasetVersionRegistry>,
    pub artifact_store: Option<Arc<DatasetArtifactStore>>,
    pub query_executor: Arc<QueryExecutor>,
    pub jobs: Arc<JobRegistry>,
    pub cache: Arc<ResponseCache>,
    pub metrics: Arc<AppMetrics>,
    pub config: Arc<AppConfig>,
    /// Admission gate for uploads through decode and dataset replacement.
    /// The wire body has its own byte limit; this gate prevents concurrent
    /// parser/dataframe peaks from accumulating in process memory.
    pub upload_admission: Arc<Semaphore>,
    /// Bytes reserved by uploads admitted through decode. The reservation is
    /// conservative and complements (rather than replaces) the concurrency
    /// semaphore and wire-size limit.
    pub upload_memory_reserved: Arc<AtomicUsize>,
    pub db_pool: Arc<RwLock<Option<Arc<DbPool>>>>,
    pub db_info: Arc<RwLock<Option<DbConnectionInfo>>>,
    pub correlation_matrix_cache: Arc<Mutex<Option<(u64, CorrelationMatrixCacheEntry)>>>,
    correlation_single_flight:
        Arc<tokio::sync::Mutex<BTreeMap<u64, std::sync::Weak<tokio::sync::Mutex<()>>>>>,
    /// Bounded compiled working plans, keyed by immutable source and semantic hash.
    pub working_plan_cache: Arc<Mutex<BTreeMap<(String, String), LazyFrame>>>,
    /// Working matrices by source, plan and metric, with per-entry single flight.
    pub working_correlation_cache: Arc<tokio::sync::Mutex<WorkingCorrelationCache>>,
    pub profile_cache: Arc<Mutex<BTreeMap<String, ProfileCacheEntry>>>,
    immediate_metadata_cache: Arc<Mutex<BTreeMap<String, Value>>>,
    pub query_log: Arc<Mutex<VecDeque<QueryEntry>>>,
    pub query_counter: Arc<std::sync::atomic::AtomicU64>,
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            repository: Arc::clone(&self.repository),
            dataset_versions: Arc::clone(&self.dataset_versions),
            artifact_store: self.artifact_store.clone(),
            query_executor: Arc::clone(&self.query_executor),
            jobs: Arc::clone(&self.jobs),
            cache: Arc::clone(&self.cache),
            metrics: Arc::clone(&self.metrics),
            config: Arc::clone(&self.config),
            upload_admission: Arc::clone(&self.upload_admission),
            upload_memory_reserved: Arc::clone(&self.upload_memory_reserved),
            db_pool: Arc::clone(&self.db_pool),
            db_info: Arc::clone(&self.db_info),
            correlation_matrix_cache: Arc::clone(&self.correlation_matrix_cache),
            correlation_single_flight: Arc::clone(&self.correlation_single_flight),
            working_plan_cache: Arc::clone(&self.working_plan_cache),
            working_correlation_cache: Arc::clone(&self.working_correlation_cache),
            profile_cache: Arc::clone(&self.profile_cache),
            immediate_metadata_cache: Arc::clone(&self.immediate_metadata_cache),
            query_log: Arc::clone(&self.query_log),
            query_counter: Arc::clone(&self.query_counter),
        }
    }
}

impl AppState {
    pub fn new(df: DataFrame, config: AppConfig) -> Self {
        let can_restore_catalog = df.width() == 0 && df.height() == 0;
        let mut dataset_versions = Arc::new(DatasetVersionRegistry::new(df.clone(), 0, None));
        let repository = Arc::new(InMemoryDataRepository::new(df));
        let artifact_store = config.data.artifact_dir.as_ref().map(|path| {
            Arc::new(DatasetArtifactStore::with_max_bytes(
                path,
                config.data.max_artifact_bytes,
            ))
        });
        if let Some(store) = &artifact_store
            && let Err(error) = store.recover_temporary_files()
        {
            tracing::warn!("Could not clean interrupted managed artifact writes: {error}");
        }
        if can_restore_catalog && let Some(store) = &artifact_store {
            match store.load_catalog() {
                Ok(catalog) if !catalog.is_empty() => {
                    let restored = Arc::new(DatasetVersionRegistry::empty());
                    match restored.restore_artifacts(catalog.clone()) {
                        Ok(_) => {
                            let current = restored.current();
                            let descriptor = current.as_ref().ok().and_then(|record| {
                                catalog.iter().find(|entry| entry.version_id == record.id)
                            });
                            let attached = current.and_then(|record| {
                                let provenance = descriptor
                                    .and_then(|entry| entry.provenance.as_ref())
                                    .ok_or_else(|| {
                                        AppError::internal(
                                            "Restored artifact unexpectedly has no provenance",
                                        )
                                    })?;
                                repository.replace_from_lazyframe(
                                    restored.snapshot(&record.id)?,
                                    DatasetMeta {
                                        row_count: provenance.row_count,
                                        column_names: provenance.column_names.clone(),
                                        time_column: record.time_column.clone(),
                                    },
                                )?;
                                Ok::<_, AppError>(())
                            });
                            if let Err(error) = attached {
                                tracing::warn!(
                                    "Could not attach restored artifact catalog: {error}"
                                );
                            } else {
                                dataset_versions = restored;
                                tracing::info!(
                                    "Restored {} retained dataset versions",
                                    catalog.len()
                                );
                            }
                        }
                        Err(error) => tracing::warn!("Could not restore artifact catalog: {error}"),
                    }
                }
                Ok(_) => {}
                Err(error) => tracing::warn!("Could not read artifact catalog: {error}"),
            }
        }
        let cache = Arc::new(ResponseCache::new(crate::cache::CacheConfig {
            ttl: std::time::Duration::from_secs(config.cache.ttl_seconds.max(1)),
            max_entries: config.cache.max_entries.max(1),
            max_bytes: config.cache.max_bytes.max(1024),
        }));
        let metrics = Arc::new(AppMetrics::new());
        let max_stored = config.query.max_stored.max(1);
        // QueryExecutor uses Streaming mode by default for memory
        // efficiency. Phase 0.1: attach the metrics handle so every
        // `execute_async` call records `Query` CPU admission lifecycle.
        let query_executor = Arc::new(
            QueryExecutor::new(ExecutionContext::Streaming)
                .with_metrics(Arc::clone(&metrics))
                .with_admission(
                    config.query.max_interactive_concurrency,
                    config.query.max_background_concurrency,
                    config.query.max_blocking_io_concurrency,
                    config.query.max_queued_per_class,
                    std::time::Duration::from_millis(config.query.queue_timeout_ms.max(1)),
                ),
        );
        let jobs = Arc::new(JobRegistry::with_retention(
            config.retention.max_terminal_jobs,
            config.retention.terminal_job_ttl_seconds,
        ));
        let correlation_cache_max_bytes = config.cache.max_bytes.max(1024);
        let upload_admission =
            Arc::new(Semaphore::new(config.upload.max_concurrent_uploads.max(1)));
        Self {
            repository,
            dataset_versions,
            artifact_store,
            query_executor,
            jobs,
            cache,
            metrics,
            config: Arc::new(config),
            upload_admission,
            upload_memory_reserved: Arc::new(AtomicUsize::new(0)),
            db_pool: Arc::new(RwLock::new(None)),
            db_info: Arc::new(RwLock::new(None)),
            correlation_matrix_cache: Arc::new(Mutex::new(None)),
            correlation_single_flight: Arc::new(tokio::sync::Mutex::new(BTreeMap::new())),
            working_plan_cache: Arc::new(Mutex::new(BTreeMap::new())),
            working_correlation_cache: Arc::new(tokio::sync::Mutex::new(
                WorkingCorrelationCache::new(correlation_cache_max_bytes),
            )),
            profile_cache: Arc::new(Mutex::new(BTreeMap::new())),
            immediate_metadata_cache: Arc::new(Mutex::new(BTreeMap::new())),
            query_log: Arc::new(Mutex::new(VecDeque::with_capacity(max_stored))),
            query_counter: Arc::new(std::sync::atomic::AtomicU64::new(0)),
        }
    }

    pub async fn has_db_connection(&self) -> bool {
        self.db_pool.read().await.is_some()
    }

    /// Return a snapshot LazyFrame — no lock involved.
    /// Cloning LazyFrame is cheap (~microseconds).
    pub fn dataset_snapshot(&self) -> LazyFrame {
        self.repository.snapshot()
    }

    /// Resolve an immutable source/baseline snapshot for a plan-aware request.
    pub fn dataset_snapshot_for_version(&self, version_id: &str) -> Result<LazyFrame, AppError> {
        self.dataset_versions.snapshot(version_id)
    }

    pub fn current_dataset_version(&self) -> Result<DatasetVersionRecord, AppError> {
        self.dataset_versions.current()
    }

    pub fn dataset_versions(&self) -> Result<Vec<DatasetVersionRecord>, AppError> {
        self.dataset_versions.list()
    }

    pub fn version_retention_snapshot(&self) -> Result<VersionRetentionSnapshot, AppError> {
        self.dataset_versions.retention_snapshot()
    }

    pub fn retained_state_snapshot(&self) -> Result<RetainedStateSnapshot, AppError> {
        Ok(RetainedStateSnapshot {
            versions: self.version_retention_snapshot()?,
            artifacts: self.artifact_storage_usage()?,
            jobs: self.jobs.snapshot(),
            profile_entries: self
                .profile_cache
                .lock()
                .map(|cache| cache.len())
                .unwrap_or_else(|error| error.into_inner().len()),
            immediate_metadata_entries: self
                .immediate_metadata_cache
                .lock()
                .map(|cache| cache.len())
                .unwrap_or_else(|error| error.into_inner().len()),
        })
    }

    pub fn artifact_storage_usage(&self) -> Result<ArtifactStorageUsage, AppError> {
        match &self.artifact_store {
            Some(store) => store.usage(),
            None => Ok(ArtifactStorageUsage {
                enabled: false,
                artifact_count: 0,
                used_bytes: 0,
                max_bytes: None,
            }),
        }
    }

    /// Keep a bounded set of complete retained version lineages. The active
    /// lineage is mandatory; newer independent chains are added only while
    /// they fit the configured cap, so pruning can never make catalog recovery
    /// refer to a missing parent.
    fn enforce_artifact_retention(&self, active_id: &str) -> Result<(), AppError> {
        let Some(limit) = self.config.data.max_artifact_versions else {
            return Ok(());
        };
        let Some(store) = &self.artifact_store else {
            return Ok(());
        };
        let catalog_ids = store
            .load_catalog()?
            .into_iter()
            .map(|descriptor| descriptor.version_id)
            .collect::<BTreeSet<_>>();
        let mut retained = self
            .dataset_versions
            .lineage_ids(active_id)?
            .into_iter()
            .filter(|id| catalog_ids.contains(id))
            .collect::<BTreeSet<_>>();
        if retained.len() > limit {
            tracing::warn!(
                configured_limit = limit,
                mandatory_lineage = retained.len(),
                "Managed artifact retention cap is smaller than the active lineage; preserving recovery"
            );
        } else {
            let mut candidates = self.dataset_versions.list()?;
            candidates.sort_by_key(|record| std::cmp::Reverse(record.created_at));
            for candidate in candidates {
                if !catalog_ids.contains(&candidate.id) || retained.contains(&candidate.id) {
                    continue;
                }
                let lineage = self
                    .dataset_versions
                    .lineage_ids(&candidate.id)?
                    .into_iter()
                    .filter(|id| catalog_ids.contains(id))
                    .collect::<BTreeSet<_>>();
                let prospective = retained.union(&lineage).count();
                if prospective <= limit {
                    retained.extend(lineage);
                }
            }
        }
        store.prune_except(&retained)?;
        self.dataset_versions.retain_ids(&retained)?;
        Ok(())
    }

    /// Clone only the requested columns from the shared frame.
    /// Returns LazyFrame with projection; callers collect if needed.
    pub async fn dataset_snapshot_for_columns(
        &self,
        columns: &[&str],
    ) -> Result<LazyFrame, AppError> {
        let lf = self.repository.snapshot();
        let schema = lf
            .clone()
            .collect_schema()
            .map_err(|e| AppError::internal(format!("LazyFrame schema unavailable: {}", e)))?;
        let col_names: Vec<String> = schema
            .iter_fields()
            .filter(|f| columns.iter().any(|&col| col == f.name().as_str()))
            .map(|f| f.name().to_string())
            .collect();

        if col_names.is_empty() {
            Ok(lf.clone())
        } else {
            Ok(lf.clone().select(
                col_names
                    .iter()
                    .map(|s| polars::prelude::col(s.as_str()))
                    .collect::<Vec<_>>(),
            ))
        }
    }

    pub async fn replace_dataset(&self, df: DataFrame) -> Result<u64, AppError> {
        self.replace_dataset_with_time_column(df, None).await
    }

    pub async fn replace_dataset_with_time_column(
        &self,
        df: DataFrame,
        time_column: Option<String>,
    ) -> Result<u64, AppError> {
        let rev = if let Some(store) = &self.artifact_store {
            let version_id = self.dataset_versions.allocate_artifact_version_id();
            let store = Arc::clone(store);
            let writer_store = Arc::clone(&store);
            let artifact_frame = df.clone();
            let (mut descriptor, row_count, column_names) = self
                .query_executor
                .run_background(CpuStage::Materialization, move || {
                    let (content_fingerprint, _) = fingerprints_for_frame(&artifact_frame);
                    let (row_count, column_names) = frame_metadata(&artifact_frame);
                    let descriptor = writer_store.write_parquet(
                        version_id,
                        content_fingerprint,
                        Utc::now(),
                        artifact_frame,
                    )?;
                    Ok::<_, AppError>((descriptor, row_count, column_names))
                })
                .await??;
            let rev = self.repository.replace_from_dataframe(df)?;
            let record = self.dataset_versions.register_root_artifact(
                descriptor.clone(),
                rev,
                None,
                time_column.clone(),
            )?;
            descriptor.provenance = Some(provenance_from_record(&record, row_count, column_names));
            store.publish(descriptor)?;
            self.enforce_artifact_retention(&record.id)?;
            rev
        } else {
            let identity_frame = df.clone();
            let (resident_bytes, dataset_fingerprint, schema_fingerprint) = self
                .query_executor
                .run_background(CpuStage::Materialization, move || {
                    let resident_bytes = identity_frame.estimated_size() as u64;
                    let (dataset_fingerprint, schema_fingerprint) =
                        fingerprints_for_frame(&identity_frame);
                    (resident_bytes, dataset_fingerprint, schema_fingerprint)
                })
                .await?;
            let identity = ResidentVersionIdentity {
                resident_bytes,
                dataset_fingerprint,
                schema_fingerprint,
            };
            self.dataset_versions.ensure_resident_registration_fits(
                None,
                identity.resident_bytes,
                self.config.retention.max_resident_versions,
                self.config.retention.max_resident_bytes,
            )?;
            let rev = self.repository.replace_from_dataframe(df.clone())?;
            self.dataset_versions.register_root_with_identity(
                df,
                rev,
                None,
                time_column.clone(),
                identity,
            )?;
            self.dataset_versions.enforce_resident_retention(
                self.config.retention.max_resident_versions,
                self.config.retention.max_resident_bytes,
            )?;
            rev
        };
        self.repository
            .set_time_column_display_name(time_column.clone());
        // Invalidate cached responses so stale data is never served after upload.
        self.cache.invalidate_all().await;
        self.clear_correlation_matrix_cache();
        Ok(rev)
    }

    async fn finalize_lazy_artifact(
        &self,
        store: &Arc<DatasetArtifactStore>,
        version_id: String,
    ) -> Result<(DatasetArtifactDescriptor, UnpublishedArtifactCleanup), AppError> {
        // Create cleanup before admission so cancellation of a queued worker
        // removes the completed sink output as well.
        let cleanup = UnpublishedArtifactCleanup {
            store: Arc::clone(store),
            version_id: Some(version_id.clone()),
        };
        let worker_store = Arc::clone(store);
        self.query_executor
            .run_blocking_io(CpuStage::Materialization, move || {
                let descriptor = worker_store.finalize_lazy_parquet(version_id, Utc::now())?;
                Ok((descriptor, cleanup))
            })
            .await?
    }

    /// Normalize a lazy ingest plan directly into managed Parquet and activate
    /// a fresh scan-backed root version without collecting the full dataset.
    pub async fn replace_dataset_lazy_root(
        &self,
        frame: LazyFrame,
        source_name: Option<String>,
        time_column: String,
    ) -> Result<DatasetVersionRecord, AppError> {
        self.replace_dataset_lazy_root_with_resources(frame, source_name, time_column, ())
            .await
    }

    pub async fn replace_dataset_lazy_root_with_resources<R: Send + 'static>(
        &self,
        mut frame: LazyFrame,
        source_name: Option<String>,
        time_column: String,
        resources: R,
    ) -> Result<DatasetVersionRecord, AppError> {
        let store = self.artifact_store.as_ref().ok_or_else(|| {
            AppError::internal("Lazy root ingest requires managed artifact storage")
        })?;
        let schema = frame.collect_schema().map_err(|error| {
            AppError::bad_request(format!("Ingest schema unavailable: {error}"))
        })?;
        let column_names = schema
            .iter_names()
            .map(ToString::to_string)
            .collect::<Vec<_>>();
        let version_id = self.dataset_versions.allocate_artifact_version_id();
        let temp = store.prepare_lazy_parquet(&version_id)?;
        if let Err(error) = self
            .query_executor
            .sink_parquet_with_resources(frame, temp, resources)
            .await
        {
            store.discard_pending_lazy_parquet(&version_id);
            return Err(error);
        }
        let (mut descriptor, mut cleanup) = self
            .finalize_lazy_artifact(store, version_id.clone())
            .await?;
        let prepared = async {
            let scan = LazyFrame::scan_parquet(
                descriptor.path.to_string_lossy().as_ref().into(),
                ScanArgsParquet::default(),
            )
            .map_err(|error| {
                AppError::internal(format!("Open ingested Parquet artifact: {error}"))
            })?;
            let count = self
                .query_executor
                .execute_async(
                    scan.clone()
                        .select([len().cast(DataType::UInt64).alias("__row_count")]),
                )
                .await?;
            let row_count = count
                .column("__row_count")
                .ok()
                .and_then(|column| column.u64().ok())
                .and_then(|column| column.get(0))
                .and_then(|value| usize::try_from(value).ok())
                .ok_or_else(|| AppError::internal("Ingested Parquet row count unavailable"))?;
            if row_count == 0 {
                return Err(AppError::bad_request(
                    "No rows loaded for the selected partial range. Reduce skip_rows or increase n_rows.",
                ));
            }
            Ok::<_, AppError>((scan, row_count))
        }
        .await;
        let (scan, row_count) = match prepared {
            Ok(prepared) => prepared,
            Err(error) => {
                store.discard_unpublished_lazy_parquet(&version_id);
                return Err(error);
            }
        };
        let revision = match self.repository.replace_from_lazyframe(
            scan,
            DatasetMeta {
                row_count,
                column_names: column_names.clone(),
                time_column: Some(time_column.clone()),
            },
        ) {
            Ok(revision) => revision,
            Err(error) => {
                store.discard_unpublished_lazy_parquet(&version_id);
                return Err(error);
            }
        };
        cleanup.preserve();
        let record = self.dataset_versions.register_root_artifact(
            descriptor.clone(),
            revision,
            source_name,
            Some(time_column.clone()),
        )?;
        descriptor.provenance = Some(provenance_from_record(&record, row_count, column_names));
        store.publish(descriptor)?;
        self.enforce_artifact_retention(&record.id)?;
        self.cache.invalidate_all().await;
        self.clear_correlation_matrix_cache();
        Ok(record)
    }

    /// Make a plan result the active working dataset while retaining its
    /// immutable parent snapshot in the version registry.
    pub async fn materialize_dataset_child(
        &self,
        parent_id: &str,
        df: DataFrame,
        plan_hash: String,
        time_column: Option<String>,
    ) -> Result<DatasetVersionRecord, AppError> {
        // Resolve the parent before replacing the compatibility repository so
        // a bad/stale ID cannot mutate the live working dataset.
        let parent = self.dataset_versions.record(parent_id)?;
        let time_column = time_column.or(parent.time_column);
        let record = if let Some(store) = &self.artifact_store {
            let version_id = self.dataset_versions.allocate_artifact_version_id();
            let store = Arc::clone(store);
            let writer_store = Arc::clone(&store);
            let artifact_frame = df.clone();
            let (mut descriptor, row_count, column_names) = self
                .query_executor
                .run_background(CpuStage::Materialization, move || {
                    let (content_fingerprint, _) = fingerprints_for_frame(&artifact_frame);
                    let (row_count, column_names) = frame_metadata(&artifact_frame);
                    let descriptor = writer_store.write_parquet(
                        version_id,
                        content_fingerprint,
                        Utc::now(),
                        artifact_frame,
                    )?;
                    Ok::<_, AppError>((descriptor, row_count, column_names))
                })
                .await??;
            let revision = self.repository.replace_from_dataframe(df)?;
            let record = self.dataset_versions.register_child_artifact(
                parent_id,
                descriptor.clone(),
                revision,
                plan_hash,
                time_column.clone(),
            )?;
            descriptor.provenance = Some(provenance_from_record(&record, row_count, column_names));
            store.publish(descriptor)?;
            self.enforce_artifact_retention(&record.id)?;
            record
        } else {
            let identity_frame = df.clone();
            let (resident_bytes, dataset_fingerprint, schema_fingerprint) = self
                .query_executor
                .run_background(CpuStage::Materialization, move || {
                    let resident_bytes = identity_frame.estimated_size() as u64;
                    let (dataset_fingerprint, schema_fingerprint) =
                        fingerprints_for_frame(&identity_frame);
                    (resident_bytes, dataset_fingerprint, schema_fingerprint)
                })
                .await?;
            let identity = ResidentVersionIdentity {
                resident_bytes,
                dataset_fingerprint,
                schema_fingerprint,
            };
            self.dataset_versions.ensure_resident_registration_fits(
                Some(parent_id),
                identity.resident_bytes,
                self.config.retention.max_resident_versions,
                self.config.retention.max_resident_bytes,
            )?;
            let revision = self.repository.replace_from_dataframe(df.clone())?;
            let record = self.dataset_versions.register_child_with_identity(
                parent_id,
                df,
                revision,
                plan_hash,
                time_column,
                identity,
            )?;
            self.dataset_versions.enforce_resident_retention(
                self.config.retention.max_resident_versions,
                self.config.retention.max_resident_bytes,
            )?;
            record
        };
        self.repository
            .set_time_column_display_name(record.time_column.clone());
        self.cache.invalidate_all().await;
        self.clear_correlation_matrix_cache();
        Ok(record)
    }

    /// Stream a plan result directly into a managed Parquet child and attach
    /// the active compatibility repository to a fresh lazy scan. This path is
    /// available only when managed artifact storage is configured.
    pub async fn materialize_dataset_child_lazy(
        &self,
        parent_id: &str,
        mut frame: LazyFrame,
        plan_hash: String,
        time_column: String,
        job: Option<&JobHandle>,
    ) -> Result<DatasetVersionRecord, AppError> {
        ensure_job_not_cancelled(job)?;
        let _parent = self.dataset_versions.record(parent_id)?;
        let store = self.artifact_store.as_ref().ok_or_else(|| {
            AppError::internal("Lazy materialization requires managed artifact storage")
        })?;
        let schema = frame.collect_schema().map_err(|error| {
            AppError::bad_request(format!("Materialized plan schema unavailable: {error}"))
        })?;
        let column_names = schema
            .iter_names()
            .map(ToString::to_string)
            .collect::<Vec<_>>();
        let version_id = self.dataset_versions.allocate_artifact_version_id();
        let temp = store.prepare_lazy_parquet(&version_id)?;
        if let Err(error) = self.query_executor.sink_parquet_async(frame, temp).await {
            store.discard_pending_lazy_parquet(&version_id);
            return Err(error);
        }
        if let Err(error) = ensure_job_not_cancelled(job) {
            store.discard_pending_lazy_parquet(&version_id);
            return Err(error);
        }
        let (mut descriptor, mut cleanup) = self
            .finalize_lazy_artifact(store, version_id.clone())
            .await?;
        let prepared = async {
            let scan = LazyFrame::scan_parquet(
                descriptor.path.to_string_lossy().as_ref().into(),
                ScanArgsParquet::default(),
            )
            .map_err(|error| {
                AppError::internal(format!("Open materialized Parquet artifact: {error}"))
            })?;
            let count = self
                .query_executor
                .execute_async(
                    scan.clone()
                        .select([len().cast(DataType::UInt64).alias("__row_count")]),
                )
                .await?;
            let row_count = count
                .column("__row_count")
                .ok()
                .and_then(|column| column.u64().ok())
                .and_then(|column| column.get(0))
                .and_then(|value| usize::try_from(value).ok())
                .ok_or_else(|| AppError::internal("Materialized Parquet row count unavailable"))?;
            Ok::<_, AppError>((scan, row_count))
        }
        .await;
        let (scan, row_count) = match prepared {
            Ok(prepared) => prepared,
            Err(error) => {
                store.discard_unpublished_lazy_parquet(&version_id);
                return Err(error);
            }
        };
        if let Err(error) = ensure_job_not_cancelled(job) {
            store.discard_unpublished_lazy_parquet(&version_id);
            return Err(error);
        }
        let revision = match self.repository.replace_from_lazyframe(
            scan,
            DatasetMeta {
                row_count,
                column_names: column_names.clone(),
                time_column: Some(time_column.clone()),
            },
        ) {
            Ok(revision) => revision,
            Err(error) => {
                store.discard_unpublished_lazy_parquet(&version_id);
                return Err(error);
            }
        };
        cleanup.preserve();
        let record = self.dataset_versions.register_child_artifact(
            parent_id,
            descriptor.clone(),
            revision,
            plan_hash,
            Some(time_column.clone()),
        )?;
        descriptor.provenance = Some(provenance_from_record(&record, row_count, column_names));
        store.publish(descriptor)?;
        self.enforce_artifact_retention(&record.id)?;
        self.cache.invalidate_all().await;
        self.clear_correlation_matrix_cache();
        Ok(record)
    }

    /// Select a retained immutable source without removing any versions.
    pub async fn select_dataset_version(
        &self,
        version_id: &str,
    ) -> Result<DatasetVersionRecord, AppError> {
        let version = self.dataset_versions.record(version_id)?;
        let snapshot = self.dataset_snapshot_for_version(version_id)?;
        let schema = snapshot.clone().collect_schema().map_err(|error| {
            AppError::internal(format!("Dataset version schema unavailable: {error}"))
        })?;
        let column_names = schema
            .iter_names()
            .map(ToString::to_string)
            .collect::<Vec<_>>();
        let count = self
            .query_executor
            .execute_async(
                snapshot
                    .clone()
                    .select([len().cast(DataType::UInt64).alias("__row_count")]),
            )
            .await?;
        let row_count = count
            .column("__row_count")
            .ok()
            .and_then(|column| column.u64().ok())
            .and_then(|column| column.get(0))
            .and_then(|value| usize::try_from(value).ok())
            .ok_or_else(|| AppError::internal("Dataset version row count unavailable"))?;
        self.repository.replace_from_lazyframe(
            snapshot,
            DatasetMeta {
                row_count,
                column_names,
                time_column: version.time_column.clone(),
            },
        )?;
        let record = self.dataset_versions.select(version_id)?;
        self.repository
            .set_time_column_display_name(record.time_column.clone());
        self.cache.invalidate_all().await;
        self.clear_correlation_matrix_cache();
        Ok(record)
    }

    pub fn cached_correlation_matrix(&self, revision: u64) -> Option<CorrelationMatrixCacheEntry> {
        // The caller supplies the snapshot revision it is about to use. A
        // concurrent dataset replacement may commit immediately after this
        // lookup, so storing the recomputed matrix is guarded separately by
        // store_correlation_matrix_if_current().
        let guard = self
            .correlation_matrix_cache
            .lock()
            .map_err(|error| error.into_inner())
            .ok()?;
        guard
            .as_ref()
            .filter(|(cached_revision, _)| *cached_revision == revision)
            .map(|(_, entry)| entry.clone())
    }

    pub fn store_correlation_matrix_if_current(
        &self,
        revision: u64,
        entry: CorrelationMatrixCacheEntry,
    ) -> bool {
        if self.dataset_revision() != revision {
            return false;
        }
        let Ok(mut guard) = self
            .correlation_matrix_cache
            .lock()
            .map_err(|error| error.into_inner())
        else {
            return false;
        };
        if entry.estimated_bytes() > self.config.cache.max_bytes.max(1024) {
            return false;
        }
        *guard = Some((revision, entry));
        true
    }

    pub fn clear_correlation_matrix_cache(&self) {
        if let Ok(mut guard) = self
            .correlation_matrix_cache
            .lock()
            .map_err(|error| error.into_inner())
        {
            *guard = None;
        }
    }

    pub async fn acquire_correlation_single_flight(
        &self,
        revision: u64,
    ) -> tokio::sync::OwnedMutexGuard<()> {
        let lock = {
            let mut flights = self.correlation_single_flight.lock().await;
            flights.retain(|_, weak| weak.strong_count() > 0);
            if let Some(existing) = flights.get(&revision).and_then(std::sync::Weak::upgrade) {
                existing
            } else {
                let lock = Arc::new(tokio::sync::Mutex::new(()));
                flights.insert(revision, Arc::downgrade(&lock));
                lock
            }
        };
        lock.lock_owned().await
    }

    /// Return a cloned exact-profile entry for an immutable source/profile
    /// algorithm key. Cache entries deliberately survive source selection so
    /// returning to a retained source can reuse its completed profile.
    pub fn cached_profile(&self, key: &str) -> Option<ProfileCacheEntry> {
        self.profile_cache
            .lock()
            .map_err(|error| error.into_inner())
            .ok()?
            .get(key)
            .cloned()
    }

    /// Record either a pending job or its completed result for one immutable
    /// profile key. Callers must verify cancellation before publishing a
    /// result; this method intentionally has no knowledge of HTTP DTOs.
    pub fn store_profile(&self, key: String, entry: ProfileCacheEntry) {
        if let Ok(mut cache) = self
            .profile_cache
            .lock()
            .map_err(|error| error.into_inner())
        {
            cache.insert(key, entry);
            while cache
                .values()
                .filter(|entry| entry.result.is_some())
                .count()
                > self.config.retention.max_profile_entries.max(1)
            {
                let Some(oldest_completed) = cache
                    .iter()
                    .find(|(_, entry)| entry.result.is_some())
                    .map(|(key, _)| key.clone())
                else {
                    break;
                };
                cache.remove(&oldest_completed);
            }
        }
    }

    pub fn cached_immediate_metadata(&self, key: &str) -> Option<Value> {
        self.immediate_metadata_cache
            .lock()
            .map_err(|error| error.into_inner())
            .ok()?
            .get(key)
            .cloned()
    }

    pub fn store_immediate_metadata(&self, key: String, value: Value) {
        if let Ok(mut cache) = self
            .immediate_metadata_cache
            .lock()
            .map_err(|error| error.into_inner())
        {
            cache.insert(key, value);
            while cache.len() > self.config.retention.max_profile_entries.max(1) {
                let Some(oldest) = cache.keys().next().cloned() else {
                    break;
                };
                cache.remove(&oldest);
            }
        }
    }

    pub fn set_time_column_display_name(&self, name: Option<String>) {
        self.repository.set_time_column_display_name(name);
    }

    pub fn time_column_display_name_sync(&self) -> Option<String> {
        self.repository.time_column_display_name_sync()
    }

    /// Returns TsContext (ts_col name, multiplier, dtype) for the time column.
    /// All route handlers that duplicate the 3-line pattern should use this.
    pub fn ts_context(&self, lf: &LazyFrame) -> Result<TsContext, AppError> {
        let ts_col = self
            .current_dataset_version()?
            .time_column
            .unwrap_or_else(|| "ts".to_string());
        ts_context(lf, &ts_col)
    }

    /// Returns row count without forcing a full collect of the active frame.
    /// Uses `count()` on the repository's metadata — O(1) instead of O(n).
    pub async fn dataset_rows(&self) -> usize {
        let meta = self.repository.meta();
        let meta = meta.read().unwrap_or_else(|error| {
            tracing::warn!("dataset metadata lock poisoned; recovering the last value");
            error.into_inner()
        });
        meta.row_count
    }

    pub fn dataset_revision(&self) -> u64 {
        self.repository.revision()
    }

    /// Push a query entry to the ring buffer.
    pub fn push_query(&self, entry: QueryEntry) {
        let Ok(mut log) = self.query_log.lock().map_err(|e| e.into_inner()) else {
            tracing::warn!("query_log lock failed, dropping entry");
            return;
        };
        let max = self.config.query.max_stored.max(1);
        while log.len() >= max {
            log.pop_front();
        }
        log.push_back(entry);
    }

    /// Drain all query entries (for export).
    pub fn drain_queries(&self) -> Vec<QueryEntry> {
        let Ok(mut log) = self.query_log.lock().map_err(|e| e.into_inner()) else {
            tracing::warn!("query_log drain failed, returning empty");
            return Vec::new();
        };
        log.drain(..).collect::<Vec<_>>()
    }

    pub fn next_query_id(&self) -> u64 {
        self.query_counter
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            + 1
    }
}

fn ensure_job_not_cancelled(job: Option<&JobHandle>) -> Result<(), AppError> {
    if job.is_some_and(JobHandle::is_cancelled) {
        return Err(AppError::bad_request(
            "Materialization job cancelled before publication",
        ));
    }
    Ok(())
}

impl Default for AppState {
    fn default() -> Self {
        Self::new(DataFrame::default(), AppConfig::default())
    }
}

fn provenance_from_record(
    record: &DatasetVersionRecord,
    row_count: usize,
    column_names: Vec<String>,
) -> DatasetArtifactProvenance {
    DatasetArtifactProvenance {
        root_id: record.root_id.clone(),
        parent_id: record.parent_id.clone(),
        revision: record.revision,
        schema_fingerprint: record.schema_fingerprint.clone(),
        source_name: record.source_name.clone(),
        time_column: record.time_column.clone(),
        materialized_from_plan_hash: record.materialized_from_plan_hash.clone(),
        row_count,
        column_names,
    }
}

fn frame_metadata(frame: &DataFrame) -> (usize, Vec<String>) {
    (
        frame.height(),
        frame
            .get_column_names()
            .iter()
            .map(ToString::to_string)
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use std::fs;

    use chrono::Utc;
    use polars::prelude::{DataFrame, IntoLazy, NamedFrom, Series};

    use super::AppState;
    use crate::artifacts::DatasetArtifactProvenance;
    use crate::cache::CorrelationMatrixCacheEntry;
    use crate::jobs::JobKind;
    use crate::versions::DatasetVersionRecord;
    use edatime_core::config::AppConfig;

    fn frame(values: Vec<i64>) -> DataFrame {
        DataFrame::new(
            values.len(),
            vec![Series::new("value".into(), values).into()],
        )
        .expect("frame")
    }

    #[test]
    fn active_correlation_matrix_cache_rejects_entries_over_byte_budget() {
        let mut config = AppConfig::default();
        config.cache.max_bytes = 1024;
        let state = AppState::new(frame(vec![1]), config);
        let revision = state.dataset_revision();
        let n = 20;
        let values = vec![vec![Some(0.5); n]; n];
        let entry = CorrelationMatrixCacheEntry {
            columns: (0..n).map(|index| format!("column_{index}")).collect(),
            pearson_raw: values.clone(),
            spearman_raw: values.clone(),
            kendall_raw: values.clone(),
            pearson_diff: values.clone(),
            spearman_diff: values.clone(),
            kendall_diff: values,
            counts: vec![vec![10; n]; n],
            diff_counts: vec![vec![9; n]; n],
        };

        assert!(!state.store_correlation_matrix_if_current(revision, entry));
        assert!(state.cached_correlation_matrix(revision).is_none());
    }

    #[tokio::test]
    async fn lazy_finalization_waits_for_io_admission_and_cleans_cancelled_queue() {
        use edatime_core::metrics::CpuStage;
        use std::sync::{Arc, mpsc};
        use std::time::Duration;

        let root = std::env::temp_dir().join(format!(
            "edatime-finalize-queue-{}",
            Utc::now().timestamp_nanos_opt().unwrap()
        ));
        let mut config = AppConfig::default();
        config.data.artifact_dir = Some(root.clone());
        config.query.max_blocking_io_concurrency = 1;
        let state = AppState::new(DataFrame::default(), config);
        let store = state.artifact_store.as_ref().expect("artifact store");
        let version_id = "queued-finalizer".to_string();
        let pending = store
            .prepare_lazy_parquet(&version_id)
            .expect("pending path");
        fs::write(&pending, b"pending artifact fixture").expect("pending sink output");
        let executor = Arc::clone(&state.query_executor);
        let (started, running) = tokio::sync::oneshot::channel();
        let (release, blocked) = mpsc::channel();
        let blocker = tokio::spawn(async move {
            executor
                .run_blocking_io(CpuStage::Materialization, move || {
                    started.send(()).expect("worker started");
                    blocked.recv().expect("release worker");
                })
                .await
                .expect("blocking worker");
        });
        running.await.expect("I/O lane occupied");
        let mut finalizing = Box::pin(state.finalize_lazy_artifact(store, version_id));
        assert!(
            tokio::time::timeout(Duration::from_millis(25), &mut finalizing)
                .await
                .is_err(),
            "file hashing must wait for the bounded I/O lane"
        );
        assert!(pending.exists());
        drop(finalizing);
        assert!(
            !pending.exists(),
            "cancelling queued finalization must remove sink output"
        );
        release.send(()).expect("release I/O lane");
        blocker.await.expect("blocker joined");
        assert!(store.load_catalog().expect("catalog").is_empty());
        fs::remove_dir_all(root).expect("remove fixture directory");
    }

    #[tokio::test]
    async fn dropping_unpublished_finalization_result_removes_the_artifact() {
        let root = std::env::temp_dir().join(format!(
            "edatime-finalize-result-{}",
            Utc::now().timestamp_nanos_opt().unwrap()
        ));
        let mut config = AppConfig::default();
        config.data.artifact_dir = Some(root.clone());
        let state = AppState::new(DataFrame::default(), config);
        let store = state.artifact_store.as_ref().expect("artifact store");
        let version_id = "unpublished-finalizer".to_string();
        let pending = store
            .prepare_lazy_parquet(&version_id)
            .expect("pending path");
        fs::write(&pending, b"pending artifact fixture").expect("pending sink output");
        let (descriptor, cleanup) = state
            .finalize_lazy_artifact(store, version_id)
            .await
            .expect("finalize");
        assert!(!pending.exists());
        assert!(descriptor.path.exists());
        assert!(descriptor.content_fingerprint.starts_with("fnv1a-parquet-"));
        drop(cleanup);
        assert!(
            !descriptor.path.exists(),
            "unobserved worker results must not leave artifacts behind"
        );
        assert!(store.load_catalog().expect("catalog").is_empty());
        fs::remove_dir_all(root).expect("remove fixture directory");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn configured_lazy_root_ingest_activates_a_scan_backed_artifact() {
        let artifact_dir = std::env::temp_dir().join(format!(
            "edatime-state-lazy-root-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let mut config = AppConfig::default();
        config.data.artifact_dir = Some(artifact_dir.clone());
        let state = AppState::new(frame(vec![0]), config);
        let lazy = DataFrame::new(
            3,
            vec![
                Series::new("time".into(), vec![1_i64, 2, 3]).into(),
                Series::new("value".into(), vec![10.0_f64, 20.0, 30.0]).into(),
            ],
        )
        .expect("ingest frame")
        .lazy();

        let record = state
            .replace_dataset_lazy_root(
                lazy,
                Some("fixture.parquet".to_string()),
                "time".to_string(),
            )
            .await
            .expect("lazy root ingest");

        assert!(record.id.starts_with("artifact-"));
        assert_eq!(record.source_name.as_deref(), Some("fixture.parquet"));
        assert_eq!(state.dataset_rows().await, 3);
        assert_eq!(
            state
                .query_executor
                .execute_async(state.dataset_snapshot())
                .await
                .expect("active scan")
                .height(),
            3
        );
        let catalog = state
            .artifact_store
            .as_ref()
            .expect("artifact store")
            .load_catalog()
            .expect("catalog");
        assert_eq!(catalog.len(), 1);
        assert_eq!(catalog[0].version_id, record.id);
        assert_eq!(
            catalog[0]
                .provenance
                .as_ref()
                .and_then(|provenance| provenance.source_name.as_deref()),
            Some("fixture.parquet")
        );
        fs::remove_dir_all(artifact_dir).expect("clean artifact directory");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn configured_artifact_storage_publishes_root_and_child_versions() {
        let artifact_dir = std::env::temp_dir().join(format!(
            "edatime-state-artifacts-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let mut config = AppConfig::default();
        config.data.artifact_dir = Some(artifact_dir.clone());
        let state = AppState::new(frame(vec![0]), config.clone());

        state
            .replace_dataset(frame(vec![1, 2]))
            .await
            .expect("persist root");
        let root = state.current_dataset_version().expect("root record");
        assert!(root.id.starts_with("artifact-"));
        let root_scan = state
            .dataset_snapshot_for_version(&root.id)
            .expect("root scan");
        let root_height = tokio::task::spawn_blocking(move || {
            root_scan.collect().expect("collect root scan").height()
        })
        .await
        .expect("join root scan");
        assert_eq!(root_height, 2);

        let child = state
            .materialize_dataset_child(&root.id, frame(vec![2]), "plan-1".to_string(), None)
            .await
            .expect("persist child");
        assert_eq!(child.parent_id.as_deref(), Some(root.id.as_str()));
        assert!(child.id.starts_with("artifact-"));
        let catalog = state
            .artifact_store
            .as_ref()
            .expect("configured artifact store")
            .load_catalog()
            .expect("catalog");
        assert_eq!(catalog.len(), 2);
        let root_artifact = catalog
            .iter()
            .find(|artifact| artifact.version_id == root.id)
            .expect("root artifact");
        expect_provenance(root_artifact.provenance.as_ref(), &root, None);
        let child_artifact = catalog
            .iter()
            .find(|artifact| artifact.version_id == child.id)
            .expect("child artifact");
        expect_provenance(
            child_artifact.provenance.as_ref(),
            &child,
            Some(root.id.as_str()),
        );

        let restored = AppState::new(DataFrame::default(), config);
        assert_eq!(
            restored
                .current_dataset_version()
                .expect("restored current version")
                .id,
            child.id
        );
        assert_eq!(
            restored
                .dataset_versions()
                .expect("restored versions")
                .len(),
            2
        );
        assert_eq!(restored.dataset_rows().await, 1);
        let restored_scan = restored.dataset_snapshot();
        let restored_height = tokio::task::spawn_blocking(move || {
            restored_scan
                .collect()
                .expect("collect restored scan")
                .height()
        })
        .await
        .expect("join restored scan");
        assert_eq!(restored_height, 1);

        fs::remove_dir_all(artifact_dir).expect("clean artifact test directory");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn selecting_artifact_version_restores_scan_and_metadata_without_eager_frame_copy() {
        let artifact_dir = std::env::temp_dir().join(format!(
            "edatime-state-select-artifact-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let mut config = AppConfig::default();
        config.data.artifact_dir = Some(artifact_dir.clone());
        config.retention.max_resident_bytes = 1;
        let state = AppState::new(DataFrame::default(), config);
        let root_frame = DataFrame::new(
            3,
            vec![
                Series::new("time".into(), vec![10_i64, 20, 30]).into(),
                Series::new("value".into(), vec![1.0_f64, 2.0, 3.0]).into(),
            ],
        )
        .expect("root frame");
        assert!(root_frame.estimated_size() as u64 > state.config.retention.max_resident_bytes);
        state
            .replace_dataset_with_time_column(root_frame, Some("time".to_string()))
            .await
            .expect("persist root");
        let root = state.current_dataset_version().expect("root version");
        assert_eq!(root.time_column.as_deref(), Some("time"));
        let root_id = root.id;
        state
            .materialize_dataset_child(&root_id, frame(vec![4, 5]), "child-plan".into(), None)
            .await
            .expect("persist child");

        let selected = state
            .select_dataset_version(&root_id)
            .await
            .expect("select root version");
        assert_eq!(selected.id, root_id);
        assert_eq!(selected.time_column.as_deref(), Some("time"));
        {
            let metadata = state.repository.meta();
            let metadata = metadata.read().expect("dataset metadata lock");
            assert_eq!(metadata.row_count, 3);
            assert_eq!(metadata.column_names, vec!["time", "value"]);
            assert_eq!(metadata.time_column.as_deref(), Some("time"));
        }
        let plan = state
            .dataset_snapshot()
            .describe_optimized_plan()
            .expect("selected plan");
        assert!(
            plan.to_ascii_lowercase().contains("parquet scan"),
            "selection must keep a Parquet scan instead of a resident frame: {plan}"
        );
        let restored = state
            .query_executor
            .execute_async(state.dataset_snapshot())
            .await
            .expect("collect selected lazy scan");
        assert_eq!(restored.height(), 3);
        assert_eq!(
            restored
                .get_column_names()
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>(),
            vec!["time", "value"]
        );

        fs::remove_dir_all(artifact_dir).expect("clean artifact directory");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn cancelled_lazy_materialization_discards_its_unpublished_artifact() {
        let artifact_dir = std::env::temp_dir().join(format!(
            "edatime-state-cancelled-materialization-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let mut config = AppConfig::default();
        config.data.artifact_dir = Some(artifact_dir.clone());
        let state = AppState::new(frame(vec![0]), config);
        let job = state.jobs.create(JobKind::Materialization);
        assert!(state.jobs.start(&job));
        state.jobs.cancel(job.id());

        let error = state
            .materialize_dataset_child_lazy(
                "source-0",
                frame(vec![1, 2]).lazy(),
                "plan-cancelled".to_string(),
                "value".to_string(),
                Some(&job),
            )
            .await
            .expect_err("cancelled job must not publish");
        assert!(error.to_string().contains("cancelled"));
        assert!(
            state
                .artifact_store
                .as_ref()
                .expect("artifact store")
                .load_catalog()
                .expect("catalog")
                .is_empty()
        );
        assert_eq!(state.dataset_rows().await, 1);
        if artifact_dir.exists() {
            fs::remove_dir_all(artifact_dir).expect("clean artifact directory");
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn artifact_retention_preserves_active_lineage_and_prunes_old_roots() {
        let artifact_dir = std::env::temp_dir().join(format!(
            "edatime-state-retention-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let mut config = AppConfig::default();
        config.data.artifact_dir = Some(artifact_dir.clone());
        config.data.max_artifact_versions = Some(2);
        let state = AppState::new(frame(vec![0]), config);

        state
            .replace_dataset(frame(vec![1, 2]))
            .await
            .expect("first root");
        let first_root = state.current_dataset_version().expect("first root record");
        let first_child = state
            .materialize_dataset_child(&first_root.id, frame(vec![2]), "plan-1".to_string(), None)
            .await
            .expect("first child");
        assert_eq!(
            state
                .artifact_store
                .as_ref()
                .expect("artifact store")
                .load_catalog()
                .expect("catalog")
                .len(),
            2
        );

        state
            .replace_dataset(frame(vec![10, 20, 30]))
            .await
            .expect("second root");
        let active = state.current_dataset_version().expect("second root record");
        let catalog = state
            .artifact_store
            .as_ref()
            .expect("artifact store")
            .load_catalog()
            .expect("catalog");
        assert_eq!(catalog.len(), 2);
        assert!(catalog.iter().any(|entry| entry.version_id == active.id));
        assert!(
            catalog
                .iter()
                .any(|entry| entry.version_id == first_root.id)
        );
        assert!(state.dataset_snapshot_for_version(&first_root.id).is_ok());
        assert!(state.dataset_snapshot_for_version(&first_child.id).is_err());
        assert_eq!(state.dataset_versions().expect("versions").len(), 2);
        assert_eq!(state.dataset_rows().await, 3);
        fs::remove_dir_all(artifact_dir).expect("clean artifact directory");
    }

    fn expect_provenance(
        provenance: Option<&DatasetArtifactProvenance>,
        record: &DatasetVersionRecord,
        expected_parent: Option<&str>,
    ) {
        let provenance = provenance.expect("artifact provenance");
        assert_eq!(provenance.root_id, record.root_id);
        assert_eq!(provenance.parent_id.as_deref(), expected_parent);
        assert_eq!(provenance.revision, record.revision);
        assert_eq!(provenance.schema_fingerprint, record.schema_fingerprint);
        assert_eq!(
            provenance.materialized_from_plan_hash,
            record.materialized_from_plan_hash
        );
    }
}
