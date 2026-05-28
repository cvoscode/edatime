# unit_tests.rs

**Purpose:** Unit tests for core backend modules: filters, temporal, pipeline, config, stats.

## Functions

```rust
fn small_df() -> DataFrame
```

## Tests

### Temporal Module

```rust
#[test]
fn unit_multiplier_nanoseconds()
```

```rust
#[test]
fn unit_multiplier_microseconds()
```

```rust
#[test]
fn unit_multiplier_milliseconds()
```

```rust
#[test]
fn native_to_epoch_ms_date()
```

```rust
#[test]
fn native_to_epoch_ms_nanoseconds()
```

```rust
#[test]
fn epoch_ms_to_native_roundtrip()
```

```rust
#[test]
fn epoch_ms_to_native_rejects_nan()
```

### Validation Module

```rust
#[test]
fn validate_time_window_ok()
```

```rust
#[test]
fn validate_time_window_rejects_reversed()
```

```rust
#[test]
fn validate_time_window_rejects_equal()
```

```rust
#[test]
fn validate_width_ok()
```

```rust
#[test]
fn validate_width_rejects_zero()
```

```rust
#[test]
fn validate_bucket_count_ok()
```

```rust
#[test]
fn validate_bucket_count_rejects_zero()
```

```rust
#[test]
fn validate_scatter_limit_ok()
```

```rust
#[test]
fn validate_upload_size_ok()
```

```rust
#[test]
fn validate_upload_size_rejects_oversized()
```

```rust
#[test]
fn validate_numeric_columns_accepts_valid()
```

```rust
#[test]
fn validate_numeric_columns_rejects_unknown()
```

```rust
#[test]
fn validate_numeric_columns_deduplicates()
```

### Filter Parsing

```rust
#[test]
fn parse_range_filters_empty()
```

```rust
#[test]
fn parse_range_filters_valid_json()
```

```rust
#[test]
fn parse_range_filters_invalid_json()
```

```rust
#[test]
fn parse_line_filters_valid()
```

```rust
#[test]
fn parse_line_filters_camel_case_alias()
```

### Apply Filters

```rust
#[test]
fn apply_filters_no_constraints()
```

```rust
#[test]
fn apply_filters_with_time_range()
```

```rust
#[test]
fn apply_filters_with_range_filter()
```

### Pipeline

```rust
#[tokio::test(flavor = "multi_thread")]
async fn pipeline_filter_time_range()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn pipeline_no_reduction_passthrough()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn pipeline_lttb_downsamples()
```

### Repository

```rust
#[tokio::test(flavor = "multi_thread")]
async fn repository_revision_increments()
```

### Config Module

```rust
#[test]
fn config_default_is_valid()
```

### Stats Module

```rust
#[test]
fn build_histogram_produces_bins()
```

```rust
#[test]
fn compute_column_stats_basic()
```

### Cache Module

```rust
#[tokio::test(flavor = "multi_thread")]
async fn cache_stores_and_retrieves()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn cache_miss_on_unknown_key()
```

### Metrics Module

```rust
#[test]
fn metrics_recording()
```

### Error Module

```rust
#[test]
fn app_error_bad_request_has_validation_kind()
```

```rust
#[test]
fn app_error_internal_has_internal_kind()
```

```rust
#[test]
fn app_error_rate_limit_has_rate_limit_kind()
```

### Drift Module

```rust
#[test]
fn ks_test_identical_distributions()
```

```rust
#[test]
fn ks_test_different_distributions()
```

```rust
#[test]
fn ks_test_empty_input()
```

```rust
#[test]
fn epps_singleton_basic_properties()
```

```rust
#[test]
fn epps_singleton_different_distributions()
```

```rust
#[test]
fn temporal_drift_reference_too_small_returns_error()
```

```rust
#[test]
fn temporal_drift_empty_monitoring_range_produces_zero_windows()
```

```rust
#[test]
fn temporal_drift_valid_request_returns_correct_shape()
```

```rust
#[test]
fn temporal_drift_low_sample_windows_do_not_crash()
```

```rust
#[test]
fn temporal_drift_metadata_fields_populated()
```

```rust
#[test]
fn temporal_drift_window_stats_include_es_fields()
```

```rust
#[test]
fn temporal_drift_auto_wasserstein_threshold_is_derived_from_reference_std()
```

```rust
#[test]
fn temporal_drift_explicit_wasserstein_threshold_is_preserved()
```
