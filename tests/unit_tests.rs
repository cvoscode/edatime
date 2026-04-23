//! Unit tests for core backend modules: filters, temporal, pipeline, config, stats.
//!
//! These test internal logic without going through the HTTP layer.

use edatime::analytics;
use edatime::cache::ResponseCache;
use edatime::config::AppConfig;
use edatime::error::{AppError, ErrorCode, ErrorKind};
use edatime::filters::{RangeFilter, apply_filters, parse_line_filters, parse_range_filters};
use edatime::metrics::AppMetrics;
use edatime::pipeline::{Reduction, apply_reduction, filter_time_range};
use edatime::repository::InMemoryDataRepository;
use edatime::stats::{build_histogram, compute_column_stats};
use edatime::temporal::{epoch_ms_to_native, native_to_epoch_ms, unit_multiplier};
use edatime::validation::{
    validate_bucket_count, validate_numeric_columns, validate_scatter_limit, validate_time_window,
    validate_upload_size_with_limit, validate_width,
};

use chrono::{TimeZone, Utc};
use polars::prelude::*;

// ─── Test fixture ─────────────────────────────────────────────────────────────

fn small_df() -> DataFrame {
    let ts: Vec<i64> = (0..100)
        .map(|i| 1_704_067_200_000 + i * 3_600_000)
        .collect();
    let values: Vec<f64> = (0..100).map(|i| i as f64 * 2.0).collect();
    let columns = vec![
        Column::new("ts".into(), ts)
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .unwrap(),
        Column::new("value".into(), values.clone()),
        Column::new("other".into(), values),
    ];
    DataFrame::new(100, columns).unwrap()
}

// ─── Temporal module ──────────────────────────────────────────────────────────

#[test]
fn unit_multiplier_nanoseconds() {
    let dtype = DataType::Datetime(TimeUnit::Nanoseconds, None);
    assert_eq!(unit_multiplier(&dtype), 1_000_000);
}

#[test]
fn unit_multiplier_microseconds() {
    let dtype = DataType::Datetime(TimeUnit::Microseconds, None);
    assert_eq!(unit_multiplier(&dtype), 1_000);
}

#[test]
fn unit_multiplier_milliseconds() {
    let dtype = DataType::Datetime(TimeUnit::Milliseconds, None);
    assert_eq!(unit_multiplier(&dtype), 1);
}

#[test]
fn native_to_epoch_ms_date() {
    // Day 0 = 1970-01-01, day 1 = 1970-01-02 = 86400000 ms
    let ms = native_to_epoch_ms(1, &DataType::Date);
    assert_eq!(ms, 86_400_000.0);
}

#[test]
fn native_to_epoch_ms_nanoseconds() {
    let ns_per_ms = 1_000_000_i64;
    let dtype = DataType::Datetime(TimeUnit::Nanoseconds, None);
    let ms = native_to_epoch_ms(5 * ns_per_ms, &dtype);
    assert_eq!(ms, 5.0);
}

#[test]
fn epoch_ms_to_native_roundtrip() {
    let dtype = DataType::Datetime(TimeUnit::Milliseconds, None);
    let native = epoch_ms_to_native(1_704_067_200_000.0, &dtype, false).unwrap();
    let back = native_to_epoch_ms(native, &dtype);
    assert_eq!(back, 1_704_067_200_000.0);
}

#[test]
fn epoch_ms_to_native_rejects_nan() {
    let dtype = DataType::Datetime(TimeUnit::Milliseconds, None);
    let result = epoch_ms_to_native(f64::NAN, &dtype, false);
    assert!(result.is_err());
}
// ─── Validation module ────────────────────────────────────────────────────────

#[test]
fn validate_time_window_ok() {
    let start = Utc.with_ymd_and_hms(2024, 1, 1, 0, 0, 0).unwrap();
    let end = Utc.with_ymd_and_hms(2024, 1, 2, 0, 0, 0).unwrap();
    assert!(validate_time_window(start, end).is_ok());
}

#[test]
fn validate_time_window_rejects_reversed() {
    let start = Utc.with_ymd_and_hms(2024, 1, 2, 0, 0, 0).unwrap();
    let end = Utc.with_ymd_and_hms(2024, 1, 1, 0, 0, 0).unwrap();
    assert!(validate_time_window(start, end).is_err());
}

#[test]
fn validate_time_window_rejects_equal() {
    let t = Utc.with_ymd_and_hms(2024, 1, 1, 0, 0, 0).unwrap();
    assert!(validate_time_window(t, t).is_err());
}

#[test]
fn validate_width_ok() {
    let limits = AppConfig::default().validation;
    assert!(validate_width(500, &limits).is_ok());
    assert!(validate_width(1, &limits).is_ok());
}

#[test]
fn validate_width_rejects_zero() {
    let limits = AppConfig::default().validation;
    assert!(validate_width(0, &limits).is_err());
}

#[test]
fn validate_bucket_count_ok() {
    let limits = AppConfig::default().validation;
    assert!(validate_bucket_count(10, &limits).is_ok());
}

#[test]
fn validate_bucket_count_rejects_zero() {
    let limits = AppConfig::default().validation;
    assert!(validate_bucket_count(0, &limits).is_err());
}

#[test]
fn validate_scatter_limit_ok() {
    let limits = AppConfig::default().validation;
    assert!(validate_scatter_limit(1000, &limits).is_ok());
}

#[test]
fn validate_upload_size_ok() {
    assert!(validate_upload_size_with_limit(1024, 10 * 1024 * 1024).is_ok());
}

#[test]
fn validate_upload_size_rejects_oversized() {
    assert!(validate_upload_size_with_limit(20 * 1024 * 1024, 10 * 1024 * 1024).is_err());
}

#[test]
fn validate_numeric_columns_accepts_valid() {
    let df = small_df();
    let limits = AppConfig::default().validation;
    let result = validate_numeric_columns(&df, &["value".to_string()], &limits);
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), vec!["value".to_string()]);
}

#[test]
fn validate_numeric_columns_rejects_unknown() {
    let df = small_df();
    let limits = AppConfig::default().validation;
    let result = validate_numeric_columns(&df, &["nonexistent".to_string()], &limits);
    assert!(result.is_err());
}

#[test]
fn validate_numeric_columns_deduplicates() {
    let df = small_df();
    let limits = AppConfig::default().validation;
    let result =
        validate_numeric_columns(&df, &["value".to_string(), "value".to_string()], &limits);
    assert!(result.is_ok());
    assert_eq!(result.unwrap().len(), 1);
}

// ─── Filter parsing ──────────────────────────────────────────────────────────

#[test]
fn parse_range_filters_empty() {
    assert!(parse_range_filters(None).unwrap().is_empty());
    assert!(parse_range_filters(Some("")).unwrap().is_empty());
    assert!(parse_range_filters(Some("  ")).unwrap().is_empty());
}

#[test]
fn parse_range_filters_valid_json() {
    let json = r#"[{"column":"value","from":10.0,"to":50.0}]"#;
    let filters = parse_range_filters(Some(json)).unwrap();
    assert_eq!(filters.len(), 1);
    assert_eq!(filters[0].column, "value");
    assert_eq!(filters[0].from, 10.0);
    assert_eq!(filters[0].to, 50.0);
}

#[test]
fn parse_range_filters_invalid_json() {
    assert!(parse_range_filters(Some("{invalid")).is_err());
}

#[test]
fn parse_line_filters_valid() {
    let json = r#"[{"column":"value","x1":0,"y1":10,"x2":100,"y2":50,"keep_above":true}]"#;
    let filters = parse_line_filters(Some(json)).unwrap();
    assert_eq!(filters.len(), 1);
    assert!(filters[0].keep_above);
}

#[test]
fn parse_line_filters_camel_case_alias() {
    let json = r#"[{"column":"value","x1":0,"y1":10,"x2":100,"y2":50,"keepAbove":true}]"#;
    let filters = parse_line_filters(Some(json)).unwrap();
    assert!(filters[0].keep_above);
}

// ─── apply_filters ───────────────────────────────────────────────────────────

#[test]
fn apply_filters_no_constraints() {
    let df = small_df();
    let lf = apply_filters(&df, None, None, &[], &[]).unwrap();
    let result = lf.collect().unwrap();
    assert_eq!(result.height(), 100);
}

#[test]
fn apply_filters_with_time_range() {
    let df = small_df();
    let start_ms = 1_704_067_200_000.0; // row 0
    let end_ms = 1_704_067_200_000.0 + 10.0 * 3_600_000.0; // row 10
    let lf = apply_filters(&df, Some(start_ms), Some(end_ms), &[], &[]).unwrap();
    let result = lf.collect().unwrap();
    assert!(result.height() <= 11);
    assert!(result.height() > 0);
}

#[test]
fn apply_filters_with_range_filter() {
    let df = small_df();
    let range_filters = vec![RangeFilter {
        column: "value".to_string(),
        from: 50.0,
        to: 100.0,
    }];
    let lf = apply_filters(&df, None, None, &range_filters, &[]).unwrap();
    let result = lf.collect().unwrap();
    // Values 50..100 ⇒ indices 25..50 ⇒ 26 rows
    assert!(result.height() > 0);
    assert!(result.height() < 100);
}

// ─── Pipeline: filter_time_range ──────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn pipeline_filter_time_range() {
    let df = small_df();
    let start = 1_704_067_200_000_i64; // row 0
    let end = 1_704_067_200_000 + 5 * 3_600_000; // row 5
    let result = filter_time_range(df.lazy(), start, end, &["value".to_string()]).unwrap();
    assert!(result.height() <= 6);
    assert!(result.height() > 0);
}

// ─── Pipeline: apply_reduction ────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn pipeline_no_reduction_passthrough() {
    let df = small_df();
    let (result, was_reduced) =
        apply_reduction(&df, &["value".to_string()], &[], &Reduction::None).unwrap();
    assert!(!was_reduced);
    assert_eq!(result.height(), 100);
}

#[tokio::test(flavor = "multi_thread")]
async fn pipeline_lttb_downsamples() {
    let df = small_df();
    let (result, was_reduced) = apply_reduction(
        &df,
        &["value".to_string()],
        &[],
        &Reduction::Lttb { target_points: 20 },
    )
    .unwrap();
    assert!(was_reduced);
    assert!(result.height() <= 20);
    assert!(result.height() > 0);
}

// ─── Repository ──────────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn repository_revision_increments() {
    let repo = InMemoryDataRepository::new(small_df());
    let r1 = repo.revision();
    repo.bump_revision();
    let r2 = repo.revision();
    assert_eq!(r2, r1 + 1);
}

// ─── Config module ───────────────────────────────────────────────────────────

#[test]
fn config_default_is_valid() {
    let config = AppConfig::default();
    assert!(config.upload.max_upload_bytes > 0);
    assert!(config.rate_limit.max_requests > 0);
    assert!(config.validation.max_viewport_width > 0);
    assert!(config.validation.max_scatter_limit > 0);
}

// ─── Stats module ─────────────────────────────────────────────────────────────

#[test]
fn build_histogram_produces_bins() {
    let values: Vec<f64> = (0..100).map(|i| i as f64).collect();
    let hist = build_histogram(&values, 0.0, 99.0).unwrap();
    assert_eq!(hist.bin_edges.len(), 25); // DEFAULT_BINS(24) + 1 edges
    assert_eq!(hist.counts.len(), 24);
    let total: u64 = hist.counts.iter().sum();
    assert_eq!(total, 100);
}

#[test]
fn compute_column_stats_basic() {
    let values: Vec<f64> = (0..100).map(|i| i as f64 * 2.0).collect();
    let stats = compute_column_stats(&values);
    assert!(stats.min.is_some());
    assert!(stats.max.is_some());
    assert_eq!(stats.min.unwrap(), 0.0);
    assert_eq!(stats.max.unwrap(), 198.0);
}

// ─── Cache module ─────────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn cache_stores_and_retrieves() {
    use edatime::cache::{CacheConfig, CachedResponse};
    use std::time::Duration;

    let cache = ResponseCache::new(CacheConfig {
        ttl: Duration::from_secs(60),
        max_entries: 10,
        max_bytes: 1024 * 1024,
    });
    let data = CachedResponse::json(b"test-data".to_vec(), false, 1, 0);
    cache.insert("key1".to_string(), data).await;

    let retrieved = cache.get("key1").await;
    assert!(retrieved.is_some());
}

#[tokio::test(flavor = "multi_thread")]
async fn cache_miss_on_unknown_key() {
    use edatime::cache::CacheConfig;
    use std::time::Duration;

    let cache = ResponseCache::new(CacheConfig {
        ttl: Duration::from_secs(60),
        max_entries: 10,
        max_bytes: 1024 * 1024,
    });
    assert!(cache.get("unknown").await.is_none());
}

// ─── Metrics module ──────────────────────────────────────────────────────────

#[test]
fn metrics_recording() {
    let metrics = AppMetrics::new();
    metrics.record_cache_hit();
    metrics.record_cache_hit();
    metrics.record_cache_miss();
    let snap = metrics.snapshot(0, 0);
    assert_eq!(snap.cache_hits, 2);
    assert_eq!(snap.cache_misses, 1);
}

// ─── Error module ─────────────────────────────────────────────────────────────

#[test]
fn app_error_bad_request_has_validation_kind() {
    let err = AppError::bad_request("test error");
    assert!(matches!(err.kind, ErrorKind::Validation));
    assert!(matches!(err.code, ErrorCode::InvalidRequest));
}

#[test]
fn app_error_internal_has_internal_kind() {
    let err = AppError::internal("oops");
    assert!(matches!(err.kind, ErrorKind::Internal));
}

#[test]
fn app_error_rate_limit_has_rate_limit_kind() {
    let err = AppError::rate_limit("too fast");
    assert!(matches!(err.kind, ErrorKind::RateLimit));
}

// ─── Drift module ─────────────────────────────────────────────────────────────

use edatime::stats::{epps_singleton_test, ks_test_2sample};

#[test]
fn ks_test_identical_distributions() {
    let a = vec![0.0, 1.0, 2.0, 3.0, 4.0, 5.0];
    let (stat, p) = ks_test_2sample(&a, &a);
    assert!(stat >= 0.0 && stat <= 1.0);
    // Identical distributions: p should be high
    assert!(p >= 0.5, "p={p} for identical distributions");
}

#[test]
fn ks_test_different_distributions() {
    let a: Vec<f64> = (0..50).map(|i| i as f64).collect();
    let b: Vec<f64> = (100..150).map(|i| i as f64).collect();
    let (stat, p) = ks_test_2sample(&a, &b);
    assert!(stat > 0.5, "KS stat={stat} should be large for disjoint distributions");
    assert!(p < 0.05, "p={p} should be significant for disjoint distributions");
}

#[test]
fn ks_test_empty_input() {
    let empty: Vec<f64> = vec![];
    let a = vec![1.0, 2.0, 3.0];
    let (stat, _p) = ks_test_2sample(&empty, &a);
    // Should return a defined value, not panic
    assert!(stat == 0.0 || stat.is_finite() || stat.is_nan());
}

#[test]
fn epps_singleton_basic_properties() {
    let a: Vec<f64> = (0..20).map(|i| i as f64).collect();
    let b: Vec<f64> = (0..20).map(|i| i as f64).collect();
    let (stat_same, p_same) = epps_singleton_test(&a, &b);
    assert!(stat_same.is_finite(), "E-S stat should be finite");
    assert!(p_same >= 0.0 && p_same <= 1.0, "p_same={p_same} must be in [0,1]");
}

#[test]
fn epps_singleton_different_distributions() {
    let a: Vec<f64> = vec![0.0; 30];
    let b: Vec<f64> = vec![1000.0; 30];
    let (stat, p) = epps_singleton_test(&a, &b);
    assert!(stat.is_finite());
    assert!(p >= 0.0 && p <= 1.0);
    // Wildly different distributions should yield a small p-value
    assert!(p < 0.1, "p={p} should indicate significant difference");
}

#[test]
fn temporal_drift_reference_too_small_returns_error() {
    let df = small_df();
    // Reference window of just 1ms — should have < 5 samples
    let result = analytics::compute_temporal_drift(
        &df, "value",
        86_400_000,           // daily window
        1_704_067_200_000.0,  // ref start = 2024-01-01
        1_704_067_200_001.0,  // ref end = 1ms later (empty)
        1_704_067_200_001.0,  // curr start
        1_704_153_600_000.0,  // curr end = 2024-01-02
        10, 0.05, 0.0, 0.1, 0.2,
    );
    assert!(result.is_err(), "Expected error for reference window with < 5 samples");
}

#[test]
fn temporal_drift_empty_monitoring_range_produces_zero_windows() {
    let df = small_df();
    // Reference = first 50 hours, monitoring range is empty (start == end)
    let result = analytics::compute_temporal_drift(
        &df, "value",
        3_600_000,                    // hourly
        1_704_067_200_000.0,          // ref start
        1_704_067_200_000.0 + 50.0 * 3_600_000.0,  // ref end (50h)
        1_704_067_200_000.0 + 51.0 * 3_600_000.0,  // curr start = after ref
        1_704_067_200_000.0 + 51.0 * 3_600_000.0,  // curr end = same as start (empty)
        10, 0.05, 0.0, 0.1, 0.2,
    );
    // Empty monitoring range: either error or zero windows
    match result {
        Ok(r) => assert!(r.windows.is_empty(), "Expected 0 windows for empty monitoring range"),
        Err(_) => {} // also acceptable
    }
}

#[test]
fn temporal_drift_valid_request_returns_correct_shape() {
    let df = small_df();
    // Reference: first 24 hours, monitoring: next 24 hours (1 daily window)
    let ref_start = 1_704_067_200_000.0;
    let ref_end   = ref_start + 24.0 * 3_600_000.0;
    let curr_end  = ref_end   + 24.0 * 3_600_000.0;

    let result = analytics::compute_temporal_drift(
        &df, "value",
        86_400_000,
        ref_start, ref_end,
        ref_end, curr_end,
        10, 0.05, 0.0, 0.1, 0.2,
    );
    let resp = result.expect("Expected Ok for valid drift request");
    assert_eq!(resp.column, "value");
    assert!(resp.reference.count >= 5);
    assert_eq!(resp.windows.len(), 1);
    assert!(resp.metadata.reference_samples >= 5);
    assert_eq!(resp.metadata.num_windows, 1);
}

#[test]
fn temporal_drift_low_sample_windows_do_not_crash() {
    let df = small_df();
    // Use a window size larger than the dataset so each window has few/no samples
    let ref_start = 1_704_067_200_000.0;
    let ref_end   = ref_start + 24.0 * 3_600_000.0;
    let curr_start = ref_end;
    let curr_end  = curr_start + 4.0 * 3_600_000.0; // only 4 hours → 4 samples

    let result = analytics::compute_temporal_drift(
        &df, "value",
        86_400_000, // daily — 1 window with 4 samples → low_sample_warning
        ref_start, ref_end,
        curr_start, curr_end,
        10, 0.05, 0.0, 0.1, 0.2,
    );
    let resp = result.expect("Should not panic on low-sample windows");
    for w in &resp.windows {
        if w.distribution.count < 5 {
            assert!(w.low_sample_warning, "low_sample_warning must be true for N<5");
        }
    }
}

#[test]
fn temporal_drift_metadata_fields_populated() {
    let df = small_df();
    let ref_start = 1_704_067_200_000.0;
    let ref_end   = ref_start + 24.0 * 3_600_000.0;
    let curr_end  = ref_end + 48.0 * 3_600_000.0;

    let result = analytics::compute_temporal_drift(
        &df, "value",
        86_400_000,
        ref_start, ref_end,
        ref_end, curr_end,
        10, 0.05, 0.0, 0.1, 0.2,
    );
    let resp = result.expect("Expected Ok");
    // metadata.computation_time_ms may be 0 on fast machines, but must be present
    assert_eq!(resp.metadata.num_windows, resp.windows.len());
    assert_eq!(resp.metadata.reference_samples, resp.reference.count);
}

#[test]
fn temporal_drift_window_stats_include_es_fields() {
    let df = small_df();
    let ref_start = 1_704_067_200_000.0;
    let ref_end   = ref_start + 24.0 * 3_600_000.0;
    let curr_end  = ref_end + 24.0 * 3_600_000.0;

    let resp = analytics::compute_temporal_drift(
        &df, "value",
        86_400_000,
        ref_start, ref_end,
        ref_end, curr_end,
        10, 0.05, 0.0, 0.1, 0.2,
    ).expect("Expected Ok");

    for w in &resp.windows {
        if !w.low_sample_warning {
            assert!(w.es_stat.is_finite(), "es_stat must be finite for sufficient samples");
            assert!(w.es_pvalue >= 0.0 && w.es_pvalue <= 1.0, "es_pvalue={}", w.es_pvalue);
        }
    }
}
