//! TimescaleDB / PostgreSQL integration.
//!
//! Provides:
//! - [`DbPool`] — thin wrapper around a `deadpool_postgres::Pool`
//! - [`connect`] — validate credentials and build the pool
//! - [`list_tables`] — return user-visible hypertables / ordinary tables
//! - [`list_columns`] — return column names and types for a table
//! - [`ingest_table`] — pull a table (or time-filtered slice) into a
//!   Polars `DataFrame` so the rest of the app can serve it via the
//!   existing Arrow IPC routes unchanged

use deadpool_postgres::{Config as PgConfig, ManagerConfig, Pool, RecyclingMethod};
use polars::prelude::{DataFrame, DataType, NamedFrom, Series, TimeUnit};
use serde::{Deserialize, Serialize};
use tokio_postgres::{NoTls, Row};

use crate::error::AppError;

// ── Public types ───────────────────────────────────────────────────────────

pub struct DbPool(Pool);

impl DbPool {
    pub fn pool(&self) -> &Pool {
        &self.0
    }
}

// `deadpool_postgres::Pool` is Clone (it wraps an Arc internally).
impl Clone for DbPool {
    fn clone(&self) -> Self {
        DbPool(self.0.clone())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub schema: String,
    pub name: String,
    /// "hypertable" | "table" | "view"
    pub kind: String,
    pub row_estimate: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub pg_type: String,
    /// Polars dtype string we'll produce for this column
    pub polars_dtype: String,
    pub is_nullable: bool,
}

// ── Connection helpers ─────────────────────────────────────────────────────

/// Build a connection pool and verify the credentials by running a trivial
/// query.  Returns an error if the credentials are wrong or the host is
/// unreachable.
pub async fn connect(connection_string: &str) -> Result<DbPool, AppError> {
    let mut cfg = PgConfig::new();
    // Parse a plain postgres:// URI into the deadpool config.
    cfg.url = Some(connection_string.to_string());
    cfg.manager = Some(ManagerConfig {
        recycling_method: RecyclingMethod::Fast,
    });

    let pool = cfg
        .create_pool(Some(deadpool_postgres::Runtime::Tokio1), NoTls)
        .map_err(|e| AppError::internal(format!("Failed to create DB pool: {e}")))?;

    // Smoke-test the connection.
    let client = pool
        .get()
        .await
        .map_err(|e| AppError::internal(format!("DB connection failed: {e}")))?;

    client
        .execute("SELECT 1", &[])
        .await
        .map_err(|e| AppError::internal(format!("DB ping failed: {e}")))?;

    tracing::info!("TimescaleDB/Postgres connection pool ready");
    Ok(DbPool(pool))
}

// ── Discovery queries ──────────────────────────────────────────────────────

/// List user tables and hypertables visible to the connected role.
pub async fn list_tables(pool: &DbPool) -> Result<Vec<TableInfo>, AppError> {
    let client = pool
        .pool()
        .get()
        .await
        .map_err(|e| AppError::internal(format!("DB pool error: {e}")))?;

    // Check if TimescaleDB extension is present.
    let has_timescale: bool = client
        .query_opt(
            "SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'",
            &[],
        )
        .await
        .map(|r| r.is_some())
        .unwrap_or(false);

    let mut tables: Vec<TableInfo> = Vec::new();

    if has_timescale {
        // Hypertables via the TimescaleDB catalog.
        let ht_rows = client
            .query(
                "SELECT h.schema_name, h.table_name,
                        COALESCE(c.reltuples::bigint, -1) AS row_estimate
                 FROM   _timescaledb_catalog.hypertable h
                 JOIN   pg_class c ON c.relname = h.table_name
                 JOIN   pg_namespace n ON n.nspname = h.schema_name
                                     AND c.relnamespace = n.oid
                 ORDER  BY h.schema_name, h.table_name",
                &[],
            )
            .await
            .unwrap_or_default();

        for row in ht_rows {
            let schema: String = row.get(0);
            let name: String = row.get(1);
            let row_estimate: i64 = row.get(2);
            tables.push(TableInfo {
                schema,
                name,
                kind: "hypertable".to_string(),
                row_estimate: Some(row_estimate),
            });
        }
    }

    // Ordinary user tables (excluding TimescaleDB internal schemas).
    let ordinary_rows = client
        .query(
            "SELECT table_schema, table_name
             FROM   information_schema.tables
             WHERE  table_type = 'BASE TABLE'
               AND  table_schema NOT IN ('pg_catalog','information_schema',
                                         '_timescaledb_catalog','_timescaledb_internal',
                                         '_timescaledb_config','_timescaledb_cache',
                                         'timescaledb_information','timescaledb_experimental')
             ORDER  BY table_schema, table_name",
            &[],
        )
        .await
        .map_err(|e| AppError::internal(format!("list_tables query failed: {e}")))?;

    let existing: std::collections::HashSet<String> = tables
        .iter()
        .map(|t| format!("{}.{}", t.schema, t.name))
        .collect();

    for row in ordinary_rows {
        let schema: String = row.get(0);
        let name: String = row.get(1);
        if !existing.contains(&format!("{schema}.{name}")) {
            tables.push(TableInfo {
                schema,
                name,
                kind: "table".to_string(),
                row_estimate: None,
            });
        }
    }

    Ok(tables)
}

/// Return column metadata for a specific table.
pub async fn list_columns(
    pool: &DbPool,
    schema: &str,
    table: &str,
) -> Result<Vec<ColumnInfo>, AppError> {
    let client = pool
        .pool()
        .get()
        .await
        .map_err(|e| AppError::internal(format!("DB pool error: {e}")))?;

    let rows = client
        .query(
            "SELECT column_name, data_type,
                    is_nullable = 'YES' AS nullable
             FROM   information_schema.columns
             WHERE  table_schema = $1 AND table_name = $2
             ORDER  BY ordinal_position",
            &[&schema, &table],
        )
        .await
        .map_err(|e| AppError::internal(format!("list_columns query failed: {e}")))?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let pg_type: String = row.get(1);
            let polars_dtype = pg_type_to_polars(&pg_type).to_string();
            let nullable: bool = row.get(2);
            ColumnInfo {
                name: row.get(0),
                pg_type,
                polars_dtype,
                is_nullable: nullable,
            }
        })
        .collect())
}

fn pg_type_to_polars(pg: &str) -> &'static str {
    match pg {
        "smallint" | "smallserial" => "Int16",
        "integer" | "serial" => "Int32",
        "bigint" | "bigserial" => "Int64",
        "real" => "Float32",
        "double precision" | "numeric" | "decimal" => "Float64",
        "boolean" => "Boolean",
        "timestamp without time zone"
        | "timestamp with time zone"
        | "timestamptz"
        | "timestamp" => "Datetime(Microseconds)",
        "date" => "Date",
        _ => "String",
    }
}

// ── Ingest ─────────────────────────────────────────────────────────────────

/// Options for pulling data from a table.
#[derive(Debug, Default)]
pub struct IngestOptions {
    /// Optionally restrict to rows where `time_column >= start_ms`.
    pub start_ms: Option<i64>,
    /// Optionally restrict to rows where `time_column <= end_ms`.
    pub end_ms: Option<i64>,
    /// Hard cap on number of rows returned.
    pub limit: Option<usize>,
    /// Columns to SELECT. Empty = all.
    pub columns: Vec<String>,
}

/// Fetch rows from `schema.table` and return a Polars DataFrame.
///
/// The table must have at least one temporal column (TIMESTAMP / TIMESTAMPTZ).
/// If `time_col` is provided it is used directly; otherwise the first
/// TIMESTAMP-like column is auto-detected.
pub async fn ingest_table(
    pool: &DbPool,
    schema: &str,
    table: &str,
    time_col: Option<&str>,
    opts: &IngestOptions,
) -> Result<DataFrame, AppError> {
    let client = pool
        .pool()
        .get()
        .await
        .map_err(|e| AppError::internal(format!("DB pool error: {e}")))?;

    // Validate / sanitise identifiers (only allow safe chars).
    let schema = sanitise_ident(schema)?;
    let table = sanitise_ident(table)?;

    // Resolve column list from metadata.
    let all_cols = list_columns_raw(&client, &schema, &table).await?;

    let sel_cols: Vec<(String, String)> = if opts.columns.is_empty() {
        all_cols.clone()
    } else {
        let want: std::collections::HashSet<_> = opts.columns.iter().map(|s| s.as_str()).collect();
        all_cols
            .into_iter()
            .filter(|(name, _)| want.contains(name.as_str()))
            .collect()
    };

    if sel_cols.is_empty() {
        return Err(AppError::bad_request("No valid columns selected"));
    }

    // Auto-detect time column if not specified.
    let resolved_time_col: Option<String> = time_col.map(|c| c.to_string()).or_else(|| {
        sel_cols.iter().find_map(|(name, pg_type)| {
            if is_pg_temporal(pg_type) {
                Some(name.clone())
            } else {
                None
            }
        })
    });

    // Build SELECT list.
    let col_list: String = sel_cols
        .iter()
        .map(|(name, _)| format!("\"{}\"", name))
        .collect::<Vec<_>>()
        .join(", ");

    // Build WHERE clause (time-range filter).
    let mut where_parts: Vec<String> = Vec::new();
    if let Some(start_ms) = opts.start_ms
        && let Some(tc) = &resolved_time_col {
            let tc = sanitise_ident(tc)?;
            // Embed i64 literal directly — no injection risk with numeric types.
            where_parts.push(format!(
                "\"{}\" >= to_timestamp({} / 1000.0)",
                tc,
                start_ms
            ));
        }
    if let Some(end_ms) = opts.end_ms
        && let Some(tc) = &resolved_time_col {
            let tc = sanitise_ident(tc)?;
            where_parts.push(format!(
                "\"{}\" <= to_timestamp({} / 1000.0)",
                tc, end_ms
            ));
        }

    let where_clause = if where_parts.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_parts.join(" AND "))
    };

    let order_by = resolved_time_col
        .as_ref()
        .map(|tc| format!("ORDER BY \"{}\" ASC", tc))
        .unwrap_or_default();

    let limit_clause = opts
        .limit
        .map(|n| format!("LIMIT {}", n))
        .unwrap_or_default();

    let sql = format!(
        "SELECT {col_list} FROM \"{schema}\".\"{table}\" {where_clause} {order_by} {limit_clause}"
    );

    tracing::debug!(sql = %sql, "TimescaleDB query");

    let rows = client
        .query(&sql as &str, &[])
        .await
        .map_err(|e| AppError::internal(format!("TimescaleDB query failed: {e}")))?;

    rows_to_dataframe(rows, &sel_cols)
}

// ── Internal helpers ───────────────────────────────────────────────────────

fn sanitise_ident(name: &str) -> Result<String, AppError> {
    if name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '_' || c == '.')
    {
        Ok(name.to_string())
    } else {
        Err(AppError::bad_request(format!(
            "Invalid identifier: {name:?}"
        )))
    }
}

fn is_pg_temporal(pg_type: &str) -> bool {
    matches!(
        pg_type,
        "timestamp without time zone"
            | "timestamp with time zone"
            | "timestamptz"
            | "timestamp"
            | "date"
    )
}

async fn list_columns_raw(
    client: &tokio_postgres::Client,
    schema: &str,
    table: &str,
) -> Result<Vec<(String, String)>, AppError> {
    let rows = client
        .query(
            "SELECT column_name, data_type
             FROM   information_schema.columns
             WHERE  table_schema = $1 AND table_name = $2
             ORDER  BY ordinal_position",
            &[&schema, &table],
        )
        .await
        .map_err(|e| AppError::internal(format!("Column list query failed: {e}")))?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let name: String = row.get(0);
            let pg_type: String = row.get(1);
            (name, pg_type)
        })
        .collect())
}

/// Convert tokio-postgres `Row`s into a Polars `DataFrame`.
fn rows_to_dataframe(rows: Vec<Row>, cols: &[(String, String)]) -> Result<DataFrame, AppError> {
    use polars::prelude::Column;

    if rows.is_empty() {
        // Return an empty DataFrame with the right schema.
        let columns: Vec<Column> = cols
            .iter()
            .map(|(name, _)| Series::new(name.as_str().into(), Vec::<f64>::new()).into())
            .collect();
        let n = columns.len();
        return DataFrame::new(n, columns)
            .map_err(|e| AppError::internal(format!("Empty DataFrame build failed: {e}")));
    }

    // Build one Column per source column.
    let mut columns: Vec<Column> = Vec::with_capacity(cols.len());

    for (col_idx, (col_name, pg_type)) in cols.iter().enumerate() {
        let series: Series = match pg_type.as_str() {
            "smallint" | "smallserial" => {
                let vals: Vec<Option<i16>> = rows.iter().map(|r| r.try_get(col_idx).ok()).collect();
                Series::new(col_name.as_str().into(), vals)
            }
            "integer" | "serial" => {
                let vals: Vec<Option<i32>> = rows.iter().map(|r| r.try_get(col_idx).ok()).collect();
                Series::new(col_name.as_str().into(), vals)
            }
            "bigint" | "bigserial" => {
                let vals: Vec<Option<i64>> = rows.iter().map(|r| r.try_get(col_idx).ok()).collect();
                Series::new(col_name.as_str().into(), vals)
            }
            "real" => {
                let vals: Vec<Option<f32>> = rows.iter().map(|r| r.try_get(col_idx).ok()).collect();
                Series::new(col_name.as_str().into(), vals)
            }
            "double precision" | "numeric" | "decimal" => {
                let vals: Vec<Option<f64>> = rows.iter().map(|r| r.try_get(col_idx).ok()).collect();
                Series::new(col_name.as_str().into(), vals)
            }
            "boolean" => {
                let vals: Vec<Option<bool>> =
                    rows.iter().map(|r| r.try_get(col_idx).ok()).collect();
                Series::new(col_name.as_str().into(), vals)
            }
            "timestamp without time zone"
            | "timestamp with time zone"
            | "timestamptz"
            | "timestamp" => {
                // Get as chrono::DateTime<Utc>, convert to microsecond epoch.
                use chrono::{DateTime, Utc};
                let vals: Vec<Option<i64>> = rows
                    .iter()
                    .map(|r| {
                        r.try_get::<_, DateTime<Utc>>(col_idx)
                            .ok()
                            .map(|dt| dt.timestamp_micros())
                    })
                    .collect();
                Series::new(col_name.as_str().into(), vals)
                    .cast(&DataType::Datetime(TimeUnit::Microseconds, None))
                    .map_err(|e| AppError::internal(format!("Datetime cast failed: {e}")))?
            }
            "date" => {
                use chrono::NaiveDate;
                // Days since epoch (Polars Date is i32 days).
                let epoch = NaiveDate::from_ymd_opt(1970, 1, 1).ok_or_else(|| AppError::internal("Failed to create epoch date"))?;
                let vals: Vec<Option<i32>> = rows
                    .iter()
                    .map(|r| {
                        r.try_get::<_, NaiveDate>(col_idx)
                            .ok()
                            .map(|d| (d - epoch).num_days() as i32)
                    })
                    .collect();
                Series::new(col_name.as_str().into(), vals)
                    .cast(&DataType::Date)
                    .map_err(|e| AppError::internal(format!("Date cast failed: {e}")))?
            }
            _ => {
                // Everything else as String.
                let vals: Vec<Option<String>> = rows
                    .iter()
                    .map(|r| r.try_get::<_, String>(col_idx).ok())
                    .collect();
                Series::new(col_name.as_str().into(), vals)
            }
        };
        columns.push(series.into());
    }

    let n = columns.len();
    DataFrame::new(n, columns)
        .map_err(|e| AppError::internal(format!("DataFrame build failed: {e}")))
}
