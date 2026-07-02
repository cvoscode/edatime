//! Spectrogram (STFT) and spectral filtering.

use polars::prelude::*;
use rustfft::{FftPlanner, num_complex::Complex};
use serde::{Deserialize, Serialize};

use super::shared::{estimate_sample_rate_hz, extract_f64_column, extract_ts_epoch_ms};
use crate::error::AppError;
use edatime_core::stats::{ColumnStats, compute_column_stats};

/// Normalization mode for the spectrogram colorbar. Mirrors the
/// frontend `ScaleMode` in `frontend/src/utils/spectralScaling.ts` so
/// that the same color contract is produced regardless of which side
/// does the scaling.
#[derive(Debug, Clone, Copy, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ScaleMode {
    #[default]
    None,
    Minmax,
    Zscore,
    Robust,
}

impl ScaleMode {
    pub fn parse(value: Option<&str>) -> Result<Self, AppError> {
        match value.unwrap_or("none") {
            "none" | "" => Ok(ScaleMode::None),
            "minmax" | "min-max" | "min_max" => Ok(ScaleMode::Minmax),
            "zscore" | "z-score" | "z_score" => Ok(ScaleMode::Zscore),
            "robust" => Ok(ScaleMode::Robust),
            other => Err(AppError::bad_request(format!(
                "Unknown normalize mode '{other}'. Expected one of: none, minmax, zscore, robust."
            ))),
        }
    }
}

/// Outlier clipping mode. Mirrors the frontend `ClipMode`.
#[derive(Debug, Clone, Copy, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ClipMode {
    #[default]
    None,
    Percentile,
    Iqr,
}

impl ClipMode {
    pub fn parse(value: Option<&str>) -> Result<Self, AppError> {
        match value.unwrap_or("none") {
            "none" | "" => Ok(ClipMode::None),
            "percentile" | "pct" | "p" => Ok(ClipMode::Percentile),
            "iqr" => Ok(ClipMode::Iqr),
            other => Err(AppError::bad_request(format!(
                "Unknown clip mode '{other}'. Expected one of: none, percentile, iqr."
            ))),
        }
    }
}

/// Effective options for the spectrogram color scaling.
#[derive(Debug, Clone, Copy, Default)]
pub struct ScaleOptions {
    pub mode: ScaleMode,
    pub clip: ClipMode,
    /// `percentile` → percentage on each tail (0..50).
    /// `iqr` → k multiplier.
    pub clip_param: f64,
}

impl ScaleOptions {
    pub fn from_query(
        normalize: Option<&str>,
        clip_method: Option<&str>,
        clip_param: Option<f64>,
    ) -> Result<Self, AppError> {
        let mode = ScaleMode::parse(normalize)?;
        let clip = ClipMode::parse(clip_method)?;
        // Sensible default: percentile → 0.5% per tail; IQR → k=1.5.
        let default_param = match clip {
            ClipMode::None => 0.0,
            ClipMode::Percentile => 0.5,
            ClipMode::Iqr => 1.5,
        };
        let param = clip_param.unwrap_or(default_param);
        Ok(Self {
            mode,
            clip,
            clip_param: param,
        })
    }
}

#[derive(Debug, Serialize)]
pub struct SpectrogramResult {
    pub column: String,
    pub times_ms: Vec<f64>,
    pub frequencies: Vec<f64>,
    pub magnitudes: Vec<Vec<f64>>,
}

/// Filter type for spectral filtering.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FilterType {
    Lowpass,
    Highpass,
    Bandpass,
    Bandstop,
}

/// Compute an STFT spectrogram for one column.
pub fn compute_spectrogram(
    df: &DataFrame,
    column: &str,
    window_size: usize,
    hop_size: usize,
) -> Result<SpectrogramResult, AppError> {
    let ts_ms = extract_ts_epoch_ms(df)?;
    let fs = estimate_sample_rate_hz(&ts_ms);
    let values = extract_f64_column(df, column)?;

    let n = values.len();
    if n < window_size {
        return Err(AppError::bad_request(format!(
            "Not enough data ({n} samples) for window size {window_size}"
        )));
    }

    let half = window_size / 2 + 1;
    let df_freq = fs / window_size as f64;
    let frequencies: Vec<f64> = (0..half).map(|i| i as f64 * df_freq).collect();

    let hann: Vec<f64> = (0..window_size)
        .map(|i| {
            0.5 * (1.0 - (2.0 * std::f64::consts::PI * i as f64 / (window_size as f64 - 1.0)).cos())
        })
        .collect();

    let mut planner = FftPlanner::<f64>::new();
    let fft = planner.plan_fft_forward(window_size);

    let mut times_ms = Vec::new();
    let mut magnitudes = Vec::new();

    let mut pos = 0usize;
    while pos + window_size <= n {
        let centre_idx = pos + window_size / 2;
        let t = if centre_idx < ts_ms.len() {
            ts_ms[centre_idx]
        } else {
            f64::NAN
        };
        times_ms.push(t);

        let mean: f64 = values[pos..pos + window_size].iter().sum::<f64>() / window_size as f64;
        let mut buffer: Vec<Complex<f64>> = values[pos..pos + window_size]
            .iter()
            .enumerate()
            .map(|(i, &v)| Complex::new((v - mean) * hann[i], 0.0))
            .collect();

        fft.process(&mut buffer);

        let row: Vec<f64> = (0..half)
            .map(|i| {
                let mag = buffer[i].norm() / window_size as f64;
                if i == 0 || i == window_size / 2 {
                    mag
                } else {
                    2.0 * mag
                }
            })
            .collect();
        magnitudes.push(row);

        pos += hop_size;
    }

    Ok(SpectrogramResult {
        column: column.to_string(),
        times_ms,
        frequencies,
        magnitudes,
    })
}

/// Clip + normalize the magnitudes of a spectrogram in place. Mirrors
/// `applySpectralScale` in
/// `frontend/src/utils/spectralScaling.ts` so that the same color
/// contract is produced regardless of which side does the scaling.
///
/// When `opts.mode == ScaleMode::None` and `opts.clip == ClipMode::None`
/// the input is returned unchanged.
pub fn apply_scale(result: &mut SpectrogramResult, opts: ScaleOptions) -> Result<(), AppError> {
    if opts.mode == ScaleMode::None && opts.clip == ClipMode::None {
        return Ok(());
    }

    // Flatten the magnitudes for statistics. Non-finite values are dropped
    // from the clip calculation but still propagated through unchanged.
    let mut flat: Vec<f64> = Vec::new();
    for row in &result.magnitudes {
        for &v in row {
            if v.is_finite() {
                flat.push(v);
            }
        }
    }
    if flat.is_empty() {
        return Ok(());
    }

    let stats = compute_column_stats(&flat);

    // 1. Determine clip bounds in raw units.
    let (clip_low, clip_high) = match opts.clip {
        ClipMode::None => (f64::NEG_INFINITY, f64::INFINITY),
        ClipMode::Percentile => {
            let pct = opts.clip_param.clamp(0.0, 49.0) / 100.0;
            let lo = percentile_from_stats(&stats, pct).unwrap_or(f64::NEG_INFINITY);
            let hi = percentile_from_stats(&stats, 1.0 - pct).unwrap_or(f64::INFINITY);
            (lo, hi)
        }
        ClipMode::Iqr => {
            let k = opts.clip_param.max(0.0);
            let q1 = stats.q1.unwrap_or(f64::NEG_INFINITY);
            let q3 = stats.q3.unwrap_or(f64::INFINITY);
            (q1 - k * (q3 - q1), q3 + k * (q3 - q1))
        }
    };

    // 2. Stretch the clipped values into [0, 1] (or pass through when no
    //    normalization is requested). We compute the stretch span from the
    //    same `flat` array so degenerate inputs collapse to a stable 0.5.
    let mut clipped_flat: Vec<f64> = flat.iter().map(|&v| v.clamp(clip_low, clip_high)).collect();

    let (vmin, vmax) = match opts.mode {
        ScaleMode::None => {
            // Colorbar pinned to the clipped span so the user sees the
            // tightened range even without an explicit stretch.
            let lo = clipped_flat.iter().cloned().fold(f64::INFINITY, f64::min);
            let hi = clipped_flat
                .iter()
                .cloned()
                .fold(f64::NEG_INFINITY, f64::max);
            (lo, hi)
        }
        ScaleMode::Minmax => stretch_minmax(&mut clipped_flat),
        ScaleMode::Zscore => stretch_zscore(&mut clipped_flat, &stats),
        ScaleMode::Robust => stretch_robust(&mut clipped_flat, &stats),
    };
    let _ = if vmax > vmin {
        (vmin, vmax)
    } else {
        (vmin, vmin + 1.0)
    };
    // ^ colorbar bounds; informational only at the moment, but kept here
    //   so the next iteration can surface them in the response.

    // 3. Re-walk the 2D grid so non-finite cells stay NaN. The clipped /
    //    normalized values are looked up by linear scan over `flat` — this
    //    keeps the implementation simple and matches the frontend
    //    contract; the spectrogram has at most ~32K cells in practice.
    let mut idx = 0usize;
    for row in result.magnitudes.iter_mut() {
        for cell in row.iter_mut() {
            if cell.is_finite() {
                *cell = clipped_flat[idx];
                idx += 1;
            }
        }
    }

    Ok(())
}

fn stretch_minmax(values: &mut [f64]) -> (f64, f64) {
    let lo = values.iter().cloned().fold(f64::INFINITY, f64::min);
    let hi = values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    // Values come from a finite-only slice, so `partial_cmp` only differs
    // from `>` when both are NaN — which can't happen here. Fall back to
    // the degenerate-collapse branch if the span is non-positive.
    let span = match hi.partial_cmp(&lo) {
        Some(std::cmp::Ordering::Greater) => hi - lo,
        _ => {
            for v in values.iter_mut() {
                *v = 0.5;
            }
            return (0.0, 1.0);
        }
    };
    for v in values.iter_mut() {
        *v = (*v - lo) / span;
    }
    (0.0, 1.0)
}

fn stretch_zscore(values: &mut [f64], stats: &ColumnStats) -> (f64, f64) {
    let mean = stats.mean.unwrap_or(0.0);
    let std = stats.std_dev.unwrap_or(0.0);
    if std <= 0.0 || !std.is_finite() {
        for v in values.iter_mut() {
            *v = 0.5;
        }
        return (0.0, 1.0);
    }
    for v in values.iter_mut() {
        *v = (*v - mean) / std;
    }
    let lo = values.iter().cloned().fold(f64::INFINITY, f64::min);
    let hi = values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let span = match hi.partial_cmp(&lo) {
        Some(std::cmp::Ordering::Greater) => hi - lo,
        _ => {
            for v in values.iter_mut() {
                *v = 0.5;
            }
            return (0.0, 1.0);
        }
    };
    for v in values.iter_mut() {
        *v = (*v - lo) / span;
    }
    (0.0, 1.0)
}

fn stretch_robust(values: &mut [f64], stats: &ColumnStats) -> (f64, f64) {
    let q1 = stats.q1.unwrap_or(0.0);
    let q3 = stats.q3.unwrap_or(1.0);
    let iqr = q3 - q1;
    if iqr <= 0.0 || !iqr.is_finite() {
        for v in values.iter_mut() {
            *v = 0.5;
        }
        return (0.0, 1.0);
    }
    for v in values.iter_mut() {
        *v = 0.25 + 0.5 * ((*v - q1) / iqr);
    }
    (0.0, 1.0)
}

/// Linear-interpolation quantile from a `ColumnStats` block. Mirrors
/// `quantileSorted` in the frontend helper.
fn percentile_from_stats(stats: &ColumnStats, p: f64) -> Option<f64> {
    if !(0.0..=1.0).contains(&p) {
        return None;
    }
    // We have only min/q1/median/q3/max — combine into a tiny synthetic
    // array and reuse numpy-style linear interpolation. This is good
    // enough for the typical 5–95% range used in clipping and matches
    // the frontend behaviour within the resolution of these landmarks.
    let lo = stats.min?;
    let hi = stats.max?;
    let q1 = stats.q1.unwrap_or(lo);
    let median = stats.median.unwrap_or((lo + hi) * 0.5);
    let q3 = stats.q3.unwrap_or(hi);
    let samples = [lo, q1, median, q3, hi];
    // Indices for 0.0, 0.25, 0.5, 0.75, 1.0.
    let idx = p * (samples.len() as f64 - 1.0);
    let l = idx.floor() as usize;
    let h = idx.ceil() as usize;
    if l >= samples.len() {
        return Some(*samples.last().unwrap());
    }
    if h >= samples.len() || l == h {
        return Some(samples[l]);
    }
    let frac = idx - l as f64;
    Some(samples[l] * (1.0 - frac) + samples[h] * frac)
}

/// Apply a frequency-domain filter to a time-series column.
pub fn apply_spectral_filter(
    df: &DataFrame,
    column: &str,
    filter_type: FilterType,
    low_hz: Option<f64>,
    high_hz: Option<f64>,
    sample_rate_hz: Option<f64>,
) -> Result<(Vec<f64>, Vec<f64>), AppError> {
    let ts_ms = extract_ts_epoch_ms(df)?;
    let values = extract_f64_column(df, column)?;
    let n = values.len();
    if n < 4 {
        return Err(AppError::bad_request(
            "Not enough data for filtering".to_string(),
        ));
    }

    let fs = sample_rate_hz.unwrap_or_else(|| estimate_sample_rate_hz(&ts_ms));
    let nyquist = fs / 2.0;

    let mean = values.iter().sum::<f64>() / n as f64;

    let mut buffer: Vec<Complex<f64>> = values
        .iter()
        .map(|&v| Complex::new(v - mean, 0.0))
        .collect();

    let mut planner = FftPlanner::<f64>::new();
    let fft_forward = planner.plan_fft_forward(n);
    fft_forward.process(&mut buffer);

    let df_freq = fs / n as f64;
    for (i, c) in buffer.iter_mut().enumerate() {
        let freq = if i <= n / 2 {
            i as f64 * df_freq
        } else {
            (n - i) as f64 * df_freq
        };

        let pass = match filter_type {
            FilterType::Lowpass => {
                let cutoff = high_hz.unwrap_or(nyquist);
                freq <= cutoff
            }
            FilterType::Highpass => {
                let cutoff = low_hz.unwrap_or(0.0);
                freq >= cutoff
            }
            FilterType::Bandpass => {
                let lo = low_hz.unwrap_or(0.0);
                let hi = high_hz.unwrap_or(nyquist);
                freq >= lo && freq <= hi
            }
            FilterType::Bandstop => {
                let lo = low_hz.unwrap_or(0.0);
                let hi = high_hz.unwrap_or(nyquist);
                freq < lo || freq > hi
            }
        };

        if !pass {
            c.re = 0.0;
            c.im = 0.0;
        }
    }

    let fft_inverse = planner.plan_fft_inverse(n);
    fft_inverse.process(&mut buffer);

    let scale = 1.0 / n as f64;
    let filtered: Vec<f64> = buffer.iter().map(|c| c.re * scale + mean).collect();

    Ok((ts_ms, filtered))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_result(values: Vec<f64>) -> SpectrogramResult {
        SpectrogramResult {
            column: "x".into(),
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
}
