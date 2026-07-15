//! Persistent descriptors for scan-backed dataset artifacts.

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
        if let Err(error) = std::fs::rename(&temp, &path) {
            let _ = std::fs::remove_file(&temp);
            return Err(AppError::Io(format!("Finalize Parquet artifact: {error}")));
        }
        let descriptor = DatasetArtifactDescriptor {
            version_id,
            path,
            format: "parquet".to_string(),
            byte_size: std::fs::metadata(self.root.join(&file_name))
                .map_err(|e| AppError::Io(format!("Read Parquet artifact size: {e}")))?
                .len(),
            content_fingerprint,
            created_at,
            provenance: None,
        };
        Ok(descriptor)
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

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    use chrono::Utc;
    use polars::prelude::{DataFrame, NamedFrom, Series};

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
}
