use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::Mutex;

use chrono::Utc;
use polars::prelude::{DataFrame, DataType, LazyFrame, ScanArgsParquet, SchemaExt, len};
use tokio::sync::RwLock;

use crate::artifacts::{ArtifactStorageUsage, DatasetArtifactProvenance, DatasetArtifactStore};
use crate::cache::{CorrelationMatrixCacheEntry, ResponseCache};
use crate::db::DbPool;
use crate::repository::{DataRepository, DatasetMeta, InMemoryDataRepository};
use crate::versions::{DatasetVersionRecord, DatasetVersionRegistry, fingerprints_for_frame};
use edatime_core::config::AppConfig;
use edatime_core::error::AppError;
use edatime_core::metrics::AppMetrics;
use edatime_core::temporal::{TsContext, ts_context};
use edatime_query::executor::{ExecutionContext, QueryExecutor};
use edatime_query::query::QueryEntry;

/// Live database connection state, set after a successful `/api/database/connect`.
#[derive(Clone, Debug)]
pub struct DbConnectionInfo {
    pub schema: String,
    pub table: String,
    pub time_column: Option<String>,
}

#[allow(clippy::clone_on_ref_ptr)]
pub struct AppState {
    pub repository: Arc<dyn DataRepository>,
    pub dataset_versions: Arc<DatasetVersionRegistry>,
    pub artifact_store: Option<Arc<DatasetArtifactStore>>,
    pub query_executor: Arc<QueryExecutor>,
    pub cache: Arc<ResponseCache>,
    pub metrics: Arc<AppMetrics>,
    pub config: Arc<AppConfig>,
    pub db_pool: Arc<RwLock<Option<Arc<DbPool>>>>,
    pub db_info: Arc<RwLock<Option<DbConnectionInfo>>>,
    pub correlation_matrix_cache: Arc<Mutex<Option<(u64, CorrelationMatrixCacheEntry)>>>,
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
            cache: Arc::clone(&self.cache),
            metrics: Arc::clone(&self.metrics),
            config: Arc::clone(&self.config),
            db_pool: Arc::clone(&self.db_pool),
            db_info: Arc::clone(&self.db_info),
            correlation_matrix_cache: Arc::clone(&self.correlation_matrix_cache),
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
                                        time_column: None,
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
            QueryExecutor::new(ExecutionContext::Streaming).with_metrics(Arc::clone(&metrics)),
        );
        Self {
            repository,
            dataset_versions,
            artifact_store,
            query_executor,
            cache,
            metrics,
            config: Arc::new(config),
            db_pool: Arc::new(RwLock::new(None)),
            db_info: Arc::new(RwLock::new(None)),
            correlation_matrix_cache: Arc::new(Mutex::new(None)),
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
        self.dataset_versions
            .snapshot(version_id)
            .map_err(AppError::from)
    }

    pub fn current_dataset_version(&self) -> Result<DatasetVersionRecord, AppError> {
        self.dataset_versions.current().map_err(AppError::from)
    }

    pub fn dataset_versions(&self) -> Result<Vec<DatasetVersionRecord>, AppError> {
        self.dataset_versions.list().map_err(AppError::from)
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
        let rev = if let Some(store) = &self.artifact_store {
            let version_id = self.dataset_versions.allocate_artifact_version_id();
            let (content_fingerprint, _) = fingerprints_for_frame(&df);
            let (row_count, column_names) = frame_metadata(&df);
            let store = Arc::clone(store);
            let writer_store = Arc::clone(&store);
            let artifact_frame = df.clone();
            let mut descriptor = tokio::task::spawn_blocking(move || {
                writer_store.write_parquet(
                    version_id,
                    content_fingerprint,
                    Utc::now(),
                    artifact_frame,
                )
            })
            .await
            .map_err(|error| {
                AppError::internal(format!("Failed to join artifact write: {error}"))
            })??;
            let rev = self.repository.replace_from_dataframe(df)?;
            let record = self
                .dataset_versions
                .register_root_artifact(descriptor.clone(), rev, None)
                .map_err(AppError::from)?;
            descriptor.provenance = Some(provenance_from_record(&record, row_count, column_names));
            store.publish(descriptor)?;
            rev
        } else {
            let rev = self.repository.replace_from_dataframe(df.clone())?;
            self.dataset_versions
                .register_root(df, rev, None)
                .map_err(AppError::from)?;
            rev
        };
        // Invalidate cached responses so stale data is never served after upload.
        self.cache.invalidate_all().await;
        self.clear_correlation_matrix_cache();
        Ok(rev)
    }

    /// Make a plan result the active working dataset while retaining its
    /// immutable parent snapshot in the version registry.
    pub async fn materialize_dataset_child(
        &self,
        parent_id: &str,
        df: DataFrame,
        plan_hash: String,
    ) -> Result<DatasetVersionRecord, AppError> {
        // Resolve the parent before replacing the compatibility repository so
        // a bad/stale ID cannot mutate the live working dataset.
        let _parent = self
            .dataset_versions
            .record(parent_id)
            .map_err(AppError::from)?;
        let record = if let Some(store) = &self.artifact_store {
            let version_id = self.dataset_versions.allocate_artifact_version_id();
            let (content_fingerprint, _) = fingerprints_for_frame(&df);
            let (row_count, column_names) = frame_metadata(&df);
            let store = Arc::clone(store);
            let writer_store = Arc::clone(&store);
            let artifact_frame = df.clone();
            let mut descriptor = tokio::task::spawn_blocking(move || {
                writer_store.write_parquet(
                    version_id,
                    content_fingerprint,
                    Utc::now(),
                    artifact_frame,
                )
            })
            .await
            .map_err(|error| {
                AppError::internal(format!("Failed to join artifact write: {error}"))
            })??;
            let revision = self.repository.replace_from_dataframe(df)?;
            let record = self
                .dataset_versions
                .register_child_artifact(parent_id, descriptor.clone(), revision, plan_hash)
                .map_err(AppError::from)?;
            descriptor.provenance = Some(provenance_from_record(&record, row_count, column_names));
            store.publish(descriptor)?;
            record
        } else {
            let revision = self.repository.replace_from_dataframe(df.clone())?;
            self.dataset_versions
                .register_child(parent_id, df, revision, plan_hash)
                .map_err(AppError::from)?
        };
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
    ) -> Result<DatasetVersionRecord, AppError> {
        let _parent = self
            .dataset_versions
            .record(parent_id)
            .map_err(AppError::from)?;
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
        let mut descriptor = store.finalize_lazy_parquet(version_id.clone(), Utc::now())?;
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
        let revision = match self.repository.replace_from_lazyframe(
            scan,
            DatasetMeta {
                row_count,
                column_names: column_names.clone(),
                time_column: Some(time_column),
            },
        ) {
            Ok(revision) => revision,
            Err(error) => {
                store.discard_unpublished_lazy_parquet(&version_id);
                return Err(error);
            }
        };
        let record = self
            .dataset_versions
            .register_child_artifact(parent_id, descriptor.clone(), revision, plan_hash)
            .map_err(AppError::from)?;
        descriptor.provenance = Some(provenance_from_record(&record, row_count, column_names));
        store.publish(descriptor)?;
        self.cache.invalidate_all().await;
        self.clear_correlation_matrix_cache();
        Ok(record)
    }

    /// Select a retained immutable source without removing any versions.
    pub async fn select_dataset_version(
        &self,
        version_id: &str,
    ) -> Result<DatasetVersionRecord, AppError> {
        let snapshot = self.dataset_snapshot_for_version(version_id)?;
        let data = self
            .query_executor
            .execute_async(snapshot)
            .await
            .map_err(AppError::from)?;
        self.repository.replace_from_dataframe(data)?;
        let record = self
            .dataset_versions
            .select(version_id)
            .map_err(AppError::from)?;
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
            .time_column_display_name_sync()
            .unwrap_or_else(|| "ts".to_string());
        ts_context(lf, &ts_col)
    }

    /// Returns row count without forcing a full collect of the active frame.
    /// Uses `count()` on the repository's metadata — O(1) instead of O(n).
    pub async fn dataset_rows(&self) -> usize {
        let meta = self.repository.meta();
        let meta = meta.read().unwrap();
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
    use polars::prelude::{DataFrame, NamedFrom, Series};

    use super::AppState;
    use crate::artifacts::DatasetArtifactProvenance;
    use crate::versions::DatasetVersionRecord;
    use edatime_core::config::AppConfig;

    fn frame(values: Vec<i64>) -> DataFrame {
        DataFrame::new(
            values.len(),
            vec![Series::new("value".into(), values).into()],
        )
        .expect("frame")
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
            .materialize_dataset_child(&root.id, frame(vec![2]), "plan-1".to_string())
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
