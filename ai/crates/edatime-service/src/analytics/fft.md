# crates/edatime-service/src/analytics/fft.rs
> FFT, PSD, and frequency peak detection.

## Structs

### `FrequencyPeak`
- `frequency_hz: f64`
- `magnitude: f64`
- `power: f64`
- `rank: usize`

### `FftResult`
- `column: String`
- `frequencies: Vec<f64>`
- `magnitudes: Vec<f64>`
- `psd: Vec<f64>`
- `sample_rate_hz: f64`
- `nyquist_hz: f64`
- `dominant_peaks: Vec<FrequencyPeak>`

## Functions

- `compute_fft(df: &DataFrame, columns: &[String], sample_rate_hz: Option<f64>) -> Result<Vec<FftResult>, AppError>`