//! Analytics module — split into submodules for maintainability.
//!
//! - `shared` — timestamp extraction, column helpers, sample rate estimation
//! - `rolling` — rolling mean and ±1σ/±2σ bands
//! - `anomaly` — Z-score and IQR anomaly detection
//! - `fft` — FFT, PSD, dominant frequency peaks
//! - `spectrogram` — STFT spectrogram and spectral filtering
//! - `transform` — column expression parsing and application
//! - `outlier` — global and windowed outlier removal
//! - `drift` — temporal drift analysis (KS, Wasserstein, PSI)

pub mod anomaly;
pub mod drift;
pub mod fft;
pub mod outlier;
pub mod rolling;
pub mod shared;
pub mod spectrogram;
pub mod transform;

// ── Public re-exports for the top-level API ─────────────────────────────────

pub use anomaly::{detect_anomalies_iqr, detect_anomalies_zscore, AnomalyRegion};
pub use drift::{
    compute_temporal_drift, DriftMetadata, DriftResponse, DriftThresholds, DriftWindowStats,
    WindowDistributionStats,
};
pub use fft::{compute_fft, FftResult, FrequencyPeak};
pub use outlier::{remove_outliers_global, remove_outliers_windowed, OutlierRemovalResult};
pub use rolling::{compute_rolling_bands, RollingBands};
pub use shared::{extract_columns_f64_mean, extract_f64_column, extract_f64_column_opt, extract_ts_epoch_ms};
pub use spectrogram::{apply_spectral_filter, compute_spectrogram, FilterType, SpectrogramResult};
pub use transform::{apply_column_transform, apply_column_transform_lazy};
