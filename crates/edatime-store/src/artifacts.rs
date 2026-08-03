//! Persistent descriptors for scan-backed dataset artifacts.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use polars::prelude::{DataFrame, ParquetWriter};
use serde::{Deserialize, Serialize};

use edatime_core::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DatasetArtifactDescriptor {
    pub version_id: String,
    pub path: PathBuf,
    pub format: String,
    pub byte_size: u64,
    pub content_fingerprint: String,
    pub created_at: DateTime<Utc>,
    /// Version lineage needed to restore a retained source after restart.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<DatasetArtifactProvenance>,
}

/// Durable version metadata kept separate from storage-file details so old
/// catalogs remain readable while newly published artifacts are restartable.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DatasetArtifactProvenance {
    pub root_id: String,
    pub parent_id: Option<String>,
    pub revision: u64,
    pub schema_fingerprint: String,
    pub source_name: Option<String>,
    pub materialized_from_plan_hash: Option<String>,
    pub row_count: usize,
    pub column_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactStorageUsage {
    pub enabled: bool,
    pub artifact_count: usize,
    pub used_bytes: u64,
    pub max_bytes: Option<u64>,
}

/// Small atomic JSON catalog used as the durable boundary before the version
/// registry begins resolving lazy scans from artifacts.
#[derive(Debug, Clone)]
pub struct DatasetArtifactStore {
    root: PathBuf,
    max_bytes: Option<u64>,
}

impl DatasetArtifactStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            max_bytes: None,
        }
    }

    pub fn with_max_bytes(root: impl Into<PathBuf>, max_bytes: Option<u64>) -> Self {
        Self {
            root: root.into(),
            max_bytes,
        }
    }

    fn catalog_path(&self) -> PathBuf {
        self.root.join("catalog.json")
    }

    pub fn load_catalog(&self) -> Result<Vec<DatasetArtifactDescriptor>, AppError> {
        let path = self.catalog_path();
        if !path.exists() {
            return Ok(Vec::new());
        }
        let bytes = std::fs::read(&path)
            .map_err(|e| AppError::Io(format!("Read artifact catalog: {e}")))?;
        serde_json::from_slice(&bytes)
            .map_err(|e| AppError::internal(format!("Parse artifact catalog: {e}")))
    }

    pub fn publish(&self, descriptor: DatasetArtifactDescriptor) -> Result<(), AppError> {
        std::fs::create_dir_all(&self.root)
            .map_err(|e| AppError::Io(format!("Create artifact directory: {e}")))?;
        let mut catalog = self.load_catalog()?;
        catalog.retain(|entry| entry.version_id != descriptor.version_id);
        catalog.push(descriptor);
        self.write_catalog(&catalog)
    }

    /// Atomically remove catalog entries outside a validated retention set,
    /// then best-effort remove their files. Publishing the catalog first keeps
    /// restart recovery valid even if a file is temporarily locked; an orphan
    /// is safer than deleting an operator-managed file during recovery.
    pub fn prune_except(
        &self,
        retained: &BTreeSet<String>,
    ) -> Result<Vec<DatasetArtifactDescriptor>, AppError> {
        let catalog = self.load_catalog()?;
        let (kept, removed): (Vec<_>, Vec<_>) = catalog
            .into_iter()
            .partition(|entry| retained.contains(&entry.version_id));
        if removed.is_empty() {
            return Ok(Vec::new());
        }
        self.write_catalog(&kept)?;
        for descriptor in &removed {
            if let Err(error) = std::fs::remove_file(&descriptor.path)
                && error.kind() != std::io::ErrorKind::NotFound
            {
                tracing::warn!(
                    "Could not delete pruned artifact '{}': {error}",
                    descriptor.path.display()
                );
            }
        }
        Ok(removed)
    }

    fn write_catalog(&self, catalog: &[DatasetArtifactDescriptor]) -> Result<(), AppError> {
        std::fs::create_dir_all(&self.root)
            .map_err(|e| AppError::Io(format!("Create artifact directory: {e}")))?;
        let temp = self.root.join("catalog.json.tmp");
        let bytes = serde_json::to_vec_pretty(catalog)
            .map_err(|e| AppError::internal(format!("Encode artifact catalog: {e}")))?;
        std::fs::write(&temp, bytes)
            .map_err(|e| AppError::Io(format!("Write artifact catalog: {e}")))?;
        std::fs::rename(temp, self.catalog_path())
            .map_err(|e| AppError::Io(format!("Publish artifact catalog: {e}")))
    }

    /// Write a complete immutable frame to its final managed Parquet path but
    /// do not yet expose it in the catalog. Callers can attach the definitive
    /// registry provenance before publishing the descriptor.
    pub fn write_parquet(
        &self,
        version_id: String,
        content_fingerprint: String,
        created_at: DateTime<Utc>,
        mut frame: DataFrame,
    ) -> Result<DatasetArtifactDescriptor, AppError> {
        let file_name = artifact_file_name(&version_id)?;
        std::fs::create_dir_all(&self.root)
            .map_err(|e| AppError::Io(format!("Create artifact directory: {e}")))?;
        let path = self.root.join(&file_name);
        if path.exists() {
            return Err(AppError::bad_request(format!(
                "Artifact for dataset version '{version_id}' already exists"
            )));
        }
        let temp = self.root.join(format!("{file_name}.tmp"));
        let file = std::fs::File::create(&temp)
            .map_err(|e| AppError::Io(format!("Create Parquet artifact: {e}")))?;
        if let Err(error) = ParquetWriter::new(file).finish(&mut frame) {
            let _ = std::fs::remove_file(&temp);
            return Err(AppError::internal(format!(
                "Write Parquet artifact: {error}"
            )));
        }
        let byte_size = std::fs::metadata(&temp)
            .map_err(|e| AppError::Io(format!("Read pending Parquet artifact size: {e}")))?
            .len();
        if let Err(error) = self.ensure_capacity(&version_id, byte_size) {
            let _ = std::fs::remove_file(&temp);
            return Err(error);
        }
        if let Err(error) = std::fs::rename(&temp, &path) {
            let _ = std::fs::remove_file(&temp);
            return Err(AppError::Io(format!("Finalize Parquet artifact: {error}")));
        }
        let descriptor = DatasetArtifactDescriptor {
            version_id,
            path,
            format: "parquet".to_string(),
            byte_size,
            content_fingerprint,
            created_at,
            provenance: None,
        };
        Ok(descriptor)
    }

    /// Reserve the temporary path used by a lazy streaming Parquet sink. The
    /// final artifact remains invisible until `finalize_lazy_parquet` renames
    /// it and the caller publishes its descriptor.
    pub fn prepare_lazy_parquet(&self, version_id: &str) -> Result<PathBuf, AppError> {
        let file_name = artifact_file_name(version_id)?;
        std::fs::create_dir_all(&self.root)
            .map_err(|e| AppError::Io(format!("Create artifact directory: {e}")))?;
        let path = self.root.join(&file_name);
        if path.exists() {
            return Err(AppError::bad_request(format!(
                "Artifact for dataset version '{version_id}' already exists"
            )));
        }
        Ok(self.root.join(format!("{file_name}.tmp")))
    }

    /// Atomically promote a complete lazy-sink output to an immutable managed
    /// artifact after quota and bounded file-fingerprint checks succeed.
    pub fn finalize_lazy_parquet(
        &self,
        version_id: String,
        created_at: DateTime<Utc>,
    ) -> Result<DatasetArtifactDescriptor, AppError> {
        let file_name = artifact_file_name(&version_id)?;
        let temp = self.root.join(format!("{file_name}.tmp"));
        let path = self.root.join(file_name);
        let finalize = || -> Result<DatasetArtifactDescriptor, AppError> {
            let byte_size = std::fs::metadata(&temp)
                .map_err(|e| AppError::Io(format!("Read pending Parquet artifact size: {e}")))?
                .len();
            self.ensure_capacity(&version_id, byte_size)?;
            let content_fingerprint = fingerprint_file(&temp)?;
            std::fs::rename(&temp, &path)
                .map_err(|e| AppError::Io(format!("Finalize Parquet artifact: {e}")))?;
            Ok(DatasetArtifactDescriptor {
                version_id,
                path,
                format: "parquet".to_string(),
                byte_size,
                content_fingerprint,
                created_at,
                provenance: None,
            })
        };
        match finalize() {
            Ok(descriptor) => Ok(descriptor),
            Err(error) => {
                let _ = std::fs::remove_file(temp);
                Err(error)
            }
        }
    }

    pub fn discard_pending_lazy_parquet(&self, version_id: &str) {
        if let Ok(file_name) = artifact_file_name(version_id) {
            let _ = std::fs::remove_file(self.root.join(format!("{file_name}.tmp")));
        }
    }

    pub fn discard_unpublished_lazy_parquet(&self, version_id: &str) {
        if let Ok(file_name) = artifact_file_name(version_id) {
            let _ = std::fs::remove_file(self.root.join(&file_name));
            let _ = std::fs::remove_file(self.root.join(format!("{file_name}.tmp")));
        }
    }

    /// Write a complete immutable frame and immediately publish it when the
    /// caller does not need to enrich the descriptor with registry metadata.
    pub fn publish_parquet(
        &self,
        version_id: String,
        content_fingerprint: String,
        created_at: DateTime<Utc>,
        frame: DataFrame,
    ) -> Result<DatasetArtifactDescriptor, AppError> {
        let descriptor = self.write_parquet(version_id, content_fingerprint, created_at, frame)?;
        if let Err(error) = self.publish(descriptor.clone()) {
            let _ = std::fs::remove_file(&descriptor.path);
            return Err(error);
        }
        Ok(descriptor)
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn max_bytes(&self) -> Option<u64> {
        self.max_bytes
    }

    pub fn usage(&self) -> Result<ArtifactStorageUsage, AppError> {
        let catalog = self.load_catalog()?;
        Ok(ArtifactStorageUsage {
            enabled: true,
            artifact_count: catalog.len(),
            used_bytes: catalog.iter().map(|entry| entry.byte_size).sum(),
            max_bytes: self.max_bytes,
        })
    }

    fn ensure_capacity(&self, version_id: &str, pending_bytes: u64) -> Result<(), AppError> {
        let Some(limit) = self.max_bytes else {
            return Ok(());
        };
        let used = self
            .load_catalog()?
            .into_iter()
            .filter(|entry| entry.version_id != version_id)
            .map(|entry| entry.byte_size)
            .sum::<u64>();
        if used.saturating_add(pending_bytes) > limit {
            return Err(AppError::bad_request(format!(
                "Managed artifact quota exceeded: {} bytes used + {} bytes pending exceeds {} bytes",
                used, pending_bytes, limit
            )));
        }
        Ok(())
    }

    /// Remove files left by interrupted writes before the store begins serving
    /// requests. This must not run during a live write because another unique
    /// artifact temporary file may still be an active streaming sink.
    pub fn recover_temporary_files(&self) -> Result<(), AppError> {
        if !self.root.exists() {
            return Ok(());
        }
        let entries = std::fs::read_dir(&self.root)
            .map_err(|error| AppError::Io(format!("Read artifact directory: {error}")))?;
        for entry in entries {
            let entry =
                entry.map_err(|error| AppError::Io(format!("Read artifact entry: {error}")))?;
            let name = entry.file_name();
            let name = name.to_string_lossy();
            let path = entry.path();
            if (name == "catalog.json.tmp" || name.ends_with(".parquet.tmp")) && path.is_file() {
                std::fs::remove_file(path).map_err(|error| {
                    AppError::Io(format!("Remove incomplete artifact: {error}"))
                })?;
            }
        }
        Ok(())
    }
}

fn artifact_file_name(version_id: &str) -> Result<String, AppError> {
    if version_id.is_empty()
        || !version_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    {
        return Err(AppError::bad_request(
            "Dataset version IDs for managed artifacts may contain only letters, digits, '-' and '_'",
        ));
    }
    Ok(format!("{version_id}.parquet"))
}

fn fingerprint_file(path: &Path) -> Result<String, AppError> {
    use std::io::Read;

    let mut file = std::fs::File::open(path)
        .map_err(|error| AppError::Io(format!("Open pending artifact fingerprint: {error}")))?;
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| AppError::Io(format!("Read pending artifact fingerprint: {error}")))?;
        if read == 0 {
            break;
        }
        for byte in &buffer[..read] {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    Ok(format!("fnv1a-parquet-{hash:016x}"))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    use chrono::Utc;
    use polars::prelude::{DataFrame, NamedFrom, Series};

    use super::{ArtifactStorageUsage, DatasetArtifactDescriptor, DatasetArtifactStore};

    static NEXT_TEST_DIRECTORY: AtomicU64 = AtomicU64::new(0);

    fn test_root() -> PathBuf {
        let serial = NEXT_TEST_DIRECTORY.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "edatime-artifact-store-{}-{serial}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ))
    }

    fn descriptor(version_id: &str, byte_size: u64) -> DatasetArtifactDescriptor {
        DatasetArtifactDescriptor {
            version_id: version_id.to_string(),
            path: PathBuf::from(format!("{version_id}.parquet")),
            format: "parquet".to_string(),
            byte_size,
            content_fingerprint: format!("fingerprint-{version_id}-{byte_size}"),
            created_at: Utc::now(),
            provenance: None,
        }
    }

    fn frame(values: Vec<i64>) -> DataFrame {
        DataFrame::new(
            values.len(),
            vec![Series::new("value".into(), values).into()],
        )
        .expect("frame")
    }

    #[test]
    fn a_missing_catalog_is_an_empty_catalog() {
        let root = test_root();
        let store = DatasetArtifactStore::new(&root);

        assert_eq!(
            store.load_catalog().expect("load empty catalog"),
            Vec::new()
        );
        assert!(!root.exists());
    }

    #[test]
    fn publishing_replaces_a_version_without_leaving_a_temp_catalog() {
        let root = test_root();
        let store = DatasetArtifactStore::new(&root);
        let first = descriptor("source-7", 12);
        let replacement = descriptor("source-7", 24);

        store.publish(first).expect("publish first descriptor");
        store
            .publish(replacement.clone())
            .expect("replace descriptor");

        assert_eq!(
            store.load_catalog().expect("load replacement catalog"),
            vec![replacement]
        );
        assert!(!root.join("catalog.json.tmp").exists());

        fs::remove_dir_all(root).expect("clean test artifact directory");
    }

    #[test]
    fn publishing_parquet_writes_the_artifact_before_catalog_visibility() {
        let root = test_root();
        let store = DatasetArtifactStore::new(&root);

        let published = store
            .publish_parquet(
                "source-8".to_string(),
                "content-8".to_string(),
                Utc::now(),
                frame(vec![1, 2, 3]),
            )
            .expect("publish parquet artifact");

        assert!(published.path.exists());
        assert!(published.byte_size > 0);
        assert_eq!(store.load_catalog().expect("load catalog"), vec![published]);
        assert!(!root.join("source-8.parquet.tmp").exists());

        fs::remove_dir_all(root).expect("clean test artifact directory");
    }

    #[test]
    fn quota_rejects_an_artifact_before_it_is_published() {
        let root = test_root();
        let store = DatasetArtifactStore::with_max_bytes(&root, Some(1));

        let error = store
            .publish_parquet(
                "source-9".to_string(),
                "content-9".to_string(),
                Utc::now(),
                frame(vec![1, 2, 3]),
            )
            .expect_err("quota should reject parquet");

        assert!(error.to_string().contains("quota exceeded"));
        assert!(store.load_catalog().expect("catalog").is_empty());
        assert!(!root.join("source-9.parquet").exists());
        assert!(!root.join("source-9.parquet.tmp").exists());

        fs::remove_dir_all(root).expect("clean test artifact directory");
    }

    #[test]
    fn usage_reports_catalogued_artifact_bytes_and_quota() {
        let root = test_root();
        let store = DatasetArtifactStore::with_max_bytes(&root, Some(10_000));
        store
            .publish(descriptor("source-10", 123))
            .expect("publish descriptor");

        assert_eq!(
            store.usage().expect("usage"),
            ArtifactStorageUsage {
                enabled: true,
                artifact_count: 1,
                used_bytes: 123,
                max_bytes: Some(10_000),
            }
        );

        fs::remove_dir_all(root).expect("clean test artifact directory");
    }

    #[test]
    fn lazy_finalize_checks_quota_and_removes_rejected_temp_output() {
        let root = test_root();
        let store = DatasetArtifactStore::with_max_bytes(&root, Some(1));
        let temp = store
            .prepare_lazy_parquet("source-11")
            .expect("pending path");
        fs::write(&temp, b"larger than quota").expect("pending bytes");

        let error = store
            .finalize_lazy_parquet("source-11".to_string(), Utc::now())
            .expect_err("quota should reject lazy artifact");

        assert!(error.to_string().contains("quota exceeded"));
        assert!(!temp.exists());
        assert!(!root.join("source-11.parquet").exists());
        fs::remove_dir_all(root).expect("clean test artifact directory");
    }

    #[test]
    fn startup_recovery_cleans_only_recognized_interrupted_artifacts() {
        let root = test_root();
        fs::create_dir_all(&root).expect("create artifact directory");
        fs::write(root.join("catalog.json.tmp"), "partial catalog").expect("write catalog temp");
        fs::write(root.join("source-11.parquet.tmp"), "partial parquet")
            .expect("write parquet temp");
        fs::write(root.join("operator-note.tmp"), "keep me").expect("write unrelated temp");
        let store = DatasetArtifactStore::new(&root);

        store
            .recover_temporary_files()
            .expect("recover interrupted writes");

        assert!(!root.join("catalog.json.tmp").exists());
        assert!(!root.join("source-11.parquet.tmp").exists());
        assert!(root.join("operator-note.tmp").exists());

        fs::remove_dir_all(root).expect("clean test artifact directory");
    }

    #[test]
    fn catalog_publication_does_not_remove_an_active_sink_temp_file() {
        let root = test_root();
        let store = DatasetArtifactStore::new(&root);
        let active = store
            .prepare_lazy_parquet("source-active")
            .expect("active sink path");
        fs::write(&active, "in progress").expect("active sink bytes");

        store
            .publish(descriptor("source-complete", 1))
            .expect("publish unrelated descriptor");

        assert!(active.exists());
        fs::remove_dir_all(root).expect("clean test artifact directory");
    }

    #[test]
    fn pruning_updates_the_catalog_and_removes_only_pruned_managed_files() {
        let root = test_root();
        let store = DatasetArtifactStore::new(&root);
        let first = store
            .write_parquet(
                "source-retained".to_string(),
                "fingerprint-retained".to_string(),
                Utc::now(),
                frame(vec![1]),
            )
            .expect("first artifact");
        let second = store
            .write_parquet(
                "source-pruned".to_string(),
                "fingerprint-pruned".to_string(),
                Utc::now(),
                frame(vec![2]),
            )
            .expect("second artifact");
        store.publish(first.clone()).expect("publish first");
        store.publish(second.clone()).expect("publish second");
        let operator_file = root.join("operator.parquet");
        fs::write(&operator_file, "leave me alone").expect("operator file");

        let retained = [first.version_id.clone()].into_iter().collect();
        let removed = store.prune_except(&retained).expect("prune artifacts");

        assert_eq!(removed, vec![second.clone()]);
        assert!(first.path.exists());
        assert!(!second.path.exists());
        assert!(operator_file.exists());
        assert_eq!(store.load_catalog().expect("catalog"), vec![first]);
        fs::remove_dir_all(root).expect("clean test artifact directory");
    }
}
