use polars::prelude::*;
use std::path::Path;

pub fn load_dataframe<P: AsRef<Path>>(path: P) -> PolarsResult<DataFrame> {
    load_dataframe_partial(path, None, 0, None, None, None)
}

/// Load a DataFrame with optional row-level limits.
/// - `n_rows`   – cap the total number of rows ingested (None = all rows)
/// - `skip_rows`– skip this many rows before reading (0 = no skip)
pub fn load_dataframe_partial<P: AsRef<Path>>(
    path: P,
    n_rows: Option<usize>,
    skip_rows: usize,
    time_start_ms: Option<i64>,
    time_end_ms: Option<i64>,
    selected_columns: Option<&[String]>,
) -> PolarsResult<DataFrame> {
    let path_ref = path.as_ref();
    let is_parquet = path_ref.extension().map_or(false, |ext| ext == "parquet");

    let mut df = if is_parquet {
        let args = ScanArgsParquet::default();
        let lf = LazyFrame::scan_parquet(path_ref.to_str().unwrap().into(), args)?;
        let collected = lf.collect()?;
        let height = collected.height();
        if skip_rows >= height {
            DataFrame::empty()
        } else {
            let after_skip = collected.slice(skip_rows as i64, height - skip_rows);
            if let Some(limit) = n_rows {
                after_skip.slice(0, limit)
            } else {
                after_skip
            }
        }
    } else {
        let mut reader = LazyCsvReader::new(path_ref.to_str().unwrap().into())
            .with_try_parse_dates(true)
            .with_skip_rows(skip_rows);
        if let Some(n) = n_rows {
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

    for (i, dt) in dtypes.iter().enumerate() {
        if time_col_name.is_none() && matches!(dt, DataType::Datetime(_, _) | DataType::Date) {
            time_col_name = Some(col_names[i].to_string());
        }
    }

    let old_name = time_col_name.ok_or_else(|| {
        PolarsError::ComputeError("DataFrame must contain at least one datetime column".into())
    })?;

    if let Some(selected_columns) = selected_columns {
        let requested: std::collections::HashSet<&str> = selected_columns
            .iter()
            .map(|name| name.trim())
            .filter(|name| !name.is_empty())
            .collect();

        if !requested.is_empty() {
            let mut keep: Vec<PlSmallStr> = Vec::new();
            for name in df.get_column_names() {
                let name_str = name.as_str();
                if requested.contains(name_str) {
                    keep.push(name.clone());
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

    let has_numeric = df.dtypes().iter().any(|dt| dt.is_numeric());

    if !has_numeric {
        return Err(PolarsError::ComputeError(
            "DataFrame must contain at least one numeric column".into(),
        ));
    }

    if old_name != "ts" {
        df.rename(old_name.as_str().into(), "ts".into())?;
    }

    // Apply optional time filtering + ensure a consistent ts dtype.
    let mut lf = df.lazy().with_column(
        col("ts")
            .cast(DataType::Datetime(TimeUnit::Milliseconds, None))
            .alias("ts"),
    );

    if let Some(start_ms) = time_start_ms {
        lf = lf.filter(
            col("ts").gt_eq(lit(start_ms).cast(DataType::Datetime(TimeUnit::Milliseconds, None))),
        );
    }
    if let Some(end_ms) = time_end_ms {
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
        let selected = vec!["value".to_string()];

        let df = load_dataframe_partial(&path, Some(2), 0, None, None, Some(&selected))
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
        let err = load_dataframe_partial(&path, None, 0, None, None, None).unwrap_err();
        assert!(err.to_string().contains("datetime column"));
    }
}
