# crates/edatime-service/src/handlers/routes/analytics.rs
> Analytics endpoints: rolling, anomalies, FFT, spectrogram, spectral filter, transform, causal graph, outlier removal.

## Structs (Query Params)

### `RollingQuery`
- `start: DateTime<Utc>`, `end: DateTime<Utc>`
- `columns: Option<String>`
- `window: Option<usize>` — rolling window size in samples (default: 50)

### `AnomalyQuery`
- `start`, `end`, `columns`
- `method: Option<String>` — "zscore" (default) or "iqr"
- `threshold: Option<f64>`

### `FftQuery`
- `start`, `end`, `columns`
- `max_points: Option<usize>` — default: 8192

### `SpectrogramQuery`
- `start`, `end`, `column: String`
- `window_size: Option<usize>` — default: 256
- `hop_size: Option<usize>` — default: window_size / 2
- `max_points: Option<usize>` — default: 32768

### `SpectralFilterQuery`
- `start: Option<DateTime<Utc>>`, `end: Option<DateTime<Utc>>`
- `column: String`
- `filter_type: String` — lowpass | highpass | bandpass | bandstop
- `low_hz: Option<f64>`, `high_hz: Option<f64>`
- `sample_rate_hz: Option<f64>`
- `max_points: Option<usize>` — default: 16384

### `TransformRequest`
- `expression: String` — e.g. "col_a / col_b"
- `output_name: String`

### `OutlierRemovalRequest`
- `columns: Option<String>`
- `method: Option<String>` — "zscore" or "iqr"
- `threshold: Option<f64>`
- `window: Option<usize>`

### `CausalGraphRequest`
- `columns: Option<String>`
- `tau_max: Option<usize>` — default: 3
- `pc_alpha: Option<f64>` — default: 0.2
- `alpha: Option<f64>` — default: 0.05
- `method: Option<String>` — "pcmci" (default), "pcmciplus", "fullci", "bivci", "lpcmci"
- `test: Option<String>` — "par_corr" (default), "cmi_knn", "robust_parcorr", "gsquared", "cmi_symb"
- `max_points: Option<usize>` — default: 5000
- `max_conds_dim: Option<usize>`
- `fdr_method: Option<String>` — "none" (default) or "fdr_bh"
- `n_preliminary_iterations: Option<usize>` — default: 1
- `knn: Option<usize>` — default: 10
- `sig_samples: Option<usize>` — default: 200

## Handlers

- `get_rolling(...) -> Result<impl IntoResponse, AppError>`
- `get_anomalies(...) -> Result<impl IntoResponse, AppError>`
- `get_fft(...) -> Result<impl IntoResponse, AppError>`
- `get_spectrogram(...) -> Result<impl IntoResponse, AppError>`
- `get_spectral_filter(...) -> Result<impl IntoResponse, AppError>`
- `post_transform(...) -> Result<impl IntoResponse, AppError>`
- `post_remove_outliers(...) -> Result<impl IntoResponse, AppError>`
- `post_causal_graph(...) -> Result<impl IntoResponse, AppError>`