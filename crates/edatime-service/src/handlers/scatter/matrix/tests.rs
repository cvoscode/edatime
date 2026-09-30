use super::post_scatter_matrix;
use crate::handlers::routes::cleaning::PlanRequestEnvelope;
use crate::handlers::scatter::ScatterMatrixQuery;
use axum::{Json, extract::State};
use base64::prelude::*;
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
            id: "scatter-matrix-test-plan".to_string(),
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
async fn scatter_matrix_returns_arrow_with_cell_metadata_for_multiple_pairs() {
    let df = DataFrame::new(
        4,
        vec![
            Series::new("HUFL".into(), [1.0_f64, 2.0, 3.0, 4.0]).into(),
            Series::new("HULL".into(), [10.0_f64, 20.0, 30.0, 40.0]).into(),
            Series::new("OT".into(), [5.0_f64, 6.0, 7.0, 8.0]).into(),
        ],
    )
    .expect("test dataframe should build");
    let state = AppState::new(df, AppConfig::default());
    let params = ScatterMatrixQuery {
        pairs: vec![
            crate::handlers::scatter::ScatterMatrixPair {
                x: "HUFL".to_string(),
                y: "HULL".to_string(),
            },
            crate::handlers::scatter::ScatterMatrixPair {
                x: "OT".to_string(),
                y: "HULL".to_string(),
            },
        ],
        color: None,
        start: None,
        end: None,
        cleaning_plan: envelope(&state),
        limit: 10,
        time_color_mode: None,
    };

    let response = post_scatter_matrix(State(state), Json(params))
        .await
        .expect("scatter matrix request should succeed");

    assert_eq!(
        response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok()),
        Some("application/vnd.apache.arrow.stream")
    );
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
        "plan-aware requests must expose their plan hash"
    );
    assert_eq!(
        response
            .headers()
            .get("x-edatime-sampling-algorithm")
            .and_then(|value| value.to_str().ok()),
        Some("reservoir-stream-v1")
    );
    assert!(
        response
            .headers()
            .get("x-edatime-schema-fingerprint")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with("fnv1a-"))
    );
    let encoded = response
        .headers()
        .get("x-edatime-matrix-cells")
        .and_then(|value| value.to_str().ok())
        .expect("matrix metadata header should be present");
    let decoded = BASE64_STANDARD
        .decode(encoded)
        .expect("matrix metadata header should decode");
    let metadata: serde_json::Value =
        serde_json::from_slice(&decoded).expect("matrix metadata should be JSON");
    let cells = metadata
        .as_array()
        .expect("matrix metadata should be an array");
    assert_eq!(cells.len(), 2);
    assert_eq!(cells[0]["cell_id"], "HUFL|HULL");
    assert_eq!(cells[1]["cell_id"], "OT|HULL");
}

#[tokio::test(flavor = "multi_thread")]
async fn scatter_matrix_cache_reuses_identical_requests() {
    let df = DataFrame::new(
        3,
        vec![
            Series::new("LULL".into(), [1.0_f64, 2.0, 3.0]).into(),
            Series::new("HULL".into(), [10.0_f64, 20.0, 30.0]).into(),
        ],
    )
    .expect("test dataframe should build");
    let state = AppState::new(df, AppConfig::default());
    let params = ScatterMatrixQuery {
        pairs: vec![crate::handlers::scatter::ScatterMatrixPair {
            x: "LULL".to_string(),
            y: "HULL".to_string(),
        }],
        color: None,
        start: None,
        end: None,
        cleaning_plan: envelope(&state),
        limit: 10,
        time_color_mode: None,
    };

    let first = post_scatter_matrix(State(state.clone()), Json(params.clone()))
        .await
        .expect("first scatter matrix request should succeed");
    let second = post_scatter_matrix(State(state), Json(params))
        .await
        .expect("second scatter matrix request should succeed");

    assert_eq!(
        first
            .headers()
            .get("x-edatime-cache")
            .and_then(|value| value.to_str().ok()),
        Some("miss")
    );
    assert_eq!(
        second
            .headers()
            .get("x-edatime-cache")
            .and_then(|value| value.to_str().ok()),
        Some("hit")
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn scatter_matrix_preserves_categorical_color_metadata() {
    let df = DataFrame::new(
        4,
        vec![
            Series::new("HUFL".into(), [1.0_f64, 2.0, 3.0, 4.0]).into(),
            Series::new("HULL".into(), [10.0_f64, 20.0, 30.0, 40.0]).into(),
            Series::new("group".into(), ["a", "b", "a", "b"]).into(),
        ],
    )
    .expect("test dataframe should build");
    let state = AppState::new(df, AppConfig::default());
    let params = ScatterMatrixQuery {
        pairs: vec![crate::handlers::scatter::ScatterMatrixPair {
            x: "HUFL".to_string(),
            y: "HULL".to_string(),
        }],
        color: Some("group".to_string()),
        start: None,
        end: None,
        cleaning_plan: envelope(&state),
        limit: 10,
        time_color_mode: None,
    };

    let response = post_scatter_matrix(State(state), Json(params))
        .await
        .expect("scatter matrix request with categorical color should succeed");
    let encoded = response
        .headers()
        .get("x-edatime-matrix-cells")
        .and_then(|value| value.to_str().ok())
        .expect("matrix metadata header should be present");
    let decoded = BASE64_STANDARD
        .decode(encoded)
        .expect("matrix metadata header should decode");
    let metadata: serde_json::Value =
        serde_json::from_slice(&decoded).expect("matrix metadata should be JSON");
    assert_eq!(metadata[0]["color_kind"], "categorical");
    assert_eq!(
        response
            .headers()
            .get("x-edatime-scatter-color")
            .and_then(|value| value.to_str().ok()),
        Some("group")
    );
}
