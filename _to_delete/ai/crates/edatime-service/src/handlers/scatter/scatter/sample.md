# crates/edatime-service/src/handlers/scatter/scatter/sample.rs
> Scatter sampling — LTTB downsampling of scatter points.

## Struct: SampledScatterRow
- `{ x: f64, y: f64, color_value: Option<f64>, color_label: Option<String>, size_value: Option<f64> }`

## Enum: ScatterColorKind
- `ScatterColorKind::Continuous`
- `ScatterColorKind::Categorical`

## Function
- `pub(super) fn collect_sampled_xyc_rows(df: &DataFrame, x: &str, y: &str, color: Option<&str>, size: Option<&str>, _limit: usize, effective_limit: usize) -> Result<(usize, Vec<SampledScatterRow>, Option<ScatterColorKind>), AppError>`
  - Sample scatter points with LTTB downsampling.