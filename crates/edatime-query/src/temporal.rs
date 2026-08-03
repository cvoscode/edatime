//! Temporal column normalization helpers.
//!
//! Used by both the upload preview path and the ingest path to keep
//! `datetime[μs]`, `datetime[ns]`, and `Date` columns aligned with the
//! canonical `datetime[ms]` representation that the rest of the
//! pipeline assumes. Without this normalization, a dataset's preview
//! metadata can report one unit while the post-ingest metadata reports
//! another (audit issue 4.1).

use polars::prelude::*;

/// Normalize every temporal column (`Datetime(_, _) | Date`) in the
/// given LazyFrame to `Datetime(Milliseconds, None)`. Polars' Datetime
/// cast rescales the underlying integer automatically (e.g. μs → ms
/// divides by 1000). For `Date` columns (days since epoch) we go
/// through Int64 so the rescaling is explicit.
pub fn normalize_temporal_columns_to_ms(lf: LazyFrame) -> LazyFrame {
    let schema = match lf.clone().collect_schema() {
        Ok(s) => s,
        Err(_) => return lf,
    };
    let mut lf = lf;
    for (name, dtype) in schema.iter() {
        let needs_normalize = matches!(dtype, DataType::Datetime(_, _) | DataType::Date)
            && !matches!(dtype, DataType::Datetime(TimeUnit::Milliseconds, None));
        if !needs_normalize {
            continue;
        }
        let new_expr = match dtype {
            // Polars rescales Datetime casts automatically.
            DataType::Datetime(_, _) => {
                col(name.as_str()).cast(DataType::Datetime(TimeUnit::Milliseconds, None))
            }
            // Date is days since epoch. Cast through Int64 to make
            // the unit conversion explicit.
            DataType::Date => col(name.as_str())
                .cast(DataType::Int64)
                .cast(DataType::Datetime(TimeUnit::Milliseconds, None)),
            _ => col(name.as_str()).cast(DataType::Datetime(TimeUnit::Milliseconds, None)),
        };
        lf = lf.with_column(new_expr.alias(name.as_str()));
    }
    lf
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_microseconds_to_milliseconds() {
        let ts_us: Vec<i64> = vec![
            1_700_000_000_000_000, // 1.7e15 us
            1_700_000_100_000_000,
        ];
        let xs: Vec<f64> = vec![10.0, 20.0];
        let ts_series = Series::new("ts".into(), ts_us)
            .cast(&DataType::Datetime(TimeUnit::Microseconds, None))
            .expect("cast us ts");
        let df = DataFrame::new(
            2,
            vec![ts_series.into(), Series::new("x".into(), xs).into()],
        )
        .expect("build df");
        let lf = normalize_temporal_columns_to_ms(df.lazy());
        let collected = lf.collect().expect("collect after normalize");
        let dtype = collected.column("ts").expect("ts column").dtype().clone();
        assert!(
            matches!(dtype, DataType::Datetime(TimeUnit::Milliseconds, None)),
            "ts must be normalized to datetime[ms], got {dtype:?}"
        );
    }

    #[test]
    fn normalize_passthrough_when_already_ms() {
        let ts_ms: Vec<i64> = vec![1_700_000_000_000_i64, 1_700_000_100_000_i64];
        let ts_series = Series::new("ts".into(), ts_ms)
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .expect("cast ms ts");
        let df = DataFrame::new(2, vec![ts_series.into()]).expect("build df");
        let lf = normalize_temporal_columns_to_ms(df.lazy());
        let collected = lf.collect().expect("collect after normalize");
        let dtype = collected.column("ts").unwrap().dtype().clone();
        assert!(matches!(
            dtype,
            DataType::Datetime(TimeUnit::Milliseconds, None)
        ));
    }
}
