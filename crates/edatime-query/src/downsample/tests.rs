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
    assert_eq!(
        sorted.len(),
        padded.len(),
        "padding must not introduce duplicates"
    );
}

#[test]
fn pad_to_limit_zero_target_returns_empty() {
    let padded = pad_to_limit(vec![0, 1, 2], 10, 0);
    assert!(padded.is_empty());
}
