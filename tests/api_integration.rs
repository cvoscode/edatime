//! Integration tests for the edatime HTTP API.
//!
//! These tests exercise the full route stack (handlers → state → pipeline)
//! using an in-memory fixture dataset. They validate the documented API
//! contract: correct status codes, response shapes, and error handling.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode},
};
use http_body_util::BodyExt;
use tower::ServiceExt;

use edatime_core::config::AppConfig;
use edatime_service::app::build_app;
use edatime_store::state::AppState;
use edatime_store::versions::fingerprints_for_frame;
use polars::prelude::*;

/// Build a deterministic test fixture: hourly data for 30 days, 3 numeric columns.
fn test_dataframe() -> DataFrame {
    let n = 720; // 30 days × 24 hours
    let start_ms: i64 = 1_704_067_200_000; // 2024-01-01T00:00:00Z
    let step_ms: i64 = 3_600_000; // 1 hour

    let ts: Vec<i64> = (0..n).map(|i| start_ms + i * step_ms).collect();
    let col_a: Vec<f64> = (0..n)
        .map(|i| 60.0 + (i as f64 * 0.01).sin() * 20.0)
        .collect();
    let col_b: Vec<f64> = (0..n)
        .map(|i| 30.0 + (i as f64 * 0.02).cos() * 10.0)
        .collect();
    let col_c: Vec<f64> = (0..n).map(|i| (i as f64) * 0.1).collect();

    let columns = vec![
        Column::new("ts".into(), ts)
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .unwrap(),
        Column::new("col_a".into(), col_a),
        Column::new("col_b".into(), col_b),
        Column::new("col_c".into(), col_c),
    ];
    DataFrame::new(n as usize, columns).unwrap()
}

fn non_numeric_dataframe() -> DataFrame {
    DataFrame::new(
        3,
        vec![
            Column::new("label".into(), ["a", "b", "c"]),
            Column::new("category".into(), ["x", "y", "z"]),
        ],
    )
    .unwrap()
}

/// Build the exact production route and middleware stack.
fn test_app() -> Router {
    test_app_with_dataframe(test_dataframe())
}

fn test_app_with_dataframe(df: DataFrame) -> Router {
    let config = AppConfig::default();
    let state = AppState::new(df, config);
    build_app(state, std::path::PathBuf::from("__missing_test_frontend__"))
}

fn plan_envelope(df: &DataFrame, time_column: &str) -> serde_json::Value {
    let (dataset_fingerprint, schema_fingerprint) = fingerprints_for_frame(df);
    serde_json::json!({
        "plan": {
            "schemaVersion": 1,
            "id": "api-integration-plan",
            "planRevision": 1,
            "sourceVersionId": "source-0",
            "datasetRevision": 0,
            "datasetFingerprint": dataset_fingerprint,
            "schemaFingerprint": schema_fingerprint,
            "timeColumn": time_column,
            "sourceName": null,
            "stages": [],
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-01-01T00:00:00Z"
        },
        "expectedPlanHash": null,
        "expectedSourceVersionId": "source-0",
        "expectedDatasetRevision": 0
    })
}

fn plan_post(
    path: &str,
    mut body: serde_json::Value,
    df: &DataFrame,
    time_column: &str,
) -> Request<Body> {
    body.as_object_mut()
        .expect("plan-aware request body must be an object")
        .insert("cleaning_plan".to_string(), plan_envelope(df, time_column));
    Request::builder()
        .method(Method::POST)
        .uri(path)
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap()
}

fn test_plan_post(path: &str, body: serde_json::Value) -> Request<Body> {
    plan_post(path, body, &test_dataframe(), "ts")
}

// ─── Health endpoint ──────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn health_returns_ok() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/v1/health")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["status"], "ok");
}

#[tokio::test(flavor = "multi_thread")]
async fn health_v1_alias_works() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/v1/health")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

// ─── Metadata endpoint ────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn metadata_returns_dataset_info() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/v1/metadata")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(json["total_rows"], 720);
    assert!(json["numeric_columns"].as_array().unwrap().len() >= 3);
    assert!(json["time_column"].as_str().is_some());
    assert!(json["time_range"].is_object());
    assert!(json["columns"].as_array().unwrap().len() >= 4);
}

#[tokio::test(flavor = "multi_thread")]
async fn metadata_is_immediate_and_defers_column_profiles() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/v1/metadata")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    let profiles = json["column_profiles"].as_array().unwrap();
    assert!(
        profiles.is_empty(),
        "exact per-column profiles belong to /profile jobs"
    );
    assert!(!json["columns"].as_array().unwrap().is_empty());
    assert!(json["time_range"]["min"].as_i64().is_some());
}

/// `/api/v1/metadata` is the canonical dataset metadata endpoint. After the
/// cutover it is the only mount; the response must carry the dataset
/// profile fields the frontend renders.
#[tokio::test(flavor = "multi_thread")]
async fn metadata_v1_returns_well_formed_profile() {
    let app = test_app();
    let req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/metadata")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let ct = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    assert!(
        ct.starts_with("application/json"),
        "metadata must return JSON, got {ct}"
    );

    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let value: serde_json::Value =
        serde_json::from_slice(&bytes).expect("metadata body must be valid JSON");
    assert!(
        value.get("columns").and_then(|v| v.as_array()).is_some(),
        "metadata must expose a `columns` array"
    );
    assert!(
        value
            .get("numeric_columns")
            .and_then(|v| v.as_array())
            .is_some(),
        "metadata must expose a `numeric_columns` array"
    );
    assert!(
        value.get("total_rows").and_then(|v| v.as_u64()).is_some(),
        "metadata must expose `total_rows` as a number"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn metadata_allows_the_empty_initial_dataset() {
    let app = test_app_with_dataframe(DataFrame::default());
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/metadata")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let metadata: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(metadata["profile_status"], "immediate");
    assert_eq!(metadata["total_rows"], 0);
    assert_eq!(metadata["column_profiles"], serde_json::json!([]));
}

#[tokio::test(flavor = "multi_thread")]
async fn sampled_profile_v1_returns_estimated_metadata() {
    let app = test_app();
    let start = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/profile/sample")
                .header("content-type", "application/json")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(start.status(), StatusCode::OK);

    for _ in 0..100 {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/profile/sample")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let profile: serde_json::Value = serde_json::from_slice(&body).unwrap();
        if profile["status"] == "ready" {
            assert_eq!(profile["algorithmVersion"], "sample-v1");
            assert_eq!(profile["metadata"]["profile_status"], "sampled");
            assert_eq!(profile["metadata"]["profile_sample_rows"], 720);
            assert!(profile["metadata"]["time_quality"].is_object());
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    panic!("sampled profile did not complete");
}

// ─── Data endpoint ────────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn data_returns_arrow_ipc() {
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/data",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "width": 500, "columns": "col_a"
        }),
    );

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let ct = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(
        ct.contains("arrow") || ct.contains("octet-stream"),
        "Expected Arrow IPC content-type, got: {}",
        ct
    );

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    assert!(!body.is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn data_rejects_invalid_time_window() {
    let app = test_app();
    // end before start
    let req = test_plan_post(
        "/api/v1/data",
        serde_json::json!({
            "start": "2024-01-30T00:00:00Z", "end": "2024-01-01T00:00:00Z",
            "width": 500, "columns": "col_a"
        }),
    );

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["code"], "invalid_time_range");
}

#[tokio::test(flavor = "multi_thread")]
async fn data_rejects_zero_width() {
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/data",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "width": 0, "columns": "col_a"
        }),
    );

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["code"], "invalid_width");
}

#[tokio::test(flavor = "multi_thread")]
async fn data_rejects_unknown_column() {
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/data",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "width": 500, "columns": "nonexistent"
        }),
    );

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["code"], "column_not_found");
}

#[tokio::test(flavor = "multi_thread")]
async fn data_rejects_missing_columns_without_hardcoded_default() {
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/data",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "width": 500
        }),
    );

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["code"], "invalid_column_selection");
    assert!(
        !json["message"]
            .as_str()
            .unwrap_or_default()
            .contains("value")
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn data_sets_downsample_headers() {
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/data",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "width": 100, "columns": "col_a"
        }),
    );

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Should have downsampled since 720 points > 100*2 target
    let downsampled = resp.headers().get("x-edatime-downsampled");
    assert!(downsampled.is_some());
}

#[tokio::test(flavor = "multi_thread")]
async fn data_multiple_columns() {
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/data",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "width": 500, "columns": "col_a,col_b"
        }),
    );

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test(flavor = "multi_thread")]
async fn data_downsampled_response_is_non_empty_with_epoch_timestamps() {
    // Regression test: epoch-millisecond timestamps (1_704_067_200_000…)
    // previously caused downsample_indices() to return an empty
    // selection, which made /api/v1/data return an empty Arrow IPC body and
    // the timeseries page fall into the empty state. The fix decouples
    // LTTB's coordinate axis from the caller's real x so the lookup is
    // bounded and the selection stays non-empty.
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/data",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "width": 100, "columns": "col_a"
        }),
    );

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Header contract: downsample-related headers must be present and
    // consistent with each other.
    let downsampled = resp
        .headers()
        .get("x-edatime-downsampled")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let returned = resp
        .headers()
        .get("x-edatime-returned-rows")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<usize>().ok());

    assert_eq!(
        downsampled.as_deref(),
        Some("1"),
        "720 input rows > 100 width → downsampled=1"
    );
    let returned = returned.expect("x-edatime-returned-rows must be a usize");
    assert!(
        returned > 0,
        "x-edatime-returned-rows must be > 0, got {returned}"
    );
    assert!(
        returned <= 200,
        "x-edatime-returned-rows must respect target (width*2=200), got {returned}"
    );

    // Body contract: the decoded Arrow IPC must contain at least one row
    // and the column count must match the requested columns (ts + col_a).
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    assert!(!body.is_empty(), "Arrow IPC body must not be empty");

    let table =
        arrow::ipc::reader::StreamReader::try_new(std::io::Cursor::new(&body), None).unwrap();
    let mut row_count: usize = 0;
    let mut schema_cols: usize = 0;
    for batch in table.flatten() {
        row_count += batch.num_rows();
        schema_cols = batch.num_columns();
    }
    assert!(
        row_count > 0,
        "downsampled Arrow response must contain at least one row (got {row_count})"
    );
    assert!(
        row_count <= returned,
        "Arrow row count ({row_count}) must not exceed x-edatime-returned-rows ({returned})"
    );
    assert_eq!(
        schema_cols, 2,
        "request columns=col_a → response must have ts + col_a (2 columns), got {schema_cols}"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn data_downsampled_response_is_non_empty_with_narrow_width() {
    // Companion to the epoch-timestamps test: a chart width at the lower
    // bound forces aggressive downsampling. The selection must still be
    // non-empty and the body must contain data, otherwise the user sees
    // the timeseries empty state. We use `width=50` (the configured
    // `min_viewport_width`) because widths below the bound are rejected
    // by validation (audit issue 1.2).
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/data",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "width": 50, "columns": "col_a"
        }),
    );

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let returned = resp
        .headers()
        .get("x-edatime-returned-rows")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<usize>().ok())
        .expect("x-edatime-returned-rows must be a usize");
    assert!(
        returned > 0,
        "narrow-width downsampled response must still return > 0 rows, got {returned}"
    );

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let table =
        arrow::ipc::reader::StreamReader::try_new(std::io::Cursor::new(&body), None).unwrap();
    let mut row_count: usize = 0;
    for batch in table.flatten() {
        row_count += batch.num_rows();
    }
    assert!(
        row_count > 0,
        "narrow-width downsampled body must contain rows, got {row_count}"
    );
}

// ─── Metrics endpoint ─────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn metrics_returns_counters() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/v1/metrics")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(json.is_object());
}

// ─── Scatter endpoints ────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn scatter_correlations_returns_suggestions() {
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/scatter/correlations",
        serde_json::json!({"base": "col_a", "threshold": 0.5, "mode": "pearson_raw"}),
    );

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(json["correlations"].as_array().is_some());
    assert!(json["numeric_columns"].as_array().is_some());
}

#[tokio::test(flavor = "multi_thread")]
async fn correlation_matrix_returns_ok_with_empty_payload_when_no_numeric_columns_exist() {
    let app = test_app_with_dataframe(non_numeric_dataframe());
    let df = non_numeric_dataframe();
    let req = plan_post(
        "/api/v1/scatter/correlations/matrix",
        serde_json::json!({}),
        &df,
        "label",
    );

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["columns"], serde_json::json!([]));
    // Backend returns canonical `*_raw` / `*_diff` keys; the legacy
    // `pearson` / `spearman` aliases are no longer serialized.
    assert_eq!(json["pearson_raw"], serde_json::json!([]));
    assert_eq!(json["spearman_raw"], serde_json::json!([]));
}

#[tokio::test(flavor = "multi_thread")]
async fn scatter_points_post() {
    let app = test_app();
    let body_json = serde_json::json!({
        "x": "col_a",
        "y": "col_b",
        "limit": 1000,
        "format": "arrow",
        "cleaning_plan": plan_envelope(&test_dataframe(), "ts")
    });

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/scatter/points")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&body_json).unwrap()))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let ct = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(
        ct.contains("apache-arrow") || ct.contains("arrow"),
        "Expected Arrow IPC content-type, got {ct}"
    );

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let table =
        arrow::ipc::reader::StreamReader::try_new(std::io::Cursor::new(&body), None).unwrap();
    let mut row_count = 0;
    for batch in table.flatten() {
        row_count += batch.num_rows();
    }
    assert!(
        row_count > 0,
        "Expected at least one row in Arrow scatter response"
    );
}

// ─── Analytics endpoints ──────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn analytics_fft() {
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/analytics/fft",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "columns": "col_a"
        }),
    );

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(json.is_object());
}

#[tokio::test(flavor = "multi_thread")]
async fn analytics_rolling() {
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/analytics/rolling",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "columns": "col_a", "window": 10
        }),
    );

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test(flavor = "multi_thread")]
async fn analytics_anomalies() {
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/analytics/anomalies",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "columns": "col_a", "method": "zscore", "threshold": 3.0
        }),
    );

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test(flavor = "multi_thread")]
async fn analytics_spectrogram_default() {
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/analytics/spectrogram",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "column": "col_a", "window_size": 64
        }),
    );
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let result = json.get("result").expect("result key present");
    let magnitudes = result
        .get("magnitudes")
        .and_then(|m| m.as_array())
        .expect("magnitudes array present");
    assert!(!magnitudes.is_empty(), "magnitudes should be non-empty");
    // Default mode has no scaling, so values should be > 0 (raw FFT magnitudes).
    let first_row = magnitudes[0].as_array().unwrap();
    assert!(first_row.iter().all(|v| v.as_f64().unwrap_or(0.0) >= 0.0));
}

#[tokio::test(flavor = "multi_thread")]
async fn analytics_spectrogram_normalize_minmax() {
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/analytics/spectrogram",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "column": "col_a", "window_size": 64, "normalize": "minmax"
        }),
    );
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let magnitudes = json
        .get("result")
        .and_then(|r| r.get("magnitudes"))
        .and_then(|m| m.as_array())
        .expect("magnitudes array present");
    // With min-max, every finite value must lie in [0, 1].
    for row in magnitudes {
        for cell in row.as_array().unwrap() {
            let v = cell.as_f64().expect("finite number");
            assert!((0.0..=1.0).contains(&v), "value {v} outside [0, 1]");
        }
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn analytics_spectrogram_clip_percentile() {
    let app = test_app();
    // 10% per-tail clip should be a no-op on this signal but the response
    // must still be valid. We mainly assert status 200 and shape.
    let req = test_plan_post(
        "/api/v1/analytics/spectrogram",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "column": "col_a", "window_size": 64, "clip": "percentile", "clip_param": 10
        }),
    );
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let magnitudes = json
        .get("result")
        .and_then(|r| r.get("magnitudes"))
        .and_then(|m| m.as_array())
        .expect("magnitudes array present");
    assert!(!magnitudes.is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn analytics_spectrogram_clip_iqr_with_k() {
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/analytics/spectrogram",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "column": "col_a", "window_size": 64, "normalize": "minmax",
            "clip": "iqr", "clip_param": 1.5
        }),
    );
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let magnitudes = json
        .get("result")
        .and_then(|r| r.get("magnitudes"))
        .and_then(|m| m.as_array())
        .expect("magnitudes array present");
    for row in magnitudes {
        for cell in row.as_array().unwrap() {
            let v = cell.as_f64().expect("finite number");
            assert!(
                (0.0..=1.0).contains(&v),
                "IQR+minmax value {v} outside [0, 1]"
            );
        }
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn analytics_spectrogram_invalid_normalize_returns_400() {
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/analytics/spectrogram",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "column": "col_a", "window_size": 64, "normalize": "bogus"
        }),
    );
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test(flavor = "multi_thread")]
async fn analytics_spectrogram_invalid_clip_returns_400() {
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/analytics/spectrogram",
        serde_json::json!({
            "start": "2024-01-01T00:00:00Z", "end": "2024-01-30T00:00:00Z",
            "column": "col_a", "window_size": 64, "clip": "bogus"
        }),
    );
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

// ─── Upload endpoints ─────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn upload_requires_multipart() {
    let app = test_app();
    // Sending a non-multipart body should fail
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/upload")
        .header("content-type", "application/json")
        .body(Body::from("{}"))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test(flavor = "multi_thread")]
async fn upload_parses_csv_file() {
    use std::io::Write;

    let app = test_app();

    // Create a minimal CSV with datetime column
    let csv_content = "time,value\n2024-01-01T00:00:00Z,10.5\n2024-01-01T01:00:00Z,20.5\n";

    // Build multipart form data manually
    let mut form = Vec::new();
    // Boundary
    let boundary = "----FormBoundary7MA41YWsqSbuR0OH";

    // File field
    write!(&mut form, "--{}\r\n", boundary).unwrap();
    write!(
        &mut form,
        "Content-Disposition: form-data; name=\"file\"; filename=\"test.csv\"\r\n"
    )
    .unwrap();
    write!(&mut form, "Content-Type: text/csv\r\n\r\n").unwrap();
    form.extend_from_slice(csv_content.as_bytes());
    write!(&mut form, "\r\n").unwrap();

    // n_rows field
    write!(&mut form, "--{}\r\n", boundary).unwrap();
    write!(
        &mut form,
        "Content-Disposition: form-data; name=\"n_rows\"\r\n\r\n"
    )
    .unwrap();
    write!(&mut form, "100\r\n").unwrap();

    // Close boundary
    write!(&mut form, "--{}--\r\n", boundary).unwrap();

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/upload")
        .header(
            "content-type",
            format!("multipart/form-data; boundary={}", boundary),
        )
        .body(Body::from(form))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK, "Upload should succeed");

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["status"], "success");
    assert!(
        json["rows"].as_u64().unwrap_or(0) > 0,
        "Should return row count"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn upload_preview_returns_metadata() {
    use std::io::Write;

    let app = test_app();

    // Create a minimal CSV with datetime column
    let csv_content = "time,value\n2024-01-01T00:00:00Z,10.5\n2024-01-01T01:00:00Z,20.5\n";

    // Build multipart form data
    let mut form = Vec::new();
    let boundary = "----FormBoundary7MA41YWsqSbuR0OH";

    write!(&mut form, "--{}\r\n", boundary).unwrap();
    write!(
        &mut form,
        "Content-Disposition: form-data; name=\"file\"; filename=\"test.csv\"\r\n"
    )
    .unwrap();
    write!(&mut form, "Content-Type: text/csv\r\n\r\n").unwrap();
    form.extend_from_slice(csv_content.as_bytes());
    write!(&mut form, "\r\n").unwrap();
    write!(&mut form, "--{}--\r\n", boundary).unwrap();

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/upload/preview")
        .header(
            "content-type",
            format!("multipart/form-data; boundary={}", boundary),
        )
        .body(Body::from(form))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK, "Preview should succeed");

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["status"], "ok");
    assert!(json["metadata"].is_object(), "Should return metadata");
    assert!(
        json["metadata"]["columns"].is_array(),
        "Metadata should have columns"
    );
}

// ─── Aggregate endpoint ───────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn aggregate_returns_json_by_default() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/v1/aggregate?start=2024-01-01T00:00:00Z&end=2024-01-30T00:00:00Z&columns=col_a&buckets=10")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

// ─── Export endpoint ──────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn export_parquet_returns_data() {
    let app = test_app();
    let req = test_plan_post(
        "/api/v1/scatter/export/parquet",
        serde_json::json!({"x": "col_a", "y": "col_b", "limit": 1000}),
    );

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let ct = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(ct.contains("parquet") || ct.contains("octet-stream"));
}

// ─── Cache behaviour ──────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn second_data_request_hits_cache() {
    let config = AppConfig::default();
    let state = AppState::new(test_dataframe(), config);
    let app = build_app(
        state.clone(),
        std::path::PathBuf::from("__missing_test_frontend__"),
    );
    let payload = serde_json::json!({
        "start": "2024-01-01T00:00:00Z", "end": "2024-01-15T00:00:00Z",
        "width": 200, "columns": "col_a"
    });

    // First request — miss
    let req = test_plan_post("/api/v1/data", payload.clone());
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let cache_header = resp.headers().get("x-edatime-cache");
    // First request should be a miss
    assert!(cache_header.is_none() || cache_header.unwrap().to_str().unwrap() != "hit");

    // Second request — same params → should hit cache
    let req = test_plan_post("/api/v1/data", payload);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let cache_header = resp
        .headers()
        .get("x-edatime-cache")
        .map(|v| v.to_str().unwrap().to_string());
    assert_eq!(cache_header.as_deref(), Some("hit"));
}

// ─── Database endpoints (no connection) ───────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn database_status_without_connection() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/v1/database/status")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["connected"], false);
}

#[tokio::test(flavor = "multi_thread")]
async fn framework_rejections_use_the_structured_error_and_request_id() {
    let app = test_app();
    let req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/data")
        .header("x-request-id", "integration-request-42")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::METHOD_NOT_ALLOWED);
    assert_eq!(
        resp.headers().get("x-request-id").unwrap(),
        "integration-request-42"
    );
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["code"], "method_not_allowed");
    assert_eq!(json["request_id"], "integration-request-42");
    assert_eq!(json["correlation_id"], "integration-request-42");
}

#[tokio::test(flavor = "multi_thread")]
async fn database_config_never_returns_the_connection_string() {
    let mut config = AppConfig::default();
    config.database.connection_string = Some("postgres://user:secret@db/private".to_string());
    let state = AppState::new(test_dataframe(), config);
    let app = build_app(state, std::path::PathBuf::from("__missing_test_frontend__"));
    let req = Request::builder()
        .uri("/api/v1/config/database")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let text = String::from_utf8(body.to_vec()).unwrap();
    assert!(!text.contains("secret"));
    assert!(!text.contains("postgres://"));
    let json: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(json["configured"], true);
}

#[tokio::test(flavor = "multi_thread")]
async fn cors_defaults_to_same_origin_only() {
    let app = test_app();
    let req = Request::builder()
        .method(Method::OPTIONS)
        .uri("/api/v1/database/connect")
        .header("origin", "https://untrusted.example")
        .header("access-control-request-method", "DELETE")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert!(resp.headers().get("access-control-allow-origin").is_none());
}

#[tokio::test(flavor = "multi_thread")]
async fn cors_allowlist_supports_delete_preflight() {
    let mut config = AppConfig::default();
    config.server.cors_allowed_origins = vec!["https://trusted.example".to_string()];
    let state = AppState::new(test_dataframe(), config);
    let app = build_app(state, std::path::PathBuf::from("__missing_test_frontend__"));
    let req = Request::builder()
        .method(Method::OPTIONS)
        .uri("/api/v1/database/connect")
        .header("origin", "https://trusted.example")
        .header("access-control-request-method", "DELETE")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(
        resp.headers().get("access-control-allow-origin").unwrap(),
        "https://trusted.example"
    );
    assert!(
        resp.headers()
            .get("access-control-allow-methods")
            .unwrap()
            .to_str()
            .unwrap()
            .contains("DELETE")
    );
}
