//! FFT, PSD, and frequency peak detection.

use polars::prelude::*;
use rustfft::{FftPlanner, num_complex::Complex};
use serde::Serialize;

use crate::error::AppError;
use super::shared::{extract_f64_column, extract_ts_epoch_ms, estimate_sample_rate_hz};

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
    let ts_ms = extract_ts_epoch_ms(df)?;
    let fs = sample_rate_hz.unwrap_or_else(|| estimate_sample_rate_hz(&ts_ms));
    let nyquist = fs / 2.0;

    let mut results = Vec::with_capacity(columns.len());
    let mut planner = FftPlanner::<f64>::new();

    for col_name in columns {
        let values = extract_f64_column(df, col_name)?;

        let n = values.len();
        if n < 4 {
            continue;
        }

        let mean = values.iter().sum::<f64>() / n as f64;
        let mut buffer: Vec<Complex<f64>> = values
            .iter()
            .map(|&v| Complex::new(v - mean, 0.0))
            .collect();

        for (i, sample) in buffer.iter_mut().enumerate() {
            let w = 0.5 * (1.0 - (2.0 * std::f64::consts::PI * i as f64 / (n as f64 - 1.0)).cos());
            sample.re *= w;
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
            let mag = val.norm() / n as f64;
            let magnitude = if i == 0 || i == n / 2 { mag } else { 2.0 * mag };
            magnitudes.push(magnitude);
            psd.push(magnitude * magnitude);
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
        });
    }

    Ok(results)
}
