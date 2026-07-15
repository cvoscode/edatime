//! Immutable dataset-version snapshots used by reversible cleaning plans.

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use chrono::{DateTime, Utc};
use polars::prelude::{DataFrame, IntoLazy, LazyFrame, SchemaExt};
use serde::Serialize;

use edatime_core::error::AppError;

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
    pub materialized_from_plan_hash: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone)]
struct DatasetVersionEntry {
    record: DatasetVersionRecord,
    frame: LazyFrame,
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
}

fn fnv1a(input: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in input.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("fnv1a-{hash:016x}")
}

fn fingerprints(df: &DataFrame) -> (String, String) {
    let schema = df.schema();
    let columns = schema
        .iter_fields()
        .map(|field| format!("{}:{}", field.name(), field.dtype()))
        .collect::<Vec<_>>()
        .join("|");
    let schema_fingerprint = fnv1a(&columns);
    let dataset_fingerprint = fnv1a(&format!("rows={};{columns}", df.height()));
    (dataset_fingerprint, schema_fingerprint)
}

impl DatasetVersionRegistry {
    pub fn new(initial: DataFrame, revision: u64, source_name: Option<String>) -> Self {
        let (dataset_fingerprint, schema_fingerprint) = fingerprints(&initial);
        let id = "source-0".to_string();
        let record = DatasetVersionRecord {
            id: id.clone(),
            root_id: id.clone(),
            parent_id: None,
            revision,
            dataset_fingerprint,
            schema_fingerprint,
            source_name,
            materialized_from_plan_hash: None,
            created_at: Utc::now(),
        };
        let mut entries = BTreeMap::new();
        entries.insert(
            id.clone(),
            DatasetVersionEntry {
                record,
                frame: initial.lazy(),
            },
        );
        Self {
            entries: Arc::new(RwLock::new(entries)),
            current_id: Arc::new(RwLock::new(id)),
            next_id: Arc::new(AtomicU64::new(1)),
        }
    }

    pub fn current(&self) -> Result<DatasetVersionRecord, AppError> {
        let id = self
            .current_id
            .read()
            .map_err(|_| AppError::internal("dataset version selection lock poisoned"))?
            .clone();
        self.record(&id)
    }

    pub fn record(&self, id: &str) -> Result<DatasetVersionRecord, AppError> {
        self.entries
            .read()
            .map_err(|_| AppError::internal("dataset version registry lock poisoned"))?
            .get(id)
            .map(|entry| entry.record.clone())
            .ok_or_else(|| AppError::NotFound(format!("Unknown dataset version '{id}'")))
    }

    pub fn snapshot(&self, id: &str) -> Result<LazyFrame, AppError> {
        self.entries
            .read()
            .map_err(|_| AppError::internal("dataset version registry lock poisoned"))?
            .get(id)
            .map(|entry| entry.frame.clone())
            .ok_or_else(|| AppError::NotFound(format!("Unknown dataset version '{id}'")))
    }

    pub fn list(&self) -> Result<Vec<DatasetVersionRecord>, AppError> {
        Ok(self
            .entries
            .read()
            .map_err(|_| AppError::internal("dataset version registry lock poisoned"))?
            .values()
            .map(|entry| entry.record.clone())
            .collect())
    }

    pub fn register_root(
        &self,
        frame: DataFrame,
        revision: u64,
        source_name: Option<String>,
    ) -> Result<DatasetVersionRecord, AppError> {
        let serial = self.next_id.fetch_add(1, Ordering::Relaxed);
        let id = format!("source-{serial}");
        let (dataset_fingerprint, schema_fingerprint) = fingerprints(&frame);
        let record = DatasetVersionRecord {
            id: id.clone(),
            root_id: id.clone(),
            parent_id: None,
            revision,
            dataset_fingerprint,
            schema_fingerprint,
            source_name,
            materialized_from_plan_hash: None,
            created_at: Utc::now(),
        };
        self.entries
            .write()
            .map_err(|_| AppError::internal("dataset version registry lock poisoned"))?
            .insert(
                id.clone(),
                DatasetVersionEntry {
                    record: record.clone(),
                    frame: frame.lazy(),
                },
            );
        *self
            .current_id
            .write()
            .map_err(|_| AppError::internal("dataset version selection lock poisoned"))? = id;
        Ok(record)
    }

    pub fn register_child(
        &self,
        parent_id: &str,
        frame: DataFrame,
        revision: u64,
        plan_hash: String,
    ) -> Result<DatasetVersionRecord, AppError> {
        let parent = self.record(parent_id)?;
        let serial = self.next_id.fetch_add(1, Ordering::Relaxed);
        let id = format!("source-{serial}");
        let (dataset_fingerprint, schema_fingerprint) = fingerprints(&frame);
        let record = DatasetVersionRecord {
            id: id.clone(),
            root_id: parent.root_id,
            parent_id: Some(parent.id),
            revision,
            dataset_fingerprint,
            schema_fingerprint,
            source_name: parent.source_name,
            materialized_from_plan_hash: Some(plan_hash),
            created_at: Utc::now(),
        };
        self.entries
            .write()
            .map_err(|_| AppError::internal("dataset version registry lock poisoned"))?
            .insert(
                id.clone(),
                DatasetVersionEntry {
                    record: record.clone(),
                    frame: frame.lazy(),
                },
            );
        *self
            .current_id
            .write()
            .map_err(|_| AppError::internal("dataset version selection lock poisoned"))? = id;
        Ok(record)
    }

    /// Select an already-retained immutable snapshot as the working dataset.
    /// Version identity stays immutable; the compatibility repository owns the
    /// separate active-session revision used to invalidate live requests.
    pub fn select(&self, id: &str) -> Result<DatasetVersionRecord, AppError> {
        let entries = self
            .entries
            .read()
            .map_err(|_| AppError::internal("dataset version registry lock poisoned"))?;
        let entry = entries
            .get(id)
            .ok_or_else(|| AppError::NotFound(format!("Unknown dataset version '{id}'")))?;
        let record = entry.record.clone();
        drop(entries);
        *self
            .current_id
            .write()
            .map_err(|_| AppError::internal("dataset version selection lock poisoned"))? =
            id.to_string();
        Ok(record)
    }
}

#[cfg(test)]
mod tests {
    use super::DatasetVersionRegistry;
    use polars::prelude::{DataFrame, NamedFrom, Series};

    fn frame(values: Vec<i64>) -> DataFrame {
        DataFrame::new(
            values.len(),
            vec![Series::new("value".into(), values).into()],
        )
        .expect("frame")
    }

    #[test]
    fn preserves_root_and_child_snapshots() {
        let registry =
            DatasetVersionRegistry::new(frame(vec![1, 2]), 0, Some("root.csv".to_string()));
        let root = registry.current().expect("root");
        let child = registry
            .register_child(&root.id, frame(vec![2]), 1, "plan-hash".to_string())
            .expect("child");

        assert_eq!(child.root_id, root.id);
        assert_eq!(child.parent_id.as_deref(), Some(root.id.as_str()));
        assert_eq!(
            registry
                .snapshot(&root.id)
                .expect("root frame")
                .collect()
                .expect("collect")
                .height(),
            2
        );
        assert_eq!(
            registry
                .snapshot(&child.id)
                .expect("child frame")
                .collect()
                .expect("collect")
                .height(),
            1
        );
    }

    #[test]
    fn selecting_a_version_does_not_rewrite_its_identity() {
        let registry = DatasetVersionRegistry::new(frame(vec![1, 2]), 4, None);
        let root = registry.current().expect("root");
        let child = registry
            .register_child(&root.id, frame(vec![2]), 5, "plan".to_string())
            .expect("child");

        let selected = registry.select(&root.id).expect("select root");

        assert_eq!(selected.revision, 4);
        assert_eq!(
            registry.record(&child.id).expect("child record").revision,
            5
        );
    }
}
