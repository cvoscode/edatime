use super::*;
use edatime_core::config::AppConfig;
use edatime_core::metrics::AppMetrics;
use edatime_query::cleaning::CleaningPlanDto;
use polars::prelude::IntoLazy;
use polars::prelude::{DataFrame, NamedFrom, Series};

/// Test-only metrics handle. Telemetry from compute_correlation_matrix
/// is observed but discarded in tests; the test still asserts on the
/// returned matrix, not on metric counters.
fn test_metrics() -> Arc<AppMetrics> {
    Arc::new(AppMetrics::new())
}

fn empty_envelope(state: &AppState) -> PlanRequestEnvelope {
    let version = state.current_dataset_version().expect("source version");
    PlanRequestEnvelope {
        expected_plan_hash: None,
        expected_source_version_id: version.id.clone(),
        expected_dataset_revision: version.revision,
        plan: CleaningPlanDto {
            schema_version: 1,
            id: "correlation-test-plan".to_string(),
            plan_revision: 1,
            source_version_id: version.id,
            dataset_revision: version.revision,
            dataset_fingerprint: Some(version.dataset_fingerprint),
            schema_fingerprint: version.schema_fingerprint,
            time_column: "ts".to_string(),
            source_name: None,
            stages: vec![],
            created_at: "now".to_string(),
            updated_at: "now".to_string(),
        },
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn working_matrix_reuses_results_and_invalidates_on_plan_change() {
    let frame = DataFrame::new(
        3,
        vec![
            Series::new("a".into(), [1.0_f64, 2.0, 3.0]).into(),
            Series::new("b".into(), [2.0_f64, 4.0, 6.0]).into(),
        ],
    )
    .expect("frame");
    let state = AppState::new(frame.clone(), AppConfig::default());
    let mut identity = ExecutionIdentity::from_version(
        state.current_dataset_version().expect("version"),
        Some("plan-a".into()),
    );
    let mode = Some(CorrelationMode::PearsonRaw);
    let first = working_correlation_matrix(&state, frame.clone().lazy(), &identity, mode)
        .await
        .expect("first");
    // An empty input would fail to reproduce the first matrix without a cache hit.
    let cached = working_correlation_matrix(&state, frame.head(Some(0)).lazy(), &identity, mode)
        .await
        .expect("cached");
    assert_eq!(first.counts, cached.counts);
    identity.plan_hash = Some("plan-b".into());
    let changed = working_correlation_matrix(&state, frame.head(Some(2)).lazy(), &identity, mode)
        .await
        .expect("changed");
    assert_eq!(changed.counts[0][1], 2);
    assert_eq!(first.counts[0][1], 3);
    identity.source_version_id = "another-source".into();
    let changed_source =
        working_correlation_matrix(&state, frame.head(Some(1)).lazy(), &identity, mode)
            .await
            .expect("changed source");
    assert_eq!(changed_source.counts[0][1], 1);
}

#[tokio::test(flavor = "multi_thread")]
async fn working_matrix_computes_only_requested_modes_and_coalesces_matching_requests() {
    let frame = DataFrame::new(
        5,
        vec![
            Series::new(
                "a".into(),
                [Some(1.0_f64), None, Some(3.0), Some(8.0), Some(5.0)],
            )
            .into(),
            Series::new("b".into(), [2.0_f64, 7.0, 4.0, 9.0, 5.0]).into(),
        ],
    )
    .expect("frame");
    let state = AppState::new(frame.clone(), AppConfig::default());
    let identity = ExecutionIdentity::from_version(
        state.current_dataset_version().expect("version"),
        Some("plan-a".into()),
    );
    let mode = Some(CorrelationMode::PearsonRaw);
    let (first, second) = tokio::join!(
        working_correlation_matrix(&state, frame.clone().lazy(), &identity, mode),
        working_correlation_matrix(&state, frame.clone().lazy(), &identity, mode),
    );
    let first = first.expect("first");
    assert_eq!(first.pearson_raw, second.expect("second").pearson_raw);
    assert_eq!(first.counts[0][1], 4);
    assert!(first.spearman_raw.is_empty());
    assert!(first.kendall_raw.is_empty());
    assert!(first.pearson_diff.is_empty());
    assert!(first.spearman_diff.is_empty());
    assert!(first.kendall_diff.is_empty());
    // Both callers share a single collection and pair calculation.
    assert_eq!(
        state
            .metrics
            .snapshot(0, 0)
            .correlations_stages
            .input_rows_total,
        5
    );
    let snapshot = state.metrics.snapshot(0, 0);
    assert_eq!(snapshot.correlations_stages.all_modes_total, 0);
    assert_eq!(snapshot.correlations_stages.cache_miss_total, 1);
    assert_eq!(snapshot.correlations_stages.cache_hit_total, 1);
    let spearman = working_correlation_matrix(
        &state,
        frame.clone().lazy(),
        &identity,
        Some(CorrelationMode::SpearmanRaw),
    )
    .await
    .expect("spearman");
    assert!(spearman.pearson_raw.is_empty());
    let full = working_correlation_matrix(&state, frame.lazy(), &identity, None)
        .await
        .expect("all modes");
    assert_eq!(spearman.spearman_raw, full.spearman_raw);
    assert_eq!(first.pearson_raw, full.pearson_raw);
    assert_eq!(first.counts, full.counts);
}

#[tokio::test(flavor = "multi_thread")]
async fn working_matrix_does_not_wait_for_another_plan_in_flight() {
    let frame = DataFrame::new(
        3,
        vec![
            Series::new("a".into(), [1.0_f64, 2.0, 3.0]).into(),
            Series::new("b".into(), [2.0_f64, 4.0, 6.0]).into(),
        ],
    )
    .expect("frame");
    let state = AppState::new(frame.clone(), AppConfig::default());
    let identity = ExecutionIdentity::from_version(
        state.current_dataset_version().expect("version"),
        Some("new-plan".into()),
    );
    let old_slot = state.working_correlation_cache.lock().await.entry(
        identity.source_version_id.clone(),
        "old-plan".into(),
        "pearson_raw",
        1,
    );
    let (started, waiting) = tokio::sync::oneshot::channel();
    let old_request = tokio::spawn(async move {
        old_slot
            .get_or_init(|| async {
                started.send(()).expect("started");
                std::future::pending::<CorrelationMatrixCacheEntry>().await
            })
            .await;
    });
    waiting.await.expect("old request holds its slot");
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        working_correlation_matrix(
            &state,
            frame.lazy(),
            &identity,
            Some(CorrelationMode::PearsonRaw),
        ),
    )
    .await;
    old_request.abort();
    let matrix = result
        .expect("new plan must not wait for old plan")
        .expect("new matrix");
    assert_eq!(matrix.pearson_raw[0][1], Some(1.0));
}

#[test]
fn selected_mode_preserves_pair_alignment_and_counts_for_every_metric() {
    let frame = DataFrame::new(
        6,
        vec![
            Series::new(
                "a".into(),
                [
                    Some(1.0_f64),
                    None,
                    Some(3.0),
                    Some(f64::NAN),
                    Some(7.0),
                    Some(5.0),
                ],
            )
            .into(),
            Series::new("b".into(), [2.0_f64, 8.0, 2.0, 9.0, 6.0, 4.0]).into(),
            Series::new("c".into(), [6.0_f64, 5.0, 4.0, 3.0, 2.0, 1.0]).into(),
        ],
    )
    .expect("frame");
    let all = compute_correlation_matrix(frame.clone().lazy(), test_metrics()).expect("all");
    for mode in [
        CorrelationMode::PearsonRaw,
        CorrelationMode::SpearmanRaw,
        CorrelationMode::KendallRaw,
        CorrelationMode::PearsonDiff,
        CorrelationMode::SpearmanDiff,
        CorrelationMode::KendallDiff,
    ] {
        let selected =
            compute_correlation_data_for_mode(frame.clone().lazy(), mode, test_metrics())
                .expect("selected mode");
        assert_eq!(mode.matrix(&selected), mode.matrix(&all));
        assert_eq!(selected.counts, all.counts);
        let response = build_scatter_correlations_from_matrix_data(&selected, Some("a"), 0.0, mode)
            .expect("scatter response");
        let expected = build_scatter_correlations_from_matrix_data(&all, Some("a"), 0.0, mode)
            .expect("full response");
        assert_eq!(
            serde_json::to_value(response).unwrap(),
            serde_json::to_value(expected).unwrap()
        );
    }
}

#[test]
fn cached_matrix_builds_sorted_correlations_for_requested_base() {
    let cached = edatime_store::cache::CorrelationMatrixCacheEntry {
        input_rows: 0,
        time_range_ms: None,
        columns: vec!["a".to_string(), "b".to_string(), "c".to_string()],
        pearson_raw: vec![
            vec![Some(1.0), Some(0.25), Some(0.9)],
            vec![Some(0.25), Some(1.0), Some(-0.8)],
            vec![Some(0.9), Some(-0.8), Some(1.0)],
        ],
        spearman_raw: vec![
            vec![Some(1.0), Some(0.3), Some(0.7)],
            vec![Some(0.3), Some(1.0), Some(-0.6)],
            vec![Some(0.7), Some(-0.6), Some(1.0)],
        ],
        kendall_raw: vec![
            vec![Some(1.0), Some(0.2), Some(0.6)],
            vec![Some(0.2), Some(1.0), Some(-0.4)],
            vec![Some(0.6), Some(-0.4), Some(1.0)],
        ],
        pearson_diff: vec![
            vec![Some(1.0), Some(0.1), Some(-0.2)],
            vec![Some(0.1), Some(1.0), Some(0.4)],
            vec![Some(-0.2), Some(0.4), Some(1.0)],
        ],
        spearman_diff: vec![
            vec![Some(1.0), Some(0.15), Some(-0.1)],
            vec![Some(0.15), Some(1.0), Some(0.45)],
            vec![Some(-0.1), Some(0.45), Some(1.0)],
        ],
        kendall_diff: vec![
            vec![Some(1.0), Some(0.05), Some(-0.1)],
            vec![Some(0.05), Some(1.0), Some(0.72)],
            vec![Some(-0.1), Some(0.72), Some(1.0)],
        ],
        counts: vec![vec![3, 3, 3], vec![3, 3, 3], vec![3, 3, 3]],
        diff_counts: vec![vec![2, 2, 2], vec![2, 2, 2], vec![2, 2, 2]],
    };

    let response = build_scatter_correlations_from_cached_matrix(
        cached,
        Some("b"),
        0.7,
        CorrelationMode::KendallDiff,
    )
    .expect("cached matrix should build response");

    assert_eq!(response.base_column, "b");
    assert_eq!(response.mode, CorrelationMode::KendallDiff);
    assert_eq!(response.numeric_columns, vec!["a", "b", "c"]);
    assert_eq!(
        response
            .correlations
            .iter()
            .map(|item| item.column.as_str())
            .collect::<Vec<_>>(),
        vec!["c", "a"]
    );
    assert_eq!(response.correlations[0].value, Some(0.72));
    assert_eq!(response.correlations[0].count, 2);
    assert_eq!(response.suggestions.len(), 1);
    assert_eq!(response.suggestions[0].x, "b");
    assert_eq!(response.suggestions[0].y, "c");
    assert_eq!(response.suggestions[0].correlation, 0.72);
}

#[test]
fn top_pairs_ranks_by_absolute_correlation_across_full_matrix() {
    // Mirror the ETTm2 situation: the strongest pair (b↔c) does not
    // involve the base column `a`. The legacy `suggestions` list would
    // miss it when threshold > |corr(a,*)|; the new `top_pairs` field
    // surfaces it regardless — see `usage_issue.md` §2.1.
    let cached = edatime_store::cache::CorrelationMatrixCacheEntry {
        input_rows: 0,
        time_range_ms: None,
        columns: vec![
            "a".to_string(),
            "b".to_string(),
            "c".to_string(),
            "d".to_string(),
        ],
        pearson_raw: vec![
            vec![Some(1.0), Some(0.25), Some(0.30), Some(-0.10)],
            vec![Some(0.25), Some(1.0), Some(0.91), Some(-0.60)],
            vec![Some(0.30), Some(0.91), Some(1.0), Some(-0.20)],
            vec![Some(-0.10), Some(-0.60), Some(-0.20), Some(1.0)],
        ],
        spearman_raw: vec![
            vec![Some(1.0), Some(0.25), Some(0.30), Some(-0.10)],
            vec![Some(0.25), Some(1.0), Some(0.91), Some(-0.60)],
            vec![Some(0.30), Some(0.91), Some(1.0), Some(-0.20)],
            vec![Some(-0.10), Some(-0.60), Some(-0.20), Some(1.0)],
        ],
        kendall_raw: vec![
            vec![Some(1.0), Some(0.25), Some(0.30), Some(-0.10)],
            vec![Some(0.25), Some(1.0), Some(0.91), Some(-0.60)],
            vec![Some(0.30), Some(0.91), Some(1.0), Some(-0.20)],
            vec![Some(-0.10), Some(-0.60), Some(-0.20), Some(1.0)],
        ],
        pearson_diff: vec![
            vec![Some(1.0), Some(0.25), Some(0.30), Some(-0.10)],
            vec![Some(0.25), Some(1.0), Some(0.91), Some(-0.60)],
            vec![Some(0.30), Some(0.91), Some(1.0), Some(-0.20)],
            vec![Some(-0.10), Some(-0.60), Some(-0.20), Some(1.0)],
        ],
        spearman_diff: vec![
            vec![Some(1.0), Some(0.25), Some(0.30), Some(-0.10)],
            vec![Some(0.25), Some(1.0), Some(0.91), Some(-0.60)],
            vec![Some(0.30), Some(0.91), Some(1.0), Some(-0.20)],
            vec![Some(-0.10), Some(-0.60), Some(-0.20), Some(1.0)],
        ],
        kendall_diff: vec![
            vec![Some(1.0), Some(0.25), Some(0.30), Some(-0.10)],
            vec![Some(0.25), Some(1.0), Some(0.91), Some(-0.60)],
            vec![Some(0.30), Some(0.91), Some(1.0), Some(-0.20)],
            vec![Some(-0.10), Some(-0.60), Some(-0.20), Some(1.0)],
        ],
        counts: vec![
            vec![3, 3, 3, 3],
            vec![3, 3, 3, 3],
            vec![3, 3, 3, 3],
            vec![3, 3, 3, 3],
        ],
        diff_counts: vec![
            vec![2, 2, 2, 2],
            vec![2, 2, 2, 2],
            vec![2, 2, 2, 2],
            vec![2, 2, 2, 2],
        ],
    };

    let response = build_scatter_correlations_from_cached_matrix(
        cached,
        Some("a"),
        // High threshold so the legacy `suggestions` list comes back
        // empty — the whole point of `top_pairs` is to surface pairs
        // regardless of the threshold.
        0.95,
        CorrelationMode::PearsonRaw,
    )
    .expect("cached matrix should build response");

    // Legacy base-column suggestions are filtered out by threshold.
    assert!(
        response.suggestions.is_empty(),
        "threshold should hide suggestions"
    );

    // top_pairs is sorted by |r| descending and includes the strongest
    // off-base pair first (b ↔ c = 0.91), then the strong negative
    // (b ↔ d = -0.60).
    assert_eq!(response.top_pairs[0].x, "b");
    assert_eq!(response.top_pairs[0].y, "c");
    assert!((response.top_pairs[0].correlation - 0.91).abs() < 1e-9);
    assert_eq!(response.top_pairs[0].count, 3);

    // Negative pair is ranked by absolute value so it sits below the
    // 0.91 pair but above the 0.30 / 0.25 noise.
    assert_eq!(response.top_pairs[1].x, "b");
    assert_eq!(response.top_pairs[1].y, "d");
    assert!((response.top_pairs[1].correlation + 0.60).abs() < 1e-9);
}

#[test]
fn top_pairs_respects_selected_mode() {
    let cached = edatime_store::cache::CorrelationMatrixCacheEntry {
        input_rows: 0,
        time_range_ms: None,
        columns: vec!["a".to_string(), "b".to_string()],
        pearson_raw: vec![vec![Some(1.0), Some(0.5)], vec![Some(0.5), Some(1.0)]],
        spearman_raw: vec![vec![Some(1.0), Some(0.9)], vec![Some(0.9), Some(1.0)]],
        kendall_raw: vec![vec![Some(1.0), Some(0.3)], vec![Some(0.3), Some(1.0)]],
        pearson_diff: vec![vec![Some(1.0), Some(0.1)], vec![Some(0.1), Some(1.0)]],
        spearman_diff: vec![vec![Some(1.0), Some(0.2)], vec![Some(0.2), Some(1.0)]],
        kendall_diff: vec![vec![Some(1.0), Some(0.4)], vec![Some(0.4), Some(1.0)]],
        counts: vec![vec![3, 3], vec![3, 3]],
        diff_counts: vec![vec![2, 2], vec![2, 2]],
    };

    let pearson = build_scatter_correlations_from_cached_matrix(
        cached.clone(),
        Some("a"),
        0.0,
        CorrelationMode::PearsonRaw,
    )
    .expect("pearson build should succeed");
    assert!((pearson.top_pairs[0].correlation - 0.5).abs() < 1e-9);

    let spearman = build_scatter_correlations_from_cached_matrix(
        cached,
        Some("a"),
        0.0,
        CorrelationMode::SpearmanRaw,
    )
    .expect("spearman build should succeed");
    // Spearman value is higher than Pearson so it wins under |r| ordering.
    assert!((spearman.top_pairs[0].correlation - 0.9).abs() < 1e-9);
}

#[test]
fn top_pairs_returns_empty_when_matrix_has_no_pairs() {
    let cached = edatime_store::cache::CorrelationMatrixCacheEntry {
        input_rows: 0,
        time_range_ms: None,
        columns: vec!["only".to_string()],
        pearson_raw: vec![vec![Some(1.0)]],
        spearman_raw: vec![vec![Some(1.0)]],
        kendall_raw: vec![vec![Some(1.0)]],
        pearson_diff: vec![vec![Some(1.0)]],
        spearman_diff: vec![vec![Some(1.0)]],
        kendall_diff: vec![vec![Some(1.0)]],
        counts: vec![vec![3]],
        diff_counts: vec![vec![2]],
    };
    let response = build_scatter_correlations_from_cached_matrix(
        cached,
        Some("only"),
        0.5,
        CorrelationMode::PearsonRaw,
    )
    .expect("singleton matrix should still build");
    assert!(response.top_pairs.is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn warm_correlation_matrix_cache_populates_current_revision() {
    let df = DataFrame::new(
        3,
        vec![
            Series::new("a".into(), [1.0_f64, 2.0, 3.0]).into(),
            Series::new("b".into(), [2.0_f64, 4.0, 6.0]).into(),
            Series::new("c".into(), [3.0_f64, 2.0, 1.0]).into(),
        ],
    )
    .expect("test dataframe should build");
    let state = AppState::new(df, AppConfig::default());
    let revision = state.dataset_revision();

    spawn_correlation_matrix_warmup(state.clone())
        .await
        .expect("warmup task should join");

    let cached = state
        .cached_correlation_matrix(revision)
        .expect("warmup should populate matrix cache");
    assert_eq!(cached.columns, vec!["a", "b", "c"]);
    assert_eq!(cached.pearson_raw[0][1], Some(1.0));
    assert_eq!(cached.pearson_raw[0][2], Some(-1.0));
    assert_eq!(cached.spearman_raw[0][1], Some(1.0));
    assert_eq!(cached.kendall_raw[0][1], Some(1.0));
    assert_eq!(cached.counts[0][1], 3);
}

#[test]
fn correlation_matrix_returns_empty_payload_when_no_numeric_columns_exist() {
    let df = DataFrame::new(
        3,
        vec![
            Series::new("label".into(), ["a", "b", "c"]).into(),
            Series::new("group".into(), ["x", "y", "z"]).into(),
        ],
    )
    .expect("dataframe should build");

    let result =
        compute_correlation_matrix(df.lazy(), test_metrics()).expect("matrix should not error");

    assert!(result.columns.is_empty());
    assert!(result.pearson_raw.is_empty());
    assert!(result.spearman_raw.is_empty());
    assert!(result.kendall_raw.is_empty());
    assert!(result.pearson_diff.is_empty());
    assert!(result.spearman_diff.is_empty());
    assert!(result.kendall_diff.is_empty());
    assert!(result.counts.is_empty());
}

#[test]
fn correlation_matrix_returns_singleton_diagonal_when_one_numeric_column_exists() {
    let df = DataFrame::new(
        3,
        vec![
            Series::new("only".into(), [1.0_f64, 2.0, 3.0]).into(),
            Series::new("label".into(), ["x", "y", "z"]).into(),
        ],
    )
    .expect("dataframe should build");

    let result =
        compute_correlation_matrix(df.lazy(), test_metrics()).expect("matrix should not error");

    assert_eq!(result.columns, vec!["only"]);
    assert_eq!(result.pearson_raw, vec![vec![Some(1.0)]]);
    assert_eq!(result.spearman_raw, vec![vec![Some(1.0)]]);
    assert_eq!(result.kendall_raw, vec![vec![Some(1.0)]]);
    assert_eq!(result.pearson_diff, vec![vec![None]]);
    assert_eq!(result.spearman_diff, vec![vec![None]]);
    assert_eq!(result.kendall_diff, vec![vec![None]]);
    assert_eq!(result.counts, vec![vec![3]]);
}

#[test]
fn correlation_diagonals_follow_pairwise_validity_and_variance_rules() {
    let df = DataFrame::new(
        4,
        vec![
            Series::new("constant".into(), [5.0_f64, 5.0, 5.0, 5.0]).into(),
            Series::new("all_null".into(), [None::<f64>, None, None, None]).into(),
            Series::new(
                "all_invalid".into(),
                [
                    Some(f64::NAN),
                    Some(f64::INFINITY),
                    Some(f64::NEG_INFINITY),
                    None,
                ],
            )
            .into(),
            Series::new("singleton".into(), [None, None, Some(5.0_f64), None]).into(),
            Series::new("ramp".into(), [1.0_f64, 2.0, 3.0, 4.0]).into(),
            Series::new("varying".into(), [1.0_f64, 2.0, 4.0, 8.0]).into(),
        ],
    )
    .expect("diagonal fixture");
    let matrix = compute_correlation_matrix(df.lazy(), test_metrics()).expect("matrix");
    for (name, expected_count) in [
        ("constant", 4),
        ("all_null", 0),
        ("all_invalid", 0),
        ("singleton", 1),
        ("ramp", 4),
        ("varying", 4),
    ] {
        let index = matrix
            .columns
            .iter()
            .position(|column| column == name)
            .expect("diagonal column");
        assert_eq!(matrix.counts[index][index], expected_count, "{name} count");
        if matches!(name, "ramp" | "varying") {
            assert_eq!(matrix.pearson_raw[index][index], Some(1.0), "{name} raw");
            assert_eq!(
                matrix.spearman_raw[index][index],
                Some(1.0),
                "{name} raw rank"
            );
            assert_eq!(
                matrix.kendall_raw[index][index],
                Some(1.0),
                "{name} raw tau"
            );
        } else {
            assert_eq!(matrix.pearson_raw[index][index], None, "{name} raw");
            assert_eq!(matrix.spearman_raw[index][index], None, "{name} raw rank");
            assert_eq!(matrix.kendall_raw[index][index], None, "{name} raw tau");
        }
        if name == "varying" {
            assert_eq!(matrix.pearson_diff[index][index], Some(1.0));
            assert_eq!(matrix.spearman_diff[index][index], Some(1.0));
            assert_eq!(matrix.kendall_diff[index][index], Some(1.0));
        } else {
            assert_eq!(matrix.pearson_diff[index][index], None, "{name} difference");
            assert_eq!(
                matrix.spearman_diff[index][index], None,
                "{name} difference rank"
            );
            assert_eq!(
                matrix.kendall_diff[index][index], None,
                "{name} difference tau"
            );
        }
    }
}

#[test]
fn correlation_matrix_computes_first_difference_modes_from_aligned_pairs() {
    let df = DataFrame::new(
        4,
        vec![
            Series::new("a".into(), [1.0_f64, 2.0, 3.0, 4.0]).into(),
            Series::new("b".into(), [10.0_f64, 9.0, 8.0, 7.0]).into(),
        ],
    )
    .expect("dataframe should build");

    let result =
        compute_correlation_matrix(df.lazy(), test_metrics()).expect("matrix should not error");

    assert_eq!(result.pearson_raw[0][1], Some(-1.0));
    assert_eq!(result.spearman_raw[0][1], Some(-1.0));
    assert_eq!(result.kendall_raw[0][1], Some(-1.0));
    assert_eq!(result.pearson_diff[0][1], None);
    assert_eq!(result.spearman_diff[0][1], None);
    assert_eq!(result.kendall_diff[0][1], None);
}

#[test]
fn first_differences_preserve_adjacent_row_gaps_and_counts() {
    let x = vec![Some(0.0), None, Some(100.0), Some(101.0), Some(103.0)];
    let y = vec![Some(0.0), Some(3.0), Some(-100.0), Some(-99.0), Some(-97.0)];
    assert_eq!(
        first_difference_pairs(&x, &y),
        vec![[1.0, 1.0], [2.0, 2.0]],
        "a missing row must invalidate neighboring differences, not create a longer bridge"
    );

    let x = vec![
        Some(0.0),
        None,
        Some(100.0),
        Some(101.0),
        Some(103.0),
        Some(105.0),
        Some(108.0),
    ];
    let y = vec![
        Some(0.0),
        Some(3.0),
        Some(-100.0),
        Some(-99.0),
        None,
        Some(-95.0),
        Some(-90.0),
    ];
    assert_eq!(
        first_difference_pairs(&x, &y),
        vec![[1.0, 1.0], [3.0, 5.0]],
        "asymmetric masks should keep only shared adjacent valid intervals"
    );

    let df = DataFrame::new(
        7,
        vec![
            Series::new("x".into(), x).into(),
            Series::new("y".into(), y).into(),
        ],
    )
    .expect("masked frame");
    let matrix = compute_correlation_matrix(df.lazy(), test_metrics()).expect("matrix");
    let x_index = matrix
        .columns
        .iter()
        .position(|name| name == "x")
        .expect("x index");
    let y_index = matrix
        .columns
        .iter()
        .position(|name| name == "y")
        .expect("y index");
    assert_eq!(matrix.counts[x_index][y_index], 5);
    assert_eq!(matrix.diff_counts[x_index][y_index], 2);
    assert_eq!(matrix.pearson_diff[x_index][y_index], Some(1.0));

    let response = build_scatter_correlations_from_matrix_data(
        &matrix,
        Some("x"),
        0.0,
        CorrelationMode::PearsonDiff,
    )
    .expect("difference response");
    assert_eq!(response.correlations[0].count, 2);
}

#[test]
fn correlation_projection_excludes_unused_columns_before_collection() {
    let frame = DataFrame::new(
        2,
        vec![
            Series::new("value".into(), [1.0_f64, 2.0]).into(),
            Series::new("unused_payload".into(), ["large text", "more text"]).into(),
        ],
    )
    .expect("frame");
    let projected = select_correlation_columns(frame.lazy(), &["value".to_string()])
        .collect()
        .expect("projected frame");
    assert_eq!(
        projected
            .get_column_names()
            .iter()
            .map(|name| name.as_str())
            .collect::<Vec<_>>(),
        vec!["value"]
    );
}

#[test]
fn correlation_input_sorts_by_selected_time_before_differencing() {
    let frame = DataFrame::new(
        4,
        vec![
            Series::new("event_time".into(), [3_i64, 1, 4, 2]).into(),
            Series::new("signal".into(), [30.0_f64, 10.0, 40.0, 20.0]).into(),
        ],
    )
    .expect("unsorted frame");
    let sorted = chronologically_ordered_frame(frame.lazy(), "event_time")
        .collect()
        .expect("chronological sort");
    let timestamps = sorted
        .column("event_time")
        .expect("time column")
        .i64()
        .expect("integer timestamps");
    assert_eq!(
        timestamps.into_no_null_iter().collect::<Vec<_>>(),
        vec![1, 2, 3, 4]
    );
}

#[test]
fn masking_one_trace_does_not_reduce_other_pair_counts() {
    let df = DataFrame::new(
        4,
        vec![
            Series::new("a".into(), [None, Some(2.0_f64), None, Some(4.0)]).into(),
            Series::new("b".into(), [10.0_f64, 20.0, 30.0, 40.0]).into(),
            Series::new("c".into(), [40.0_f64, 30.0, 20.0, 10.0]).into(),
        ],
    )
    .expect("frame");
    let matrix = compute_correlation_matrix(df.lazy(), test_metrics()).expect("matrix");
    assert_eq!(matrix.counts[0][1], 2);
    assert_eq!(matrix.counts[1][2], 4);
    assert_eq!(matrix.pearson_raw[1][2], Some(-1.0));
    assert_eq!(matrix.spearman_raw[1][2], Some(-1.0));
}

#[test]
fn correlation_matrix_does_not_shift_rows_after_non_finite_values() {
    let df = DataFrame::new(
        4,
        vec![
            Series::new("a".into(), [1.0_f64, f64::NAN, 3.0, 4.0]).into(),
            Series::new("b".into(), [10.0_f64, 20.0, 30.0, 40.0]).into(),
        ],
    )
    .expect("dataframe should build");

    let result =
        compute_correlation_matrix(df.lazy(), test_metrics()).expect("matrix should not error");

    assert_eq!(result.counts[0][1], 3);
    assert_eq!(result.pearson_raw[0][1], Some(1.0));
}

#[test]
fn correlation_matrix_for_selected_mode_only_populates_requested_matrix() {
    let df = DataFrame::new(
        3,
        vec![
            Series::new("a".into(), [1.0_f64, 2.0, 3.0]).into(),
            Series::new("b".into(), [3.0_f64, 2.0, 1.0]).into(),
        ],
    )
    .expect("dataframe should build");

    let metrics = test_metrics();
    let response = compute_correlation_matrix_for_mode(
        df.lazy(),
        CorrelationMode::KendallDiff,
        Arc::clone(&metrics),
    )
    .expect("selected-mode matrix should build");

    assert_eq!(response.columns, vec!["a", "b"]);
    assert!(response.pearson_raw.is_none());
    assert!(response.spearman_raw.is_none());
    assert!(response.kendall_raw.is_none());
    assert!(response.pearson_diff.is_none());
    assert!(response.spearman_diff.is_none());
    assert_eq!(
        response.kendall_diff,
        Some(vec![vec![None, None], vec![None, None]])
    );
    let snapshot = metrics.snapshot(0, 0);
    assert_eq!(snapshot.correlations_stages.numeric_columns_total, 2);
    assert_eq!(snapshot.correlations_stages.input_rows_total, 3);
    assert!(snapshot.correlations_stages.collect_ns_total > 0);
    assert!(snapshot.correlations_stages.extract_ns_total > 0);
    assert!(snapshot.correlations_stages.pair_calc_ns_total > 0);
}

#[tokio::test(flavor = "multi_thread")]
async fn warm_correlation_matrix_cache_stores_empty_payload_for_insufficient_numeric_columns() {
    let df = DataFrame::new(3, vec![Series::new("label".into(), ["x", "y", "z"]).into()])
        .expect("dataframe should build");
    let state = AppState::new(df, AppConfig::default());
    let revision = state.dataset_revision();

    spawn_correlation_matrix_warmup(state.clone())
        .await
        .expect("warmup task should join");

    let cached = state
        .cached_correlation_matrix(revision)
        .expect("warmup should cache empty matrix payload");
    assert!(cached.columns.is_empty());
    assert!(cached.pearson_raw.is_empty());
    assert!(cached.spearman_raw.is_empty());
    assert!(cached.kendall_raw.is_empty());
    assert!(cached.pearson_diff.is_empty());
    assert!(cached.spearman_diff.is_empty());
    assert!(cached.kendall_diff.is_empty());
    assert!(cached.counts.is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn scatter_correlations_execute_the_canonical_plan_without_active_cache_pollution() {
    let df = DataFrame::new(
        3,
        vec![
            Series::new("ts".into(), [1_i64, 2, 3]).into(),
            Series::new("a".into(), [1.0_f64, 2.0, 3.0]).into(),
            Series::new("b".into(), [2.0_f64, 4.0, 6.0]).into(),
            Series::new("c".into(), [3.0_f64, 2.0, 1.0]).into(),
        ],
    )
    .expect("test dataframe should build");
    let state = AppState::new(df, AppConfig::default());
    let revision = state.dataset_revision();

    let response = scatter_correlations_response(
        state.clone(),
        ScatterCorrelationsQuery {
            base: Some("a".to_string()),
            threshold: Some(0.7),
            mode: Some(CorrelationMode::SpearmanDiff),
            include_global_top_pairs: true,
            cleaning_plan: empty_envelope(&state),
        },
    )
    .await
    .expect("scatter correlations request should succeed");

    assert_eq!(
        response
            .headers()
            .get("x-edatime-source-version")
            .and_then(|value| value.to_str().ok()),
        Some("source-0")
    );
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("response body");
    let response: serde_json::Value = serde_json::from_slice(&body).expect("response JSON");
    assert_eq!(response["base_column"], "a");
    assert_eq!(response["mode"], "spearman_diff");
    assert!(
        state.cached_correlation_matrix(revision).is_none(),
        "a canonical plan must not populate the unplanned active-dataset cache"
    );
}

fn budget_frame(rows: usize) -> DataFrame {
    DataFrame::new(
        rows,
        vec![
            Series::new("ts".into(), (0..rows as i64).collect::<Vec<_>>()).into(),
            Series::new(
                "a".into(),
                (0..rows).map(|row| row as f64).collect::<Vec<_>>(),
            )
            .into(),
        ],
    )
    .expect("budget fixture")
}

#[tokio::test(flavor = "multi_thread")]
async fn correlation_budget_rejects_large_retained_source_when_active_source_is_small() {
    let mut config = AppConfig::default();
    config.budgets.max_correlation_work_units = 12;
    let state = AppState::new(budget_frame(10), config);
    let retained = empty_envelope(&state);
    state
        .replace_dataset(budget_frame(1))
        .await
        .expect("replace active source");
    let error = correlation_matrix_response(
        state.clone(),
        CorrelationMatrixQuery {
            mode: Some(CorrelationMode::PearsonRaw),
            cleaning_plan: retained.clone(),
        },
    )
    .await
    .expect_err("retained source exceeds row-pair budget");
    assert!(error.to_string().contains("correlation row-pair work"));
    let error = scatter_correlations_response(
        state,
        ScatterCorrelationsQuery {
            base: Some("a".to_string()),
            threshold: None,
            mode: Some(CorrelationMode::PearsonRaw),
            include_global_top_pairs: false,
            cleaning_plan: retained,
        },
    )
    .await
    .expect_err("base-only work must also use the requested source");
    assert!(error.to_string().contains("correlation row-pair work"));
}

#[tokio::test(flavor = "multi_thread")]
async fn correlation_budget_accepts_small_retained_source_when_active_source_is_large() {
    let mut config = AppConfig::default();
    config.budgets.max_correlation_work_units = 12;
    let state = AppState::new(budget_frame(2), config);
    let retained = empty_envelope(&state);
    state
        .replace_dataset(budget_frame(10))
        .await
        .expect("replace active source");
    correlation_matrix_response(
        state,
        CorrelationMatrixQuery {
            mode: Some(CorrelationMode::PearsonRaw),
            cleaning_plan: retained,
        },
    )
    .await
    .expect("small retained source remains within budget");
}

#[tokio::test(flavor = "multi_thread")]
async fn correlation_budget_counts_filtered_rows_and_rejects_one_row_over_limit() {
    let mut config = AppConfig::default();
    config.budgets.max_correlation_work_units = 36;
    let state = AppState::new(budget_frame(20), config);
    for (mode, permitted_rows) in [(Some(CorrelationMode::PearsonRaw), 12), (None, 2)] {
        for extra_row in [0, 1] {
            let mut context = empty_envelope(&state);
            context.plan.stages = vec![
                serde_json::from_value(serde_json::json!({
                    "kind": "timeRange", "id": "window", "enabled": true,
                    "executionClass": "polarsExpression", "scope": "row",
                    "sourcePage": "timeseries", "label": "window",
                    "createdAt": "now", "updatedAt": "now",
                    "startMs": 0.0, "endMs": (permitted_rows + extra_row - 1) as f64,
                    "mode": "keepInside"
                }))
                .expect("time-range stage"),
            ];
            let result = correlation_matrix_response(
                state.clone(),
                CorrelationMatrixQuery {
                    mode,
                    cleaning_plan: context,
                },
            )
            .await;
            if extra_row == 1 {
                let error = result.expect_err("do not return a silently truncated matrix");
                assert!(error.to_string().contains("correlation row-pair work"));
            } else {
                let response = result.expect("working rows at the budget remain exact");
                let body = axum::body::to_bytes(response.into_body(), usize::MAX)
                    .await
                    .expect("body");
                let data: serde_json::Value = serde_json::from_slice(&body).expect("JSON matrix");
                let value = data["pearson_raw"][0][1].as_f64().expect("coefficient");
                assert!((value - 1.0).abs() < 1e-12);
            }
        }
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn correlation_cache_does_not_retain_results_with_oversized_column_names() {
    let name = format!("signal_{}", "x".repeat(2_000));
    let frame = DataFrame::new(
        3,
        vec![
            Series::new("ts".into(), [1_i64, 2, 3]).into(),
            Series::new(name.into(), [1.0_f64, 2.0, 3.0]).into(),
        ],
    )
    .expect("long column-name frame");
    let mut config = AppConfig::default();
    config.cache.max_bytes = 1024;
    let state = AppState::new(frame, config);
    for _ in 0..2 {
        correlation_matrix_response(
            state.clone(),
            CorrelationMatrixQuery {
                mode: Some(CorrelationMode::PearsonRaw),
                cleaning_plan: empty_envelope(&state),
            },
        )
        .await
        .expect("oversized cache result can still be returned");
    }
    assert_eq!(
        state
            .metrics
            .snapshot(0, 0)
            .correlations_stages
            .cache_hit_total,
        0,
        "result bytes must include complete column names"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn correlation_route_rejects_row_pair_work_above_configured_budget() {
    let df = DataFrame::new(
        3,
        vec![
            Series::new("ts".into(), [1_i64, 2, 3]).into(),
            Series::new("a".into(), [1.0_f64, 2.0, 3.0]).into(),
            Series::new("b".into(), [2.0_f64, 4.0, 6.0]).into(),
        ],
    )
    .expect("test dataframe should build");
    let mut config = AppConfig::default();
    config.budgets.max_correlation_work_units = 1;
    let state = AppState::new(df, config);
    let error = scatter_correlations_response(
        state.clone(),
        ScatterCorrelationsQuery {
            base: Some("a".to_string()),
            threshold: Some(0.7),
            mode: Some(CorrelationMode::PearsonRaw),
            include_global_top_pairs: true,
            cleaning_plan: empty_envelope(&state),
        },
    )
    .await
    .expect_err("work over the configured budget must fail before correlation computation");
    assert!(error.to_string().contains("correlation row-pair work"));
}

#[tokio::test(flavor = "multi_thread")]
async fn base_only_correlations_skip_global_pairs_and_keep_suggestions() {
    let df = DataFrame::new(
        4,
        vec![
            Series::new("ts".into(), [1_i64, 2, 3, 4]).into(),
            Series::new("a".into(), [1.0_f64, 2.0, 3.0, 4.0]).into(),
            Series::new("b".into(), [2.0_f64, 4.0, 6.0, 8.0]).into(),
            Series::new("c".into(), [4.0_f64, 3.0, 2.0, 1.0]).into(),
        ],
    )
    .expect("test dataframe should build");
    let state = AppState::new(df, AppConfig::default());
    let response = scatter_correlations_response(
        state.clone(),
        ScatterCorrelationsQuery {
            base: Some("a".to_string()),
            threshold: Some(0.9),
            mode: Some(CorrelationMode::PearsonRaw),
            include_global_top_pairs: false,
            cleaning_plan: empty_envelope(&state),
        },
    )
    .await
    .expect("base-only correlation request should succeed");
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("response body");
    let response: serde_json::Value = serde_json::from_slice(&body).expect("response JSON");
    assert_eq!(response["base_column"], "a");
    assert!(response["top_pairs"].as_array().unwrap().is_empty());
    assert_eq!(response["correlations"].as_array().unwrap().len(), 3);
    assert_eq!(response["suggestions"].as_array().unwrap().len(), 3);
}

#[tokio::test(flavor = "multi_thread")]
async fn correlation_route_rejects_pair_work_above_configured_budget() {
    let df = DataFrame::new(
        2,
        vec![
            Series::new("ts".into(), [1_i64, 2]).into(),
            Series::new("a".into(), [1.0_f64, 2.0]).into(),
            Series::new("b".into(), [2.0_f64, 4.0]).into(),
        ],
    )
    .expect("test dataframe should build");
    let mut config = AppConfig::default();
    config.budgets.max_scatter_matrix_pairs = 1;
    let state = AppState::new(df, config);
    let error = scatter_correlations_response(
        state.clone(),
        ScatterCorrelationsQuery {
            base: Some("a".to_string()),
            threshold: Some(0.7),
            mode: Some(CorrelationMode::PearsonRaw),
            include_global_top_pairs: true,
            cleaning_plan: empty_envelope(&state),
        },
    )
    .await
    .expect_err("pair count over the configured limit must fail before collection");
    assert!(error.to_string().contains("correlation pair count"));
}

#[tokio::test(flavor = "multi_thread")]
async fn planned_scatter_correlations_use_filtered_source_without_polluting_active_cache() {
    let df = DataFrame::new(
        3,
        vec![
            Series::new("ts".into(), [1_i64, 2, 3]).into(),
            Series::new("a".into(), [1.0_f64, 2.0, 3.0]).into(),
            Series::new("b".into(), [2.0_f64, 4.0, 6.0]).into(),
        ],
    )
    .expect("test dataframe should build");
    let state = AppState::new(df, AppConfig::default());
    let revision = state.dataset_revision();
    let version = state.current_dataset_version().expect("source version");
    let envelope = serde_json::json!({
        "plan": {
            "schemaVersion": 1,
            "id": "correlation-plan",
            "planRevision": 1,
            "sourceVersionId": version.id,
            "datasetRevision": version.revision,
            "datasetFingerprint": version.dataset_fingerprint,
            "schemaFingerprint": version.schema_fingerprint,
            "timeColumn": "ts",
            "sourceName": null,
            "stages": [{
                "kind": "columnRange",
                "id": "range-a",
                "enabled": true,
                "executionClass": "polarsExpression",
                "scope": "row",
                "sourcePage": "scatter",
                "label": "keep upper rows",
                "note": null,
                "createdAt": "2026-07-15T00:00:00Z",
                "updatedAt": "2026-07-15T00:00:00Z",
                "column": "a",
                "from": 2.0,
                "to": 3.0,
                "mode": "keepInside"
            }],
            "createdAt": "2026-07-15T00:00:00Z",
            "updatedAt": "2026-07-15T00:00:00Z"
        },
        "expectedPlanHash": null,
        "expectedSourceVersionId": version.id,
        "expectedDatasetRevision": version.revision
    });

    let response = scatter_correlations_response(
        state.clone(),
        ScatterCorrelationsQuery {
            base: Some("a".to_string()),
            threshold: Some(0.0),
            mode: Some(CorrelationMode::PearsonRaw),
            include_global_top_pairs: true,
            cleaning_plan: serde_json::from_value(envelope)
                .expect("plan envelope should deserialize"),
        },
    )
    .await
    .expect("planned correlations request should succeed");

    assert!(
        response
            .headers()
            .get("x-edatime-plan-hash")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value != "none")
    );
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("response body");
    let response: serde_json::Value = serde_json::from_slice(&body).expect("response JSON");
    let b = response["correlations"]
        .as_array()
        .expect("correlations")
        .iter()
        .find(|item| item["column"] == "b")
        .expect("b correlation");
    assert_eq!(b["count"], 2);
    assert!(
        state.cached_correlation_matrix(revision).is_none(),
        "a plan-specific matrix must not be stored under the active dataset revision"
    );
}
