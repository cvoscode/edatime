//! Persistent descriptors for scan-backed dataset artifacts.

use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
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
}

/// Small atomic JSON catalog used as the durable boundary before the version
/// registry begins resolving lazy scans from artifacts.
#[derive(Debug, Clone)]
pub struct DatasetArtifactStore {
    root: PathBuf,
}

impl DatasetArtifactStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
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
        let temp = self.root.join("catalog.json.tmp");
        let bytes = serde_json::to_vec_pretty(&catalog)
            .map_err(|e| AppError::internal(format!("Encode artifact catalog: {e}")))?;
        std::fs::write(&temp, bytes)
            .map_err(|e| AppError::Io(format!("Write artifact catalog: {e}")))?;
        std::fs::rename(temp, self.catalog_path())
            .map_err(|e| AppError::Io(format!("Publish artifact catalog: {e}")))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    use chrono::Utc;

    use super::{DatasetArtifactDescriptor, DatasetArtifactStore};

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
        }
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
}
