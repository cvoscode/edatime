use minmaxlttb::{Point, minmaxlttb};
use polars::prelude::*;

/// Run LTTB over `(x, y)` pairs and return the sorted, deduplicated row
/// indices of the kept samples.
///
/// The function separates *sampling coordinates* (used by LTTB) from
/// *row lookup keys* (used to recover original rows):
///
/// 1. Pair each row with its real `x` value and original row index, then
///    sort by `x`. This preserves x-aware ordering of the LTTB input.
/// 2. Hand LTTB a strictly increasing encoded x sequence (`0..n`) so the
///    `points.windows(2).all(|w| w[0].x() < w[1].x())` precondition is
///    satisfied even when the real `x` has duplicates, NaNs, or
///    negative / fractional values. The y value at each position is the
///    y from the corresponding sorted-by-x row.
/// 3. After sampling, each sampled point's encoded x is its position in
///    the sorted view; look that position up in the sorted-by-x array to
///    recover the original row index.
///
/// The function uses a bounded, evenly-spaced fallback for inputs that
/// LTTB cannot safely consume — non-finite x/y values, duplicate x values,
/// or a mapping failure. This preserves the response cap for very long
/// series: one malformed point must not turn a 2,000-point chart request
/// into a multi-million-row response.
///
/// When `n <= target_points` or `target_points < 3` the function keeps
/// every row in insertion order, mirroring the historical early-return
/// behavior of the scatter and time-series helpers.
pub fn downsample_indices(x_vals: &[f64], y_vals: &[f64], target_points: usize) -> Vec<usize> {
    // Every selected index is consumed as an x/y pair by callers. Restrict
    // the domain to the shared prefix so malformed input slices cannot make
    // a later projection produce misaligned arrays.
    let n = x_vals.len().min(y_vals.len());
    if n == 0 {
        return Vec::new();
    }
    if n <= target_points || target_points < 3 {
        return (0..n).collect();
    }

    // LTTB's area calculations cannot represent NaN / infinity safely.
    // Keep a bounded stride sample instead of injecting 0.0 (which creates
    // artificial spikes) or returning every input row.
    if x_vals[..n].iter().any(|v| !v.is_finite()) || y_vals[..n].iter().any(|v| !v.is_finite()) {
        return evenly_spaced_indices(n, target_points);
    }

    // A normal time series is already strictly sorted by timestamp. Avoid
    // allocating and sorting an `(x, row_index)` vector in that dominant
    // case; this removes O(n log n) work and one large temporary allocation
    // from very long time-series requests.
    if x_vals[..n].windows(2).all(|window| window[0] < window[1]) {
        let points: Vec<Point> = y_vals[..n]
            .iter()
            .enumerate()
            .map(|(index, &y)| Point::new(index as f64, y))
            .collect();
        return decode_lttb_positions(&points, target_points)
            .unwrap_or_else(|| evenly_spaced_indices(n, target_points));
    }

    // Unordered x values still need a sorted sampling view. Keep the row
    // lookup separately so sampled positions can be mapped to input rows.
    let mut indexed: Vec<(f64, usize)> = (0..n).map(|index| (x_vals[index], index)).collect();
    indexed.sort_by(|a, b| a.0.total_cmp(&b.0));
    if indexed.windows(2).any(|window| window[0].0 >= window[1].0) {
        return evenly_spaced_indices(n, target_points);
    }

    let points: Vec<Point> = indexed
        .iter()
        .enumerate()
        .map(|(encoded_x, (_, original_idx))| Point::new(encoded_x as f64, y_vals[*original_idx]))
        .collect();
    let Some(positions) = decode_lttb_positions(&points, target_points) else {
        return evenly_spaced_indices(n, target_points);
    };
    let mut indices: Vec<usize> = positions
        .into_iter()
        .map(|position| indexed[position].1)
        .collect();
    indices.sort_unstable();
    indices.dedup();
    indices
}

/// Decode `minmaxlttb`'s encoded, integer x coordinates back into positions.
/// `None` means the library returned a value outside that internal contract.
fn decode_lttb_positions(points: &[Point], target_points: usize) -> Option<Vec<usize>> {
    let sampled = minmaxlttb(points, target_points, 4).ok()?;
    let mut positions = Vec::with_capacity(sampled.len());
    for point in sampled {
        let encoded_x = point.x();
        if !encoded_x.is_finite() || encoded_x < 0.0 || encoded_x >= points.len() as f64 {
            return None;
        }
        let position = encoded_x as usize;
        if encoded_x != position as f64 {
            return None;
        }
        positions.push(position);
    }
    positions.sort_unstable();
    positions.dedup();
    Some(positions)
}

/// Produce exactly `min(n, target_points)` monotonically increasing indices,
/// including both endpoints. Used only when shape-preserving LTTB is unsafe.
fn evenly_spaced_indices(n: usize, target_points: usize) -> Vec<usize> {
    debug_assert!(n > target_points && target_points >= 3);
    let last = n - 1;
    let denominator = target_points - 1;
    (0..target_points)
        .map(|slot| slot * last / denominator)
        .collect()
}

/// Top up a sorted, deduplicated set of indices so the final length is
/// at least `target`. Excess entries are filled by deterministic stride
/// from the remaining candidate range `[0, candidate_count)`, skipping
/// any index that is already present in `indices`.
///
/// `minmaxlttb` can return slightly fewer points than requested because
/// the algorithm collapses duplicate x values via `sort_unstable() +
/// dedup()`. This helper preserves LTTB's choices (those indices stay
/// in the result) and only adds more rows from the unused range to hit
/// the contract. Deterministic stride (no randomness) keeps analyses
/// reproducible across calls.
pub fn pad_to_limit(indices: Vec<usize>, candidate_count: usize, target: usize) -> Vec<usize> {
    if target == 0 || candidate_count == 0 {
        return Vec::new();
    }
    let mut out: Vec<usize> = indices;
    out.sort_unstable();
    out.dedup();
    if out.len() >= target {
        return out;
    }
    let already: std::collections::HashSet<usize> = out.iter().copied().collect();
    let needed = target - out.len();
    // We have candidate_count total slots. We want to pick `needed` more
    // uniformly from the slots that aren't already in `out`. The stride
    // is computed so that the new picks are evenly distributed across
    // the candidate range, weighted by the empty slots.
    let empty = candidate_count.saturating_sub(already.len());
    if empty == 0 {
        return out;
    }
    let stride = (empty as f64 / needed as f64).ceil() as usize;
    let stride = stride.max(1);
    let mut picked = 0usize;
    let mut cursor = 0usize;
    while picked < needed && cursor < candidate_count {
        if !already.contains(&cursor) {
            out.push(cursor);
            picked += 1;
        }
        cursor += stride;
        if cursor >= candidate_count && picked < needed {
            // Wrap and pick remaining empties.
            cursor = 0;
            // Keep going; the `already` set guards against duplicates.
        }
    }
    out.sort_unstable();
    out
}

pub fn downsample_xy_pairs(
    x_vals: &[f64],
    y_vals: &[f64],
    color_vals: Option<&[f64]>,
    target_points: usize,
) -> (Vec<f64>, Vec<f64>, Option<Vec<f64>>) {
    let n = x_vals.len().min(y_vals.len());
    let x_vals = &x_vals[..n];
    let y_vals = &y_vals[..n];
    // A partial color vector cannot remain aligned with selected xy rows.
    // Drop that optional channel rather than returning unequal output arrays.
    let color_vals = color_vals
        .filter(|values| values.len() >= n)
        .map(|values| &values[..n]);
    if n <= target_points || target_points < 3 {
        let out_x = x_vals.to_vec();
        let out_y = y_vals.to_vec();
        let out_color = color_vals.map(|c| c.to_vec());
        return (out_x, out_y, out_color);
    }

    let indices = downsample_indices(x_vals, y_vals, target_points);

    let mut out_x = Vec::with_capacity(indices.len());
    let mut out_y = Vec::with_capacity(indices.len());
    let mut out_color: Option<Vec<f64>> = color_vals.map(|_| Vec::with_capacity(indices.len()));

    for idx in indices {
        if let Some(xv) = x_vals.get(idx) {
            out_x.push(*xv);
        }
        if let Some(yv) = y_vals.get(idx) {
            out_y.push(*yv);
        }
        if let (Some(c), Some(vals)) = (out_color.as_mut(), color_vals)
            && let Some(v) = vals.get(idx)
        {
            c.push(*v);
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

    let ts_series = df.column(ts_col)?.as_materialized_series();
    let ts_chunked = ts_series.cast(&DataType::Float64)?;
    let ts_f64 = ts_chunked.f64()?;

    let mut x_vals: Vec<f64> = Vec::with_capacity(df.height());
    let mut y_vals: Vec<f64> = Vec::with_capacity(df.height());
    for (idx, y) in y_f64.into_iter().enumerate() {
        let x_val = ts_f64.get(idx).unwrap_or(idx as f64);
        let y_val = y.unwrap_or(0.0);
        x_vals.push(x_val);
        y_vals.push(y_val);
    }

    let indices = downsample_indices(&x_vals, &y_vals, target_points);

    let selected_rows: Vec<u32> = indices.into_iter().map(|idx| idx as u32).collect();

    let mut cols = vec![ts_col];
    cols.extend_from_slice(value_cols);
    cols.extend_from_slice(extra_cols);

    let idx_ca = IdxCa::new("idx".into(), &selected_rows);
    let out_df = df.select(cols)?.take(&idx_ca)?;

    Ok(out_df)
}

#[cfg(test)]
mod tests;
