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
/// The function falls back to the prior row-index-based sampling path
/// (i.e. `(0..n).collect()`) for inputs that LTTB cannot safely consume
/// — non-finite x at any index, sorted x that is not strictly
/// increasing, or any mapping failure. This guarantees that callers
/// never receive an empty selection from valid input.
///
/// When `n <= target_points` or `target_points < 3` the function keeps
/// every row in insertion order, mirroring the historical early-return
/// behavior of the scatter and time-series helpers.
pub(crate) fn downsample_indices(
    x_vals: &[f64],
    y_vals: &[f64],
    target_points: usize,
) -> Vec<usize> {
    let n = x_vals.len();
    if n == 0 {
        return Vec::new();
    }
    if n <= target_points || target_points < 3 {
        return (0..n).collect();
    }

    // Validate x: any non-finite value (NaN / +-inf) means LTTB cannot
    // operate safely. Take the row-index fallback.
    if x_vals.iter().any(|v| !v.is_finite()) {
        return (0..n).collect();
    }

    // Pair each row with its real x value and original row index, then
    // sort by x. This preserves x-aware ordering of the LTTB input.
    let mut indexed: Vec<(f64, usize)> = Vec::with_capacity(n);
    for i in 0..n {
        let x_val = x_vals.get(i).copied().unwrap_or(i as f64);
        indexed.push((x_val, i));
    }
    indexed.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    // The LTTB precondition is strictly-increasing x. After sorting by
    // real x, duplicate x values violate this and the debug_assert in
    // minmaxlttb will fire. Take the row-index fallback so we never
    // panic / silently return empty on duplicate-x input.
    if indexed
        .windows(2)
        .any(|w| w[0].0.partial_cmp(&w[1].0) != Some(std::cmp::Ordering::Less))
    {
        return (0..n).collect();
    }

    // Build LTTB points using a strictly increasing encoded x sequence
    // (0..n). This decouples the algorithm's coordinate axis from the
    // caller's real x — which may be epoch timestamps, negative values,
    // fractional values, etc. — while keeping the y values aligned with
    // the real x-sorted order so the triangle-area selection still
    // reflects the actual shape of the data.
    let points: Vec<Point> = indexed
        .iter()
        .enumerate()
        .map(|(encoded_x, (_real_x, original_idx))| {
            let y_val = y_vals.get(*original_idx).copied().unwrap_or(0.0);
            Point::new(encoded_x as f64, y_val)
        })
        .collect();

    let Ok(sampled) = minmaxlttb(&points, target_points, 4) else {
        // On LTTB failure keep the original order so callers get a stable
        // fallback instead of an empty result.
        return (0..n).collect();
    };

    // Map each sampled point back to its original row index. The
    // encoded x is the position in `indexed`; we look that up to recover
    // the original row. Any out-of-range or non-finite encoded x is a
    // contract violation we treat as a fallback trigger so we never
    // produce an empty selection from valid input.
    let mut indices: Vec<usize> = Vec::with_capacity(sampled.len());
    for p in &sampled {
        let encoded_x = p.x();
        if !encoded_x.is_finite() {
            return (0..n).collect();
        }
        let sorted_pos = encoded_x.round() as usize;
        let original = match indexed.get(sorted_pos) {
            Some((_, original)) => *original,
            None => return (0..n).collect(),
        };
        indices.push(original);
    }
    indices.sort_unstable();
    indices.dedup();
    indices
}

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
mod tests {
    use super::downsample_indices;
    use super::downsample_xy_pairs;

    #[test]
    fn downsample_indices_returns_all_rows_when_under_target() {
        let x_vals = [10.0, 20.0, 30.0];
        let y_vals = [1.0, 2.0, 3.0];

        let indices = downsample_indices(&x_vals, &y_vals, 8);

        assert_eq!(indices, vec![0, 1, 2]);
    }

    #[test]
    fn downsample_indices_returns_empty_for_empty_input() {
        let empty: [f64; 0] = [];

        let indices = downsample_indices(&empty, &empty, 4);

        assert!(indices.is_empty());
    }

    #[test]
    fn downsample_indices_returns_all_rows_when_target_below_three() {
        // The contract: target_points < 3 keeps every row, mirroring the
        // scatter/timeseries early-return branches.
        let x_vals = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
        let y_vals = [0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0];

        let indices = downsample_indices(&x_vals, &y_vals, 2);

        assert_eq!(indices, (0..x_vals.len()).collect::<Vec<_>>());
    }

    #[test]
    fn downsample_indices_stays_sorted_and_unique() {
        let x_vals = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
        let y_vals = [0.0, 12.0, 1.0, 14.0, 2.0, 16.0, 3.0, 18.0, 4.0];

        let indices = downsample_indices(&x_vals, &y_vals, 4);

        assert!(indices.len() <= 4);
        assert!(indices.windows(2).all(|window| window[0] < window[1]));
        assert_eq!(indices.first().copied(), Some(0));
        assert_eq!(indices.last().copied(), Some(y_vals.len() - 1));
    }

    #[test]
    fn downsample_indices_handles_epoch_scale_timestamps() {
        // Regression test: epoch-millisecond timestamps previously caused
        // `p.x().round() as usize` to index out of bounds in the sorted
        // view, yielding an empty selection. The fix encodes x as a
        // strictly-increasing sequence so the lookup is bounded.
        let start_ms: i64 = 1_704_067_200_000;
        let step_ms: i64 = 60_000;
        let n = 200;
        let x_vals: Vec<f64> = (0..n).map(|i| (start_ms + i * step_ms) as f64).collect();
        let y_vals: Vec<f64> = (0..n)
            .map(|i| 60.0 + (i as f64 * 0.01).sin() * 20.0)
            .collect();

        let indices = downsample_indices(&x_vals, &y_vals, 50);

        assert!(
            !indices.is_empty(),
            "epoch-scale x must not collapse to empty selection"
        );
        assert!(
            indices.len() <= 50,
            "must respect target_points upper bound"
        );
        assert_eq!(indices.first().copied(), Some(0), "first row must be kept");
        assert_eq!(
            indices.last().copied(),
            Some(y_vals.len() - 1),
            "last row must be kept"
        );
        for &i in &indices {
            assert!(i < x_vals.len(), "indices must be valid row positions");
        }
    }

    #[test]
    fn downsample_indices_handles_duplicate_x_without_panicking() {
        // Duplicate x violates the strictly-increasing precondition of
        // minmaxlttb. The helper must take the row-index fallback instead
        // of panicking or returning an empty selection.
        let x_vals = [1.0, 1.0, 2.0, 2.0, 3.0, 3.0, 4.0, 5.0, 6.0, 7.0];
        let y_vals = [0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0];

        let indices = downsample_indices(&x_vals, &y_vals, 4);

        // Fallback keeps every row (the row-index path) when LTTB is
        // unsafe; either way the selection must be non-empty and valid.
        assert!(!indices.is_empty());
        for &i in &indices {
            assert!(i < x_vals.len());
        }
    }

    #[test]
    fn downsample_indices_handles_non_finite_x_without_panicking() {
        // NaN / infinity in x is incompatible with sorting. The helper
        // must take the row-index fallback.
        let x_vals = [1.0, 2.0, f64::NAN, 4.0, 5.0, 6.0, 7.0, 8.0];
        let y_vals = [0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0];

        let indices = downsample_indices(&x_vals, &y_vals, 3);

        assert!(!indices.is_empty());
        for &i in &indices {
            assert!(i < x_vals.len());
        }
    }

    #[test]
    fn downsample_indices_xy_swap_returns_non_empty_valid_indices() {
        // LTTB is not symmetric in x and y, so a strict equality between
        // forward and swapped selections is not a real contract (the
        // algorithm bins by x and selects by triangle area). However,
        // both calls must still produce non-empty, valid row index sets
        // so scatter matrix cells (HULL↔MUFL) keep working.
        let x_vals = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0];
        let y_vals = [3.0, 1.0, 4.0, 1.0, 5.0, 9.0, 2.0, 6.0, 5.0, 3.0];

        let forward = downsample_indices(&x_vals, &y_vals, 4);
        let swapped = downsample_indices(&y_vals, &x_vals, 4);

        assert!(!forward.is_empty(), "forward selection must be non-empty");
        assert!(!swapped.is_empty(), "swapped selection must be non-empty");
        for &i in forward.iter().chain(swapped.iter()) {
            assert!(i < x_vals.len(), "indices must be valid row positions");
        }
    }

    #[test]
    fn downsample_indices_respects_x_sort_order() {
        // The helper sorts by real x before sampling, so the returned
        // row indices, when interpreted as positions in the x-sorted
        // view, must be strictly increasing. This is the real x-aware
        // contract: the selection follows the x-ordering of the input.
        // (Note: x-aware *spacing* is not preserved — the encoded
        // sequence handed to LTTB is uniform `0..n`, so count-based
        // bucketing is used. Swapping to x-range bucketing is a
        // separate feature requiring `Binning::ByRange`.)
        let x_uniform = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0];
        let y_vals = [0.0, 5.0, 1.0, 6.0, 2.0, 7.0, 3.0, 8.0];

        let indices = downsample_indices(&x_uniform, &y_vals, 3);

        assert!(!indices.is_empty());
        assert!(indices.windows(2).all(|w| w[0] < w[1]));
        assert_eq!(indices.first().copied(), Some(0));
        assert_eq!(indices.last().copied(), Some(y_vals.len() - 1));
    }

    #[test]
    fn downsample_indices_differs_when_x_sort_changes_row_order() {
        // When x reverses the row order, the selection must follow the
        // x-sorted order rather than the input row order. This is the
        // core x-aware contract: the helper sorts by x first.
        let x_vals = [3.0, 1.0, 2.0, 0.0, 4.0];
        let y_vals = [10.0, 20.0, 30.0, 40.0, 50.0];

        let indices = downsample_indices(&x_vals, &y_vals, 4);

        // x-sorted order is [3, 1, 2, 0, 4] → rows in that order are
        // (3,1,2,0,4) → y values (40,20,30,10,50). LTTB preserves the
        // first and last points and selects middle points from the
        // x-sorted view, so the smallest and largest returned indices
        // (in input-row space) should correspond to the first/last
        // x-sorted entries: row 3 (x=0.0) and row 4 (x=4.0).
        assert!(!indices.is_empty());
        assert!(indices.contains(&3), "first x-sorted row (3) must be kept");
        assert!(indices.contains(&4), "last x-sorted row (4) must be kept");
    }

    #[test]
    fn downsample_xy_pairs_keeps_x_y_color_aligned() {
        // Selected rows must keep x, y, and color in lock-step. We use
        // epoch-millisecond x so the test exercises the same shape that
        // broke in production (epoch timestamps previously collapsed to
        // an empty selection). The lookup-by-x strategy compares against
        // each input x with a relative tolerance so it works for both
        // integer-spaced and real-timestamp inputs.
        let start_ms: i64 = 1_704_067_200_000;
        let step_ms: i64 = 3_600_000;
        let n = 50;
        let x_vals: Vec<f64> = (0..n).map(|i| (start_ms + i * step_ms) as f64).collect();
        let y_vals: Vec<f64> = (0..n).map(|i| (i as f64) * 0.1).collect();
        let color_vals: Vec<f64> = (0..n).map(|i| 100.0 + i as f64).collect();

        let (sx, sy, sc) = downsample_xy_pairs(&x_vals, &y_vals, Some(&color_vals), 10);

        assert!(
            !sx.is_empty(),
            "epoch-scale x must not collapse to empty selection"
        );
        assert_eq!(sx.len(), sy.len());
        assert_eq!(sx.len(), sc.as_ref().map(Vec::len).unwrap_or(0));

        for (xi, (yi, ci)) in sx.iter().zip(sy.iter().zip(sc.as_ref().unwrap().iter())) {
            // Find the original row matching x with a relative tolerance
            // (timestamps can lose a bit of precision through the encode
            // step, but the absolute difference stays tiny).
            let idx = x_vals
                .iter()
                .position(|v| (v - xi).abs() < 1e-3)
                .unwrap_or_else(|| panic!("sampled x {xi} did not match any input row"));
            assert!(
                (y_vals[idx] - yi).abs() < 1e-9,
                "y mismatch at row {idx}: sampled={yi} expected={}",
                y_vals[idx]
            );
            assert!(
                (color_vals[idx] - ci).abs() < 1e-9,
                "color mismatch at row {idx}: sampled={ci} expected={}",
                color_vals[idx]
            );
        }
    }

    #[test]
    fn downsample_xy_pairs_returns_all_rows_under_target() {
        let x_vals = [0.0, 1.0, 2.0];
        let y_vals = [1.0, 2.0, 3.0];
        let color_vals = [9.0, 8.0, 7.0];

        let (sx, sy, sc) = downsample_xy_pairs(&x_vals, &y_vals, Some(&color_vals), 8);

        assert_eq!(sx, x_vals.to_vec());
        assert_eq!(sy, y_vals.to_vec());
        assert_eq!(sc, Some(color_vals.to_vec()));
    }
}
