use axum::{Json, extract::State};

use crate::state::AppState;

pub async fn get_metrics(State(state): State<AppState>) -> Json<serde_json::Value> {
    let rows = state.dataset_rows().await;
    let revision = state.dataset_revision();
    Json(
        serde_json::to_value(state.metrics.snapshot(rows, revision))
            .unwrap_or_else(|_| serde_json::json!({ "error": "failed to serialize metrics" })),
    )
}
