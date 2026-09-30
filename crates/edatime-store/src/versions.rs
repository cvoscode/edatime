//! Immutable dataset-version snapshots used by reversible cleaning plans.

use std::collections::{BTreeMap, BTreeSet};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use chrono::{DateTime, Utc};
use polars::prelude::{
    DataFrame, IntoLazy, IpcStreamWriter, LazyFrame, ScanArgsParquet, SchemaExt, SerWriter,
};
use serde::Serialize;
use serde_json::Value;

use edatime_core::error::DomainError;

use crate::artifacts::{DatasetArtifactDescriptor, DatasetArtifactProvenance};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetVersionRecord {
    pub id: String,
    pub root_id: String,
    pub parent_id: Option<String>,
    pub revision: u64,
    pub dataset_fingerprint: String,
    pub schema_fingerprint: String,
    pub source_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_column: Option<String>,
    pub materialized_from_plan_hash: Option<String>,
    /// Kept out of the version-list response; the dedicated provenance route
    /// returns this potentially large snapshot on demand.
    #[serde(skip)]
    pub applied_plan: Option<Value>,
    pub created_at: DateTime<Utc>,
}

pub(crate) struct ResidentVersionIdentity {
    pub(crate) resident_bytes: u64,
    pub(crate) dataset_fingerprint: String,
    pub(crate) schema_fingerprint: String,
}

#[derive(Clone)]
struct DatasetVersionEntry {
    record: DatasetVersionRecord,
    source: DatasetVersionSource,
}

/// An immutable version is either resident for the current compatibility
/// workflow or reopened from a durable artifact every time it is requested.
#[derive(Clone)]
enum DatasetVersionSource {
    Resident { frame: LazyFrame, bytes: u64 },
    Parquet(PathBuf),
}

impl DatasetVersionSource {
    fn snapshot(&self) -> Result<LazyFrame, DomainError> {
        match self {
            Self::Resident { frame, .. } => Ok(frame.clone()),
            Self::Parquet(path) => LazyFrame::scan_parquet(
                path.to_string_lossy().as_ref().into(),
                ScanArgsParquet::default(),
            )
            .map_err(|error| {
                DomainError::internal(format!(
                    "Open retained Parquet artifact '{}': {error}",
                    path.display()
                ))
            }),
        }
    }
}

/// Session-scoped immutable frame registry.
///
/// The live repository remains as a compatibility facade for legacy routes;
/// new plan-aware routes resolve their requested baseline through this store.
#[derive(Clone)]
pub struct DatasetVersionRegistry {
    entries: Arc<RwLock<BTreeMap<String, DatasetVersionEntry>>>,
    current_id: Arc<RwLock<String>>,
    next_id: Arc<AtomicU64>,
    resident_evictions: Arc<AtomicU64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VersionRetentionSnapshot {
    pub total_versions: usize,
    pub resident_versions: usize,
    pub resident_bytes: u64,
    pub resident_evictions: u64,
}

fn fnv1a(input: &str) -> String {
    fnv1a_bytes(input.as_bytes())
}

fn fnv1a_bytes(input: &[u8]) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in input {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("fnv1a-{hash:016x}")
}

struct FnvWriter(u64);

impl FnvWriter {
    fn new() -> Self {
        Self(0xcbf2_9ce4_8422_2325)
    }

    fn fingerprint(&self) -> String {
        format!("fnv1a-content-{:016x}", self.0)
    }
}

impl Write for FnvWriter {
    fn write(&mut self, buffer: &[u8]) -> std::io::Result<usize> {
        for byte in buffer {
            self.0 ^= u64::from(*byte);
            self.0 = self.0.wrapping_mul(0x0000_0100_0000_01b3);
        }
        Ok(buffer.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

/// Return the stable content and schema identities used by dataset versions.
/// Artifact publishers use this before the version is registered so a durable
/// file and its registry record share exactly one content identity.
pub fn fingerprints_for_frame(df: &DataFrame) -> (String, String) {
    let schema = df.schema();
    let columns = schema
        .iter_fields()
        .map(|field| format!("{}:{}", field.name(), field.dtype()))
        .collect::<Vec<_>>()
        .join("|");
    let schema_fingerprint = fnv1a(&columns);
    // Stream the canonical Arrow IPC representation directly through the
    // hasher. This keeps content identity stable without allocating a second
    // frame-sized byte buffer during upload/materialization.
    let mut writer = FnvWriter::new();
    let mut frame = df.clone();
    let dataset_fingerprint = IpcStreamWriter::new(&mut writer)
        .finish(&mut frame)
        .map(|_| writer.fingerprint())
        // DataFrames admitted to the registry are Arrow-serializable. Keep a
        // deterministic diagnostic fallback for an unexpected serializer
        // failure rather than making source registration panic.
        .unwrap_or_else(|_| {
            format!(
                "fnv1a-fallback-{}",
                &fnv1a(&format!("rows={};{columns}", df.height()))[6..]
            )
        });
    (dataset_fingerprint, schema_fingerprint)
}

fn schema_fingerprint(mut frame: LazyFrame) -> Result<String, DomainError> {
    let schema = frame.collect_schema().map_err(|error| {
        DomainError::internal(format!("Read retained artifact schema: {error}"))
    })?;
    let columns = schema
        .iter_fields()
        .map(|field| format!("{}:{}", field.name(), field.dtype()))
        .collect::<Vec<_>>()
        .join("|");
    Ok(fnv1a(&columns))
}

impl DatasetVersionRegistry {
    /// Empty registry used while restoring an artifact catalog at startup.
    pub fn empty() -> Self {
        Self {
            entries: Arc::new(RwLock::new(BTreeMap::new())),
            current_id: Arc::new(RwLock::new(String::new())),
            next_id: Arc::new(AtomicU64::new(1)),
            resident_evictions: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn new(initial: DataFrame, revision: u64, source_name: Option<String>) -> Self {
        let (dataset_fingerprint, schema_fingerprint) = fingerprints_for_frame(&initial);
        let id = "source-0".to_string();
        let record = DatasetVersionRecord {
            id: id.clone(),
            root_id: id.clone(),
            parent_id: None,
            revision,
            dataset_fingerprint,
            schema_fingerprint,
            display_name: source_name.clone(),
            source_name,
            time_column: None,
            materialized_from_plan_hash: None,
            applied_plan: None,
            created_at: Utc::now(),
        };
        let mut entries = BTreeMap::new();
        entries.insert(
            id.clone(),
            DatasetVersionEntry {
                record,
                source: DatasetVersionSource::Resident {
                    bytes: initial.estimated_size() as u64,
                    frame: initial.lazy(),
                },
            },
        );
        Self {
            entries: Arc::new(RwLock::new(entries)),
            current_id: Arc::new(RwLock::new(id)),
            next_id: Arc::new(AtomicU64::new(1)),
            resident_evictions: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn current(&self) -> Result<DatasetVersionRecord, DomainError> {
        let id = self
            .current_id
            .read()
            .map_err(|_| DomainError::internal("dataset version selection lock poisoned"))?
            .clone();
        self.record(&id)
    }

    pub fn record(&self, id: &str) -> Result<DatasetVersionRecord, DomainError> {
        self.entries
            .read()
            .map_err(|_| DomainError::internal("dataset version registry lock poisoned"))?
            .get(id)
            .map(|entry| entry.record.clone())
            .ok_or_else(|| DomainError::NotFound(format!("Unknown dataset version '{id}'")))
    }

    pub fn snapshot(&self, id: &str) -> Result<LazyFrame, DomainError> {
        let source = self
            .entries
            .read()
            .map_err(|_| DomainError::internal("dataset version registry lock poisoned"))?
            .get(id)
            .ok_or_else(|| DomainError::NotFound(format!("Unknown dataset version '{id}'")))?
            .source
            .clone();
        source.snapshot()
    }

    pub fn list(&self) -> Result<Vec<DatasetVersionRecord>, DomainError> {
        Ok(self
            .entries
            .read()
            .map_err(|_| DomainError::internal("dataset version registry lock poisoned"))?
            .values()
            .map(|entry| entry.record.clone())
            .collect())
    }

    pub fn retention_snapshot(&self) -> Result<VersionRetentionSnapshot, DomainError> {
        let entries = self
            .entries
            .read()
            .map_err(|_| DomainError::internal("dataset version registry lock poisoned"))?;
        let resident_versions = entries
            .values()
            .filter(|entry| matches!(entry.source, DatasetVersionSource::Resident { .. }))
            .count();
        let resident_bytes = entries
            .values()
            .filter_map(|entry| match &entry.source {
                DatasetVersionSource::Resident { bytes, .. } => Some(*bytes),
                DatasetVersionSource::Parquet(_) => None,
            })
            .sum();
        Ok(VersionRetentionSnapshot {
            total_versions: entries.len(),
            resident_versions,
            resident_bytes,
            resident_evictions: self.resident_evictions.load(Ordering::Relaxed),
        })
    }

    /// Check a prospective resident root/child before the active repository is
    /// mutated. Independent roots can replace older roots, while a child must
    /// fit together with every resident ancestor in its active lineage.
    pub fn ensure_resident_registration_fits(
        &self,
        parent_id: Option<&str>,
        pending_bytes: u64,
        max_versions: usize,
        max_bytes: u64,
    ) -> Result<(), DomainError> {
        let lineage = match parent_id {
            Some(parent) => self.lineage_ids(parent)?,
            None => BTreeSet::new(),
        };
        let entries = self
            .entries
            .read()
            .map_err(|_| DomainError::internal("dataset version registry lock poisoned"))?;
        let lineage_versions = lineage
            .iter()
            .filter(|id| {
                entries.get(*id).is_some_and(|entry| {
                    matches!(entry.source, DatasetVersionSource::Resident { .. })
                })
            })
            .count();
        let lineage_bytes = lineage
            .iter()
            .filter_map(|id| entries.get(id))
            .filter_map(|entry| match &entry.source {
                DatasetVersionSource::Resident { bytes, .. } => Some(*bytes),
                DatasetVersionSource::Parquet(_) => None,
            })
            .sum::<u64>();
        let required_versions = lineage_versions.saturating_add(1);
        let required_bytes = lineage_bytes.saturating_add(pending_bytes);
        if required_versions > max_versions.max(1) || required_bytes > max_bytes.max(1) {
            return Err(DomainError::Validation(format!(
                "resident dataset retention budget exceeded: versions={required_versions}/{}, bytes={required_bytes}/{}; configure managed artifact storage or raise the retention limit",
                max_versions.max(1),
                max_bytes.max(1)
            )));
        }
        Ok(())
    }

    /// Remove the oldest resident versions outside the active lineage until
    /// both configured caps are met. Parquet-backed entries are governed by
    /// artifact retention and do not consume resident-memory budget.
    pub fn enforce_resident_retention(
        &self,
        max_versions: usize,
        max_bytes: u64,
    ) -> Result<Vec<String>, DomainError> {
        let current = self
            .current_id
            .read()
            .map_err(|_| DomainError::internal("dataset version selection lock poisoned"))?
            .clone();
        let protected = self.lineage_ids(&current)?;
        let mut entries = self
            .entries
            .write()
            .map_err(|_| DomainError::internal("dataset version registry lock poisoned"))?;
        let mut candidates = entries
            .iter()
            .filter(|(id, entry)| {
                !protected.contains(*id)
                    && matches!(entry.source, DatasetVersionSource::Resident { .. })
            })
            .map(|(id, entry)| (id.clone(), entry.record.created_at))
            .collect::<Vec<_>>();
        candidates.sort_by_key(|(_, created_at)| *created_at);
        let resident_usage = |entries: &BTreeMap<String, DatasetVersionEntry>| {
            entries
                .values()
                .fold((0usize, 0u64), |(count, bytes), entry| {
                    match &entry.source {
                        DatasetVersionSource::Resident { bytes: size, .. } => {
                            (count.saturating_add(1), bytes.saturating_add(*size))
                        }
                        DatasetVersionSource::Parquet(_) => (count, bytes),
                    }
                })
        };
        let mut removed = Vec::new();
        for (id, _) in candidates {
            let (count, bytes) = resident_usage(&entries);
            if count <= max_versions.max(1) && bytes <= max_bytes.max(1) {
                break;
            }
            if entries.remove(&id).is_some() {
                removed.push(id);
            }
        }
        self.resident_evictions
            .fetch_add(removed.len() as u64, Ordering::Relaxed);
        Ok(removed)
    }

    /// Return a root-to-leaf lineage for `version_id`. Retention must keep
    /// every member of this set or catalog recovery could lose a child’s
    /// immutable parent chain after restart.
    pub fn lineage_ids(&self, version_id: &str) -> Result<BTreeSet<String>, DomainError> {
        let entries = self
            .entries
            .read()
            .map_err(|_| DomainError::internal("dataset version registry lock poisoned"))?;
        let mut lineage = BTreeSet::new();
        let mut next = Some(version_id.to_string());
        while let Some(id) = next {
            let entry = entries
                .get(&id)
                .ok_or_else(|| DomainError::NotFound(format!("Unknown dataset version '{id}'")))?;
            if !lineage.insert(id) {
                return Err(DomainError::internal(
                    "Dataset version lineage contains a cycle",
                ));
            }
            next = entry.record.parent_id.clone();
        }
        Ok(lineage)
    }

    /// Drop versions that are no longer backed by retained artifacts. The
    /// active version may never be removed.
    pub fn retain_ids(&self, retained: &BTreeSet<String>) -> Result<(), DomainError> {
        let current = self
            .current_id
            .read()
            .map_err(|_| DomainError::internal("dataset version selection lock poisoned"))?
            .clone();
        if !retained.contains(&current) {
            return Err(DomainError::internal(
                "Artifact retention cannot remove the active dataset version",
            ));
        }
        self.entries
            .write()
            .map_err(|_| DomainError::internal("dataset version registry lock poisoned"))?
            .retain(|id, _| retained.contains(id));
        Ok(())
    }

    pub fn register_root(
        &self,
        frame: DataFrame,
        revision: u64,
        source_name: Option<String>,
        time_column: Option<String>,
    ) -> Result<DatasetVersionRecord, DomainError> {
        let resident_bytes = frame.estimated_size() as u64;
        let (dataset_fingerprint, schema_fingerprint) = fingerprints_for_frame(&frame);
        self.register_root_with_identity(
            frame,
            revision,
            source_name,
            time_column,
            ResidentVersionIdentity {
                resident_bytes,
                dataset_fingerprint,
                schema_fingerprint,
            },
        )
    }

    pub(crate) fn register_root_with_identity(
        &self,
        frame: DataFrame,
        revision: u64,
        source_name: Option<String>,
        time_column: Option<String>,
        identity: ResidentVersionIdentity,
    ) -> Result<DatasetVersionRecord, DomainError> {
        let id = self.allocate_version_id();
        let record = DatasetVersionRecord {
            id: id.clone(),
            root_id: id.clone(),
            parent_id: None,
            revision,
            dataset_fingerprint: identity.dataset_fingerprint,
            schema_fingerprint: identity.schema_fingerprint,
            display_name: source_name.clone(),
            source_name,
            time_column,
            materialized_from_plan_hash: None,
            applied_plan: None,
            created_at: Utc::now(),
        };
        self.entries
            .write()
            .map_err(|_| DomainError::internal("dataset version registry lock poisoned"))?
            .insert(
                id.clone(),
                DatasetVersionEntry {
                    record: record.clone(),
                    source: DatasetVersionSource::Resident {
                        frame: frame.lazy(),
                        bytes: identity.resident_bytes,
                    },
                },
            );
        *self
            .current_id
            .write()
            .map_err(|_| DomainError::internal("dataset version selection lock poisoned"))? = id;
        Ok(record)
    }

    pub fn register_child(
        &self,
        parent_id: &str,
        frame: DataFrame,
        revision: u64,
        plan_hash: String,
    ) -> Result<DatasetVersionRecord, DomainError> {
        let resident_bytes = frame.estimated_size() as u64;
        let (dataset_fingerprint, schema_fingerprint) = fingerprints_for_frame(&frame);
        self.register_child_with_identity(
            parent_id,
            frame,
            revision,
            plan_hash,
            None,
            None,
            ResidentVersionIdentity {
                resident_bytes,
                dataset_fingerprint,
                schema_fingerprint,
            },
        )
    }

    // Each argument is a distinct field of the child record; a parameter struct
    // would only rename them.
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn register_child_with_identity(
        &self,
        parent_id: &str,
        frame: DataFrame,
        revision: u64,
        plan_hash: String,
        time_column: Option<String>,
        applied_plan: Option<Value>,
        identity: ResidentVersionIdentity,
    ) -> Result<DatasetVersionRecord, DomainError> {
        let parent = self.record(parent_id)?;
        let id = self.allocate_version_id();
        let record = DatasetVersionRecord {
            id: id.clone(),
            root_id: parent.root_id.clone(),
            parent_id: Some(parent.id.clone()),
            revision,
            dataset_fingerprint: identity.dataset_fingerprint,
            schema_fingerprint: identity.schema_fingerprint,
            display_name: Some(prepared_display_name(&parent, revision)),
            source_name: parent.source_name.clone(),
            time_column: time_column.or(parent.time_column.clone()),
            materialized_from_plan_hash: Some(plan_hash),
            applied_plan,
            created_at: Utc::now(),
        };
        self.entries
            .write()
            .map_err(|_| DomainError::internal("dataset version registry lock poisoned"))?
            .insert(
                id.clone(),
                DatasetVersionEntry {
                    record: record.clone(),
                    source: DatasetVersionSource::Resident {
                        frame: frame.lazy(),
                        bytes: identity.resident_bytes,
                    },
                },
            );
        *self
            .current_id
            .write()
            .map_err(|_| DomainError::internal("dataset version selection lock poisoned"))? = id;
        Ok(record)
    }

    /// Reserve a deterministic ID for a new source. Callers that publish a
    /// durable artifact before registration use this so the file and version
    /// record cannot disagree about their identity.
    pub fn allocate_version_id(&self) -> String {
        let serial = self.next_id.fetch_add(1, Ordering::Relaxed);
        format!("source-{serial}")
    }

    /// Allocate a collision-resistant ID for an artifact that can outlive this
    /// process. The in-memory serial alone restarts at `source-1`, so it is
    /// intentionally not used for durable files.
    pub fn allocate_artifact_version_id(&self) -> String {
        let serial = self.next_id.fetch_add(1, Ordering::Relaxed);
        format!(
            "artifact-{}-{serial}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        )
    }

    /// Register an immutable Parquet artifact without collecting it into the
    /// resident repository. Its content identity comes from ingestion; only
    /// its schema is inspected to preserve the normal version contract.
    pub fn register_root_artifact(
        &self,
        artifact: DatasetArtifactDescriptor,
        revision: u64,
        source_name: Option<String>,
        time_column: Option<String>,
    ) -> Result<DatasetVersionRecord, DomainError> {
        if artifact.format != "parquet" {
            return Err(DomainError::bad_request(format!(
                "Unsupported retained artifact format '{}'",
                artifact.format
            )));
        }
        let source = DatasetVersionSource::Parquet(artifact.path);
        let schema_fingerprint = schema_fingerprint(source.snapshot()?)?;
        let record = DatasetVersionRecord {
            id: artifact.version_id.clone(),
            root_id: artifact.version_id.clone(),
            parent_id: None,
            revision,
            dataset_fingerprint: artifact.content_fingerprint,
            schema_fingerprint,
            display_name: source_name.clone(),
            source_name,
            time_column,
            materialized_from_plan_hash: None,
            applied_plan: None,
            created_at: artifact.created_at,
        };
        let mut entries = self
            .entries
            .write()
            .map_err(|_| DomainError::internal("dataset version registry lock poisoned"))?;
        if entries.contains_key(&record.id) {
            return Err(DomainError::bad_request(format!(
                "Dataset version '{}' is already retained",
                record.id
            )));
        }
        entries.insert(
            record.id.clone(),
            DatasetVersionEntry {
                record: record.clone(),
                source,
            },
        );
        drop(entries);
        *self
            .current_id
            .write()
            .map_err(|_| DomainError::internal("dataset version selection lock poisoned"))? =
            record.id.clone();
        Ok(record)
    }

    /// Register a materialized child backed by an already-published immutable
    /// Parquet artifact. This preserves the parent's root/provenance while
    /// avoiding a second resident version frame.
    pub fn register_child_artifact(
        &self,
        parent_id: &str,
        artifact: DatasetArtifactDescriptor,
        revision: u64,
        plan_hash: String,
        time_column: Option<String>,
        applied_plan: Option<Value>,
    ) -> Result<DatasetVersionRecord, DomainError> {
        if artifact.format != "parquet" {
            return Err(DomainError::bad_request(format!(
                "Unsupported retained artifact format '{}'",
                artifact.format
            )));
        }
        let parent = self.record(parent_id)?;
        let source = DatasetVersionSource::Parquet(artifact.path);
        let schema_fingerprint = schema_fingerprint(source.snapshot()?)?;
        let record = DatasetVersionRecord {
            id: artifact.version_id,
            root_id: parent.root_id.clone(),
            parent_id: Some(parent.id.clone()),
            revision,
            dataset_fingerprint: artifact.content_fingerprint,
            schema_fingerprint,
            display_name: Some(prepared_display_name(&parent, revision)),
            source_name: parent.source_name.clone(),
            time_column: time_column.or(parent.time_column.clone()),
            materialized_from_plan_hash: Some(plan_hash),
            applied_plan,
            created_at: artifact.created_at,
        };
        let mut entries = self
            .entries
            .write()
            .map_err(|_| DomainError::internal("dataset version registry lock poisoned"))?;
        if entries.contains_key(&record.id) {
            return Err(DomainError::bad_request(format!(
                "Dataset version '{}' is already retained",
                record.id
            )));
        }
        entries.insert(
            record.id.clone(),
            DatasetVersionEntry {
                record: record.clone(),
                source,
            },
        );
        drop(entries);
        *self
            .current_id
            .write()
            .map_err(|_| DomainError::internal("dataset version selection lock poisoned"))? =
            record.id.clone();
        Ok(record)
    }

    /// Restore descriptor-backed versions after a process restart. Entries are
    /// replayed in parent-before-child order, and each stored schema identity
    /// is checked against a fresh Parquet scan before it becomes selectable.
    pub fn restore_artifacts(
        &self,
        artifacts: Vec<DatasetArtifactDescriptor>,
    ) -> Result<Vec<DatasetVersionRecord>, DomainError> {
        let mut pending = artifacts;
        pending.sort_by_key(|artifact| artifact.created_at);
        let mut restored = Vec::with_capacity(pending.len());

        while !pending.is_empty() {
            let next = pending.iter().position(|artifact| {
                artifact
                    .provenance
                    .as_ref()
                    .is_some_and(|provenance| match &provenance.parent_id {
                        Some(parent_id) => self.record(parent_id).is_ok(),
                        None => true,
                    })
            });
            let Some(index) = next else {
                return Err(DomainError::bad_request(
                    "Retained artifact catalog has missing provenance or unresolved parent versions",
                ));
            };
            let artifact = pending.remove(index);
            let provenance = artifact.provenance.clone().ok_or_else(|| {
                DomainError::bad_request(
                    "Retained artifact catalog entry has no version provenance",
                )
            })?;
            let source = parquet_source(&artifact)?;
            let actual_schema_fingerprint = schema_fingerprint(source.snapshot()?)?;
            if actual_schema_fingerprint != provenance.schema_fingerprint {
                return Err(DomainError::bad_request(format!(
                    "Retained artifact '{}' schema fingerprint does not match its catalog",
                    artifact.version_id
                )));
            }
            let record = record_from_artifact(&artifact, provenance)?;
            let mut entries = self
                .entries
                .write()
                .map_err(|_| DomainError::internal("dataset version registry lock poisoned"))?;
            if entries.contains_key(&record.id) {
                return Err(DomainError::bad_request(format!(
                    "Dataset version '{}' is already retained",
                    record.id
                )));
            }
            entries.insert(
                record.id.clone(),
                DatasetVersionEntry {
                    record: record.clone(),
                    source,
                },
            );
            restored.push(record);
        }

        if let Some(current) = restored.iter().max_by_key(|record| record.created_at) {
            *self
                .current_id
                .write()
                .map_err(|_| DomainError::internal("dataset version selection lock poisoned"))? =
                current.id.clone();
        }
        Ok(restored)
    }

    /// Select an already-retained immutable snapshot as the working dataset.
    /// Version identity stays immutable; the compatibility repository owns the
    /// separate active-session revision used to invalidate live requests.
    pub fn select(&self, id: &str) -> Result<DatasetVersionRecord, DomainError> {
        let entries = self
            .entries
            .read()
            .map_err(|_| DomainError::internal("dataset version registry lock poisoned"))?;
        let entry = entries
            .get(id)
            .ok_or_else(|| DomainError::NotFound(format!("Unknown dataset version '{id}'")))?;
        let record = entry.record.clone();
        drop(entries);
        *self
            .current_id
            .write()
            .map_err(|_| DomainError::internal("dataset version selection lock poisoned"))? =
            id.to_string();
        Ok(record)
    }
}

fn parquet_source(
    artifact: &DatasetArtifactDescriptor,
) -> Result<DatasetVersionSource, DomainError> {
    if artifact.format != "parquet" {
        return Err(DomainError::bad_request(format!(
            "Unsupported retained artifact format '{}'",
            artifact.format
        )));
    }
    Ok(DatasetVersionSource::Parquet(artifact.path.clone()))
}

fn record_from_artifact(
    artifact: &DatasetArtifactDescriptor,
    provenance: DatasetArtifactProvenance,
) -> Result<DatasetVersionRecord, DomainError> {
    if provenance.parent_id.is_none() && provenance.root_id != artifact.version_id {
        return Err(DomainError::bad_request(format!(
            "Root artifact '{}' must use itself as rootId",
            artifact.version_id
        )));
    }
    Ok(DatasetVersionRecord {
        id: artifact.version_id.clone(),
        root_id: provenance.root_id,
        parent_id: provenance.parent_id,
        revision: provenance.revision,
        dataset_fingerprint: artifact.content_fingerprint.clone(),
        schema_fingerprint: provenance.schema_fingerprint,
        display_name: provenance
            .display_name
            .or_else(|| provenance.source_name.clone()),
        source_name: provenance.source_name,
        time_column: provenance.time_column,
        materialized_from_plan_hash: provenance.materialized_from_plan_hash,
        applied_plan: provenance.applied_plan,
        created_at: artifact.created_at,
    })
}

fn prepared_display_name(parent: &DatasetVersionRecord, revision: u64) -> String {
    let source = parent
        .source_name
        .as_deref()
        .or(parent.display_name.as_deref())
        .unwrap_or(&parent.id);
    format!("{source} · prepared v{revision}")
}

#[cfg(test)]
mod tests;
