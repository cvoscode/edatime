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
use futures_util::{StreamExt, pin_mut};
use polars::prelude::{DataFrame, DataType, NamedFrom, Series, TimeUnit};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::time::timeout;
use tokio_postgres::{NoTls, Row};

use edatime_core::error::AppError;

// ── Public types ───────────────────────────────

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

// ── Connection helpers ─────────────────────────

/// Build a connection pool and verify the credentials by running a trivial
/// query.  Returns an error if the credentials are wrong or the host is
/// unreachable.
pub async fn connect(connection_string: &str) -> Result<DbPool, AppError> {
    connect_with_timeout(connection_string, Duration::from_secs(30)).await
}

pub async fn connect_with_timeout(
    connection_string: &str,
    timeout_duration: Duration,
) -> Result<DbPool, AppError> {
    let mut cfg = PgConfig::new();
    // Parse a plain postgres:// URI into the deadpool config.
    cfg.url = Some(connection_string.to_string());
    cfg.manager = Some(ManagerConfig {
        recycling_method: RecyclingMethod::Fast,
    });

    let pool = cfg
        .create_pool(Some(deadpool_postgres::Runtime::Tokio1), NoTls)
        .map_err(|e| AppError::database_configuration(format!("Failed to create DB pool: {e}")))?;

    // Smoke-test the connection.
    let client = timeout(timeout_duration, pool.get())
        .await
        .map_err(|_| AppError::database_timeout("Database connection timed out"))?
        .map_err(|e| AppError::database_unavailable(format!("DB connection failed: {e}")))?;

    timeout(timeout_duration, client.execute("SELECT 1", &[]))
        .await
        .map_err(|_| AppError::database_timeout("Database ping timed out"))?
        .map_err(|e| AppError::database_unavailable(format!("DB ping failed: {e}")))?;

    tracing::info!("TimescaleDB/Postgres connection pool ready");
    Ok(DbPool(pool))
}

// ── Discovery queries ──────────────────────────

/// List user tables and hypertables visible to the connected role.
pub async fn list_tables(pool: &DbPool) -> Result<Vec<TableInfo>, AppError> {
    let client = pool
        .pool()
        .get()
        .await
        .map_err(|e| AppError::database_unavailable(format!("DB pool unavailable: {e}")))?;

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
            .await;

        if let Ok(ht_rows) = ht_rows {
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
        } else {
            tracing::debug!(
                "TimescaleDB hypertable query failed (non-fatal — ordinary tables still listed)"
            );
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
        .map_err(|e| AppError::database_query(format!("Table list query failed: {e}")))?;

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
        .map_err(|e| AppError::database_unavailable(format!("DB pool unavailable: {e}")))?;

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
        .map_err(|e| AppError::database_query(format!("Column list query failed: {e}")))?;

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

// ── Ingest ─────────────────────────────────────

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
    /// Maximum retained value bytes while constructing the bounded snapshot.
    pub max_bytes: Option<usize>,
    /// Server- and client-side statement timeout.
    pub statement_timeout_ms: Option<u64>,
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
    let timeout_duration =
        Duration::from_millis(opts.statement_timeout_ms.unwrap_or(30_000).max(1));
    let client = timeout(timeout_duration, pool.pool().get())
        .await
        .map_err(|_| AppError::database_timeout("Database pool acquisition timed out"))?
        .map_err(|e| AppError::database_unavailable(format!("DB pool error: {e}")))?;
    client
        .batch_execute(&format!(
            "SET statement_timeout = {}",
            timeout_duration.as_millis().min(u128::from(u32::MAX))
        ))
        .await
        .map_err(|e| AppError::database_query(format!("Set statement timeout failed: {e}")))?;

    // Validate and sanitise identifiers upfront (no borrows held).
    // Identifiers are double-quoted per SQL standard — this is the only safe
    // way to embed user-supplied names in SQL. The allowlist (alphanumeric + _ + .)
    // prevents literal injection, and double-quoting prevents identifier injection
    // (e.g. a keyword like "update" in a table name stays as a name, not a command).
    let schema = sanitise_ident(schema)?;
    let table = sanitise_ident(table)?;

    // Resolve column list from metadata.
    let all_cols = list_columns_raw(&client, &schema, &table).await?;

    let sel_cols: Vec<(String, String)> = if opts.columns.is_empty() {
        all_cols
    } else {
        let want: std::collections::HashSet<&str> =
            opts.columns.iter().map(|s| s.as_str()).collect();
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
        && let Some(tc) = &resolved_time_col
    {
        let tc = sanitise_ident(tc)?;
        // Embed i64 literal directly — no injection risk with numeric types.
        where_parts.push(format!("\"{}\" >= to_timestamp({} / 1000.0)", tc, start_ms));
    }
    if let Some(end_ms) = opts.end_ms
        && let Some(tc) = &resolved_time_col
    {
        let tc = sanitise_ident(tc)?;
        where_parts.push(format!("\"{}\" <= to_timestamp({} / 1000.0)", tc, end_ms));
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
        .query_raw(
            &sql as &str,
            std::iter::empty::<&(dyn tokio_postgres::types::ToSql + Sync)>(),
        )
        .await
        .map_err(|e| AppError::database_query(format!("TimescaleDB query failed: {e}")))?;
    pin_mut!(rows);
    let mut accumulators = sel_cols
        .iter()
        .map(|(_, pg_type)| ColumnAccumulator::new(pg_type))
        .collect::<Vec<_>>();
    let mut estimated_bytes = 0usize;
    while let Some(row) = rows.next().await {
        let row = row.map_err(|error| {
            AppError::database_query(format!("TimescaleDB row stream failed: {error}"))
        })?;
        for (index, accumulator) in accumulators.iter_mut().enumerate() {
            estimated_bytes = estimated_bytes.saturating_add(accumulator.push(&row, index));
        }
        if opts.max_bytes.is_some_and(|limit| estimated_bytes > limit) {
            return Err(AppError::Validation(format!(
                "database snapshot byte budget exceeded: estimated={estimated_bytes}, limit={}",
                opts.max_bytes.unwrap_or_default()
            )));
        }
    }
    accumulators_to_dataframe(accumulators, &sel_cols)
}

// ── Internal helpers ───────────────────────────

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
        .map_err(|e| AppError::database_query(format!("Column list query failed: {e}")))?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let name: String = row.get(0);
            let pg_type: String = row.get(1);
            (name, pg_type)
        })
        .collect())
}

enum ColumnAccumulator {
    I16(Vec<Option<i16>>),
    I32(Vec<Option<i32>>),
    I64(Vec<Option<i64>>),
    F32(Vec<Option<f32>>),
    F64(Vec<Option<f64>>),
    Bool(Vec<Option<bool>>),
    Datetime(Vec<Option<i64>>),
    Date(Vec<Option<i32>>),
    String(Vec<Option<String>>),
}

impl ColumnAccumulator {
    fn new(pg_type: &str) -> Self {
        match pg_type {
            "smallint" | "smallserial" => Self::I16(Vec::new()),
            "integer" | "serial" => Self::I32(Vec::new()),
            "bigint" | "bigserial" => Self::I64(Vec::new()),
            "real" => Self::F32(Vec::new()),
            "double precision" | "numeric" | "decimal" => Self::F64(Vec::new()),
            "boolean" => Self::Bool(Vec::new()),
            "timestamp without time zone"
            | "timestamp with time zone"
            | "timestamptz"
            | "timestamp" => Self::Datetime(Vec::new()),
            "date" => Self::Date(Vec::new()),
            _ => Self::String(Vec::new()),
        }
    }

    fn push(&mut self, row: &Row, index: usize) -> usize {
        match self {
            Self::I16(values) => {
                values.push(row.try_get(index).ok());
                std::mem::size_of::<Option<i16>>()
            }
            Self::I32(values) => {
                values.push(row.try_get(index).ok());
                std::mem::size_of::<Option<i32>>()
            }
            Self::I64(values) => {
                values.push(row.try_get(index).ok());
                std::mem::size_of::<Option<i64>>()
            }
            Self::F32(values) => {
                values.push(row.try_get(index).ok());
                std::mem::size_of::<Option<f32>>()
            }
            Self::F64(values) => {
                values.push(row.try_get(index).ok());
                std::mem::size_of::<Option<f64>>()
            }
            Self::Bool(values) => {
                values.push(row.try_get(index).ok());
                std::mem::size_of::<Option<bool>>()
            }
            Self::Datetime(values) => {
                values.push(
                    row.try_get::<_, chrono::DateTime<chrono::Utc>>(index)
                        .ok()
                        .map(|value| value.timestamp_micros()),
                );
                std::mem::size_of::<Option<i64>>()
            }
            Self::Date(values) => {
                let epoch = chrono::NaiveDate::from_ymd_opt(1970, 1, 1);
                values.push(
                    row.try_get::<_, chrono::NaiveDate>(index)
                        .ok()
                        .zip(epoch)
                        .map(|(value, epoch)| (value - epoch).num_days() as i32),
                );
                std::mem::size_of::<Option<i32>>()
            }
            Self::String(values) => {
                let value: Option<String> = row.try_get(index).ok();
                let bytes = value
                    .as_ref()
                    .map_or(0, String::len)
                    .saturating_add(std::mem::size_of::<Option<String>>());
                values.push(value);
                bytes
            }
        }
    }

    fn len(&self) -> usize {
        match self {
            Self::I16(values) => values.len(),
            Self::I32(values) => values.len(),
            Self::I64(values) => values.len(),
            Self::F32(values) => values.len(),
            Self::F64(values) => values.len(),
            Self::Bool(values) => values.len(),
            Self::Datetime(values) => values.len(),
            Self::Date(values) => values.len(),
            Self::String(values) => values.len(),
        }
    }

    fn into_series(self, name: &str) -> Result<Series, AppError> {
        let series = match self {
            Self::I16(values) => Series::new(name.into(), values),
            Self::I32(values) => Series::new(name.into(), values),
            Self::I64(values) => Series::new(name.into(), values),
            Self::F32(values) => Series::new(name.into(), values),
            Self::F64(values) => Series::new(name.into(), values),
            Self::Bool(values) => Series::new(name.into(), values),
            Self::Datetime(values) => Series::new(name.into(), values)
                .cast(&DataType::Datetime(TimeUnit::Microseconds, None))
                .map_err(|error| AppError::internal(format!("Datetime cast failed: {error}")))?,
            Self::Date(values) => Series::new(name.into(), values)
                .cast(&DataType::Date)
                .map_err(|error| AppError::internal(format!("Date cast failed: {error}")))?,
            Self::String(values) => Series::new(name.into(), values),
        };
        Ok(series)
    }
}

fn accumulators_to_dataframe(
    accumulators: Vec<ColumnAccumulator>,
    cols: &[(String, String)],
) -> Result<DataFrame, AppError> {
    use polars::prelude::Column;
    let height = accumulators
        .first()
        .map(ColumnAccumulator::len)
        .unwrap_or(0);
    let columns: Vec<Column> = accumulators
        .into_iter()
        .zip(cols)
        .map(|(accumulator, (name, _))| accumulator.into_series(name).map(Into::into))
        .collect::<Result<_, _>>()?;

    DataFrame::new(height, columns)
        .map_err(|e| AppError::internal(format!("DataFrame build failed: {e}")))
}

#[cfg(test)]
mod tests {
    use super::{ColumnAccumulator, accumulators_to_dataframe};

    #[test]
    fn accumulator_dataframe_height_is_the_streamed_row_count() {
        let frame = accumulators_to_dataframe(
            vec![
                ColumnAccumulator::I64(vec![Some(1), Some(2), None]),
                ColumnAccumulator::String(vec![Some("a".into()), None, Some("c".into())]),
            ],
            &[
                ("number".into(), "bigint".into()),
                ("label".into(), "text".into()),
            ],
        )
        .expect("dataframe");

        assert_eq!(frame.height(), 3);
        assert_eq!(frame.width(), 2);
        assert_eq!(frame.column("number").expect("number").null_count(), 1);
        assert_eq!(frame.column("label").expect("label").null_count(), 1);
    }
}
