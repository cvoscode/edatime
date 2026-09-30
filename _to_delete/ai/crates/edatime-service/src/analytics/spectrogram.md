# crates/edatime-service/src/analytics/spectrogram.rs
> Spectrogram (STFT) and spectral filtering.

## Enum: FilterType
- `FilterType::Lowpass`
- `FilterType::Highpass`
- `FilterType::Bandpass`
- `FilterType::Bandstop`

## Struct: SpectrogramResult
- `{ column: String, times_ms: Vec<f64>, frequencies: Vec<f64>, magnitudes: Vec<Vec<f64>> }`

## Functions
- `pub fn compute_spectrogram(df: &DataFrame, column: &str, window_size: usize, hop_size: usize) -> Result<SpectrogramResult, AppError>`
- `pub fn apply_spectral_filter(df: &DataFrame, column: &str, filter_type: FilterType, low_hz: Option<f64>, high_hz: Option<f64>, sample_rate_hz: Option<f64>) -> Result<(Vec<f64>, Vec<f64>), AppError>`