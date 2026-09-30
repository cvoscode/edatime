use std::fs::{self, File};

use chrono::Utc;
use polars::prelude::{DataFrame, NamedFrom, ParquetWriter, Series};

use crate::artifacts::{DatasetArtifactDescriptor, DatasetArtifactProvenance};

use super::DatasetVersionRegistry;

fn frame(values: Vec<i64>) -> DataFrame {
    DataFrame::new(
        values.len(),
        vec![Series::new("value".into(), values).into()],
    )
    .expect("frame")
}

#[test]
fn preserves_root_and_child_snapshots() {
    let registry = DatasetVersionRegistry::new(frame(vec![1, 2]), 0, Some("root.csv".to_string()));
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

#[test]
fn same_shape_sources_have_distinct_content_fingerprints() {
    let registry = DatasetVersionRegistry::new(frame(vec![1, 2]), 0, None);
    let first = registry.current().expect("first source");
    let second = registry
        .register_root(frame(vec![1, 3]), 1, None, None)
        .expect("second source");

    assert_eq!(first.schema_fingerprint, second.schema_fingerprint);
    assert_ne!(first.dataset_fingerprint, second.dataset_fingerprint);
    assert!(first.dataset_fingerprint.starts_with("fnv1a-content-"));
}

#[test]
fn resident_retention_evicts_old_independent_roots_but_keeps_active_lineage() {
    let registry = DatasetVersionRegistry::new(frame(vec![1]), 0, None);
    let first = registry.current().expect("first root");
    let second = registry
        .register_root(frame(vec![2]), 1, None, None)
        .expect("second root");
    let child = registry
        .register_child(&second.id, frame(vec![3]), 2, "plan".into())
        .expect("active child");

    let removed = registry
        .enforce_resident_retention(2, u64::MAX)
        .expect("enforce retention");
    assert_eq!(removed, vec![first.id.clone()]);
    assert!(registry.record(&first.id).is_err());
    assert!(registry.record(&second.id).is_ok());
    assert!(registry.record(&child.id).is_ok());
    let snapshot = registry.retention_snapshot().expect("retention snapshot");
    assert_eq!(snapshot.resident_versions, 2);
    assert_eq!(snapshot.resident_evictions, 1);
}

#[test]
fn prospective_child_is_rejected_when_its_required_lineage_cannot_fit() {
    let registry = DatasetVersionRegistry::new(frame(vec![1, 2]), 0, None);
    let root = registry.current().expect("root");
    let root_bytes = registry
        .retention_snapshot()
        .expect("retention snapshot")
        .resident_bytes;

    let error = registry
        .ensure_resident_registration_fits(Some(&root.id), 1, 1, root_bytes)
        .expect_err("root plus child must exceed the version cap");
    assert!(
        error
            .to_string()
            .contains("resident dataset retention budget exceeded")
    );
    assert_eq!(registry.list().expect("unchanged registry").len(), 1);
    assert_eq!(registry.current().expect("unchanged current").id, root.id);
}

#[test]
fn retained_parquet_versions_reopen_a_scan_for_each_snapshot() {
    let root = std::env::temp_dir().join(format!(
        "edatime-retained-version-{}",
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    fs::create_dir_all(&root).expect("create artifact test directory");
    let path = root.join("source-7.parquet");
    let mut persisted = frame(vec![4, 9]);
    ParquetWriter::new(File::create(&path).expect("create parquet"))
        .finish(&mut persisted)
        .expect("write parquet");
    let registry = DatasetVersionRegistry::new(frame(vec![1]), 0, None);
    let retained = registry
        .register_root_artifact(
            DatasetArtifactDescriptor {
                version_id: "source-7".to_string(),
                path,
                format: "parquet".to_string(),
                byte_size: 1,
                content_fingerprint: "fixture-content".to_string(),
                created_at: Utc::now(),
                provenance: None,
            },
            7,
            Some("retained.parquet".to_string()),
            None,
        )
        .expect("register retained artifact");

    assert_eq!(retained.id, "source-7");
    assert_eq!(retained.dataset_fingerprint, "fixture-content");
    assert_eq!(
        registry
            .snapshot(&retained.id)
            .expect("open retained snapshot")
            .collect()
            .expect("collect retained snapshot")
            .height(),
        2
    );
    assert_eq!(registry.current().expect("current version").id, retained.id);

    fs::remove_dir_all(root).expect("clean retained artifact directory");
}

#[test]
fn restores_catalogued_artifacts_with_parent_provenance() {
    let root = std::env::temp_dir().join(format!(
        "edatime-restored-versions-{}",
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    fs::create_dir_all(&root).expect("create artifact test directory");
    let root_path = root.join("artifact-root.parquet");
    let child_path = root.join("artifact-child.parquet");
    let mut root_frame = frame(vec![1, 2]);
    ParquetWriter::new(File::create(&root_path).expect("create root parquet"))
        .finish(&mut root_frame)
        .expect("write root parquet");
    let mut child_frame = frame(vec![2]);
    ParquetWriter::new(File::create(&child_path).expect("create child parquet"))
        .finish(&mut child_frame)
        .expect("write child parquet");

    let schema_fingerprint = DatasetVersionRegistry::new(frame(vec![0]), 0, None)
        .current()
        .expect("schema record")
        .schema_fingerprint;
    let created_at = Utc::now();
    let restored = DatasetVersionRegistry::new(frame(vec![0]), 0, None);
    let records = restored
        .restore_artifacts(vec![
            DatasetArtifactDescriptor {
                version_id: "artifact-child".to_string(),
                path: child_path,
                format: "parquet".to_string(),
                byte_size: 1,
                content_fingerprint: "child-content".to_string(),
                created_at: created_at + chrono::Duration::seconds(1),
                provenance: Some(DatasetArtifactProvenance {
                    root_id: "artifact-root".to_string(),
                    parent_id: Some("artifact-root".to_string()),
                    revision: 2,
                    schema_fingerprint: schema_fingerprint.clone(),
                    source_name: Some("input.csv".to_string()),
                    display_name: Some("input.csv · prepared v2".to_string()),
                    time_column: None,
                    materialized_from_plan_hash: Some("plan-1".to_string()),
                    applied_plan: Some(serde_json::json!({"id": "plan-1"})),
                    row_count: 1,
                    column_names: vec!["value".to_string()],
                }),
            },
            DatasetArtifactDescriptor {
                version_id: "artifact-root".to_string(),
                path: root_path,
                format: "parquet".to_string(),
                byte_size: 1,
                content_fingerprint: "root-content".to_string(),
                created_at,
                provenance: Some(DatasetArtifactProvenance {
                    root_id: "artifact-root".to_string(),
                    parent_id: None,
                    revision: 1,
                    schema_fingerprint,
                    source_name: Some("input.csv".to_string()),
                    display_name: Some("input.csv".to_string()),
                    time_column: None,
                    materialized_from_plan_hash: None,
                    applied_plan: None,
                    row_count: 2,
                    column_names: vec!["value".to_string()],
                }),
            },
        ])
        .expect("restore catalog");

    assert_eq!(records.len(), 2);
    let current = restored.current().expect("current child");
    assert_eq!(current.id, "artifact-child");
    assert_eq!(
        current.display_name.as_deref(),
        Some("input.csv · prepared v2")
    );
    assert_eq!(
        current.applied_plan,
        Some(serde_json::json!({"id": "plan-1"}))
    );
    assert_eq!(
        restored
            .record("artifact-child")
            .expect("child record")
            .parent_id
            .as_deref(),
        Some("artifact-root")
    );
    assert_eq!(
        restored
            .snapshot("artifact-root")
            .expect("root scan")
            .collect()
            .expect("collect root")
            .height(),
        2
    );

    fs::remove_dir_all(root).expect("clean restored artifact directory");
}
