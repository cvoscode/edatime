//! Integration tests for the edatime HTTP API.
//!
//! These tests exercise the full route stack (handlers → state → pipeline)
//! using an in-memory fixture dataset. They validate the documented API
//! contract: correct status codes, response shapes, and error handling.

use axum::{
    Router,
    body::Body,
    extract::DefaultBodyLimit,
    http::{Method, Request, StatusCode},
};
use http_body_util::BodyExt;
use tower::ServiceExt;

use edatime::config::AppConfig;
use edatime::routes;
use edatime::state::AppState;
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

/// Build a test router identical to production but without middleware layers
/// that would interfere with testing (rate limiting, compression, etc.).
fn test_app() -> Router {
    let config = AppConfig::default();
    let max_upload = config.upload.max_upload_bytes;
    let state = AppState::new(test_dataframe(), config);

    Router::new()
        .nest("/api", routes::api_router())
        .nest("/api/v1", routes::api_router())
        .layer(DefaultBodyLimit::max(max_upload))
        .with_state(state)
}

// ─── Health endpoint ──────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn health_returns_ok() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/health")
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
        .uri("/api/metadata")
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
async fn metadata_includes_column_profiles() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/metadata")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    let profiles = json["column_profiles"].as_array().unwrap();
    assert!(!profiles.is_empty());
    // Each profile should have name, dtype, non_null_count
    let first = &profiles[0];
    assert!(first["name"].as_str().is_some());
    assert!(first["dtype"].as_str().is_some());
    assert!(first["non_null_count"].as_u64().is_some());
}

// ─── Data endpoint ────────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn data_returns_arrow_ipc() {
    let app = test_app();
    let req = Request::builder()
        .uri(
            "/api/data?start=2024-01-01T00:00:00Z&end=2024-01-30T00:00:00Z&width=500&columns=col_a",
        )
        .body(Body::empty())
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
    let req = Request::builder()
        .uri(
            "/api/data?start=2024-01-30T00:00:00Z&end=2024-01-01T00:00:00Z&width=500&columns=col_a",
        )
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["code"], "invalid_time_range");
}

#[tokio::test(flavor = "multi_thread")]
async fn data_rejects_zero_width() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/data?start=2024-01-01T00:00:00Z&end=2024-01-30T00:00:00Z&width=0&columns=col_a")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["code"], "invalid_width");
}

#[tokio::test(flavor = "multi_thread")]
async fn data_rejects_unknown_column() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/data?start=2024-01-01T00:00:00Z&end=2024-01-30T00:00:00Z&width=500&columns=nonexistent")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test(flavor = "multi_thread")]
async fn data_sets_downsample_headers() {
    let app = test_app();
    let req = Request::builder()
        .uri(
            "/api/data?start=2024-01-01T00:00:00Z&end=2024-01-30T00:00:00Z&width=100&columns=col_a",
        )
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Should have downsampled since 720 points > 100*2 target
    let downsampled = resp.headers().get("x-edatime-downsampled");
    assert!(downsampled.is_some());
}

#[tokio::test(flavor = "multi_thread")]
async fn data_multiple_columns() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/data?start=2024-01-01T00:00:00Z&end=2024-01-30T00:00:00Z&width=500&columns=col_a,col_b")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

// ─── Metrics endpoint ─────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn metrics_returns_counters() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/metrics")
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
    let req = Request::builder()
        .uri("/api/scatter/correlations")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(json["correlations"].as_array().is_some());
    assert!(json["numeric_columns"].as_array().is_some());
}

#[tokio::test(flavor = "multi_thread")]
async fn scatter_points_post() {
    let app = test_app();
    let body_json = serde_json::json!({
        "x": "col_a",
        "y": "col_b",
        "limit": 1000
    });

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/scatter/points")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&body_json).unwrap()))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["x"], "col_a");
    assert_eq!(json["y"], "col_b");
    assert!(json["points"].as_array().is_some());
}

// ─── Analytics endpoints ──────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn analytics_fft() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/analytics/fft?start=2024-01-01T00:00:00Z&end=2024-01-30T00:00:00Z&columns=col_a")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(json.is_object());
}

#[tokio::test(flavor = "multi_thread")]
async fn analytics_rolling() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/analytics/rolling?start=2024-01-01T00:00:00Z&end=2024-01-30T00:00:00Z&columns=col_a&window=10")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test(flavor = "multi_thread")]
async fn analytics_anomalies() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/analytics/anomalies?start=2024-01-01T00:00:00Z&end=2024-01-30T00:00:00Z&columns=col_a&method=zscore&threshold=3.0")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

// ─── Upload endpoints ─────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn upload_requires_multipart() {
    let app = test_app();
    // Sending a non-multipart body should fail
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/upload")
        .header("content-type", "application/json")
        .body(Body::from("{}"))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

// ─── Aggregate endpoint ───────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn aggregate_returns_json_by_default() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/aggregate?start=2024-01-01T00:00:00Z&end=2024-01-30T00:00:00Z&columns=col_a&buckets=10")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

// ─── Export endpoint ──────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn export_parquet_returns_data() {
    let app = test_app();
    let req = Request::builder()
        .uri("/api/export/parquet?start=2024-01-01T00:00:00Z&end=2024-01-30T00:00:00Z&columns=col_a,col_b")
        .body(Body::empty())
        .unwrap();

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
    let max_upload = config.upload.max_upload_bytes;
    let state = AppState::new(test_dataframe(), config);

    let app = Router::new()
        .nest("/api", routes::api_router())
        .layer(DefaultBodyLimit::max(max_upload))
        .with_state(state.clone());

    let uri =
        "/api/data?start=2024-01-01T00:00:00Z&end=2024-01-15T00:00:00Z&width=200&columns=col_a";

    // First request — miss
    let req = Request::builder().uri(uri).body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let cache_header = resp.headers().get("x-edatime-cache");
    // First request should be a miss
    assert!(cache_header.is_none() || cache_header.unwrap().to_str().unwrap() != "hit");

    // Second request — same params → should hit cache
    let req = Request::builder().uri(uri).body(Body::empty()).unwrap();
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
        .uri("/api/database/status")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["connected"], false);
}

// ─── Drift endpoint ───────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn drift_stats_valid_request_returns_correct_shape() {
    let app = test_app();

    let body = serde_json::json!({
        "column": "col_a",
        "window": "daily",
        "reference_start": "2024-01-01T00:00:00Z",
        "reference_end": "2024-01-15T00:00:00Z",
        "current_start": "2024-01-15T00:00:00Z",
        "current_end": "2024-01-31T00:00:00Z",
        "n_bins": 10
    });

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/drift/stats")
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();

    assert_eq!(json["column"], "col_a");
    assert!(json["reference"]["count"].as_u64().unwrap_or(0) >= 5);
    assert!(json["windows"].as_array().unwrap().len() >= 1);
    assert!(json["thresholds"]["ks_threshold"].is_number());
    assert!(json["metadata"]["computation_time_ms"].is_number());
    assert!(json["metadata"]["num_windows"].is_number());
    assert!(json["metadata"]["reference_samples"].is_number());

    // Verify Epps-Singleton fields are present
    let first_window = &json["windows"][0];
    assert!(first_window["es_stat"].is_number(), "es_stat missing from window");
    assert!(first_window["es_pvalue"].is_number(), "es_pvalue missing from window");
}

#[tokio::test(flavor = "multi_thread")]
async fn drift_stats_invalid_column_returns_400() {
    let app = test_app();

    let body = serde_json::json!({
        "column": "nonexistent_column",
        "window": "daily",
        "reference_start": "2024-01-01T00:00:00Z",
        "reference_end": "2024-01-15T00:00:00Z"
    });

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/drift/stats")
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test(flavor = "multi_thread")]
async fn drift_stats_reference_start_after_end_returns_400() {
    let app = test_app();

    let body = serde_json::json!({
        "column": "col_a",
        "window": "daily",
        "reference_start": "2024-01-15T00:00:00Z",
        "reference_end": "2024-01-01T00:00:00Z"
    });

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/drift/stats")
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test(flavor = "multi_thread")]
async fn drift_stats_reference_window_too_small_returns_400() {
    let app = test_app();

    // 1ms reference window → < 5 samples
    let body = serde_json::json!({
        "column": "col_a",
        "window": "daily",
        "reference_start": "2024-01-01T00:00:00Z",
        "reference_end": "2024-01-01T00:00:00.001Z"
    });

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/drift/stats")
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test(flavor = "multi_thread")]
async fn drift_stats_v1_alias_works() {
    let app = test_app();

    let body = serde_json::json!({
        "column": "col_a",
        "window": "daily",
        "reference_start": "2024-01-01T00:00:00Z",
        "reference_end": "2024-01-10T00:00:00Z"
    });

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/drift/stats")
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}
