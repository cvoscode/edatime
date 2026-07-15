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
