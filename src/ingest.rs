use polars::prelude::*;
use std::path::Path;

/// Parameters for partial DataFrame loading.
#[derive(Debug, Default)]
pub struct IngestParams {
    /// Cap the total number of rows ingested (None = all rows).
    pub n_rows: Option<usize>,
    /// Skip this many rows before reading (0 = no skip).
    pub skip_rows: usize,
    /// Filter: keep only rows with ts >= this value (epoch ms).
    pub time_start_ms: Option<i64>,
    /// Filter: keep only rows with ts <= this value (epoch ms).
    pub time_end_ms: Option<i64>,
    /// Only keep these columns (plus the time column). None = all columns.
    pub selected_columns: Option<Vec<String>>,
    /// Explicit time column name, bypassing auto-detection.
    pub time_column: Option<String>,
    /// Explicit epoch unit for integer time columns: "s", "ms", "us", "ns".
    /// When set, skips the max-abs heuristic.
    pub time_unit: Option<String>,
}

pub fn load_dataframe<P: AsRef<Path>>(path: P) -> PolarsResult<DataFrame> {
    load_dataframe_partial(path, &IngestParams::default())
}

pub fn load_dataframe_partial<P: AsRef<Path>>(
    path: P,
    params: &IngestParams,
) -> PolarsResult<DataFrame> {
    let path_ref = path.as_ref();
    let is_parquet = path_ref.extension().is_some_and(|ext| ext == "parquet");

    // ── 1. Build lazy scan (no data loaded yet) ───────────────────────────
    let mut lf: LazyFrame = if is_parquet {
        LazyFrame::scan_parquet(
            path_ref.to_string_lossy().as_ref().into(),
            ScanArgsParquet::default(),
        )?
    } else {
        let mut reader = LazyCsvReader::new(path_ref.to_string_lossy().as_ref().into())
            .with_try_parse_dates(true)
            .with_skip_rows(params.skip_rows)
            .with_ignore_errors(true)
            .with_infer_schema_length(Some(10_000));
        if let Some(n) = params.n_rows {
            reader = reader.with_n_rows(Some(n));
        }
        reader.finish()?
    };

    // For Parquet, apply skip_rows / n_rows lazily — avoids loading the whole
    // file into memory just to slice it.
    if is_parquet && (params.skip_rows > 0 || params.n_rows.is_some()) {
        let offset = params.skip_rows as i64;
        let len: u32 = params
            .n_rows
            .and_then(|n| u32::try_from(n).ok())
            .unwrap_or(u32::MAX);
        lf = lf.slice(offset, len);
    }

    // ── 2. Inspect schema without loading any row data ─────────────────────
    let schema_ref = lf
        .clone()
        .collect_schema()
        .map_err(|e| PolarsError::ComputeError(format!("Failed to read schema: {e}").into()))?;
    let schema = schema_ref.as_ref();

    // ── 3. Detect time column from schema ──────────────────────────────────
    let mut time_col_name: Option<String> = None;

    if let Some(ref explicit_column) = params.time_column
        && schema.get(explicit_column.as_str()).is_some() {
            time_col_name = Some(explicit_column.clone());
        }
    if time_col_name.is_none() {
        for field in schema.iter_fields() {
            if matches!(field.dtype(), DataType::Datetime(_, _) | DataType::Date) {
                time_col_name = Some(field.name().to_string());
                break;
            }
        }
    }

    let old_name = time_col_name.ok_or_else(|| {
        PolarsError::ComputeError("DataFrame must contain at least one datetime column".into())
    })?;

    // ── 4. Validate numeric columns from schema (no data needed) ──────────
    let has_numeric = schema
        .iter_fields()
        .any(|f| f.name().as_str() != old_name.as_str() && f.dtype().is_numeric());
    if !has_numeric {
        return Err(PolarsError::ComputeError(
            "DataFrame must contain at least one numeric column".into(),
        ));
    }

    // ── 5. Apply column selection lazily ───────────────────────────────────
    if let Some(ref selected_columns) = params.selected_columns {
        let requested: std::collections::HashSet<&str> = selected_columns
            .iter()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        if !requested.is_empty() {
            let keep_exprs: Vec<Expr> = schema
                .iter_fields()
                .filter(|f| {
                    let name = f.name().as_str();
                    requested.contains(name) || name == old_name.as_str()
                })
                .map(|f| col(f.name().as_str()))
                .collect();
            if keep_exprs.len() < schema.len() {
                lf = lf.select(keep_exprs);
            }
        }
    }

    // ── 6. Rename time column to "ts" lazily ──────────────────────────────
    if old_name != "ts" {
        lf = lf.rename([old_name.as_str()], ["ts"], true);
    }

    // ── 7. Cast / normalise the ts column lazily ──────────────────────────
    let ts_dtype = schema
        .get(old_name.as_str())
        .cloned()
        .unwrap_or(DataType::Int64);
    let needs_cast = !matches!(ts_dtype, DataType::Datetime(_, _) | DataType::Date);

    if needs_cast
        && matches!(
            ts_dtype,
            DataType::Int64 | DataType::Int32 | DataType::UInt64 | DataType::UInt32
        )
    {
        let mut ts_expr = col("ts").cast(DataType::Int64);

        // If the caller provided an explicit time_unit, use it directly
        // instead of probing the data.
        if let Some(ref unit) = params.time_unit {
            match unit.to_ascii_lowercase().as_str() {
                "s" => ts_expr = ts_expr * lit(1_000_i64),
                "ms" => {} // already milliseconds
                "us" | "μs" => ts_expr = ts_expr / lit(1_000_i64),
                "ns" => ts_expr = ts_expr / lit(1_000_000_i64),
                _ => {} // unrecognised — fall through to heuristic below
            }
        } else {
            // Determine the epoch unit by finding the max absolute value with a
            // single streaming pass over only the ts column.
            let probe = lf
                .clone()
                .select([col("ts").cast(DataType::Int64).max().alias("m")])
                .collect()
                .map_err(|e| PolarsError::ComputeError(format!("ts probe: {e}").into()))?;
            let max_abs: i64 = probe
                .column("m")
                .ok()
                .and_then(|s| s.get(0).ok())
                .and_then(|v| match v {
                    AnyValue::Int64(n) => Some(n),
                    _ => None,
                })
                .unwrap_or(0);

            if max_abs > 0 {
                if max_abs < 100_000_000_000 {
                    ts_expr = ts_expr * lit(1_000_i64); // seconds → ms
                } else if max_abs >= 100_000_000_000_000_000 {
                    ts_expr = ts_expr / lit(1_000_000_i64); // ns → ms
                } else if max_abs >= 100_000_000_000_000 {
                    ts_expr = ts_expr / lit(1_000_i64); // μs → ms
                }
                // else: already milliseconds
            }
        }

        lf = lf.with_column(
            ts_expr
                .cast(DataType::Datetime(TimeUnit::Milliseconds, None))
                .alias("ts"),
        );
    } else if needs_cast {
        lf = lf.with_column(
            col("ts")
                .cast(DataType::Int64)
                .cast(DataType::Datetime(TimeUnit::Milliseconds, None))
                .alias("ts"),
        );
    } else if !matches!(ts_dtype, DataType::Datetime(TimeUnit::Milliseconds, None)) {
        // Normalise non-ms datetime (ns, μs, Date) to ms for consistency.
        lf = lf.with_column(
            col("ts")
                .cast(DataType::Datetime(TimeUnit::Milliseconds, None))
                .alias("ts"),
        );
    }

    // ── 8. Apply time range filters lazily ────────────────────────────────
    if let Some(start_ms) = params.time_start_ms {
        lf = lf.filter(
            col("ts").gt_eq(lit(start_ms).cast(DataType::Datetime(TimeUnit::Milliseconds, None))),
        );
    }
    if let Some(end_ms) = params.time_end_ms {
        lf = lf.filter(
            col("ts").lt_eq(lit(end_ms).cast(DataType::Datetime(TimeUnit::Milliseconds, None))),
        );
    }

    // ── 9. Sort and single collect (streaming for out-of-core support) ────
    let df = lf.sort(["ts"], SortMultipleOptions::default()).collect()?;

    if df.height() == 0 {
        return Err(PolarsError::ComputeError(
            "No rows loaded for the selected partial range. Reduce skip_rows or increase n_rows."
                .into(),
        ));
    }

    Ok(df)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use std::fs;

    fn write_temp_csv(contents: &str) -> tempfile::TempPath {
        let file = tempfile::NamedTempFile::new().expect("tempfile");
        fs::write(file.path(), contents).expect("write csv");
        file.into_temp_path()
    }

    #[test]
    fn partial_load_respects_row_limit_and_selection() {
        let path = write_temp_csv(
            "time,value,other\n2024-01-01T00:00:00Z,1,10\n2024-01-01T00:00:01Z,2,20\n2024-01-01T00:00:02Z,3,30\n",
        );

        let df = load_dataframe_partial(
            &path,
            &IngestParams {
                n_rows: Some(2),
                selected_columns: Some(vec!["value".to_string()]),
                ..IngestParams::default()
            },
        )
        .expect("partial load");

        assert_eq!(df.height(), 2);
        let column_names = df
            .get_column_names()
            .iter()
            .map(|name| name.as_str())
            .collect::<Vec<_>>();
        assert!(column_names.contains(&"ts"));
        assert!(column_names.contains(&"value"));
        assert_eq!(column_names.len(), 2);
    }

    #[test]
    fn partial_load_rejects_missing_temporal_column() {
        let path = write_temp_csv("value,other\n1,10\n2,20\n");
        let err = load_dataframe_partial(&path, &IngestParams::default()).unwrap_err();
        assert!(err.to_string().contains("datetime column"));
    }

    #[test]
    fn partial_load_accepts_explicit_time_column() {
        let path = write_temp_csv("timekey,value\n1700000000,1\n1700000001,2\n");
        let df = load_dataframe_partial(
            &path,
            &IngestParams {
                time_column: Some("timekey".to_string()),
                ..IngestParams::default()
            },
        )
        .expect("partial load with explicit time column");
        assert_eq!(df.height(), 2);
        assert!(df.column("ts").is_ok());
        assert!(df.column("value").is_ok());
    }
}
