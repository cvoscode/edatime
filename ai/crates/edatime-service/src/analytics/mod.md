# ai/crates/edatime-service/src/analytics/mod.md
> Analytics module — split into submodules for maintainability. Re-exports public API.

## Submodules
- `anomaly` — Z-score and IQR anomaly detection
- `drift` — temporal drift analysis (KS, Wasserstein, PSI) [deps: [shared][1], [AppError][2]]
- `fft` — FFT, PSD, dominant frequency peaks
- `outlier` — global and windowed outlier removal
- `rolling` — rolling mean and ±1σ/±2σ bands
- `shared` — timestamp extraction, column helpers, sample rate estimation
- `spectrogram` — STFT spectrogram and spectral filtering
- `transform` — column expression parsing and application

## Public Re-exports
- `pub use anomaly::{AnomalyRegion, detect_anomalies_iqr, detect_anomalies_zscore}`
- `pub use drift::{DriftInvestigationResponse, DriftMetadata, DriftResponse, DriftThresholds, DriftWindowStats, WindowDistributionStats, compute_drift_investigation, compute_temporal_drift}`
- `pub use fft::{FftResult, FrequencyPeak, compute_fft}`
- `pub use outlier::{OutlierRemovalResult, remove_outliers_global, remove_outliers_windowed}`
- `pub use rolling::{RollingBands, compute_rolling_bands}`
- `pub use shared::{extract_columns_f64_mean, extract_columns_f64_preserve_missing, extract_f64_column, extract_f64_column_opt, extract_ts_epoch_ms}`
- `pub use spectrogram::{ClipMode, FilterType, ScaleMode, ScaleOptions, SpectrogramResult, apply_scale as apply_spectrogram_scale, apply_spectral_filter, compute_spectrogram}`
- `pub use transform::{apply_column_transform, apply_column_transform_lazy}`

---
[1]: shared.md
[2]: ../../error.md#AppError