//! FFT, PSD, and frequency peak detection.

use polars::prelude::*;
use rustfft::{FftPlanner, num_complex::Complex};
use serde::Serialize;

use super::shared::{estimate_sample_rate_hz, extract_f64_column, extract_ts_epoch_ms};
use crate::error::AppError;

/// A detected dominant frequency peak.
#[derive(Debug, Serialize, Clone)]
pub struct FrequencyPeak {
    pub frequency_hz: f64,
    pub magnitude: f64,
    pub power: f64,
    pub rank: usize,
}

/// FFT result for a single column.
#[derive(Debug, Serialize)]
pub struct FftResult {
    pub column: String,
    pub frequencies: Vec<f64>,
    pub magnitudes: Vec<f64>,
    pub psd: Vec<f64>,
    pub sample_rate_hz: f64,
    pub nyquist_hz: f64,
    pub dominant_peaks: Vec<FrequencyPeak>,
    pub estimator: &'static str,
    pub window: &'static str,
    pub detrend: String,
    pub magnitude_units: &'static str,
    pub psd_units: &'static str,
    pub missing_count: usize,
}

fn find_dominant_peaks(
    frequencies: &[f64],
    magnitudes: &[f64],
    psd: &[f64],
    top_n: usize,
) -> Vec<FrequencyPeak> {
    let mut indexed: Vec<(usize, f64)> = magnitudes
        .iter()
        .enumerate()
        .skip(1)
        .filter(|&(_, m)| m.is_finite() && *m > 0.0)
        .map(|(i, m)| (i, *m))
        .collect();

    indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    indexed
        .into_iter()
        .take(top_n)
        .enumerate()
        .map(|(rank, (idx, mag))| FrequencyPeak {
            frequency_hz: frequencies.get(idx).copied().unwrap_or(0.0),
            magnitude: mag,
            power: psd.get(idx).copied().unwrap_or(0.0),
            rank: rank + 1,
        })
        .collect()
}

/// Compute FFT for the given columns.
pub fn compute_fft(
    df: &DataFrame,
    columns: &[String],
    sample_rate_hz: Option<f64>,
) -> Result<Vec<FftResult>, AppError> {
    compute_fft_with_detrend(df, columns, sample_rate_hz, "constant")
}

/// Hann-window periodogram; one-sided density integrates to window-weighted
/// mean square. Magnitudes use the coherent gain separately from PSD energy.
pub fn compute_fft_with_detrend(
    df: &DataFrame, columns: &[String], sample_rate_hz: Option<f64>, detrend: &str,
) -> Result<Vec<FftResult>, AppError> {
    if !matches!(detrend, "none" | "constant" | "linear") {
        return Err(AppError::bad_request("FFT detrend must be none, constant, or linear"));
    }
    let ts_ms = extract_ts_epoch_ms(df)?;
    let fs = sample_rate_hz.unwrap_or_else(|| estimate_sample_rate_hz(&ts_ms));
    let nyquist = fs / 2.0;

    let mut results = Vec::with_capacity(columns.len());
    let mut planner = FftPlanner::<f64>::new();

    for col_name in columns {
        let values = extract_f64_column(df, col_name)?;

        let n = values.len();
        let valid_count = values.iter().filter(|v| v.is_finite()).count();
        if valid_count < 4 {
            continue;
        }

        // Missing observations contribute no term to the centered transform.
        // Keep their time positions rather than compressing the sampling grid.
        let mean = values.iter().filter(|v| v.is_finite()).sum::<f64>() / valid_count as f64;
        let mean_index = values.iter().enumerate().filter(|(_, v)| v.is_finite())
            .map(|(i, _)| i as f64).sum::<f64>() / valid_count as f64;
        let slope = if detrend == "linear" {
            let covariance = values.iter().enumerate().filter(|(_, v)| v.is_finite())
                .map(|(i, v)| (i as f64 - mean_index) * (v - mean)).sum::<f64>();
            let variance = values.iter().enumerate().filter(|(_, v)| v.is_finite())
                .map(|(i, _)| (i as f64 - mean_index).powi(2)).sum::<f64>();
            if variance > 0.0 { covariance / variance } else { 0.0 }
        } else { 0.0 };
        let mut buffer: Vec<Complex<f64>> = values
            .iter()
            .enumerate()
            .map(|(i, &v)| Complex::new(if !v.is_finite() { 0.0 }
                else if detrend == "none" { v }
                else { v - mean - slope * (i as f64 - mean_index) }, 0.0))
            .collect();

        let mut window_sum = 0.0;
        let mut window_energy = 0.0;
        for (i, sample) in buffer.iter_mut().enumerate() {
            let w = 0.5 * (1.0 - (2.0 * std::f64::consts::PI * i as f64 / (n as f64 - 1.0)).cos());
            sample.re *= w;
            if values[i].is_finite() {
                window_sum += w;
                window_energy += w * w;
            }
        }

        let fft = planner.plan_fft_forward(n);
        fft.process(&mut buffer);

        let half = n / 2 + 1;
        let df_freq = fs / n as f64;

        let mut frequencies = Vec::with_capacity(half);
        let mut magnitudes = Vec::with_capacity(half);
        let mut psd = Vec::with_capacity(half);

        for (i, val) in buffer.iter().enumerate().take(half) {
            frequencies.push(i as f64 * df_freq);
            let sidedness = if i == 0 || (n % 2 == 0 && i == n / 2) { 1.0 } else { 2.0 };
            magnitudes.push(sidedness * val.norm() / window_sum);
            psd.push(sidedness * val.norm_sqr() / (fs * window_energy));
        }

        let dominant_peaks = find_dominant_peaks(&frequencies, &magnitudes, &psd, 5);

        results.push(FftResult {
            column: col_name.clone(),
            frequencies,
            magnitudes,
            psd,
            sample_rate_hz: fs,
            nyquist_hz: nyquist,
            dominant_peaks,
            estimator: "one_sided_periodogram_v1", window: "hann_symmetric",
            detrend: detrend.to_string(), magnitude_units: "signal", psd_units: "signal^2/Hz",
            missing_count: n - valid_count,
        });
    }

    Ok(results)
}

#[cfg(test)]
mod mask_tests {
    use super::*;

    fn frame(values: Vec<f64>) -> DataFrame {
        DataFrame::new(values.len(), vec![
            Series::new("ts".into(), (0..values.len()).map(|i| i as i64 * 250).collect::<Vec<_>>())
                .cast(&DataType::Datetime(TimeUnit::Milliseconds, None)).unwrap().into(),
            Series::new("value".into(), values).into(),
        ]).unwrap()
    }

    #[test]
    fn calibrated_sinusoid_amplitude_and_integrated_density() {
        let n = 1024;
        let amplitude = 3.0;
        let values = (0..n).map(|i| amplitude * (2.0 * std::f64::consts::PI * 64.0 * i as f64 / n as f64).sin()).collect();
        let result = compute_fft(&frame(values), &["value".into()], Some(4.0)).unwrap().remove(0);
        assert!((result.magnitudes[64] - amplitude).abs() < 1e-5);
        let integrated = result.psd.iter().sum::<f64>() * 4.0 / n as f64;
        assert!((integrated - amplitude.powi(2) / 2.0).abs() < 1e-6);
        assert_ne!(result.psd[64], result.magnitudes[64].powi(2));
    }

    #[test]
    fn density_obeys_parseval_for_even_and_odd_noise_grids() {
        for n in [1024, 1025] {
            let mut seed = 7_u64;
            let values = (0..n).map(|_| {
                seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
                (seed >> 32) as f64 / u32::MAX as f64 - 0.5
            }).collect::<Vec<_>>();
            let mean = values.iter().sum::<f64>() / n as f64;
            let mut energy = 0.0; let mut norm = 0.0;
            for (i, value) in values.iter().enumerate() {
                let w = 0.5 * (1.0 - (2.0 * std::f64::consts::PI * i as f64 / (n - 1) as f64).cos());
                energy += (value - mean).powi(2) * w.powi(2); norm += w.powi(2);
            }
            let result = compute_fft(&frame(values), &["value".into()], Some(4.0)).unwrap().remove(0);
            let integrated = result.psd.iter().sum::<f64>() * 4.0 / n as f64;
            assert!((integrated - energy / norm).abs() < 1e-12);
        }
    }

    #[test]
    fn linear_detrend_removes_a_ramp_but_none_retains_dc() {
        let ramp = frame((0..256).map(|i| 100.0 + 0.3 * i as f64).collect());
        let linear = compute_fft_with_detrend(&ramp, &["value".into()], None, "linear").unwrap().remove(0);
        assert!(linear.magnitudes.iter().all(|value| *value < 1e-10));
        let raw = compute_fft_with_detrend(&frame(vec![10.0; 256]), &["value".into()], None, "none").unwrap().remove(0);
        assert!((raw.magnitudes[0] - 10.0).abs() < 1e-12);
    }

    #[test]
    fn masked_values_do_not_become_zero_observations() {
        let frame = DataFrame::new(
            8,
            vec![
                Series::new("ts".into(), (0_i64..8).collect::<Vec<_>>())
                    .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
                    .unwrap()
                    .into(),
                Series::new(
                    "value".into(),
                    [
                        Some(100.0),
                        Some(100.0),
                        None,
                        None,
                        Some(100.0),
                        Some(100.0),
                        Some(100.0),
                        Some(100.0),
                    ],
                )
                .into(),
            ],
        )
        .unwrap();
        let results = compute_fft(&frame, &["value".into()], Some(1.0)).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].magnitudes.iter().all(|v| *v == 0.0));
    }
}
