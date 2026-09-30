use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::sync::Arc;
use std::sync::atomic::AtomicUsize;
use std::sync::{Mutex, MutexGuard};

use chrono::Utc;
use polars::prelude::{DataFrame, DataType, LazyFrame, ScanArgsParquet, SchemaExt, len};
use serde::Serialize;
use serde_json::Value;
use tokio::sync::{RwLock, Semaphore};

use crate::artifacts::{
    ArtifactStorageUsage, DatasetArtifactDescriptor, DatasetArtifactProvenance,
    DatasetArtifactStore,
};
use crate::bounded_map::BoundedMap;
use crate::cache::{CorrelationMatrixCacheEntry, ResponseCache, WorkingCorrelationCache};
use crate::db::DbPool;
use crate::jobs::{JobHandle, JobRegistry};
use crate::repository::{DataRepository, DatasetMeta, InMemoryDataRepository};
use crate::versions::{
    DatasetVersionRecord, DatasetVersionRegistry, ResidentVersionIdentity,
    VersionRetentionSnapshot, fingerprints_for_frame,
};
use edatime_core::config::AppConfig;
use edatime_core::error::DomainError;
use edatime_core::metrics::{AppMetrics, CpuStage};
use edatime_core::temporal::{TsContext, ts_context};
use edatime_query::executor::{ExecutionContext, QueryExecutor};
use edatime_query::query::QueryEntry;

/// Compiled cleaning plans retained across requests.
const WORKING_PLAN_CACHE_ENTRIES: usize = 8;

/// Lock a std mutex, recovering the data if a panicking holder poisoned it.
/// These caches hold plain values that stay consistent between statements, so
/// continuing is safer than permanently disabling the cache.
fn lock_recovering<'a, T>(mutex: &'a Mutex<T>, name: &str) -> MutexGuard<'a, T> {
    mutex.lock().unwrap_or_else(|error| {
        tracing::warn!("{name} lock poisoned; recovering the last value");
        error.into_inner()
    })
}

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

/// Shared application state. Cloning is one `Arc` bump; every handler and
/// background task holds a clone. Fields are reachable through `Deref`; the
/// caches that need invariants (bounds, revision checks) stay private and are
/// only exposed through `AppState` methods.
#[derive(Clone)]
pub struct AppState {
    inner: Arc<AppStateInner>,
}

impl std::ops::Deref for AppState {
    type Target = AppStateInner;

    fn deref(&self) -> &AppStateInner {
        &self.inner
    }
}

pub struct AppStateInner {
    repository: Arc<dyn DataRepository>,
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
    pub db_pool: RwLock<Option<Arc<DbPool>>>,
    pub db_info: RwLock<Option<DbConnectionInfo>>,
    correlation_matrix_cache: Mutex<Option<(u64, CorrelationMatrixCacheEntry)>>,
    correlation_single_flight:
        tokio::sync::Mutex<BTreeMap<u64, std::sync::Weak<tokio::sync::Mutex<()>>>>,
    /// Bounded compiled working plans, keyed by immutable source and semantic hash.
    working_plan_cache: Mutex<BoundedMap<(String, String), LazyFrame>>,
    /// Working matrices by source, plan and metric, with per-entry single flight.
    pub working_correlation_cache: tokio::sync::Mutex<WorkingCorrelationCache>,
    profile_cache: Mutex<BoundedMap<String, ProfileCacheEntry>>,
    immediate_metadata_cache: Mutex<BoundedMap<String, Value>>,
    query_log: Mutex<VecDeque<QueryEntry>>,
    query_counter: std::sync::atomic::AtomicU64,
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
                                        DomainError::internal(
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
                                Ok::<_, DomainError>(())
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
            inner: Arc::new(AppStateInner {
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
                db_pool: RwLock::new(None),
                db_info: RwLock::new(None),
                correlation_matrix_cache: Mutex::new(None),
                correlation_single_flight: tokio::sync::Mutex::new(BTreeMap::new()),
                working_plan_cache: Mutex::new(BoundedMap::new()),
                working_correlation_cache: tokio::sync::Mutex::new(WorkingCorrelationCache::new(
                    correlation_cache_max_bytes,
                )),
                profile_cache: Mutex::new(BoundedMap::new()),
                immediate_metadata_cache: Mutex::new(BoundedMap::new()),
                query_log: Mutex::new(VecDeque::with_capacity(max_stored)),
                query_counter: std::sync::atomic::AtomicU64::new(0),
            }),
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
    pub fn dataset_snapshot_for_version(&self, version_id: &str) -> Result<LazyFrame, DomainError> {
        self.dataset_versions.snapshot(version_id)
    }

    pub fn current_dataset_version(&self) -> Result<DatasetVersionRecord, DomainError> {
        self.dataset_versions.current()
    }

    pub fn dataset_versions(&self) -> Result<Vec<DatasetVersionRecord>, DomainError> {
        self.dataset_versions.list()
    }

    pub fn version_retention_snapshot(&self) -> Result<VersionRetentionSnapshot, DomainError> {
        self.dataset_versions.retention_snapshot()
    }

    pub fn retained_state_snapshot(&self) -> Result<RetainedStateSnapshot, DomainError> {
        Ok(RetainedStateSnapshot {
            versions: self.version_retention_snapshot()?,
            artifacts: self.artifact_storage_usage()?,
            jobs: self.jobs.snapshot(),
            profile_entries: lock_recovering(&self.profile_cache, "profile_cache").len(),
            immediate_metadata_entries: lock_recovering(
                &self.immediate_metadata_cache,
                "immediate_metadata_cache",
            )
            .len(),
        })
    }

    pub fn artifact_storage_usage(&self) -> Result<ArtifactStorageUsage, DomainError> {
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
    fn enforce_artifact_retention(&self, active_id: &str) -> Result<(), DomainError> {
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
    ) -> Result<LazyFrame, DomainError> {
        let lf = self.repository.snapshot();
        let schema = lf
            .clone()
            .collect_schema()
            .map_err(|e| DomainError::internal(format!("LazyFrame schema unavailable: {}", e)))?;
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

    pub async fn replace_dataset(&self, df: DataFrame) -> Result<u64, DomainError> {
        self.replace_dataset_with_time_column(df, None).await
    }

    pub async fn replace_dataset_with_time_column(
        &self,
        df: DataFrame,
        time_column: Option<String>,
    ) -> Result<u64, DomainError> {
        self.replace_dataset_with_time_column_and_source_name(df, time_column, None)
            .await
    }

    pub async fn replace_dataset_with_time_column_and_source_name(
        &self,
        df: DataFrame,
        time_column: Option<String>,
        source_name: Option<String>,
    ) -> Result<u64, DomainError> {
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
                    Ok::<_, DomainError>((descriptor, row_count, column_names))
                })
                .await??;
            let rev = self.repository.replace_from_dataframe(df)?;
            let record = self.dataset_versions.register_root_artifact(
                descriptor.clone(),
                rev,
                source_name,
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
                source_name,
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
    ) -> Result<(DatasetArtifactDescriptor, UnpublishedArtifactCleanup), DomainError> {
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
    ) -> Result<DatasetVersionRecord, DomainError> {
        self.replace_dataset_lazy_root_with_resources(frame, source_name, time_column, ())
            .await
    }

    pub async fn replace_dataset_lazy_root_with_resources<R: Send + 'static>(
        &self,
        mut frame: LazyFrame,
        source_name: Option<String>,
        time_column: String,
        resources: R,
    ) -> Result<DatasetVersionRecord, DomainError> {
        let store = self.artifact_store.as_ref().ok_or_else(|| {
            DomainError::internal("Lazy root ingest requires managed artifact storage")
        })?;
        let schema = frame.collect_schema().map_err(|error| {
            DomainError::bad_request(format!("Ingest schema unavailable: {error}"))
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
                DomainError::internal(format!("Open ingested Parquet artifact: {error}"))
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
                .ok_or_else(|| DomainError::internal("Ingested Parquet row count unavailable"))?;
            if row_count == 0 {
                return Err(DomainError::bad_request(
                    "No rows loaded for the selected partial range. Reduce skip_rows or increase n_rows.",
                ));
            }
            Ok::<_, DomainError>((scan, row_count))
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
        applied_plan: Option<Value>,
    ) -> Result<DatasetVersionRecord, DomainError> {
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
                    Ok::<_, DomainError>((descriptor, row_count, column_names))
                })
                .await??;
            let revision = self.repository.replace_from_dataframe(df)?;
            let record = self.dataset_versions.register_child_artifact(
                parent_id,
                descriptor.clone(),
                revision,
                plan_hash,
                time_column.clone(),
                applied_plan.clone(),
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
                applied_plan,
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
        applied_plan: Option<Value>,
        job: Option<&JobHandle>,
    ) -> Result<DatasetVersionRecord, DomainError> {
        ensure_job_not_cancelled(job)?;
        let _parent = self.dataset_versions.record(parent_id)?;
        let store = self.artifact_store.as_ref().ok_or_else(|| {
            DomainError::internal("Lazy materialization requires managed artifact storage")
        })?;
        let schema = frame.collect_schema().map_err(|error| {
            DomainError::bad_request(format!("Materialized plan schema unavailable: {error}"))
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
                DomainError::internal(format!("Open materialized Parquet artifact: {error}"))
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
                .ok_or_else(|| {
                    DomainError::internal("Materialized Parquet row count unavailable")
                })?;
            Ok::<_, DomainError>((scan, row_count))
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
            applied_plan,
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
    ) -> Result<DatasetVersionRecord, DomainError> {
        let version = self.dataset_versions.record(version_id)?;
        let snapshot = self.dataset_snapshot_for_version(version_id)?;
        let schema = snapshot.clone().collect_schema().map_err(|error| {
            DomainError::internal(format!("Dataset version schema unavailable: {error}"))
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
            .ok_or_else(|| DomainError::internal("Dataset version row count unavailable"))?;
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
        let guard = lock_recovering(&self.correlation_matrix_cache, "correlation_matrix_cache");
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
        let mut guard = lock_recovering(&self.correlation_matrix_cache, "correlation_matrix_cache");
        if entry.estimated_bytes() > self.config.cache.max_bytes.max(1024) {
            return false;
        }
        *guard = Some((revision, entry));
        true
    }

    pub fn clear_correlation_matrix_cache(&self) {
        *lock_recovering(&self.correlation_matrix_cache, "correlation_matrix_cache") = None;
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
        lock_recovering(&self.profile_cache, "profile_cache")
            .get(&key.to_string())
            .cloned()
    }

    /// Record either a pending job or its completed result for one immutable
    /// profile key. Callers must verify cancellation before publishing a
    /// result; this method intentionally has no knowledge of HTTP DTOs.
    /// Completed results are evicted (oldest first) before pending jobs.
    pub fn store_profile(&self, key: String, entry: ProfileCacheEntry) {
        lock_recovering(&self.profile_cache, "profile_cache").insert_bounded(
            key,
            entry,
            self.config.retention.max_profile_entries,
            |entry| entry.result.is_some(),
        );
    }

    pub fn cached_immediate_metadata(&self, key: &str) -> Option<Value> {
        lock_recovering(&self.immediate_metadata_cache, "immediate_metadata_cache")
            .get(&key.to_string())
            .cloned()
    }

    pub fn store_immediate_metadata(&self, key: String, value: Value) {
        lock_recovering(&self.immediate_metadata_cache, "immediate_metadata_cache").insert_bounded(
            key,
            value,
            self.config.retention.max_profile_entries,
            |_| true,
        );
    }

    /// Compiled cleaning plan for an immutable `(source version, plan hash)`.
    pub fn cached_working_plan(&self, source_version: &str, plan_hash: &str) -> Option<LazyFrame> {
        lock_recovering(&self.working_plan_cache, "working_plan_cache")
            .get(&(source_version.to_string(), plan_hash.to_string()))
            .cloned()
    }

    /// Publish a compiled plan. If a concurrent request already published one
    /// for the same key, that winner is returned so callers share one plan.
    pub fn store_working_plan(
        &self,
        source_version: &str,
        plan_hash: &str,
        frame: LazyFrame,
    ) -> LazyFrame {
        let key = (source_version.to_string(), plan_hash.to_string());
        let mut cache = lock_recovering(&self.working_plan_cache, "working_plan_cache");
        if let Some(winner) = cache.get(&key) {
            return winner.clone();
        }
        cache.insert_bounded(key, frame.clone(), WORKING_PLAN_CACHE_ENTRIES, |_| true);
        frame
    }

    pub fn set_time_column_display_name(&self, name: Option<String>) {
        self.repository.set_time_column_display_name(name);
    }

    pub fn time_column_display_name_sync(&self) -> Option<String> {
        self.repository.time_column_display_name_sync()
    }

    /// Returns TsContext (ts_col name, multiplier, dtype) for the time column.
    /// All route handlers that duplicate the 3-line pattern should use this.
    pub fn ts_context(&self, lf: &LazyFrame) -> Result<TsContext, DomainError> {
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
        let mut log = lock_recovering(&self.query_log, "query_log");
        let max = self.config.query.max_stored.max(1);
        while log.len() >= max {
            log.pop_front();
        }
        log.push_back(entry);
    }

    /// Drain all query entries (for export).
    pub fn drain_queries(&self) -> Vec<QueryEntry> {
        let mut log = lock_recovering(&self.query_log, "query_log");
        log.drain(..).collect::<Vec<_>>()
    }

    pub fn next_query_id(&self) -> u64 {
        self.query_counter
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            + 1
    }
}

fn ensure_job_not_cancelled(job: Option<&JobHandle>) -> Result<(), DomainError> {
    if job.is_some_and(JobHandle::is_cancelled) {
        return Err(DomainError::bad_request(
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
        display_name: record.display_name.clone(),
        time_column: record.time_column.clone(),
        materialized_from_plan_hash: record.materialized_from_plan_hash.clone(),
        applied_plan: record.applied_plan.clone(),
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
mod tests;
