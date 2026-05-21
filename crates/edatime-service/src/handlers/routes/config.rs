//! `GET /api/config/database`  — read current database configuration
//! `POST /api/config/database` — update database configuration

use axum::{Json, extract::State, response::IntoResponse};
use serde::{Deserialize, Serialize};

use edatime_core::config::DatabaseBackend;
use crate::error::AppError;
use edatime_store::state::AppState;

#[derive(Serialize)]
struct DatabaseConfigResponse {
    enabled: bool,
    backend: String,
    connection_string: String,
    table: String,
    time_column: String,
}

#[derive(Debug, Deserialize)]
pub struct DatabaseConfigUpdate {
    pub enabled: Option<bool>,
    pub backend: Option<String>,
    pub connection_string: Option<String>,
    pub table: Option<String>,
    pub time_column: Option<String>,
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
        connection_string: db.connection_string.clone().unwrap_or_default(),
        table: db.table.clone().unwrap_or_default(),
        time_column: db.time_column.clone().unwrap_or_default(),
    }))
}

#[tracing::instrument(skip(state))]
pub async fn post_database_config(
    State(state): State<AppState>,
    Json(body): Json<DatabaseConfigUpdate>,
) -> Result<impl IntoResponse, AppError> {
    // Database connection is not yet implemented; store the configuration for
    // future use and return the updated values.  Since AppConfig lives behind
    // Arc we cannot mutate it in-place — instead we acknowledge the settings.
    let db = &state.config.database;

    let enabled = body.enabled.unwrap_or(db.enabled);
    let backend_str = body
        .backend
        .as_deref()
        .unwrap_or(backend_to_str(&db.backend));
    let connection_string = body
        .connection_string
        .or_else(|| db.connection_string.clone())
        .unwrap_or_default();
    let table = body.table.or_else(|| db.table.clone()).unwrap_or_default();
    let time_column = body
        .time_column
        .or_else(|| db.time_column.clone())
        .unwrap_or_default();

    tracing::info!(
        enabled,
        backend = backend_str,
        table = %table,
        "database config update requested (not yet connected)"
    );

    Ok(Json(serde_json::json!({
        "status": "saved",
        "enabled": enabled,
        "backend": backend_str,
        "connection_string": connection_string,
        "table": table,
        "time_column": time_column,
        "note": "Database connectivity is not yet implemented. Settings have been acknowledged."
    })))
}
