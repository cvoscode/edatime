use axum::{Json, extract::State};

use edatime_store::state::AppState;

pub async fn get_metrics(State(state): State<AppState>) -> Json<serde_json::Value> {
    let rows = state.dataset_rows().await;
    let revision = state.dataset_revision();
    let snapshot = state.metrics.snapshot(rows, revision);
    match serde_json::to_value(snapshot) {
        Ok(json) => Json(json),
        Err(err) => Json(serde_json::json!({
            "error": format!("Failed to serialize metrics: {err}")
        })),
    }
}
