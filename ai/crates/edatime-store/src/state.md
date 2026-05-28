# crates/edatime-store/src/state.rs
> Live application state — repository, query executor, cache, metrics, config, DB pool.

## Struct

### `DbConnectionInfo`
- `schema: String`
- `table: String`
- `time_column: Option<String>`

### `AppState`
- `repository: Arc<dyn DataRepository>` [deps: [repository][1]]
- `query_executor: Arc<QueryExecutor>` [deps: [edatime-query/executor][2]]
- `cache: Arc<ResponseCache>` [deps: [cache][3]]
- `metrics: Arc<AppMetrics>` [deps: [edatime-core/metrics][4]]
- `config: Arc<AppConfig>` [deps: [edatime-core/config][5]]
- `db_pool: Arc<RwLock<Option<Arc<DbPool>>>>` [deps: [db][6]]
- `db_info: Arc<RwLock<Option<DbConnectionInfo>>>`
- `drift_cache: DriftCache`
- `query_log: Arc<Mutex<VecDeque<QueryEntry>>>`
- `query_counter: Arc<AtomicU64>`

## Methods
- `new(df: DataFrame, config: AppConfig) -> Self`
- `has_db_connection(&self) -> bool`
- `dataset_snapshot(&self) -> LazyFrame` [deps: [repository][1]]
- `dataset_snapshot_for_columns(&self, columns: &[&str]) -> Result<LazyFrame, AppError>` [deps: [edatime-core/error][7]]
- `replace_dataset(&self, df: DataFrame) -> Result<u64, std::io::Error>`
- `set_time_column_display_name(&self, name: Option<String>)`
- `time_column_display_name_sync(&self) -> Option<String>`
- `ts_context(&self, lf: &LazyFrame) -> Result<TsContext, AppError>` [deps: [edatime-core/temporal][8]]
- `dataset_rows(&self) -> usize`
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