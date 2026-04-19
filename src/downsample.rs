use minmaxlttb::{Point, minmaxlttb};
use polars::prelude::*;

pub fn downsample_dataframe_multi(
    df: &DataFrame,
    ts_col: &str,
    value_cols: &[&str],
    extra_cols: &[&str],
    target_points: usize,
) -> PolarsResult<DataFrame> {
    if df.height() <= target_points || target_points < 3 {
        let mut cols = vec![ts_col];
        cols.extend_from_slice(value_cols);
        cols.extend_from_slice(extra_cols);
        return df.select(cols);
    }

    let primary_y_col = value_cols[0];
    let y_series = df.column(primary_y_col)?.as_materialized_series();
    let y_chunked = y_series.cast(&DataType::Float64)?;
    let y_f64 = y_chunked.f64()?;

    let mut points: Vec<Point> = Vec::with_capacity(df.height());
    for (idx, y) in y_f64.into_iter().enumerate() {
        let x_val = idx as f64;
        let y_val = y.unwrap_or(0.0);
        points.push(Point::new(x_val, y_val));
    }

    let downsampled_points = minmaxlttb(&points, target_points, 4)
        .map_err(|e| PolarsError::ComputeError(format!("Downsampling error: {:?}", e).into()))?;

    let mut selected_rows: Vec<u32> = downsampled_points
        .iter()
        .map(|p| p.x().round() as usize)
        .filter(|idx| *idx < df.height())
        .map(|idx| idx as u32)
        .collect();

    selected_rows.sort_unstable();
    selected_rows.dedup();

    let mut cols = vec![ts_col];
    cols.extend_from_slice(value_cols);
    cols.extend_from_slice(extra_cols);

    let idx_ca = IdxCa::new("idx".into(), &selected_rows);
    let out_df = df.select(cols)?.take(&idx_ca)?;

    Ok(out_df)
}
