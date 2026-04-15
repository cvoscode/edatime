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
}

pub fn load_dataframe<P: AsRef<Path>>(path: P) -> PolarsResult<DataFrame> {
    load_dataframe_partial(path, &IngestParams::default())
}

pub fn load_dataframe_partial<P: AsRef<Path>>(
    path: P,
    params: &IngestParams,
) -> PolarsResult<DataFrame> {
    let path_ref = path.as_ref();
    let is_parquet = path_ref.extension().map_or(false, |ext| ext == "parquet");

    let mut df = if is_parquet {
        let args = ScanArgsParquet::default();
        let lf = LazyFrame::scan_parquet(path_ref.to_str().unwrap().into(), args)?;
        let collected = lf.collect()?;
        let height = collected.height();
        if params.skip_rows >= height {
            DataFrame::empty()
        } else {
            let after_skip = collected.slice(params.skip_rows as i64, height - params.skip_rows);
            if let Some(limit) = params.n_rows {
                after_skip.slice(0, limit)
            } else {
                after_skip
            }
        }
    } else {
        let mut reader = LazyCsvReader::new(path_ref.to_str().unwrap().into())
            .with_try_parse_dates(true)
            .with_skip_rows(params.skip_rows)
            .with_ignore_errors(true)
            .with_infer_schema_length(Some(10000));
        if let Some(n) = params.n_rows {
            reader = reader.with_n_rows(Some(n));
        }
        reader.finish()?.collect()?
    };

    // If the partial read returns empty, fail early before attempting column inference.
    if df.height() == 0 {
        return Err(PolarsError::ComputeError(
            "No rows loaded for the selected partial range. Reduce skip_rows or increase n_rows."
                .into(),
        ));
    }

    let col_names = df.get_column_names();
    let dtypes = df.dtypes();

    let mut time_col_name = None;

    // If user specified a time column, use it; otherwise auto-detect
    if let Some(ref explicit_column) = params.time_column {
        if col_names
            .iter()
            .any(|name| name.as_str() == explicit_column.as_str())
        {
            time_col_name = Some(explicit_column.clone());
        }
    }

    // Auto-detect time column if not explicitly specified
    if time_col_name.is_none() {
        for (i, dt) in dtypes.iter().enumerate() {
            if matches!(dt, DataType::Datetime(_, _) | DataType::Date) {
                time_col_name = Some(col_names[i].to_string());
                break;
            }
        }
    }

    let old_name = time_col_name.ok_or_else(|| {
        PolarsError::ComputeError("DataFrame must contain at least one datetime column".into())
    })?;

    if let Some(ref selected_columns) = params.selected_columns {
        let requested: std::collections::HashSet<&str> = selected_columns
            .iter()
            .map(|name| name.trim())
            .filter(|name| !name.is_empty())
            .collect();

        if !requested.is_empty() {
            let mut keep: Vec<PlSmallStr> = Vec::new();
            for name in df.get_column_names().iter() {
                let name_str = name.as_str();
                if requested.contains(name_str) {
                    keep.push(name_str.to_string().into());
                }
            }

            if !keep.iter().any(|name| name.as_str() == old_name.as_str()) {
                keep.push(old_name.clone().into());
            }

            if keep.len() < df.width() {
                df = df.select(keep)?;
            }
        }
    }

    let has_numeric = df.dtypes().iter().any(|dt: &DataType| dt.is_numeric());

    if !has_numeric {
        return Err(PolarsError::ComputeError(
            "DataFrame must contain at least one numeric column".into(),
        ));
    }

    // If the time column is not already a datetime type, cast it
    let time_col_idx = df
        .get_column_names()
        .iter()
        .position(|name| name.as_str() == old_name.as_str())
        .ok_or_else(|| PolarsError::ComputeError("Time column not found".into()))?;

    let time_col_dtype = &df.dtypes()[time_col_idx];
    let needs_cast = !matches!(time_col_dtype, DataType::Datetime(_, _) | DataType::Date);

    // Rename the time column to "ts" and cast if needed
    if old_name != "ts" {
        df.rename(old_name.as_str().into(), "ts".into())?;
    }

    // Apply casting if needed
    let ts_series = df
        .column("ts")
        .map(|col| col.as_materialized_series().clone())?;
    let ts_numeric_normalizer = if matches!(
        ts_series.dtype(),
        DataType::Int64 | DataType::Int32 | DataType::UInt64 | DataType::UInt32
    ) {
        let casted = ts_series.cast(&DataType::Int64)?;
        let ints = casted.i64()?;
        let mut max_abs = 0i64;
        for value in ints.into_iter().flatten() {
            let abs_v = value.saturating_abs();
            if abs_v > max_abs {
                max_abs = abs_v;
            }
        }

        if max_abs > 0 {
            if max_abs < 100_000_000_000 {
                // Seconds -> milliseconds
                Some((1000i64, 1i64))
            } else if max_abs >= 100_000_000_000_000_000 {
                // Nanoseconds -> milliseconds
                Some((1i64, 1_000_000i64))
            } else if max_abs >= 100_000_000_000_000 {
                // Microseconds -> milliseconds
                Some((1i64, 1_000i64))
            } else {
                // Assume milliseconds already.
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    let mut lf = df.lazy();
    if needs_cast {
        let mut ts_expr = col("ts").cast(DataType::Int64);
        if let Some((mul, div)) = ts_numeric_normalizer {
            if mul != 1 {
                ts_expr = ts_expr * lit(mul);
            }
            if div != 1 {
                ts_expr = ts_expr / lit(div);
            }
        }
        lf = lf.with_column(
            ts_expr
                .cast(DataType::Datetime(TimeUnit::Milliseconds, None))
                .alias("ts"),
        );
    } else {
        lf = lf.with_column(
            col("ts")
                .cast(DataType::Datetime(TimeUnit::Milliseconds, None))
                .alias("ts"),
        );
    }

    // Apply optional time filtering + ensure a consistent ts dtype.
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

    // LTTB requires data to be sorted by X
    df = lf.sort(["ts"], SortMultipleOptions::default()).collect()?;

    if df.height() == 0 {
        return Err(PolarsError::ComputeError(
            "No rows loaded for the selected time range. Widen the time range or remove time filters.".into(),
        ));
    }

    Ok(df)
}

#[cfg(test)]
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
