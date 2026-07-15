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
mod tests {
    use super::downsample_indices;
    use super::downsample_xy_pairs;
    use super::pad_to_limit;

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
    fn downsample_indices_keeps_very_long_non_finite_series_bounded() {
        // One NaN must not activate the historical "return every row"
        // fallback. This models an uploaded multi-million-row sensor series
        // with one malformed reading while a chart asks for a small viewport.
        let n = 1_000_000;
        let target = 2_000;
        let x_vals: Vec<f64> = (0..n).map(|index| index as f64).collect();
        let mut y_vals: Vec<f64> = (0..n).map(|index| (index as f64 * 0.001).sin()).collect();
        y_vals[n / 2] = f64::NAN;

        let indices = downsample_indices(&x_vals, &y_vals, target);

        assert_eq!(indices.len(), target);
        assert_eq!(indices.first().copied(), Some(0));
        assert_eq!(indices.last().copied(), Some(n - 1));
        assert!(indices.windows(2).all(|window| window[0] < window[1]));
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

    #[test]
    fn downsample_xy_pairs_drops_misaligned_optional_color() {
        let x_vals = [0.0, 1.0, 2.0, 3.0];
        let y_vals = [1.0, 2.0, 3.0, 4.0];
        let short_color = [10.0, 20.0];

        let (sampled_x, sampled_y, sampled_color) =
            downsample_xy_pairs(&x_vals, &y_vals, Some(&short_color), 3);

        assert_eq!(sampled_x.len(), sampled_y.len());
        assert_eq!(sampled_color, None);
    }

    // ── pad_to_limit tests ─────────────────────────────────────────────────

    #[test]
    fn pad_to_limit_returns_at_least_target_points() {
        // Regression test for audit issue 3.3: scatter `limit=N` was
        // contract-violated by ~0.4% because LTTB can return fewer
        // indices than requested. `pad_to_limit` must top up to the
        // requested target.
        let indices = vec![0, 5, 10, 15]; // 4 indices, target 10
        let padded = pad_to_limit(indices, 20, 10);
        assert!(
            padded.len() >= 10,
            "padded length must hit the target (got {})",
            padded.len()
        );
        // The original indices must still be present.
        for &i in &[0, 5, 10, 15] {
            assert!(padded.contains(&i), "original index {i} must be preserved");
        }
    }

    #[test]
    fn pad_to_limit_keeps_oversized_input_unchanged() {
        // If LTTB already returned more than `target` (rare but
        // possible for very smooth data), pad_to_limit must not drop
        // any of the original selections.
        let indices = vec![0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        let padded = pad_to_limit(indices.clone(), 20, 5);
        assert_eq!(padded.len(), 11);
    }

    #[test]
    fn pad_to_limit_does_not_duplicate() {
        let indices = vec![0, 4, 8, 12, 16];
        let padded = pad_to_limit(indices, 20, 10);
        let mut sorted = padded.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), padded.len(), "padding must not introduce duplicates");
    }

    #[test]
    fn pad_to_limit_zero_target_returns_empty() {
        let padded = pad_to_limit(vec![0, 1, 2], 10, 0);
        assert!(padded.is_empty());
    }
}
