//! Persistent descriptors for scan-backed dataset artifacts.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use polars::prelude::{DataFrame, ParquetWriter};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use edatime_core::error::DomainError;

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time_column: Option<String>,
    pub materialized_from_plan_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub applied_plan: Option<Value>,
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

    pub fn load_catalog(&self) -> Result<Vec<DatasetArtifactDescriptor>, DomainError> {
        let path = self.catalog_path();
        if !path.exists() {
            return Ok(Vec::new());
        }
        let bytes = std::fs::read(&path)
            .map_err(|e| DomainError::Io(format!("Read artifact catalog: {e}")))?;
        serde_json::from_slice(&bytes)
            .map_err(|e| DomainError::internal(format!("Parse artifact catalog: {e}")))
    }

    pub fn publish(&self, descriptor: DatasetArtifactDescriptor) -> Result<(), DomainError> {
        std::fs::create_dir_all(&self.root)
            .map_err(|e| DomainError::Io(format!("Create artifact directory: {e}")))?;
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
    ) -> Result<Vec<DatasetArtifactDescriptor>, DomainError> {
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

    fn write_catalog(&self, catalog: &[DatasetArtifactDescriptor]) -> Result<(), DomainError> {
        std::fs::create_dir_all(&self.root)
            .map_err(|e| DomainError::Io(format!("Create artifact directory: {e}")))?;
        let temp = self.root.join("catalog.json.tmp");
        let bytes = serde_json::to_vec_pretty(catalog)
            .map_err(|e| DomainError::internal(format!("Encode artifact catalog: {e}")))?;
        std::fs::write(&temp, bytes)
            .map_err(|e| DomainError::Io(format!("Write artifact catalog: {e}")))?;
        std::fs::rename(temp, self.catalog_path())
            .map_err(|e| DomainError::Io(format!("Publish artifact catalog: {e}")))
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
    ) -> Result<DatasetArtifactDescriptor, DomainError> {
        let file_name = artifact_file_name(&version_id)?;
        std::fs::create_dir_all(&self.root)
            .map_err(|e| DomainError::Io(format!("Create artifact directory: {e}")))?;
        let path = self.root.join(&file_name);
        if path.exists() {
            return Err(DomainError::bad_request(format!(
                "Artifact for dataset version '{version_id}' already exists"
            )));
        }
        let temp = self.root.join(format!("{file_name}.tmp"));
        let file = std::fs::File::create(&temp)
            .map_err(|e| DomainError::Io(format!("Create Parquet artifact: {e}")))?;
        if let Err(error) = ParquetWriter::new(file).finish(&mut frame) {
            let _ = std::fs::remove_file(&temp);
            return Err(DomainError::internal(format!(
                "Write Parquet artifact: {error}"
            )));
        }
        let byte_size = std::fs::metadata(&temp)
            .map_err(|e| DomainError::Io(format!("Read pending Parquet artifact size: {e}")))?
            .len();
        if let Err(error) = self.ensure_capacity(&version_id, byte_size) {
            let _ = std::fs::remove_file(&temp);
            return Err(error);
        }
        if let Err(error) = std::fs::rename(&temp, &path) {
            let _ = std::fs::remove_file(&temp);
            return Err(DomainError::Io(format!(
                "Finalize Parquet artifact: {error}"
            )));
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
    pub fn prepare_lazy_parquet(&self, version_id: &str) -> Result<PathBuf, DomainError> {
        let file_name = artifact_file_name(version_id)?;
        std::fs::create_dir_all(&self.root)
            .map_err(|e| DomainError::Io(format!("Create artifact directory: {e}")))?;
        let path = self.root.join(&file_name);
        if path.exists() {
            return Err(DomainError::bad_request(format!(
                "Artifact for dataset version '{version_id}' already exists"
            )));
        }
        Ok(self.root.join(format!("{file_name}.tmp")))
    }

    /// Atomically promote a complete lazy-sink output to an immutable managed
    /// artifact after quota and bounded-memory file-fingerprint checks succeed.
    /// This reads the entire file; async callers must use an admitted I/O worker.
    pub fn finalize_lazy_parquet(
        &self,
        version_id: String,
        created_at: DateTime<Utc>,
    ) -> Result<DatasetArtifactDescriptor, DomainError> {
        let file_name = artifact_file_name(&version_id)?;
        let temp = self.root.join(format!("{file_name}.tmp"));
        let path = self.root.join(file_name);
        let finalize = || -> Result<DatasetArtifactDescriptor, DomainError> {
            let byte_size = std::fs::metadata(&temp)
                .map_err(|e| DomainError::Io(format!("Read pending Parquet artifact size: {e}")))?
                .len();
            self.ensure_capacity(&version_id, byte_size)?;
            let content_fingerprint = fingerprint_file(&temp)?;
            std::fs::rename(&temp, &path)
                .map_err(|e| DomainError::Io(format!("Finalize Parquet artifact: {e}")))?;
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
    ) -> Result<DatasetArtifactDescriptor, DomainError> {
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

    pub fn usage(&self) -> Result<ArtifactStorageUsage, DomainError> {
        let catalog = self.load_catalog()?;
        Ok(ArtifactStorageUsage {
            enabled: true,
            artifact_count: catalog.len(),
            used_bytes: catalog.iter().map(|entry| entry.byte_size).sum(),
            max_bytes: self.max_bytes,
        })
    }

    fn ensure_capacity(&self, version_id: &str, pending_bytes: u64) -> Result<(), DomainError> {
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
            return Err(DomainError::bad_request(format!(
                "Managed artifact quota exceeded: {} bytes used + {} bytes pending exceeds {} bytes",
                used, pending_bytes, limit
            )));
        }
        Ok(())
    }

    /// Remove files left by interrupted writes before the store begins serving
    /// requests. This must not run during a live write because another unique
    /// artifact temporary file may still be an active streaming sink.
    pub fn recover_temporary_files(&self) -> Result<(), DomainError> {
        if !self.root.exists() {
            return Ok(());
        }
        let entries = std::fs::read_dir(&self.root)
            .map_err(|error| DomainError::Io(format!("Read artifact directory: {error}")))?;
        for entry in entries {
            let entry =
                entry.map_err(|error| DomainError::Io(format!("Read artifact entry: {error}")))?;
            let name = entry.file_name();
            let name = name.to_string_lossy();
            let path = entry.path();
            if (name == "catalog.json.tmp" || name.ends_with(".parquet.tmp")) && path.is_file() {
                std::fs::remove_file(path).map_err(|error| {
                    DomainError::Io(format!("Remove incomplete artifact: {error}"))
                })?;
            }
        }
        Ok(())
    }
}

fn artifact_file_name(version_id: &str) -> Result<String, DomainError> {
    if version_id.is_empty()
        || !version_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    {
        return Err(DomainError::bad_request(
            "Dataset version IDs for managed artifacts may contain only letters, digits, '-' and '_'",
        ));
    }
    Ok(format!("{version_id}.parquet"))
}

fn fingerprint_file(path: &Path) -> Result<String, DomainError> {
    use std::io::Read;

    let mut file = std::fs::File::open(path)
        .map_err(|error| DomainError::Io(format!("Open pending artifact fingerprint: {error}")))?;
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| {
            DomainError::Io(format!("Read pending artifact fingerprint: {error}"))
        })?;
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
mod tests;
