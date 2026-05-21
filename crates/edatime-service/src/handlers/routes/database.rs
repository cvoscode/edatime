//! Database connection routes.
//!
//! `POST /api/database/connect`        — connect to TimescaleDB / Postgres and
//!                                       optionally ingest a table snapshot into
//!                                       the in-memory DataFrame.
//! `DELETE /api/database/connect`      — disconnect and clear the pool.
//! `GET  /api/database/status`         — connection status.
//! `GET  /api/database/tables`         — list available tables/hypertables.
//! `GET  /api/database/columns`        — list columns for a table.
//! `POST /api/database/load`           — pull (or refresh) a table snapshot
//!                                       into the in-memory DataFrame.

use std::sync::Arc;

use axum::{
    Json,
    extract::{Query, State},
};
use serde::{Deserialize, Serialize};

use edatime_store::db::{self, IngestOptions};
use crate::error::AppError;
use edatime_store::state::{AppState, DbConnectionInfo};

// ── POST /api/database/connect ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ConnectRequest {
    /// postgres:// connection URL.
    pub connection_string: String,
    /// Target schema (defaults to "public").
    #[serde(default = "default_schema")]
    pub schema: String,
    /// Target table to load immediately.  Optional — can be chosen later.
    pub table: Option<String>,
    /// Time column for range filtering.  Optional — auto-detected if absent.
    pub time_column: Option<String>,
    /// Immediately ingest a snapshot of the table into the in-memory store?
    #[serde(default)]
    pub load_snapshot: bool,
    /// Row limit when `load_snapshot = true`.  Default 1 000 000.
    pub snapshot_limit: Option<usize>,
}

fn default_schema() -> String {
    "public".to_string()
}

#[derive(Serialize)]
pub struct ConnectResponse {
    pub status: &'static str,
    pub schema: String,
    pub table: Option<String>,
    pub time_column: Option<String>,
    /// How many rows were loaded (if `load_snapshot` was true).
    pub rows_loaded: Option<usize>,
    pub message: String,
}

#[tracing::instrument(skip(state, body), fields(schema = %body.schema))]
pub async fn post_connect(
    State(state): State<AppState>,
    Json(body): Json<ConnectRequest>,
) -> Result<Json<ConnectResponse>, AppError> {
    // Validate connection string format superficially.
    if !body.connection_string.starts_with("postgres")
        && !body.connection_string.starts_with("postgresql")
    {
        return Err(AppError::bad_request(
            "connection_string must be a postgres:// or postgresql:// URL",
        ));
    }

    let pool = Arc::new(db::connect(&body.connection_string).await?);

    let mut rows_loaded: Option<usize> = None;

    if body.load_snapshot
        && let Some(table) = &body.table {
            let opts = IngestOptions {
                limit: Some(body.snapshot_limit.unwrap_or(1_000_000)),
                ..Default::default()
            };
            let df: polars::prelude::DataFrame = db::ingest_table(
                &pool,
                &body.schema,
                table,
                body.time_column.as_deref(),
                &opts,
            )
            .await?;
            let n = df.height();
            state.replace_dataset(df).await;
            if let Some(ref tc) = body.time_column {
                state.set_time_column_display_name(Some(tc.clone()));
            }
            rows_loaded = Some(n);
            tracing::info!(rows = n, table = %table, "TimescaleDB snapshot loaded");
        }

    // Store pool + metadata in shared state.
    {
        let mut guard = state.db_pool.write().await;
        *guard = Some(pool);
    }
    {
        let mut guard = state.db_info.write().await;
        *guard = Some(DbConnectionInfo {
            schema: body.schema.clone(),
            table: body.table.clone().unwrap_or_default(),
            time_column: body.time_column.clone(),
        });
    }

    let msg = if let Some(n) = rows_loaded {
        format!(
            "Connected and loaded {} rows",
            n
        )
    } else {
        "Connected (no snapshot loaded)".to_string()
    };

    Ok(Json(ConnectResponse {
        status: "ok",
        schema: body.schema,
        table: body.table,
        time_column: body.time_column,
        rows_loaded,
        message: msg,
    }))
}

// ── DELETE /api/database/connect ──────────────────────────────────────────

#[tracing::instrument(skip(state))]
pub async fn delete_connect(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let had = state.db_pool.read().await.is_some();
    *state.db_pool.write().await = None;
    *state.db_info.write().await = None;
    let msg = if had {
        "Disconnected"
    } else {
        "No active connection"
    };
    tracing::info!(msg);
    Ok(Json(serde_json::json!({ "status": "ok", "message": msg })))
}

// ── GET /api/database/status ──────────────────────────────────────────────

#[derive(Serialize)]
pub struct StatusResponse {
    pub connected: bool,
    pub schema: Option<String>,
    pub table: Option<String>,
    pub time_column: Option<String>,
}

#[tracing::instrument(skip(state))]
pub async fn get_status(State(state): State<AppState>) -> Result<Json<StatusResponse>, AppError> {
    let info = state.db_info.read().await;
    if let Some(ref i) = *info {
        Ok(Json(StatusResponse {
            connected: true,
            schema: Some(i.schema.clone()),
            table: Some(i.table.clone()),
            time_column: i.time_column.clone(),
        }))
    } else {
        Ok(Json(StatusResponse {
            connected: false,
            schema: None,
            table: None,
            time_column: None,
        }))
    }
}

// ── GET /api/database/tables ──────────────────────────────────────────────

#[tracing::instrument(skip(state))]
pub async fn get_tables(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let pool: Arc<db::DbPool> = {
        let guard = state.db_pool.read().await;
        guard
            .as_ref()
            .cloned()
            .ok_or_else(|| AppError::bad_request("No active database connection"))?
    };

    let tables = db::list_tables(&pool).await?;
    Ok(Json(serde_json::json!({ "tables": tables })))
}

// ── GET /api/database/columns?schema=public&table=mytable ─────────────────

#[derive(Debug, Deserialize)]
pub struct ColumnsQuery {
    #[serde(default = "default_schema")]
    pub schema: String,
    pub table: String,
}

#[tracing::instrument(skip(state), fields(schema = %q.schema, table = %q.table))]
pub async fn get_columns(
    State(state): State<AppState>,
    Query(q): Query<ColumnsQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let pool: Arc<db::DbPool> = {
        let guard = state.db_pool.read().await;
        guard
            .as_ref()
            .cloned()
            .ok_or_else(|| AppError::bad_request("No active database connection"))?
    };

    let cols = db::list_columns(&pool, &q.schema, &q.table).await?;
    Ok(Json(serde_json::json!({ "columns": cols })))
}

// ── POST /api/database/load ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct LoadRequest {
    #[serde(default = "default_schema")]
    pub schema: String,
    pub table: String,
    pub time_column: Option<String>,
    pub columns: Option<Vec<String>>,
    pub limit: Option<usize>,
    pub start_ms: Option<i64>,
    pub end_ms: Option<i64>,
}

#[tracing::instrument(skip(state, body), fields(table = %body.table))]
pub async fn post_load(
    State(state): State<AppState>,
    Json(body): Json<LoadRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Clone the Arc out of the guard so we don't hold the lock across awaits.
    let pool: Arc<db::DbPool> = {
        let guard = state.db_pool.read().await;
        guard
            .as_ref()
            .cloned()
            .ok_or_else(|| AppError::bad_request("No active database connection"))?
    };

    let opts = IngestOptions {
        start_ms: body.start_ms,
        end_ms: body.end_ms,
        limit: Some(body.limit.unwrap_or(1_000_000)),
        columns: body.columns.unwrap_or_default(),
    };

    let df = db::ingest_table(
        &pool,
        &body.schema,
        &body.table,
        body.time_column.as_deref(),
        &opts,
    )
    .await?;

    let n = df.height();
    let numeric_cols: Vec<String> = df.get_column_names()
        .iter()
        .filter_map(|name| {
            let name_str = name.as_str();
            match df.column(name_str) {
                Ok(col) if col.dtype().is_numeric() => Some(name_str.to_string()),
                Ok(col) if name_str == "ts" && matches!(col.dtype(), polars::prelude::DataType::Datetime(_, _) | polars::prelude::DataType::Date) => Some(name_str.to_string()),
                _ => None,
            }
        })
        .collect();
    let time_col_clone = body.time_column.clone();
    let rev = state.replace_dataset(df).await;
    if let Some(ref tc) = body.time_column {
        state.set_time_column_display_name(Some(tc.clone()));
    }

    // Update connection metadata.
    let mut info = state.db_info.write().await;
    if let Some(ref mut i) = *info {
        i.table = body.table.clone();
        i.schema = body.schema.clone();
        if let Some(tc) = time_col_clone.clone() {
            i.time_column = Some(tc);
        }
    } else {
        *info = Some(DbConnectionInfo {
            schema: body.schema.clone(),
            table: body.table.clone(),
            time_column: time_col_clone.clone(),
        });
    }

    tracing::info!(rows = n, rev, table = %body.table, "DB snapshot loaded into memory");

    Ok(Json(serde_json::json!({
        "status": "ok",
        "rows": n,
        "numeric_columns": numeric_cols,
        "timestamp_column": time_col_clone.clone(),
        "revision": rev,
        "table": body.table,
        "schema": body.schema,
    })))
}
