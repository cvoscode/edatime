# ai/crates/edatime-service/src/handlers/routes/analytics.md
> HTTP handlers for rolling statistics, anomaly detection, FFT, spectrogram, spectral filtering, transforms, outlier removal, and causal graph requests.

## Query / payload structs
- `RollingQuery`
  - `{ start: DateTime<Utc>, end: DateTime<Utc>, columns: Option<String>, window: Option<usize> }`
- `AnomalyQuery`
  - `{ start: DateTime<Utc>, end: DateTime<Utc>, columns: Option<String>, method: Option<String>, threshold: Option<f64> }`
- `FftQuery`
  - `{ start: DateTime<Utc>, end: DateTime<Utc>, columns: Option<String>, max_points: Option<usize> }`
- `SpectrogramQuery`
  - `{ start: DateTime<Utc>, end: DateTime<Utc>, column: String, window_size: Option<usize>, hop_size: Option<usize>, max_points: Option<usize>, normalize: Option<String>, clip: Option<String>, clip_param: Option<f64> }`
- `SpectralFilterQuery`
  - `{ start: Option<DateTime<Utc>>, end: Option<DateTime<Utc>>, column: String, filter_type: String, low_hz: Option<f64>, high_hz: Option<f64>, sample_rate_hz: Option<f64>, max_points: Option<usize> }`
- `TransformRequest`
  - `{ expression: String, output_name: String }`
- `OutlierRemovalRequest`
  - `{ columns: Option<String>, method: Option<String>, threshold: Option<f64>, window: Option<usize> }`
- `CausalGraphRequest`
  - `{ columns: Option<String>, tau_max: Option<usize>, pc_alpha: Option<f64>, alpha: Option<f64>, method: Option<String>, test: Option<String>, max_points: Option<usize>, max_conds_dim: Option<usize>, fdr_method: Option<String>, n_preliminary_iterations: Option<usize>, knn: Option<usize>, sig_samples: Option<usize> }`

## Handlers
- `get_rolling(State(state): State<AppState>, Query(params): Query<RollingQuery>) -> Result<impl IntoResponse, AppError>`
- `get_anomalies(State(state): State<AppState>, Query(params): Query<AnomalyQuery>) -> Result<impl IntoResponse, AppError>`
  - Returns `{ method, threshold, regions, summary_stats }`, where `summary_stats` is computed across the filtered numeric values.
- `get_fft(State(state): State<AppState>, Query(params): Query<FftQuery>) -> Result<impl IntoResponse, AppError>`
- `get_spectrogram(State(state): State<AppState>, Query(params): Query<SpectrogramQuery>) -> Result<impl IntoResponse, AppError>`
- `get_spectral_filter(...) -> Result<impl IntoResponse, AppError>`
- `post_transform(...) -> Result<impl IntoResponse, AppError>`
- `post_remove_outliers(...) -> Result<impl IntoResponse, AppError>`
- `post_causal_graph(...) -> Result<impl IntoResponse, AppError>`
