//! `GET /api/config/database`  — read current database configuration
//! Database configuration is read-only at runtime.

use axum::{Json, extract::State, response::IntoResponse};
use serde::Serialize;

use crate::error::AppError;
use edatime_core::config::DatabaseBackend;
use edatime_store::state::AppState;

#[derive(Serialize)]
struct DatabaseConfigResponse {
    enabled: bool,
    backend: String,
    configured: bool,
    table: String,
    time_column: String,
}

fn backend_to_str(b: &DatabaseBackend) -> &'static str {
    match b {
        DatabaseBackend::None => "none",
        DatabaseBackend::Postgres => "postgres",
        DatabaseBackend::Timescale => "timescale",
        DatabaseBackend::Sqlite => "sqlite",
    }
}

#[tracing::instrument(skip(state))]
pub async fn get_database_config(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let db = &state.config.database;
    Ok(Json(DatabaseConfigResponse {
        enabled: db.enabled,
        backend: backend_to_str(&db.backend).to_string(),
        configured: db
            .connection_string
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty()),
        table: db.table.clone().unwrap_or_default(),
        time_column: db.time_column.clone().unwrap_or_default(),
    }))
}
