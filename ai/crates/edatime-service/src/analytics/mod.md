# crates/edatime-service/src/analytics/mod.rs
> Analytics submodule re-exports: rolling, anomaly, fft, spectrogram, transform, outlier, drift.

## Re-exports
- `detect_anomalies_iqr`, `detect_anomalies_zscore`, `AnomalyRegion` [deps: [anomaly][1]]
- `compute_temporal_drift`, `DriftMetadata`, `DriftResponse`, `DriftThresholds`, `DriftWindowStats`, `WindowDistributionStats` [deps: [drift][2]]
- `compute_fft`, `FftResult`, `FrequencyPeak` [deps: [fft][3]]
- `remove_outliers_global`, `remove_outliers_windowed`, `OutlierRemovalResult` [deps: [outlier][4]]
- `compute_rolling_bands`, `RollingBands` [deps: [rolling][5]]
- `extract_columns_f64_mean`, `extract_f64_column`, `extract_f64_column_opt`, `extract_ts_epoch_ms` [deps: [shared][6]]
- `apply_spectral_filter`, `compute_spectrogram`, `FilterType`, `SpectrogramResult` [deps: [spectrogram][7]]
- `apply_column_transform`, `apply_column_transform_lazy` [deps: [transform][8]]

---
[1]: anomaly.md
[2]: drift.md
[3]: fft.md
[4]: outlier.md
[5]: rolling.md
[6]: shared.md
[7]: spectrogram.md
[8]: transform.md