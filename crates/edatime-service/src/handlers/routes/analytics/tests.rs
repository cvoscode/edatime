use super::{
    AnomalyQuery, CausalGraphRequest, anomalies_response, estimate_causal_work_units,
    post_causal_graph,
};
use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use chrono::TimeZone;
use edatime_core::config::AppConfig;
use edatime_query::cleaning::CleaningPlanDto;
use edatime_store::state::AppState;
use polars::prelude::{DataFrame, NamedFrom, Series};
use serde_json::Value;

fn empty_envelope(state: &AppState) -> crate::handlers::routes::cleaning::PlanRequestEnvelope {
    let version = state.current_dataset_version().expect("source version");
    crate::handlers::routes::cleaning::PlanRequestEnvelope {
        expected_plan_hash: None,
        expected_source_version_id: version.id.clone(),
        expected_dataset_revision: version.revision,
        plan: CleaningPlanDto {
            schema_version: 1,
            id: "analytics-test-plan".to_string(),
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

fn test_envelope_json() -> Value {
    serde_json::json!({
        "plan": {
            "schemaVersion": 1,
            "id": "causal-test-plan",
            "planRevision": 1,
            "sourceVersionId": "source-0",
            "datasetRevision": 0,
            "datasetFingerprint": "test-frame",
            "schemaFingerprint": "test-schema",
            "timeColumn": "ts",
            "sourceName": null,
            "stages": [],
            "createdAt": "now",
            "updatedAt": "now"
        },
        "expectedPlanHash": null,
        "expectedSourceVersionId": "source-0",
        "expectedDatasetRevision": 0
    })
}

#[tokio::test(flavor = "multi_thread")]
async fn causal_route_preserves_response_shape_for_pcmci() {
    let df = DataFrame::new(
        6,
        vec![
            Series::new(
                "ts".into(),
                (0..6).map(|i| i * 900_000_i64).collect::<Vec<_>>(),
            )
            .into(),
            Series::new("x".into(), [1.0_f64, 2.0, 3.0, 4.0, 5.0, 6.0]).into(),
            Series::new("y".into(), [0.0_f64, 0.5, 1.0, 1.5, 2.0, 2.5]).into(),
        ],
    )
    .expect("test dataframe should build");
    let state = AppState::new(df, AppConfig::default());
    let cleaning_plan = empty_envelope(&state);

    let response = post_causal_graph(
        State(state.clone()),
        Json(CausalGraphRequest {
            start: None,
            end: None,
            columns: Some("x,y".to_string()),
            tau_max: Some(1),
            pc_alpha: Some(0.2),
            alpha: Some(0.05),
            method: Some("pcmci".to_string()),
            test: Some("par_corr".to_string()),
            max_points: Some(100),
            max_conds_dim: Some(1),
            fdr_method: Some("none".to_string()),
            n_preliminary_iterations: Some(1),
            knn: None,
            sig_samples: None,
            cleaning_plan,
        }),
    )
    .await
    .expect("causal route should succeed")
    .into_response();

    assert_eq!(
        response
            .headers()
            .get("x-edatime-source-version")
            .and_then(|value| value.to_str().ok()),
        Some("source-0")
    );

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("response body should read");
    let json: Value = serde_json::from_slice(&body).expect("response should be json");

    assert!(json.get("graph").is_some());
    assert!(json.get("val_matrix").is_some());
    assert!(json.get("p_matrix").is_some());
    assert!(json.get("columns").is_some());
    assert!(json.get("tau_max").is_some());
    assert!(json.get("links").is_some());
}

#[tokio::test(flavor = "multi_thread")]
async fn causal_route_accepts_tau_max_128_without_clamping() {
    let df = DataFrame::new(
        512,
        vec![
            Series::new(
                "ts".into(),
                (0..512).map(|i| i * 900_000_i64).collect::<Vec<_>>(),
            )
            .into(),
            Series::new("x".into(), (0..512).map(|i| i as f64).collect::<Vec<_>>()).into(),
            Series::new(
                "y".into(),
                (0..512).map(|i| (i as f64) * 0.5).collect::<Vec<_>>(),
            )
            .into(),
        ],
    )
    .expect("test dataframe should build");
    let state = AppState::new(df, AppConfig::default());
    let cleaning_plan = empty_envelope(&state);

    let response = post_causal_graph(
        State(state),
        Json(CausalGraphRequest {
            start: None,
            end: None,
            columns: Some("x,y".to_string()),
            tau_max: Some(128),
            pc_alpha: Some(0.2),
            alpha: Some(0.05),
            method: Some("pcmci".to_string()),
            test: Some("par_corr".to_string()),
            max_points: Some(512),
            max_conds_dim: Some(1),
            fdr_method: Some("none".to_string()),
            n_preliminary_iterations: Some(1),
            knn: None,
            sig_samples: None,
            cleaning_plan,
        }),
    )
    .await
    .expect("causal route should succeed")
    .into_response();

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("response body should read");
    let json: Value = serde_json::from_slice(&body).expect("response should be json");

    assert_eq!(json.get("tau_max").and_then(Value::as_u64), Some(128));
}

#[tokio::test(flavor = "multi_thread")]
async fn causal_route_rejects_excessive_high_lag_work() {
    let row_count = 5_000usize;
    let mut columns: Vec<_> = (0..8)
        .map(|idx| {
            Series::new(
                format!("c{idx}").into(),
                (0..row_count)
                    .map(|row| row as f64 * (idx as f64 + 1.0))
                    .collect::<Vec<_>>(),
            )
            .into()
        })
        .collect();
    columns.insert(
        0,
        Series::new(
            "ts".into(),
            (0..row_count)
                .map(|i| i as i64 * 900_000)
                .collect::<Vec<_>>(),
        )
        .into(),
    );
    let df = DataFrame::new(row_count, columns).expect("test dataframe should build");
    let mut config = AppConfig::default();
    config.budgets.max_causal_work_units = 40_000_000;
    let state = AppState::new(df, config);
    let cleaning_plan = empty_envelope(&state);

    let err = post_causal_graph(
        State(state),
        Json(CausalGraphRequest {
            start: None,
            end: None,
            columns: Some("c0,c1,c2,c3,c4,c5,c6,c7".to_string()),
            tau_max: Some(128),
            pc_alpha: Some(0.2),
            alpha: Some(0.05),
            method: Some("pcmci".to_string()),
            test: Some("par_corr".to_string()),
            max_points: Some(5_000),
            max_conds_dim: Some(1),
            fdr_method: Some("none".to_string()),
            n_preliminary_iterations: Some(1),
            knn: None,
            sig_samples: None,
            cleaning_plan,
        }),
    )
    .await
    .err()
    .expect("oversized causal request should be rejected");
    let response = err.into_response();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("response body should read");
    let json: Value = serde_json::from_slice(&body).expect("response should be json");
    assert_eq!(json["code"], "work_budget_exceeded");
}

#[test]
fn cmi_knn_work_estimate_scales_with_samples_and_shuffle_count() {
    let baseline = estimate_causal_work_units(
        2,
        3,
        1_000,
        "pcmci",
        crate::causal::IndependenceTestKind::CmiKnn,
        200,
    );
    let larger = estimate_causal_work_units(
        2,
        3,
        5_000,
        "pcmci",
        crate::causal::IndependenceTestKind::CmiKnn,
        400,
    );
    assert!(larger > baseline);
}

// ── Fix 5.1/5.2 regression tests ─────────────────────────────────────

/// `CausalGraphRequest` accepts both the documented comma-separated string and the alternative JSON
/// array form. Previously, a singular `column` (the obvious typo)
/// was silently ignored, leading to a misleading "No valid numeric
/// columns were requested" error. `deny_unknown_fields` now rejects
/// singular `column` upfront.
#[test]
fn causal_request_accepts_comma_separated_columns() {
    let mut body = serde_json::json!({"columns": "x,y", "tau_max": 1});
    body["cleaning_plan"] = test_envelope_json();
    let req: CausalGraphRequest = serde_json::from_value(body).expect("parse");
    assert_eq!(req.columns.as_deref(), Some("x,y"));
}

#[test]
fn causal_request_accepts_json_array_columns() {
    let mut body = serde_json::json!({"columns": ["x", "y"], "tau_max": 1});
    body["cleaning_plan"] = test_envelope_json();
    let req: CausalGraphRequest = serde_json::from_value(body).expect("parse");
    assert_eq!(req.columns.as_deref(), Some("x,y"));
}

#[test]
fn causal_request_rejects_singular_column_field() {
    // Regression test for audit issue 5.2: a singular `column`
    // field was previously silently dropped, leading to a
    // misleading "No valid numeric columns were requested" error.
    // `deny_unknown_fields` now rejects it with 422.
    let body = serde_json::json!({"column": "x", "tau_max": 1});
    let result: Result<CausalGraphRequest, _> = serde_json::from_value(body);
    assert!(
        result.is_err(),
        "singular `column` must be rejected, got {result:?}"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn anomaly_route_includes_global_summary_stats() {
    let ts_ms: Vec<i64> = vec![
        1_514_764_800_000,
        1_517_424_000_000,
        1_520_169_600_000,
        1_522_915_200_000,
    ];
    let df = DataFrame::new(
        4,
        vec![
            Series::new("ts".into(), ts_ms)
                .cast(&polars::prelude::DataType::Datetime(
                    polars::prelude::TimeUnit::Milliseconds,
                    None,
                ))
                .expect("cast ts")
                .into(),
            Series::new("HUFL".into(), [1.0_f64, 2.0, 3.0, 4.0]).into(),
            Series::new("HULL".into(), [10.0_f64, 20.0, 30.0, 40.0]).into(),
        ],
    )
    .expect("test dataframe should build");
    let state = AppState::new(df, AppConfig::default());

    let response = anomalies_response(
        state.clone(),
        AnomalyQuery {
            start: chrono::Utc.with_ymd_and_hms(2018, 1, 1, 0, 0, 0).unwrap(),
            end: chrono::Utc.with_ymd_and_hms(2018, 5, 1, 0, 0, 0).unwrap(),
            columns: Some("HUFL,HULL".to_string()),
            method: Some("zscore".to_string()),
            threshold: Some(3.0),
            cleaning_plan: empty_envelope(&state),
        },
    )
    .await
    .expect("anomaly route should succeed");

    assert_eq!(
        response
            .headers()
            .get("x-edatime-source-version")
            .and_then(|value| value.to_str().ok()),
        Some("source-0")
    );
    assert!(
        response
            .headers()
            .get("x-edatime-plan-hash")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| !value.is_empty()),
        "plan-aware analytics requests must expose their plan hash"
    );

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("response body should read");
    let json: Value = serde_json::from_slice(&body).expect("response should be json");
    let summary = json
        .get("summary_stats")
        .expect("summary stats should be present");

    assert_eq!(summary.get("min").and_then(Value::as_f64), Some(1.0));
    assert_eq!(summary.get("max").and_then(Value::as_f64), Some(40.0));
    assert!(summary.get("mean").and_then(Value::as_f64).is_some());
    assert!(summary.get("std").and_then(Value::as_f64).is_some());
}
