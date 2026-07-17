# crates/edatime-store/src/artifacts.rs
> Atomic-JSON catalog and immutable Parquet artifact management for reversible cleaning-plan dataset versions.

## Structs
- `pub struct DatasetArtifactDescriptor { version_id, path, format, byte_size, content_fingerprint, created_at, provenance?: Option<DatasetArtifactProvenance> }` — Single entry written into `catalog.json`. `format` is `"parquet"`; `content_fingerprint` is FNV-1a over Parquet bytes; `provenance` is optional for legacy catalogs.
- `pub struct DatasetArtifactProvenance { root_id, parent_id?, revision, schema_fingerprint, source_name?, materialized_from_plan_hash?, row_count, column_names }` — Version lineage stored separately so old catalogs remain readable while newly published artifacts are restartable.
- `pub struct ArtifactStorageUsage { enabled: bool, artifact_count: usize, used_bytes: u64, max_bytes: Option<u64> }` — Disk-usage summary surfaced via `GET /api/v1/datasets/storage`.
- `pub struct DatasetArtifactStore { root: PathBuf, max_bytes: Option<u64> }` — Small atomic JSON catalog used as the durable boundary before the version registry resolves lazy scans from artifacts.

## Functions / methods
- `DatasetArtifactStore::new(root: impl Into<PathBuf>) -> Self`
- `DatasetArtifactStore::with_max_bytes(root: impl Into<PathBuf>, max_bytes: Option<u64>) -> Self`
- `DatasetArtifactStore::load_catalog() -> Result<Vec<DatasetArtifactDescriptor>, AppError>` — Missing catalog returns empty `Vec`; never errors.
- `DatasetArtifactStore::publish(descriptor) -> Result<(), AppError>` — Removes any existing entry with the same `version_id`, writes catalog atomically via `catalog.json.tmp` → rename.
- `DatasetArtifactStore::prune_except(retained: &BTreeSet<String>) -> Result<Vec<DatasetArtifactDescriptor>, AppError>` — Updates catalog before file deletion so restart recovery is valid even if a file is temporarily locked; orphan files are preferred to deleting operator-managed files mid-recovery.
- `DatasetArtifactStore::write_parquet(version_id, content_fingerprint, created_at, frame: DataFrame) -> Result<DatasetArtifactDescriptor, AppError>` — Writes the frame to `<id>.parquet` via a `.tmp` rename; rejects on collision and on quota overflow; removes temp on error.
- `DatasetArtifactStore::prepare_lazy_parquet(version_id: &str) -> Result<PathBuf, AppError>` — Reserves `<id>.parquet.tmp` path for a streaming sink; the artifact stays invisible until `finalize_lazy_parquet`.
- `DatasetArtifactStore::finalize_lazy_parquet(version_id, created_at) -> Result<DatasetArtifactDescriptor, AppError>` — Renames temp → final after quota + FNV-1a fingerprint checks; cleans up temp on failure.
- `DatasetArtifactStore::discard_pending_lazy_parquet(version_id)` / `discard_unpublished_lazy_parquet(version_id)` — Best-effort cleanup of `.parquet.tmp` (and final) without touching the catalog.
- `DatasetArtifactStore::publish_parquet(version_id, content_fingerprint, created_at, frame) -> Result<DatasetArtifactDescriptor, AppError>` — `write_parquet` + `publish` convenience; rolls back file on catalog failure.
- `DatasetArtifactStore::root() -> &Path`, `max_bytes() -> Option<u64>`
- `DatasetArtifactStore::usage() -> Result<ArtifactStorageUsage, AppError>` — Reports `enabled=true`, total cataloged bytes, configured limit.
- `DatasetArtifactStore::ensure_capacity(version_id, pending_bytes) -> Result<(), AppError>` — Private quota check that excludes the pending `version_id` from the running total.
- `DatasetArtifactStore::recover_temporary_files() -> Result<(), AppError>` — Removes only `catalog.json.tmp` and `*.parquet.tmp` left by interrupted writes (intentionally NOT `*.tmp` of unrelated operator files). Must not run during live streaming writes.

## Module-private helpers
- `fn artifact_file_name(version_id: &str) -> Result<String, AppError>` — Validates `[A-Za-z0-9_-]+` to prevent path traversal.
- `fn fingerprint_file(path: &Path) -> Result<String, AppError>` — Streams the file through FNV-1a 64-bit; returns `"fnv1a-parquet-{hash:016x}"`.

## Notes
- Quota policy: sums all cataloged bytes except `pending_bytes` for the same `version_id`; rejects when `used + pending > max_bytes`.
- Version-ID format: must be non-empty ASCII alphanumeric with `-` / `_` allowed only.
- The store deliberately does not delete `.tmp` files of an active streaming sink; `recover_temporary_files` is a startup-only operation.
