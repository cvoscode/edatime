# ai/crates/edatime-service/src/analytics/mod.md
> Top-level analytics module that exposes anomaly, drift, FFT, outlier, rolling, shared, spectrogram, and transform helpers.

## Submodules
- `anomaly`
- `drift`
- `fft`
- `outlier`
- `rolling`
- `shared`
- `spectrogram`
- `transform`

## Public re-exports
- `pub use anomaly::{AnomalyRegion, SummaryStats, compute_summary_stats, detect_anomalies_iqr, detect_anomalies_zscore}`
- `pub use drift::{DriftInvestigationResponse, DriftMetadata, DriftResponse, DriftThresholds, DriftWindowStats, WindowDistributionStats, compute_drift_investigation, compute_temporal_drift}`
- `pub use fft::{FftResult, FrequencyPeak, compute_fft}`
- `pub use outlier::{OutlierRemovalResult, remove_outliers_global, remove_outliers_windowed}`
- `pub use rolling::{RollingBands, compute_rolling_bands}`
- `pub use shared::{extract_columns_f64_mean, extract_columns_f64_preserve_missing, extract_f64_column, extract_f64_column_opt, extract_ts_epoch_ms}`
- `pub use spectrogram::{ClipMode, FilterType, ScaleMode, ScaleOptions, SpectrogramResult, apply_scale as apply_spectrogram_scale, apply_spectral_filter, compute_spectrogram}`
- `pub use transform::{apply_column_transform, apply_column_transform_lazy}`
