use super::*;
use crate::error::ErrorCode;
use edatime_core::cancellation::cancellation_pair;

#[test]
fn spectral_filter_preserves_masked_gaps_between_valid_segments() {
    use polars::prelude::*;
    let frame = DataFrame::new(
        9,
        vec![
            Series::new("ts".into(), (0_i64..9).collect::<Vec<_>>())
                .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
                .unwrap()
                .into(),
            Series::new(
                "value".into(),
                [
                    Some(10.0),
                    Some(10.0),
                    Some(10.0),
                    Some(10.0),
                    None,
                    Some(20.0),
                    Some(20.0),
                    Some(20.0),
                    Some(20.0),
                ],
            )
            .into(),
        ],
    )
    .unwrap();
    let spectrum = compute_spectrogram(&frame, "value", 4, 1).unwrap();
    assert!(spectrum.magnitudes[0].iter().all(|value| *value == 0.0));
    assert!(spectrum.magnitudes[1].iter().all(|value| value.is_nan()));
    assert!(spectrum.magnitudes[5].iter().all(|value| *value == 0.0));
    let (times, values) = apply_spectral_filter(
        &frame,
        "value",
        FilterType::Lowpass,
        None,
        Some(0.5),
        Some(1.0),
    )
    .unwrap();
    assert_eq!(times.len(), 9);
    assert_eq!(&values[..4], &[10.0; 4]);
    assert!(values[4].is_nan());
    assert_eq!(&values[5..], &[20.0; 4]);
}

fn make_result(values: Vec<f64>) -> SpectrogramResult {
    SpectrogramResult {
        column: "x".into(),
        sample_rate_hz: 1.0,
        times_ms: vec![0.0; values.len()],
        frequencies: vec![0.0],
        magnitudes: values.into_iter().map(|v| vec![v]).collect(),
    }
}

#[test]
fn apply_scale_passthrough_when_disabled() {
    let mut r = make_result(vec![1.0, 2.0, 3.0]);
    apply_scale(
        &mut r,
        ScaleOptions {
            mode: ScaleMode::None,
            clip: ClipMode::None,
            clip_param: 0.0,
        },
    )
    .unwrap();
    assert_eq!(r.magnitudes, vec![vec![1.0], vec![2.0], vec![3.0]]);
}

#[test]
fn cancellable_scaling_stops_before_mutating_a_precancelled_result() {
    let mut result = make_result(vec![1.0, 2.0, 3.0]);
    let (handle, probe) = cancellation_pair();
    handle.cancel();

    let error = apply_scale_cancellable(
        &mut result,
        ScaleOptions {
            mode: ScaleMode::Minmax,
            clip: ClipMode::None,
            clip_param: 0.0,
        },
        &probe,
    )
    .expect_err("pre-cancelled scaling must stop");

    assert_eq!(error.code, ErrorCode::RequestCancelled);
    assert_eq!(result.magnitudes, vec![vec![1.0], vec![2.0], vec![3.0]]);
}

#[test]
fn apply_scale_minmax_stretches_to_unit_interval() {
    let mut r = make_result(vec![1.0, 2.0, 3.0, 4.0, 5.0]);
    apply_scale(
        &mut r,
        ScaleOptions {
            mode: ScaleMode::Minmax,
            clip: ClipMode::None,
            clip_param: 0.0,
        },
    )
    .unwrap();
    let flat: Vec<f64> = r.magnitudes.iter().flatten().copied().collect();
    assert!(flat.iter().all(|v| (0.0..=1.0).contains(v)));
    assert!((flat[0] - 0.0).abs() < 1e-9);
    assert!((flat[4] - 1.0).abs() < 1e-9);
    assert!((flat[2] - 0.5).abs() < 1e-9);
}

#[test]
fn apply_scale_iqr_clip_then_minmax_handles_outliers() {
    // 10 normal values + 4 huge outliers.
    let mut raw: Vec<f64> = (1..=10).map(|i| i as f64).collect();
    raw.extend([1000.0, -1000.0, 2000.0, -2000.0]);
    let mut r = make_result(raw);
    apply_scale(
        &mut r,
        ScaleOptions {
            mode: ScaleMode::Minmax,
            clip: ClipMode::Iqr,
            clip_param: 1.5,
        },
    )
    .unwrap();
    let flat: Vec<f64> = r.magnitudes.iter().flatten().copied().collect();
    // Outliers should have been clamped before the min-max stretch so
    // the body values map into a normal [0, 1] band — they should NOT
    // still be sitting at 0.0 or 1.0.
    assert!(flat[0] > 0.0);
    assert!(flat[9] < 1.0);
    // The clamped outliers at 2000 / -2000 should map to 1.0 and 0.0.
    assert!((flat[10] - 1.0).abs() < 1e-9);
    assert!(flat[11].abs() < 1e-9);
}

#[test]
fn apply_scale_percentile_clip_tolerates_bad_param() {
    // Large per-tail value should not crash; values must remain finite.
    let mut r = make_result(vec![0.0, 1.0, 2.0, 3.0, 4.0]);
    apply_scale(
        &mut r,
        ScaleOptions {
            mode: ScaleMode::None,
            clip: ClipMode::Percentile,
            clip_param: 100.0,
        },
    )
    .unwrap();
    for row in &r.magnitudes {
        for cell in row {
            assert!(cell.is_finite(), "expected finite values, got {cell}");
        }
    }
}

#[test]
fn apply_scale_zscore_and_robust_yield_values_in_unit_interval() {
    let mut r1 = make_result(vec![10.0, 12.0, 14.0, 16.0, 18.0]);
    apply_scale(
        &mut r1,
        ScaleOptions {
            mode: ScaleMode::Zscore,
            clip: ClipMode::None,
            clip_param: 0.0,
        },
    )
    .unwrap();
    let flat: Vec<f64> = r1.magnitudes.iter().flatten().copied().collect();
    assert!(flat.iter().all(|v| (0.0..=1.0).contains(v)));

    let mut r2 = make_result(vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]);
    apply_scale(
        &mut r2,
        ScaleOptions {
            mode: ScaleMode::Robust,
            clip: ClipMode::None,
            clip_param: 0.0,
        },
    )
    .unwrap();
    let flat: Vec<f64> = r2.magnitudes.iter().flatten().copied().collect();
    assert!(flat.iter().all(|v| (0.0..=1.0).contains(v)));
}

#[test]
fn apply_scale_preserves_non_finite_cells() {
    let mut r = make_result(vec![1.0, f64::NAN, 3.0]);
    apply_scale(
        &mut r,
        ScaleOptions {
            mode: ScaleMode::Minmax,
            clip: ClipMode::None,
            clip_param: 0.0,
        },
    )
    .unwrap();
    assert_eq!(r.magnitudes[0], vec![0.0]);
    assert!(r.magnitudes[1][0].is_nan());
    assert_eq!(r.magnitudes[2], vec![1.0]);
}

#[test]
fn scale_options_from_query_uses_sensible_defaults() {
    let opts = ScaleOptions::from_query(Some("minmax"), Some("iqr"), None).unwrap();
    assert_eq!(opts.mode, ScaleMode::Minmax);
    assert_eq!(opts.clip, ClipMode::Iqr);
    assert!((opts.clip_param - 1.5).abs() < 1e-9);

    let opts = ScaleOptions::from_query(Some("minmax"), Some("percentile"), None).unwrap();
    assert!((opts.clip_param - 0.5).abs() < 1e-9);

    let opts = ScaleOptions::from_query(None, None, None).unwrap();
    assert_eq!(opts.mode, ScaleMode::None);
    assert_eq!(opts.clip, ClipMode::None);
}

#[test]
fn scale_options_rejects_unknown_modes() {
    assert!(ScaleOptions::from_query(Some("bogus"), None, None).is_err());
    assert!(ScaleOptions::from_query(None, Some("bogus"), None).is_err());
}
