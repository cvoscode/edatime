# crates/edatime-store/src/lib.rs
> edatime-store — data access layer with repository + storage adapters.

## Modules
- `arrow_adapter` — Arrow IPC and schema adapters
- `cache` — TTL-based response cache + correlation matrix cache entry
- `csv_adapter` — CSV ingestion adapter
- `db` — TimescaleDB/Postgres/SQLite connection pool
- `parquet_adapter` — Parquet I/O adapter
- `repository` — `DataRepository` trait + in-memory implementation (`InMemoryDataRepository`, `DatasetMeta`)
- `state` — `AppState`, `DbConnectionInfo`, `ProfileCacheEntry`
- `artifacts` — `DatasetArtifactStore`, `ArtifactStorageUsage`, `DatasetArtifactProvenance` (cleaning plan artifacts on disk)
- `jobs` — `JobRegistry`, `JobHandle` (background cleaning/profile/correlation jobs)
- `versions` — `DatasetVersionRegistry`, `DatasetVersionRecord`, `fingerprints_for_frame` (cleaning plan versions)