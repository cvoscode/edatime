//! Analytics module — split into submodules for maintainability.
//!
//! - `shared` — timestamp extraction, column helpers, sample rate estimation
//! - `rolling` — rolling mean and ±1σ/±2σ bands
//! - `anomaly` — Z-score and IQR anomaly detection
//! - `fft` — FFT, PSD, dominant frequency peaks
//! - `spectrogram` — STFT spectrogram and spectral filtering
//! - `drift` — temporal drift analysis (KS, Wasserstein, PSI)

pub mod anomaly;
pub mod drift;
pub mod fft;
pub mod rolling;
pub mod shared;
pub mod spectrogram;

// ── Public re-exports for the top-level API ─────────────────────────────────

pub use anomaly::{
    AnomalyRegion, SummaryStats, compute_summary_stats, detect_anomalies_iqr,
    detect_anomalies_zscore,
};
pub use drift::{
    DriftInvestigationResponse, DriftMetadata, DriftResponse, DriftThresholds, DriftWindowStats,
    WindowDistributionStats, compute_drift_investigation, compute_temporal_drift,
};
pub use fft::{FftResult, FrequencyPeak, compute_fft};
pub use rolling::{RollingBands, compute_rolling_bands};
pub use shared::{
    extract_columns_f64_mean, extract_columns_f64_preserve_missing, extract_f64_column,
    extract_f64_column_opt, extract_ts_epoch_ms,
};
pub use spectrogram::{
    ClipMode, FilterType, ScaleMode, ScaleOptions, SpectrogramResult,
    apply_scale as apply_spectrogram_scale, apply_spectral_filter, compute_spectrogram,
};
