# crates/edatime-store/src/versions.rs
> Session-scoped registry of immutable dataset versions used by reversible cleaning plans. Each version is either resident (`LazyFrame`) or scan-backed (`PathBuf` Parquet).

## Structs
- `pub struct DatasetVersionRecord { id, root_id, parent_id?, revision, dataset_fingerprint, schema_fingerprint, source_name?, materialized_from_plan_hash?, created_at }` (camelCase JSON)
  - `dataset_fingerprint` is the canonical content identity used by plan/cache keys.
  - `schema_fingerprint` is the FNV-1a over canonical `name:dtype` pairs.

## Private
- `struct DatasetVersionEntry { record, source: DatasetVersionSource }`
- `enum DatasetVersionSource { Resident(LazyFrame), Parquet(PathBuf) }`
  - `DatasetVersionSource::snapshot() -> Result<LazyFrame, AppError>` — Re-opens a fresh `LazyFrame::scan_parquet` each call; resident frames are cloned.

## `DatasetVersionRegistry` methods
- `DatasetVersionRegistry::empty() -> Self` — Empty registry used while restoring an artifact catalog at startup.
- `DatasetVersionRegistry::new(initial: DataFrame, revision: u64, source_name: Option<String>) -> Self` — Registers `source-0` as the initial resident frame; computes fingerprints.
- `pub fn fingerprints_for_frame(df: &DataFrame) -> (String, String)` — Returns `(dataset_fingerprint, schema_fingerprint)`. Uses Arrow IPC bytes for `dataset_fingerprint` (includes column order, dtypes, row order, nulls, values); falls back to a deterministic diagnostic fingerprint on serializer failure.
- `current() -> Result<DatasetVersionRecord, AppError>` / `record(id) -> ...` / `list() -> Result<Vec<DatasetVersionRecord>, AppError>`
- `snapshot(id: &str) -> Result<LazyFrame, AppError>` — Resolves either a resident clone or a fresh Parquet scan.
- `lineage_ids(version_id) -> Result<BTreeSet<String>, AppError>` — Walks `parent_id` chain root-to-leaf; rejects cycles.
- `retain_ids(retained: &BTreeSet<String>) -> Result<(), AppError>` — Drops un-retained entries; refuses if the active version is not in `retained`.
- `register_root(frame, revision, source_name?) -> Result<DatasetVersionRecord, AppError>` — Allocates a new `source-N` ID via `allocate_version_id`; sets it as the current version.
- `register_child(parent_id, frame, revision, plan_hash: String) -> Result<DatasetVersionRecord, AppError>` — Inherits `root_id` and `source_name`; stores `plan_hash` as `materialized_from_plan_hash`.
- `allocate_version_id() -> String` — Returns `source-{n}` for in-memory versions.
- `allocate_artifact_version_id() -> String` — Returns `artifact-{unix_ns}-{n}` for durable artifacts that can outlive a process.
- `register_root_artifact(artifact, revision, source_name?) -> Result<DatasetVersionRecord, AppError>` — Rejects non-`"parquet"` formats; computes the schema fingerprint from a fresh scan so it matches what the catalog promises.
- `register_child_artifact(parent_id, artifact, revision, plan_hash) -> Result<DatasetVersionRecord, AppError>` — Same contract as `register_child` but backed by a published Parquet artifact; rejects format mismatches and duplicate IDs.
- `restore_artifacts(artifacts: Vec<DatasetArtifactDescriptor>) -> Result<Vec<DatasetVersionRecord>, AppError>` — Replays parent-before-child by topological order on `provenance.parent_id`; re-checks schema fingerprint; sets the most-recent `created_at` as current.
- `select(id: &str) -> Result<DatasetVersionRecord, AppError>` — Switches the active version without rewriting its identity.

## Module-private helpers
- `fn schema_fingerprint(frame: LazyFrame) -> Result<String, AppError>` — Computes the canonical schema fingerprint from a lazy frame's schema.
- `fn fnv1a(input: &str) -> String`, `fn fnv1a_bytes(input: &[u8]) -> String`
- `fn parquet_source(artifact: &DatasetArtifactDescriptor) -> Result<DatasetVersionSource, AppError>`
- `fn record_from_artifact(artifact, provenance) -> Result<DatasetVersionRecord, AppError>` — Enforces `root_id == version_id` for roots without a parent.

## Notes
- The registry is the durable identity boundary; the live repository in `state.rs` is a compatibility facade (see `state.md`).
- Restoring an artifact that fails the schema-fingerprint check is treated as a corrupt catalog (`bad_request`).
- Schema fingerprint is stable across processes because it is computed from the schema's `name:dtype` strings.
- `dataset_fingerprint` uses Arrow IPC bytes of the resident frame; this changes when the underlying data, row order, nulls, or dtypes change. (See streaming hashing todo for `Milestone D`.)
