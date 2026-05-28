# crates/edatime-query/src/downsample.rs
> LTTB downsampling for xy pairs and DataFrames.

## Functions
- `pub fn downsample_xy_pairs(x_vals: &[f64], y_vals: &[f64], color_vals: Option<&[f64]>, target_points: usize) -> (Vec<f64>, Vec<f64>, Option<Vec<f64>>)`
  - LTTB downsampling for scatter data with optional color.
- `pub fn downsample_dataframe_multi(df: &DataFrame, ts_col: &str, value_cols: &[&str], extra_cols: &[&str], target_points: usize) -> PolarsResult<DataFrame>`
  - LTTB downsampling for DataFrame with multiple value columns.