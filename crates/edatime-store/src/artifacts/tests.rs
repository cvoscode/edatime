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
    fs::write(root.join("source-11.parquet.tmp"), "partial parquet").expect("write parquet temp");
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
