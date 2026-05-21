//! Spectrogram (STFT) and spectral filtering.

use polars::prelude::*;
use rustfft::{FftPlanner, num_complex::Complex};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use super::shared::{extract_f64_column, extract_ts_epoch_ms, estimate_sample_rate_hz};

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
