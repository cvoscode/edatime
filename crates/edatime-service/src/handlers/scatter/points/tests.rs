use super::post_scatter_points;
use crate::handlers::routes::cleaning::PlanRequestEnvelope;
use crate::handlers::scatter::ScatterPointsQuery;
use axum::{Json, extract::State, http::header};
use edatime_core::config::AppConfig;
use edatime_query::cleaning::CleaningPlanDto;
use edatime_store::state::AppState;
use polars::prelude::{DataFrame, NamedFrom, Series};

fn envelope(state: &AppState) -> PlanRequestEnvelope {
    let version = state.current_dataset_version().expect("version");
    PlanRequestEnvelope {
        expected_plan_hash: None,
        expected_source_version_id: version.id.clone(),
        expected_dataset_revision: version.revision,
        plan: CleaningPlanDto {
            schema_version: 1,
            id: "scatter-test-plan".to_string(),
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
async fn scatter_points_allow_color_column_matching_axis() {
    let df = DataFrame::new(
        3,
        vec![
            Series::new("LULL".into(), [1.0_f64, 2.0, 3.0]).into(),
            Series::new("HULL".into(), [10.0_f64, 20.0, 30.0]).into(),
        ],
    )
    .expect("test dataframe should build");
    let state = AppState::new(df, AppConfig::default());
    let params = ScatterPointsQuery {
        x: "LULL".to_string(),
        y: "HULL".to_string(),
        color: Some("LULL".to_string()),
        size: None,
        start: None,
        end: None,
        cleaning_plan: envelope(&state),
        limit: 10,
        format: None,
        time_color_mode: None,
    };

    let result = post_scatter_points(State(state), Json(params)).await;

    assert!(
        result.is_ok(),
        "scatter points request should succeed: {result:?}"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn scatter_points_cache_reuses_identical_requests() {
    let df = DataFrame::new(
        3,
        vec![
            Series::new("LULL".into(), [1.0_f64, 2.0, 3.0]).into(),
            Series::new("HULL".into(), [10.0_f64, 20.0, 30.0]).into(),
        ],
    )
    .expect("test dataframe should build");
    let state = AppState::new(df, AppConfig::default());
    let params = ScatterPointsQuery {
        x: "LULL".to_string(),
        y: "HULL".to_string(),
        color: None,
        size: None,
        start: None,
        end: None,
        cleaning_plan: envelope(&state),
        limit: 10,
        format: Some("arrow".to_string()),
        time_color_mode: None,
    };

    let first = post_scatter_points(State(state.clone()), Json(params.clone()))
        .await
        .expect("first scatter points request should succeed");
    let second = post_scatter_points(State(state), Json(params))
        .await
        .expect("second scatter points request should succeed");

    assert_eq!(
        first
            .headers()
            .get("x-edatime-cache")
            .and_then(|v| v.to_str().ok()),
        Some("miss")
    );
    assert_eq!(
        first
            .headers()
            .get("x-edatime-source-version")
            .and_then(|value| value.to_str().ok()),
        Some("source-0")
    );
    assert!(
        first
            .headers()
            .get("x-edatime-plan-hash")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| !value.is_empty()),
        "plan-aware requests must expose their plan hash"
    );
    assert_eq!(
        first
            .headers()
            .get("x-edatime-sampling-algorithm")
            .and_then(|value| value.to_str().ok()),
        Some("reservoir-stream-v1")
    );
    assert!(
        first
            .headers()
            .get("x-edatime-schema-fingerprint")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with("fnv1a-"))
    );
    assert_eq!(
        second
            .headers()
            .get("x-edatime-cache")
            .and_then(|v| v.to_str().ok()),
        Some("hit")
    );
}

#[test]
fn scatter_points_reject_legacy_filter_fields() {
    let error = serde_json::from_value::<ScatterPointsQuery>(serde_json::json!({
        "x": "HUFL", "y": "HULL", "filters": "[]"
    }))
    .expect_err("legacy scatter filters must not deserialize");
    assert!(error.to_string().contains("unknown field `filters`"));
}

#[tokio::test(flavor = "multi_thread")]
async fn scatter_points_apply_the_canonical_plan() {
    let df = DataFrame::new(
        3,
        vec![
            Series::new(
                "ts".into(),
                [
                    1_467_331_200_000_i64,
                    1_491_469_996_429_i64,
                    1_530_042_300_000_i64,
                ],
            )
            .into(),
            Series::new("HUFL".into(), [70.0_f64, 80.0, 90.0]).into(),
            Series::new("HULL".into(), [10.0_f64, 20.0, 30.0]).into(),
        ],
    )
    .expect("test dataframe should build");
    let state = AppState::new(df, AppConfig::default());
    let params = ScatterPointsQuery {
        x: "HUFL".to_string(),
        y: "HULL".to_string(),
        color: None,
        size: None,
        start: Some(1_467_331_200_000.0),
        end: Some(1_530_042_300_000.0),
        cleaning_plan: envelope(&state),
        limit: 10,
        format: Some("arrow".to_string()),
        time_color_mode: None,
    };

    let result = post_scatter_points(State(state), Json(params)).await;

    assert!(
        result.is_ok(),
        "scatter points request should execute its canonical plan: {result:?}"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn scatter_points_format_json_returns_application_json() {
    // Regression test for audit issue 3.4: previously `format=json`
    // was silently ignored and the response was always Arrow IPC.
    let df = DataFrame::new(
        5,
        vec![
            Series::new("LULL".into(), [1.0_f64, 2.0, 3.0, 4.0, 5.0]).into(),
            Series::new("HULL".into(), [10.0_f64, 20.0, 30.0, 40.0, 50.0]).into(),
        ],
    )
    .expect("test dataframe should build");
    let state = AppState::new(df, AppConfig::default());
    let params = ScatterPointsQuery {
        x: "LULL".to_string(),
        y: "HULL".to_string(),
        color: None,
        size: None,
        start: None,
        end: None,
        cleaning_plan: envelope(&state),
        limit: 10,
        format: Some("json".to_string()),
        time_color_mode: None,
    };

    let response = post_scatter_points(State(state), Json(params))
        .await
        .expect("scatter points request with format=json should succeed");
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    assert!(
        content_type.starts_with("application/json"),
        "format=json must return application/json, got {content_type}"
    );
    let body = axum::body::to_bytes(response.into_body(), 1_000_000)
        .await
        .expect("read body");
    let parsed: serde_json::Value =
        serde_json::from_slice(&body).expect("body should be valid JSON");
    let points = parsed
        .get("points")
        .and_then(|v| v.as_array())
        .expect("JSON body must include `points` array");
    assert_eq!(points.len(), 5, "all 5 input rows should be returned");
}
