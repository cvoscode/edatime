use std::fs;

use chrono::Utc;
use polars::prelude::{DataFrame, IntoLazy, NamedFrom, Series};

use super::AppState;
use crate::artifacts::DatasetArtifactProvenance;
use crate::cache::CorrelationMatrixCacheEntry;
use crate::jobs::JobKind;
use crate::versions::DatasetVersionRecord;
use edatime_core::config::AppConfig;

fn frame(values: Vec<i64>) -> DataFrame {
    DataFrame::new(
        values.len(),
        vec![Series::new("value".into(), values).into()],
    )
    .expect("frame")
}

#[test]
fn active_correlation_matrix_cache_rejects_entries_over_byte_budget() {
    let mut config = AppConfig::default();
    config.cache.max_bytes = 1024;
    let state = AppState::new(frame(vec![1]), config);
    let revision = state.dataset_revision();
    let n = 20;
    let values = vec![vec![Some(0.5); n]; n];
    let entry = CorrelationMatrixCacheEntry {
        input_rows: 10,
        time_range_ms: None,
        columns: (0..n).map(|index| format!("column_{index}")).collect(),
        pearson_raw: values.clone(),
        spearman_raw: values.clone(),
        kendall_raw: values.clone(),
        pearson_diff: values.clone(),
        spearman_diff: values.clone(),
        kendall_diff: values,
        counts: vec![vec![10; n]; n],
        diff_counts: vec![vec![9; n]; n],
    };

    assert!(!state.store_correlation_matrix_if_current(revision, entry));
    assert!(state.cached_correlation_matrix(revision).is_none());
}

#[tokio::test]
async fn lazy_finalization_waits_for_io_admission_and_cleans_cancelled_queue() {
    use edatime_core::metrics::CpuStage;
    use std::sync::{Arc, mpsc};
    use std::time::Duration;

    let root = std::env::temp_dir().join(format!(
        "edatime-finalize-queue-{}",
        Utc::now().timestamp_nanos_opt().unwrap()
    ));
    let mut config = AppConfig::default();
    config.data.artifact_dir = Some(root.clone());
    config.query.max_blocking_io_concurrency = 1;
    let state = AppState::new(DataFrame::default(), config);
    let store = state.artifact_store.as_ref().expect("artifact store");
    let version_id = "queued-finalizer".to_string();
    let pending = store
        .prepare_lazy_parquet(&version_id)
        .expect("pending path");
    fs::write(&pending, b"pending artifact fixture").expect("pending sink output");
    let executor = Arc::clone(&state.query_executor);
    let (started, running) = tokio::sync::oneshot::channel();
    let (release, blocked) = mpsc::channel();
    let blocker = tokio::spawn(async move {
        executor
            .run_blocking_io(CpuStage::Materialization, move || {
                started.send(()).expect("worker started");
                blocked.recv().expect("release worker");
            })
            .await
            .expect("blocking worker");
    });
    running.await.expect("I/O lane occupied");
    let mut finalizing = Box::pin(state.finalize_lazy_artifact(store, version_id));
    assert!(
        tokio::time::timeout(Duration::from_millis(25), &mut finalizing)
            .await
            .is_err(),
        "file hashing must wait for the bounded I/O lane"
    );
    assert!(pending.exists());
    drop(finalizing);
    assert!(
        !pending.exists(),
        "cancelling queued finalization must remove sink output"
    );
    release.send(()).expect("release I/O lane");
    blocker.await.expect("blocker joined");
    assert!(store.load_catalog().expect("catalog").is_empty());
    fs::remove_dir_all(root).expect("remove fixture directory");
}

#[tokio::test]
async fn dropping_unpublished_finalization_result_removes_the_artifact() {
    let root = std::env::temp_dir().join(format!(
        "edatime-finalize-result-{}",
        Utc::now().timestamp_nanos_opt().unwrap()
    ));
    let mut config = AppConfig::default();
    config.data.artifact_dir = Some(root.clone());
    let state = AppState::new(DataFrame::default(), config);
    let store = state.artifact_store.as_ref().expect("artifact store");
    let version_id = "unpublished-finalizer".to_string();
    let pending = store
        .prepare_lazy_parquet(&version_id)
        .expect("pending path");
    fs::write(&pending, b"pending artifact fixture").expect("pending sink output");
    let (descriptor, cleanup) = state
        .finalize_lazy_artifact(store, version_id)
        .await
        .expect("finalize");
    assert!(!pending.exists());
    assert!(descriptor.path.exists());
    assert!(descriptor.content_fingerprint.starts_with("fnv1a-parquet-"));
    drop(cleanup);
    assert!(
        !descriptor.path.exists(),
        "unobserved worker results must not leave artifacts behind"
    );
    assert!(store.load_catalog().expect("catalog").is_empty());
    fs::remove_dir_all(root).expect("remove fixture directory");
}

#[tokio::test(flavor = "multi_thread")]
async fn configured_lazy_root_ingest_activates_a_scan_backed_artifact() {
    let artifact_dir = std::env::temp_dir().join(format!(
        "edatime-state-lazy-root-{}",
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let mut config = AppConfig::default();
    config.data.artifact_dir = Some(artifact_dir.clone());
    let state = AppState::new(frame(vec![0]), config);
    let lazy = DataFrame::new(
        3,
        vec![
            Series::new("time".into(), vec![1_i64, 2, 3]).into(),
            Series::new("value".into(), vec![10.0_f64, 20.0, 30.0]).into(),
        ],
    )
    .expect("ingest frame")
    .lazy();

    let record = state
        .replace_dataset_lazy_root(
            lazy,
            Some("fixture.parquet".to_string()),
            "time".to_string(),
        )
        .await
        .expect("lazy root ingest");

    assert!(record.id.starts_with("artifact-"));
    assert_eq!(record.source_name.as_deref(), Some("fixture.parquet"));
    assert_eq!(state.dataset_rows().await, 3);
    assert_eq!(
        state
            .query_executor
            .execute_async(state.dataset_snapshot())
            .await
            .expect("active scan")
            .height(),
        3
    );
    let catalog = state
        .artifact_store
        .as_ref()
        .expect("artifact store")
        .load_catalog()
        .expect("catalog");
    assert_eq!(catalog.len(), 1);
    assert_eq!(catalog[0].version_id, record.id);
    assert_eq!(
        catalog[0]
            .provenance
            .as_ref()
            .and_then(|provenance| provenance.source_name.as_deref()),
        Some("fixture.parquet")
    );
    fs::remove_dir_all(artifact_dir).expect("clean artifact directory");
}

#[tokio::test(flavor = "multi_thread")]
async fn configured_artifact_storage_publishes_root_and_child_versions() {
    let artifact_dir = std::env::temp_dir().join(format!(
        "edatime-state-artifacts-{}",
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let mut config = AppConfig::default();
    config.data.artifact_dir = Some(artifact_dir.clone());
    let state = AppState::new(frame(vec![0]), config.clone());

    state
        .replace_dataset(frame(vec![1, 2]))
        .await
        .expect("persist root");
    let root = state.current_dataset_version().expect("root record");
    assert!(root.id.starts_with("artifact-"));
    let root_scan = state
        .dataset_snapshot_for_version(&root.id)
        .expect("root scan");
    let root_height = tokio::task::spawn_blocking(move || {
        root_scan.collect().expect("collect root scan").height()
    })
    .await
    .expect("join root scan");
    assert_eq!(root_height, 2);

    let applied_plan = serde_json::json!({"schemaVersion": 1, "id": "plan-1", "stages": []});
    let child = state
        .materialize_dataset_child(
            &root.id,
            frame(vec![2]),
            "plan-1".to_string(),
            None,
            Some(applied_plan.clone()),
        )
        .await
        .expect("persist child");
    assert_eq!(child.parent_id.as_deref(), Some(root.id.as_str()));
    assert!(child.id.starts_with("artifact-"));
    assert_eq!(child.materialized_from_plan_hash.as_deref(), Some("plan-1"));
    assert_eq!(child.applied_plan, Some(applied_plan.clone()));
    assert!(
        child
            .display_name
            .as_deref()
            .unwrap_or_default()
            .contains("prepared v")
    );
    let catalog = state
        .artifact_store
        .as_ref()
        .expect("configured artifact store")
        .load_catalog()
        .expect("catalog");
    assert_eq!(catalog.len(), 2);
    let root_artifact = catalog
        .iter()
        .find(|artifact| artifact.version_id == root.id)
        .expect("root artifact");
    expect_provenance(root_artifact.provenance.as_ref(), &root, None);
    let child_artifact = catalog
        .iter()
        .find(|artifact| artifact.version_id == child.id)
        .expect("child artifact");
    expect_provenance(
        child_artifact.provenance.as_ref(),
        &child,
        Some(root.id.as_str()),
    );
    assert_eq!(
        child_artifact
            .provenance
            .as_ref()
            .and_then(|value| value.applied_plan.clone()),
        Some(applied_plan.clone()),
    );

    let restored = AppState::new(DataFrame::default(), config);
    assert_eq!(
        restored
            .current_dataset_version()
            .expect("restored current version")
            .id,
        child.id
    );
    assert_eq!(
        restored
            .dataset_versions()
            .expect("restored versions")
            .len(),
        2
    );
    assert_eq!(restored.dataset_rows().await, 1);
    let restored_child = restored
        .current_dataset_version()
        .expect("restored child provenance");
    assert_eq!(restored_child.display_name, child.display_name);
    assert_eq!(restored_child.applied_plan, Some(applied_plan));
    let restored_scan = restored.dataset_snapshot();
    let restored_height = tokio::task::spawn_blocking(move || {
        restored_scan
            .collect()
            .expect("collect restored scan")
            .height()
    })
    .await
    .expect("join restored scan");
    assert_eq!(restored_height, 1);

    fs::remove_dir_all(artifact_dir).expect("clean artifact test directory");
}

#[tokio::test(flavor = "multi_thread")]
async fn selecting_artifact_version_restores_scan_and_metadata_without_eager_frame_copy() {
    let artifact_dir = std::env::temp_dir().join(format!(
        "edatime-state-select-artifact-{}",
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let mut config = AppConfig::default();
    config.data.artifact_dir = Some(artifact_dir.clone());
    config.retention.max_resident_bytes = 1;
    let state = AppState::new(DataFrame::default(), config);
    let root_frame = DataFrame::new(
        3,
        vec![
            Series::new("time".into(), vec![10_i64, 20, 30]).into(),
            Series::new("value".into(), vec![1.0_f64, 2.0, 3.0]).into(),
        ],
    )
    .expect("root frame");
    assert!(root_frame.estimated_size() as u64 > state.config.retention.max_resident_bytes);
    state
        .replace_dataset_with_time_column(root_frame, Some("time".to_string()))
        .await
        .expect("persist root");
    let root = state.current_dataset_version().expect("root version");
    assert_eq!(root.time_column.as_deref(), Some("time"));
    let root_id = root.id;
    state
        .materialize_dataset_child(&root_id, frame(vec![4, 5]), "child-plan".into(), None, None)
        .await
        .expect("persist child");

    let selected = state
        .select_dataset_version(&root_id)
        .await
        .expect("select root version");
    assert_eq!(selected.id, root_id);
    assert_eq!(selected.time_column.as_deref(), Some("time"));
    {
        let metadata = state.repository.meta();
        let metadata = metadata.read().expect("dataset metadata lock");
        assert_eq!(metadata.row_count, 3);
        assert_eq!(metadata.column_names, vec!["time", "value"]);
        assert_eq!(metadata.time_column.as_deref(), Some("time"));
    }
    let plan = state
        .dataset_snapshot()
        .describe_optimized_plan()
        .expect("selected plan");
    assert!(
        plan.to_ascii_lowercase().contains("parquet scan"),
        "selection must keep a Parquet scan instead of a resident frame: {plan}"
    );
    let restored = state
        .query_executor
        .execute_async(state.dataset_snapshot())
        .await
        .expect("collect selected lazy scan");
    assert_eq!(restored.height(), 3);
    assert_eq!(
        restored
            .get_column_names()
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>(),
        vec!["time", "value"]
    );

    fs::remove_dir_all(artifact_dir).expect("clean artifact directory");
}

#[tokio::test(flavor = "multi_thread")]
async fn cancelled_lazy_materialization_discards_its_unpublished_artifact() {
    let artifact_dir = std::env::temp_dir().join(format!(
        "edatime-state-cancelled-materialization-{}",
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let mut config = AppConfig::default();
    config.data.artifact_dir = Some(artifact_dir.clone());
    let state = AppState::new(frame(vec![0]), config);
    let job = state.jobs.create(JobKind::Materialization);
    assert!(state.jobs.start(&job));
    state.jobs.cancel(job.id());

    let error = state
        .materialize_dataset_child_lazy(
            "source-0",
            frame(vec![1, 2]).lazy(),
            "plan-cancelled".to_string(),
            "value".to_string(),
            None,
            Some(&job),
        )
        .await
        .expect_err("cancelled job must not publish");
    assert!(error.to_string().contains("cancelled"));
    assert!(
        state
            .artifact_store
            .as_ref()
            .expect("artifact store")
            .load_catalog()
            .expect("catalog")
            .is_empty()
    );
    assert_eq!(state.dataset_rows().await, 1);
    if artifact_dir.exists() {
        fs::remove_dir_all(artifact_dir).expect("clean artifact directory");
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn artifact_retention_preserves_active_lineage_and_prunes_old_roots() {
    let artifact_dir = std::env::temp_dir().join(format!(
        "edatime-state-retention-{}",
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let mut config = AppConfig::default();
    config.data.artifact_dir = Some(artifact_dir.clone());
    config.data.max_artifact_versions = Some(2);
    let state = AppState::new(frame(vec![0]), config);

    state
        .replace_dataset(frame(vec![1, 2]))
        .await
        .expect("first root");
    let first_root = state.current_dataset_version().expect("first root record");
    let first_child = state
        .materialize_dataset_child(
            &first_root.id,
            frame(vec![2]),
            "plan-1".to_string(),
            None,
            None,
        )
        .await
        .expect("first child");
    assert_eq!(
        state
            .artifact_store
            .as_ref()
            .expect("artifact store")
            .load_catalog()
            .expect("catalog")
            .len(),
        2
    );

    state
        .replace_dataset(frame(vec![10, 20, 30]))
        .await
        .expect("second root");
    let active = state.current_dataset_version().expect("second root record");
    let catalog = state
        .artifact_store
        .as_ref()
        .expect("artifact store")
        .load_catalog()
        .expect("catalog");
    assert_eq!(catalog.len(), 2);
    assert!(catalog.iter().any(|entry| entry.version_id == active.id));
    assert!(
        catalog
            .iter()
            .any(|entry| entry.version_id == first_root.id)
    );
    assert!(state.dataset_snapshot_for_version(&first_root.id).is_ok());
    assert!(state.dataset_snapshot_for_version(&first_child.id).is_err());
    assert_eq!(state.dataset_versions().expect("versions").len(), 2);
    assert_eq!(state.dataset_rows().await, 3);
    fs::remove_dir_all(artifact_dir).expect("clean artifact directory");
}

fn expect_provenance(
    provenance: Option<&DatasetArtifactProvenance>,
    record: &DatasetVersionRecord,
    expected_parent: Option<&str>,
) {
    let provenance = provenance.expect("artifact provenance");
    assert_eq!(provenance.root_id, record.root_id);
    assert_eq!(provenance.parent_id.as_deref(), expected_parent);
    assert_eq!(provenance.revision, record.revision);
    assert_eq!(provenance.schema_fingerprint, record.schema_fingerprint);
    assert_eq!(
        provenance.materialized_from_plan_hash,
        record.materialized_from_plan_hash
    );
}
