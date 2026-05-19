use minmaxlttb::{Point, minmaxlttb};
use polars::prelude::*;

pub fn downsample_xy_pairs(
    x_vals: &[f64],
    y_vals: &[f64],
    color_vals: Option<&[f64]>,
    target_points: usize,
) -> (Vec<f64>, Vec<f64>, Option<Vec<f64>>) {
    let n = x_vals.len();
    if n <= target_points || target_points < 3 {
        let out_x = x_vals.to_vec();
        let out_y = y_vals.to_vec();
        let out_color = color_vals.map(|c| c.to_vec());
        return (out_x, out_y, out_color);
    }

    let mut points: Vec<Point> = Vec::with_capacity(n);
    for (i, y) in y_vals.iter().enumerate().take(n) {
        points.push(Point::new(i as f64, *y));
    }

    let sampled = match minmaxlttb(&points, target_points, 4) {
        Ok(s) => s,
        Err(_) => return (x_vals.to_vec(), y_vals.to_vec(), color_vals.map(|c| c.to_vec())),
    };

    let mut out_x = Vec::with_capacity(sampled.len());
    let mut out_y = Vec::with_capacity(sampled.len());
    let mut out_color: Option<Vec<f64>> = color_vals.map(|_| Vec::with_capacity(sampled.len()));

    for p in sampled {
        let idx = p.x().round() as usize;
        if idx < n {
            out_x.push(x_vals[idx]);
            out_y.push(y_vals[idx]);
            if let Some(ref mut c) = out_color && let Some(vals) = color_vals {
                c.push(vals[idx]);
            }
        }
    }

    (out_x, out_y, out_color)
}

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
