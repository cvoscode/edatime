use polars::prelude::*;
use std::path::Path;

pub fn load_dataframe<P: AsRef<Path>>(path: P) -> PolarsResult<DataFrame> {
    load_dataframe_partial(path, None, 0, None, None)
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
            "No rows loaded for the selected partial range. Reduce skip_rows or increase n_rows.".into(),
        ));
    }

    let col_names = df.get_column_names();
    let dtypes = df.dtypes();

    let mut time_col_name = None;
    let mut has_numeric = false;

    for (i, dt) in dtypes.iter().enumerate() {
        if time_col_name.is_none() && matches!(dt, DataType::Datetime(_, _) | DataType::Date) {
            time_col_name = Some(col_names[i].to_string());
        }
        if dt.is_numeric() {
            has_numeric = true;
        }
    }

    let old_name = time_col_name.ok_or_else(|| {
        PolarsError::ComputeError(
            "DataFrame must contain at least one datetime column".into(),
        )
    })?;

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
