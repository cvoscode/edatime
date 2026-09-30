use super::*;
use polars::df;
use polars::prelude::{DataFrame, DataType, IntoLazy, NamedFrom, Series, TimeUnit};
use serde_json::json;

fn sample_drift_query() -> DriftQuery {
    DriftQuery {
        column: "value".to_string(),
        window: "daily".to_string(),
        reference_start: "1970-01-01T00:00".to_string(),
        reference_end: "1970-01-01T00:10".to_string(),
        ks_pvalue_threshold: None,
        es_pvalue_threshold: None,
        psi_minor_threshold: None,
        psi_major_threshold: None,
        wasserstein_std_multiplier: None,
        cleaning_plan: serde_json::from_value(json!({
            "plan": {
                "schemaVersion": 1, "id": "drift-test-plan", "planRevision": 1,
                "sourceVersionId": "source-0", "datasetRevision": 0,
                "datasetFingerprint": "test-frame", "schemaFingerprint": "test-schema",
                "timeColumn": "ts", "sourceName": null, "stages": [],
                "createdAt": "now", "updatedAt": "now"
            },
            "expectedPlanHash": null, "expectedSourceVersionId": "source-0",
            "expectedDatasetRevision": 0
        }))
        .expect("test plan envelope should deserialize"),
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn drift_preflight_endpoint_returns_matching_source_identity_and_counts() {
    let base = 1_700_000_000_000_i64;
    let timestamp_series = Series::new(
        "ts".into(),
        (0_i64..130)
            .map(|minute| base + minute * 60_000)
            .collect::<Vec<_>>(),
    )
    .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
    .unwrap();
    let value_series = Series::new(
        "value".into(),
        (0_i64..130).map(|minute| minute as f64).collect::<Vec<_>>(),
    );
    let frame = DataFrame::new(130, vec![timestamp_series.into(), value_series.into()]).unwrap();
    let state = AppState::new(frame, Default::default());
    let version = state.current_dataset_version().unwrap();
    let cleaning_plan = serde_json::from_value(json!({
        "plan": {
            "schemaVersion": 1, "id": "drift-preflight-test-plan", "planRevision": 1,
            "sourceVersionId": version.id, "datasetRevision": version.revision,
            "datasetFingerprint": version.dataset_fingerprint,
            "schemaFingerprint": version.schema_fingerprint,
            "timeColumn": "ts", "sourceName": null, "stages": [],
            "createdAt": "now", "updatedAt": "now"
        },
        "expectedPlanHash": null,
        "expectedSourceVersionId": version.id,
        "expectedDatasetRevision": version.revision
    }))
    .unwrap();
    let start = DateTime::<Utc>::from_timestamp_millis(base).unwrap();
    let reference_end = DateTime::<Utc>::from_timestamp_millis(base + 120 * 60_000).unwrap();
    let comparison_end = DateTime::<Utc>::from_timestamp_millis(base + 129 * 60_000).unwrap();
    let response = post_drift_preflight(
        State(state),
        Json(DriftInvestigateQuery {
            columns: vec!["value".to_string()],
            window: "daily".to_string(),
            reference_start: start.to_rfc3339(),
            reference_end: reference_end.to_rfc3339(),
            comparison_start: Some(reference_end.to_rfc3339()),
            comparison_end: Some(comparison_end.to_rfc3339()),
            segment_by: None,
            segment_limit: None,
            ks_pvalue_threshold: None,
            es_pvalue_threshold: None,
            psi_minor_threshold: None,
            psi_major_threshold: None,
            wasserstein_std_multiplier: None,
            include_quality: None,
            include_change_points: None,
            include_correlations: None,
            cleaning_plan,
        }),
    )
    .await
    .unwrap();
    assert_eq!(
        response.headers().get("x-edatime-source-version").unwrap(),
        version.id.as_str()
    );
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let result: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(result["sourceVersionId"], version.id);
    assert_eq!(result["sourceRevision"], version.revision);
    assert_eq!(result["columns"][0]["referenceValidSamples"], 120);
    assert_eq!(result["columns"][0]["comparisonValidSamples"], 10);
    assert_eq!(result["columns"][0]["decisionReady"], false);
    assert!(
        result["columns"][0]["warnings"][0]
            .as_str()
            .unwrap()
            .contains("10×")
    );
}

#[test]
fn drift_preflight_reports_finite_counts_and_sample_imbalance() {
    let base = 1_700_000_000_000_i64;
    let timestamps = (0_i64..24)
        .map(|minute| base + minute * 60_000)
        .collect::<Vec<_>>();
    let values = (0_i64..24).map(|minute| minute as f64).collect::<Vec<_>>();
    // One 12-minute monitoring window with 12 values; reference is also 12 values.
    let frame = df!("ts" => timestamps, "value" => values).unwrap();
    let reports = build_drift_preflight_columns(
        &frame,
        "ts",
        &["value".to_string()],
        base as f64,
        (base + 12 * 60_000) as f64,
        (base + 12 * 60_000) as f64,
        (base + 23 * 60_000) as f64,
        12 * 60_000,
    )
    .unwrap();
    let report = &reports[0];
    assert_eq!(report.reference_valid_samples, 12);
    assert_eq!(report.comparison_valid_samples, 12);
    assert_eq!(report.comparison_windows, 1);
    assert_eq!(report.windows_below_minimum, 0);
    assert!(report.decision_ready);
}

#[test]
fn drift_preflight_flags_quantile_collapsed_histograms_with_many_distinct_values() {
    let base = 1_700_000_000_000_i64;
    let timestamps = (0_i64..2_000)
        .map(|minute| base + minute * 60_000)
        .collect::<Vec<_>>();
    let values = (0_i64..2_000)
        .map(|index| {
            if index < 980 {
                0.0
            } else if index < 1_000 {
                (index - 979) as f64
            } else {
                ((index - 1_000) % 20 + 1) as f64
            }
        })
        .collect::<Vec<_>>();
    let frame = df!("ts" => timestamps, "value" => values).unwrap();
    let reports = build_drift_preflight_columns(
        &frame,
        "ts",
        &["value".to_string()],
        base as f64,
        (base + 1_000 * 60_000) as f64,
        (base + 1_000 * 60_000) as f64,
        (base + 1_999 * 60_000) as f64,
        24 * 60 * 60_000,
    )
    .unwrap();
    let report = &reports[0];
    assert_eq!(report.reference_valid_samples, 1_000);
    assert_eq!(report.average_window_samples, 1_000.0);
    assert!(!report.decision_ready);
    assert!(
        report
            .warnings
            .iter()
            .any(|warning| warning.contains("histogram bins"))
    );
}

#[test]
fn drift_preflight_flags_reference_to_window_imbalance_and_sparse_windows() {
    let base = 1_700_000_000_000_i64;
    let frame = df!(
        "ts" => (0_i64..90).map(|minute| base + minute * 60_000).collect::<Vec<_>>(),
        "value" => (0_i64..90).map(|minute| (minute != 62).then_some(minute as f64)).collect::<Vec<_>>(),
    )
    .unwrap();
    let reports = build_drift_preflight_columns(
        &frame,
        "ts",
        &["value".to_string()],
        base as f64,
        (base + 60 * 60_000) as f64,
        (base + 60 * 60_000) as f64,
        (base + 89 * 60_000) as f64,
        5 * 60_000,
    )
    .unwrap();
    let report = &reports[0];
    assert!(!report.decision_ready);
    assert_eq!(report.reference_valid_samples, 60);
    assert_eq!(report.comparison_windows, 6);
    assert_eq!(report.windows_below_minimum, 1);
    assert!(
        report
            .warnings
            .iter()
            .any(|warning| warning.contains("10×"))
    );
    assert!(
        report
            .warnings
            .iter()
            .any(|warning| warning.contains("fewer than 5"))
    );
    assert!(!report.suggestions.is_empty());
}

#[test]
fn drift_query_rejects_unknown_fields() {
    let err = serde_json::from_value::<DriftQuery>(json!({
        "column": "value",
        "window": "daily",
        "referenceStart": "1970-01-01T00:00",
        "referenceEnd": "1970-01-01T00:10",
        "unexpected": true
    }))
    .unwrap_err();
    assert!(err.to_string().contains("unknown field"));
}

#[test]
fn drift_stats_validation_rejects_invalid_window() {
    let lf = df!(
        "ts" => &[1_i64, 2_i64],
        "value" => &[1.0_f64, 2.0_f64],
    )
    .unwrap()
    .lazy();
    let mut query = sample_drift_query();
    query.window = "monthly".to_string();

    let err = validate_drift_stats_query(&lf, &query, &Default::default()).unwrap_err();
    assert!(err.to_string().contains("Invalid drift window"));
}

#[test]
fn drift_stats_validation_rejects_unknown_column() {
    let lf = df!(
        "ts" => &[1_i64, 2_i64],
        "value" => &[1.0_f64, 2.0_f64],
    )
    .unwrap()
    .lazy();
    let mut query = sample_drift_query();
    query.column = "missing".to_string();

    let err = validate_drift_stats_query(&lf, &query, &Default::default()).unwrap_err();
    assert!(err.to_string().contains("Unknown column 'missing'"));
}
