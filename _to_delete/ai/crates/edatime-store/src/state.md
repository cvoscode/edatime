# crates/edatime-store/src/state.rs
> Live application state — repository, dataset versions, query executor, jobs, cache, metrics, config, DB pool, correlation matrix cache, profile cache.

## Struct

### `DbConnectionInfo`
- `schema: String`
- `table: String`
- `time_column: Option<String>`

### `ProfileCacheEntry`
- `job_id: String`
- `result: Option<serde_json::Value>`
- A version-keyed completed or in-progress profile. Stored as raw JSON at the store boundary so `edatime-store` does not depend on the HTTP DTO crate that owns the profile schema.

### `AppState`
- `repository: Arc<dyn DataRepository>` [deps: [repository][1]]
- `dataset_versions: Arc<DatasetVersionRegistry>` [deps: [versions][v]] — Cleaning-plan dataset versions, used for the `POST /api/v1/datasets/versions/select` handoff.
- `artifact_store: Option<Arc<DatasetArtifactStore>>` [deps: [artifacts][a]] — Optional disk-backed artifact store for cleaning plans (only present when `config.data.artifact_dir` is configured).
- `query_executor: Arc<QueryExecutor>` [deps: [edatime-query/executor][2]]
- `jobs: Arc<JobRegistry>` [deps: [jobs][j]] — Background cleaning / profile / correlation jobs (`GET /api/v1/jobs`, `GET /api/v1/jobs/{id}`, `DELETE /api/v1/jobs/{id}`).
- `cache: Arc<ResponseCache>` [deps: [cache][3]]
- `metrics: Arc<AppMetrics>` [deps: [edatime-core/metrics][4]]
- `config: Arc<AppConfig>` [deps: [edatime-core/config][5]]
- `db_pool: Arc<RwLock<Option<Arc<DbPool>>>>` [deps: [db][6]]
- `db_info: Arc<RwLock<Option<DbConnectionInfo>>>`
- `correlation_matrix_cache: Arc<Mutex<Option<(u64, CorrelationMatrixCacheEntry)>>>` [deps: [CorrelationMatrixCacheEntry][3]]
- `profile_cache: Arc<Mutex<BTreeMap<String, ProfileCacheEntry>>>`
- `query_log: Arc<Mutex<VecDeque<QueryEntry>>>`
- `query_counter: Arc<AtomicU64>`

[v]: versions.md
[a]: artifacts.md
[j]: jobs.md

## Methods
- `new(df: DataFrame, config: AppConfig) -> Self` — also restores the dataset-version catalog from `artifact_store` if configured and the input `DataFrame` is empty.
- `async has_db_connection(&self) -> bool`
- `dataset_snapshot(&self) -> LazyFrame` [deps: [repository][1]]
- `dataset_snapshot_for_version(&self, version_id: &str) -> Result<LazyFrame, AppError>` — snapshot of a specific dataset version (used by cleaning handoff).
- `current_dataset_version(&self) -> Result<DatasetVersionRecord, AppError>`
- `dataset_versions(&self) -> Result<Vec<DatasetVersionRecord>, AppError>`
- `artifact_storage_usage(&self) -> Result<ArtifactStorageUsage, AppError>`
- `async dataset_snapshot_for_columns(&self, columns: &[&str]) -> Result<LazyFrame, AppError>` [deps: [edatime-core/error][7]]
- `async replace_dataset(&self, df: DataFrame) -> Result<u64, AppError>`
  - Replaces the dataset, invalidates the response cache, and clears the correlation matrix cache.
- `async replace_dataset_lazy_root(&self, lf: LazyFrame, row_count: usize, column_names: Vec<String>) -> Result<u64, AppError>`
- `async materialize_dataset_child(&self, lf: LazyFrame, row_count: usize, column_names: Vec<String>) -> Result<u64, AppError>`
- `async materialize_dataset_child_lazy(&self, lf: LazyFrame) -> Result<u64, AppError>`
- `async select_dataset_version(&self, version_id: &str) -> Result<u64, AppError>` — implements the `POST /api/v1/datasets/versions/select` handoff.
- `cached_correlation_matrix(&self, revision: u64) -> Option<CorrelationMatrixCacheEntry>`
  - Returns the cached NxN matrix if it matches the given dataset revision; otherwise None.
- `store_correlation_matrix_if_current(&self, revision: u64, entry: CorrelationMatrixCacheEntry) -> bool`
  - Stores the matrix only if the dataset revision has not changed since `revision` was read.
- `clear_correlation_matrix_cache(&self)`
  - Drops the cached matrix (used by `replace_dataset` and warmup reset paths).
- `cached_profile(&self, key: &str) -> Option<ProfileCacheEntry>`
- `store_profile(&self, key: String, entry: ProfileCacheEntry)`
- `set_time_column_display_name(&self, name: Option<String>)`
- `time_column_display_name_sync(&self) -> Option<String>`
- `ts_context(&self, lf: &LazyFrame) -> Result<TsContext, AppError>` [deps: [edatime-core/temporal][8]]
- `async dataset_rows(&self) -> usize`
- `dataset_revision(&self) -> u64`
- `push_query(&self, entry: QueryEntry)`
- `drain_queries(&self) -> Vec<QueryEntry>`
- `next_query_id(&self) -> u64`

---
[1]: repository.md
[2]: ../../edatime-query/src/executor.md
[3]: cache.md
[4]: ../../edatime-core/src/metrics.md
[5]: ../../edatime-core/src/config.md
[6]: db.md
[7]: ../../edatime-core/src/error.md
[8]: ../../edatime-core/src/temporal.md
