use super::*;
use edatime_core::config::AppConfig;
use polars::prelude::{DataFrame, DataType, IntoLazy, NamedFrom, TimeUnit};
use std::fs;

fn frame_with_two_time_columns(ts_values: [i64; 3], event_values: [i64; 3]) -> DataFrame {
    let ts = polars::prelude::Series::new("ts".into(), ts_values.to_vec())
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .expect("ts datetime");
    let event_time = polars::prelude::Series::new("event_time".into(), event_values.to_vec())
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .expect("event time datetime");
    DataFrame::new(
        3,
        vec![
            ts.into(),
            event_time.into(),
            polars::prelude::Series::new("value".into(), vec![1.0_f64, 2.0, 3.0]).into(),
        ],
    )
    .expect("two-time-column dataframe")
}

#[test]
fn stratified_profile_covers_endpoints_without_periodic_stride() {
    let indices = profile_sample_indices(69_680, 10_000);
    assert_eq!(indices.len(), 10_000);
    assert_eq!(indices[0], 0);
    assert_eq!(indices[9_999], 69_679);
    assert!(indices.windows(2).all(|pair| pair[0] < pair[1]));
    assert!(indices.windows(2).any(|pair| pair[1] - pair[0] != 7));
    assert_eq!(indices, profile_sample_indices(69_680, 10_000));
}

#[test]
fn builds_metadata_for_in_memory_frame() {
    let ts = polars::prelude::Series::new(
        "ts".into(),
        vec![1_700_000_000_000i64, 1_700_000_100_000i64],
    )
    .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
    .expect("cast ts to datetime");
    let df = DataFrame::new(
        2,
        vec![
            ts.into(),
            polars::prelude::Series::new("value".into(), vec![1.0f64, 2.0]).into(),
        ],
    )
    .expect("dataframe");

    let metadata = build_dataset_metadata(&df, true, None).expect("metadata");
    assert_eq!(metadata.numeric_columns, vec!["value".to_string()]);
    assert_eq!(metadata.total_rows, 2);
    assert!(metadata.time_range.is_some());
    assert_eq!(
        metadata.time_quality,
        Some(TimeQuality {
            non_null_count: 2,
            null_count: 0,
            unique_timestamp_count: 2,
            duplicate_timestamp_count: 0,
            is_monotonic_non_decreasing: true,
            out_of_order_count: 0,
            min_gap_ms: Some(100_000),
            median_gap_ms: Some(100_000),
            max_gap_ms: Some(100_000),
        })
    );
    assert!(
        metadata
            .column_profiles
            .iter()
            .any(|profile| profile.name == "ts" && profile.histogram.is_some())
    );
    assert!(
        metadata
            .column_profiles
            .iter()
            .any(|profile| profile.name == "value" && profile.histogram.is_some())
    );
}

#[test]
fn immediate_metadata_keeps_exploration_facts_and_defers_profiles() {
    let df = DataFrame::new(
        2,
        vec![
            polars::prelude::Series::new(
                "ts".into(),
                vec![1_700_000_000_000_i64, 1_700_000_001_000],
            )
            .into(),
            polars::prelude::Series::new("value".into(), vec![1.0_f64, 2.0]).into(),
        ],
    )
    .expect("dataframe");

    let metadata = build_immediate_dataset_metadata_from_lazyframe(df.lazy(), None)
        .expect("immediate metadata");
    assert_eq!(metadata.total_rows, 2);
    assert_eq!(metadata.numeric_columns, vec!["value".to_string()]);
    assert_eq!(
        metadata.time_range,
        Some(TimeRange {
            min: 1_700_000_000_000,
            max: 1_700_000_001_000
        })
    );
    assert_eq!(metadata.profile_status, "immediate");
    assert_eq!(metadata.time_quality, None);
    assert!(metadata.column_profiles.is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn metadata_uses_the_selected_time_column_and_restores_it_with_its_version() {
    let state = AppState::new(DataFrame::default(), AppConfig::default());
    let first_frame = frame_with_two_time_columns([0, 1_000, 2_000], [100_000, 101_000, 102_000]);
    state
        .replace_dataset_with_time_column(first_frame, Some("event_time".to_string()))
        .await
        .expect("selected source upload");
    let first_version = state.current_dataset_version().expect("first version");

    let first = get_metadata(State(state.clone()))
        .await
        .expect("first metadata")
        .0;
    assert_eq!(first.time_column.as_deref(), Some("event_time"));
    assert_eq!(
        first.time_range,
        Some(TimeRange {
            min: 100_000,
            max: 102_000
        })
    );
    assert_eq!(
        first
            .columns
            .iter()
            .filter(|column| column.name == "ts")
            .count(),
        1
    );
    assert_eq!(
        first
            .columns
            .iter()
            .filter(|column| column.name == "event_time")
            .count(),
        1
    );

    state
        .replace_dataset_with_time_column(
            frame_with_two_time_columns([700_000, 701_000, 702_000], [800_000, 801_000, 802_000]),
            Some("ts".to_string()),
        )
        .await
        .expect("second source upload");
    state
        .select_dataset_version(&first_version.id)
        .await
        .expect("restore first version");
    let restored = get_metadata(State(state.clone()))
        .await
        .expect("restored metadata")
        .0;
    assert_eq!(
        restored.source_version_id.as_deref(),
        Some(first_version.id.as_str())
    );
    assert_eq!(restored.time_column.as_deref(), Some("event_time"));
    assert_eq!(
        restored.time_range,
        Some(TimeRange {
            min: 100_000,
            max: 102_000
        })
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn exact_profile_keeps_its_version_time_column_across_source_changes() {
    let state = AppState::new(DataFrame::default(), AppConfig::default());
    state
        .replace_dataset_with_time_column(
            frame_with_two_time_columns([0, 1_000, 2_000], [100_000, 101_000, 102_000]),
            Some("event_time".to_string()),
        )
        .await
        .expect("first source upload");
    let first = start_profile(State(state.clone()))
        .await
        .expect("start first exact profile")
        .0;

    state
        .replace_dataset_with_time_column(
            frame_with_two_time_columns([700_000, 701_000, 702_000], [800_000, 801_000, 802_000]),
            Some("ts".to_string()),
        )
        .await
        .expect("replace active source");
    state
        .select_dataset_version(&first.source_version.id)
        .await
        .expect("restore profiled version");

    for _ in 0..200 {
        let response = get_profile(State(state.clone()))
            .await
            .expect("get exact profile")
            .0;
        if response.status == "ready" {
            let report: DatasetMetadata =
                serde_json::from_value(response.metadata.expect("profile metadata"))
                    .expect("profile report");
            assert_eq!(report.time_column.as_deref(), Some("event_time"));
            assert_eq!(
                report.time_range,
                Some(TimeRange {
                    min: 100_000,
                    max: 102_000
                })
            );
            assert!(
                report
                    .column_profiles
                    .iter()
                    .any(|profile| profile.name == "event_time")
            );
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    panic!("version-bound exact profile did not finish");
}

#[tokio::test(flavor = "multi_thread")]
async fn immediate_metadata_cache_keeps_identical_upload_versions_distinct() {
    let df = DataFrame::new(
        2,
        vec![
            polars::prelude::Series::new(
                "ts".into(),
                vec![1_700_000_000_000_i64, 1_700_000_001_000],
            )
            .into(),
            polars::prelude::Series::new("value".into(), vec![1.0_f64, 2.0]).into(),
        ],
    )
    .expect("dataframe");
    let mut config = AppConfig::default();
    config.retention.max_resident_versions = 1;
    let state = AppState::new(DataFrame::default(), config);

    state
        .replace_dataset(df.clone())
        .await
        .expect("first upload");
    let first = get_metadata(State(state.clone()))
        .await
        .expect("first metadata")
        .0;

    state.replace_dataset(df).await.expect("second upload");
    let second = get_metadata(State(state.clone()))
        .await
        .expect("second metadata")
        .0;
    let active = state.current_dataset_version().expect("active version");

    assert_ne!(first.source_version_id, second.source_version_id);
    assert_eq!(
        second.source_version_id.as_deref(),
        Some(active.id.as_str())
    );
    assert_eq!(second.source_version_revision, Some(active.revision));
    assert!(state.dataset_snapshot_for_version(&active.id).is_ok());
    assert!(
        state
            .dataset_snapshot_for_version(
                first.source_version_id.as_deref().expect("first source id")
            )
            .is_err()
    );
}

#[test]
fn completed_profiles_report_duplicate_out_of_order_time_quality() {
    let df = DataFrame::new(
        5,
        vec![
            polars::prelude::Series::new(
                "ts".into(),
                vec![
                    Some(1_700_000_003_000_i64),
                    Some(1_700_000_001_000),
                    Some(1_700_000_001_000),
                    None,
                    Some(1_700_000_005_000),
                ],
            )
            .into(),
            polars::prelude::Series::new("value".into(), vec![1.0_f64; 5]).into(),
        ],
    )
    .expect("dataframe");

    let metadata = build_dataset_metadata(&df, false, None).expect("metadata");
    assert_eq!(
        metadata.time_quality,
        Some(TimeQuality {
            non_null_count: 4,
            null_count: 1,
            unique_timestamp_count: 3,
            duplicate_timestamp_count: 1,
            is_monotonic_non_decreasing: false,
            out_of_order_count: 1,
            min_gap_ms: Some(2_000),
            median_gap_ms: Some(2_000),
            max_gap_ms: Some(2_000),
        })
    );
}

#[test]
fn immediate_metadata_uses_the_selected_real_time_column() {
    let ts = polars::prelude::Series::new("ts".into(), vec![0_i64, 1_000, 2_000])
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .expect("ts datetime");
    let event_time =
        polars::prelude::Series::new("event_time".into(), vec![100_000_i64, 101_000, 102_000])
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .expect("event time datetime");
    let df = DataFrame::new(
        3,
        vec![
            ts.into(),
            event_time.into(),
            polars::prelude::Series::new("value".into(), vec![1.0_f64, 2.0, 3.0]).into(),
        ],
    )
    .expect("dataframe");

    let metadata =
        build_immediate_dataset_metadata_from_lazyframe(df.clone().lazy(), Some("event_time"))
            .expect("immediate metadata");
    assert_eq!(metadata.time_column.as_deref(), Some("event_time"));
    assert_eq!(
        metadata
            .columns
            .iter()
            .filter(|column| column.name == "ts")
            .count(),
        1
    );
    assert_eq!(
        metadata
            .columns
            .iter()
            .filter(|column| column.name == "event_time")
            .count(),
        1
    );
    assert_eq!(
        metadata.time_range,
        Some(TimeRange {
            min: 100_000,
            max: 102_000
        })
    );

    let exact =
        build_dataset_metadata(&df, true, Some("event_time")).expect("selected exact profile");
    assert_eq!(exact.time_column.as_deref(), Some("event_time"));
    assert_eq!(exact.time_range, metadata.time_range);
    assert_eq!(
        exact
            .column_profiles
            .iter()
            .filter(|profile| profile.name == "event_time")
            .count(),
        1
    );
}

#[test]
fn exact_preview_statistics_match_with_automatic_and_explicit_time_selection() {
    let event_time = polars::prelude::Series::new(
        "event_time".into(),
        vec![
            1_700_000_000_000_i64,
            1_700_000_001_000,
            1_700_000_002_000,
            1_700_000_003_000,
        ],
    )
    .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
    .expect("event time datetime");
    let df = DataFrame::new(
        4,
        vec![
            event_time.into(),
            polars::prelude::Series::new("value".into(), vec![0.0_f64, 2.0, 0.0, 4.0]).into(),
        ],
    )
    .expect("dataframe");

    let automatic = build_dataset_metadata_from_lazyframe(df.clone().lazy(), None)
        .expect("automatic exact preview");
    let explicit = build_dataset_metadata_from_lazyframe(df.lazy(), Some("event_time"))
        .expect("explicit exact preview");
    let automatic_value = automatic
        .column_profiles
        .iter()
        .find(|profile| profile.name == "value")
        .expect("automatic value profile");
    let explicit_value = explicit
        .column_profiles
        .iter()
        .find(|profile| profile.name == "value")
        .expect("explicit value profile");

    assert_eq!(automatic.profile_status, "exact");
    assert_eq!(explicit.profile_status, "exact");
    assert_eq!(automatic.numeric_columns, explicit.numeric_columns);
    assert_eq!(automatic.time_range, explicit.time_range);
    assert_eq!(automatic.time_quality, explicit.time_quality);
    assert_eq!(automatic_value.distinct_count, Some(3));
    assert_eq!(
        automatic_value.distinct_count,
        explicit_value.distinct_count
    );
    assert_eq!(automatic_value.zero_count, Some(2));
    assert_eq!(automatic_value.zero_count, explicit_value.zero_count);
    assert_eq!(automatic_value.median, explicit_value.median);
    assert_eq!(automatic_value.q25, explicit_value.q25);
    assert_eq!(automatic_value.q75, explicit_value.q75);
    assert_eq!(
        automatic_value
            .histogram
            .as_ref()
            .map(|histogram| &histogram.counts),
        explicit_value
            .histogram
            .as_ref()
            .map(|histogram| &histogram.counts)
    );
    assert!(explicit_value.histogram.is_some());
}

#[test]
fn integer_profiles_preserve_exact_identity_and_extrema() {
    let i64_values = vec![9_007_199_254_740_992_i64, 9_007_199_254_740_993_i64];
    let signed = DataFrame::new(
        2,
        vec![polars::prelude::Series::new("value".into(), i64_values).into()],
    )
    .expect("signed integer frame");
    let signed_profile = build_dataset_metadata(&signed, false, None)
        .expect("signed profile")
        .column_profiles
        .into_iter()
        .find(|profile| profile.name == "value")
        .expect("signed value profile");
    assert_eq!(signed_profile.distinct_count, Some(2));
    assert_eq!(signed_profile.is_constant, Some(false));
    assert_eq!(
        signed_profile.min_exact.as_deref(),
        Some("9007199254740992")
    );
    assert_eq!(
        signed_profile.max_exact.as_deref(),
        Some("9007199254740993")
    );

    let unsigned = DataFrame::new(
        2,
        vec![polars::prelude::Series::new("value".into(), vec![u64::MAX - 1, u64::MAX]).into()],
    )
    .expect("unsigned integer frame");
    let unsigned_profile = build_dataset_metadata(&unsigned, false, None)
        .expect("unsigned profile")
        .column_profiles
        .into_iter()
        .find(|profile| profile.name == "value")
        .expect("unsigned value profile");
    assert_eq!(unsigned_profile.distinct_count, Some(2));
    assert_eq!(unsigned_profile.is_constant, Some(false));
    assert_eq!(
        unsigned_profile.min_exact.as_deref(),
        Some("18446744073709551614")
    );
    assert_eq!(
        unsigned_profile.max_exact.as_deref(),
        Some("18446744073709551615")
    );

    let signed_boundary = DataFrame::new(
        2,
        vec![polars::prelude::Series::new("value".into(), vec![i64::MIN, i64::MAX]).into()],
    )
    .expect("signed boundary frame");
    let boundary_profile = build_dataset_metadata(&signed_boundary, false, None)
        .expect("signed boundary profile")
        .column_profiles
        .into_iter()
        .find(|profile| profile.name == "value")
        .expect("boundary value profile");
    assert_eq!(boundary_profile.distinct_count, Some(2));
    assert_eq!(
        boundary_profile.min_exact.as_deref(),
        Some("-9223372036854775808")
    );
    assert_eq!(
        boundary_profile.max_exact.as_deref(),
        Some("9223372036854775807")
    );
}

#[test]
fn explicit_time_column_errors_name_missing_and_unsupported_fields() {
    let date = polars::prelude::Series::new(
        "date".into(),
        vec![1_700_000_000_000_i64, 1_700_000_001_000],
    )
    .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
    .expect("date datetime");
    let df = DataFrame::new(
        2,
        vec![
            date.into(),
            polars::prelude::Series::new("value".into(), vec![1.0_f64, 2.0]).into(),
        ],
    )
    .expect("dataframe");

    let missing = build_dataset_metadata_from_lazyframe(df.clone().lazy(), Some("missing_time"))
        .expect_err("missing override must fail");
    assert!(missing.to_string().contains("missing_time"));
    assert!(missing.to_string().contains("not found"));

    let wrong_type = build_dataset_metadata_from_lazyframe(df.lazy(), Some("value"))
        .expect_err("numeric signal must not be accepted as a time override");
    assert!(wrong_type.to_string().contains("value"));
    assert!(
        wrong_type
            .to_string()
            .contains("date, datetime, or integer timestamp")
    );
}

#[test]
fn immediate_metadata_honors_datetime_time_override_as_datetime() {
    let timestamps = polars::prelude::Series::new(
        "recorded_at".into(),
        vec![1_700_000_000_000_i64, 1_700_000_001_000],
    )
    .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
    .expect("datetime");
    let df = DataFrame::new(
        2,
        vec![
            timestamps.into(),
            polars::prelude::Series::new("value".into(), vec![1.0_f64, 2.0]).into(),
        ],
    )
    .expect("dataframe");

    let metadata = build_immediate_dataset_metadata_from_lazyframe(df.lazy(), Some("recorded_at"))
        .expect("immediate metadata");
    assert_eq!(metadata.time_column.as_deref(), Some("recorded_at"));
    assert_eq!(
        metadata.time_range,
        Some(TimeRange {
            min: 1_700_000_000_000,
            max: 1_700_000_001_000
        })
    );
}

#[test]
fn metadata_counts_non_finite_numeric_values_without_polluting_extrema() {
    let df = DataFrame::new(
        5,
        vec![
            polars::prelude::Series::new("ts".into(), vec![1_i64, 2, 3, 4, 5]).into(),
            polars::prelude::Series::new(
                "value".into(),
                vec![
                    Some(2.0_f64),
                    Some(f64::NAN),
                    Some(f64::INFINITY),
                    Some(f64::NEG_INFINITY),
                    None,
                ],
            )
            .into(),
        ],
    )
    .expect("dataframe");

    let metadata = build_dataset_metadata(&df, true, None).expect("metadata");
    let profile = metadata
        .column_profiles
        .iter()
        .find(|profile| profile.name == "value")
        .expect("value profile");
    assert_eq!(profile.non_finite_count, 3);
    assert_eq!(profile.finite_count, Some(1));
    assert_eq!(profile.zero_count, Some(0));
    assert_eq!(profile.distinct_count, Some(1));
    assert_eq!(profile.is_constant, Some(true));
    assert_eq!(profile.min, Some(2.0));
    assert_eq!(profile.max, Some(2.0));
}

#[test]
fn completed_profiles_report_numeric_distribution_and_constant_facts() {
    let df = DataFrame::new(
        5,
        vec![
            polars::prelude::Series::new("ts".into(), vec![1_i64, 2, 3, 4, 5]).into(),
            polars::prelude::Series::new("spread".into(), vec![0.0_f64, 1.0, 2.0, 3.0, 4.0]).into(),
            polars::prelude::Series::new("constant".into(), vec![7.0_f64; 5]).into(),
        ],
    )
    .expect("dataframe");

    let metadata = build_dataset_metadata(&df, false, None).expect("metadata");
    let spread = metadata
        .column_profiles
        .iter()
        .find(|profile| profile.name == "spread")
        .expect("spread profile");
    assert_eq!(spread.finite_count, Some(5));
    assert_eq!(spread.zero_count, Some(1));
    assert_eq!(spread.distinct_count, Some(5));
    assert_eq!(spread.is_constant, Some(false));
    assert_eq!(spread.q25, Some(1.0));
    assert_eq!(spread.median, Some(2.0));
    assert_eq!(spread.q75, Some(3.0));
    assert_eq!(spread.interquartile_range, Some(2.0));
    let constant = metadata
        .column_profiles
        .iter()
        .find(|profile| profile.name == "constant")
        .expect("constant profile");
    assert_eq!(constant.distinct_count, Some(1));
    assert_eq!(constant.is_constant, Some(true));
    assert_eq!(constant.interquartile_range, Some(0.0));
}

#[test]
fn float_distinct_counts_preserve_signed_zero_and_skip_non_finite_values() {
    let df = DataFrame::new(
        4,
        vec![
            polars::prelude::Series::new(
                "signed_zero".into(),
                vec![-0.0_f64, 0.0, f64::NAN, f64::INFINITY],
            )
            .into(),
            polars::prelude::Series::new(
                "varied".into(),
                vec![1.0_f64, 1.0, 2.0, f64::NEG_INFINITY],
            )
            .into(),
        ],
    )
    .expect("float profile frame");
    let metadata = build_dataset_metadata(&df, false, None).expect("exact profile");
    let signed_zero = metadata
        .column_profiles
        .iter()
        .find(|profile| profile.name == "signed_zero")
        .expect("signed-zero profile");
    assert_eq!(signed_zero.finite_count, Some(2));
    assert_eq!(signed_zero.non_finite_count, 2);
    assert_eq!(signed_zero.distinct_count, Some(1));
    assert_eq!(signed_zero.is_constant, Some(true));

    let varied = metadata
        .column_profiles
        .iter()
        .find(|profile| profile.name == "varied")
        .expect("varied profile");
    assert_eq!(varied.finite_count, Some(3));
    assert_eq!(varied.non_finite_count, 1);
    assert_eq!(varied.distinct_count, Some(2));
    assert_eq!(varied.is_constant, Some(false));
}

#[test]
fn completed_profiles_report_zero_runs_and_skip_nulls() {
    let base = 1_700_000_000_000_i64;
    let df = DataFrame::new(
        7,
        vec![
            polars::prelude::Series::new(
                "ts".into(),
                (0..7).map(|index| base + index * 1_000).collect::<Vec<_>>(),
            )
            .into(),
            polars::prelude::Series::new(
                "signal".into(),
                vec![
                    Some(0.0_f64),
                    Some(1.0),
                    None,
                    Some(0.0),
                    Some(1.0),
                    Some(0.0),
                    Some(0.0),
                ],
            )
            .into(),
        ],
    )
    .expect("dataframe");

    let metadata = build_dataset_metadata(&df, false, None).expect("metadata");
    let profile = metadata
        .column_profiles
        .iter()
        .find(|profile| profile.name == "signal")
        .expect("signal profile");
    assert_eq!(profile.zero_count, Some(4));
    assert_eq!(profile.longest_zero_run, Some(2));
    assert_eq!(profile.longest_zero_run_start_ms, Some(base + 5_000));
    assert_eq!(profile.longest_zero_run_end_ms, Some(base + 6_000));
}

#[tokio::test(flavor = "multi_thread")]
async fn sample_dataset_exact_profile_completes() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../ETTm2.csv");
    let artifacts = tempfile::tempdir().expect("artifact directory");
    let mut config = AppConfig::default();
    config.data.artifact_dir = Some(artifacts.path().to_path_buf());
    let state = AppState::new(DataFrame::default(), config);
    let loaded = edatime_ingest::ingest::load_lazyframe_partial(
        &path,
        &edatime_ingest::ingest::IngestParams::default(),
    )
    .expect("sample ingest");
    state
        .replace_dataset_lazy_root(
            loaded.frame,
            Some("ETTm2.csv".into()),
            loaded.time_column_name.expect("time column"),
        )
        .await
        .expect("managed sample upload");
    let _ = start_profile(State(state.clone())).await.expect("start");
    for _ in 0..1000 {
        let response = get_profile(State(state.clone())).await.expect("profile").0;
        assert!(
            matches!(response.status.as_str(), "queued" | "running" | "ready"),
            "unexpected profile state: {} {:?}",
            response.status,
            response.job
        );
        if response.status == "ready" {
            let report: DatasetMetadata =
                serde_json::from_value(response.metadata.expect("report"))
                    .expect("profile metadata");
            assert_eq!(report.total_rows, 69_680);
            assert_eq!(report.column_profiles.len(), 8);
            assert_eq!(report.profile_status, "exact");
            for column in &report.column_profiles {
                assert_eq!(column.non_null_count, report.total_rows);
                assert_eq!(column.null_count, 0);
            }
            let hufl = report
                .column_profiles
                .iter()
                .find(|column| column.name == "HUFL")
                .expect("HUFL profile");
            assert!(hufl.min.is_some() && hufl.max.is_some());
            assert!(hufl.histogram.is_some());
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    panic!("sample profile did not finish");
}

#[tokio::test]
async fn exact_profile_job_is_reused_and_publishes_source_bound_metadata() {
    let df = DataFrame::new(
        3,
        vec![
            polars::prelude::Series::new("ts".into(), vec![1_i64, 2, 3]).into(),
            polars::prelude::Series::new("value".into(), vec![Some(1.0_f64), None, Some(3.0)])
                .into(),
        ],
    )
    .expect("dataframe");
    let state = AppState::new(df, AppConfig::default());

    let first = start_profile(State(state.clone()))
        .await
        .expect("start profile")
        .0;
    let second = start_profile(State(state.clone()))
        .await
        .expect("reuse profile")
        .0;
    assert_eq!(
        first.job.as_ref().map(|job| &job.id),
        second.job.as_ref().map(|job| &job.id)
    );
    assert!(matches!(
        first.status.as_str(),
        "queued" | "running" | "ready"
    ));

    let mut report = None;
    for _ in 0..100 {
        let response = get_profile(State(state.clone()))
            .await
            .expect("get profile")
            .0;
        if response.status == "ready" {
            report = response.metadata;
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    let report = report.expect("completed exact profile");
    assert_eq!(
        report["source_version_id"],
        serde_json::json!(first.source_version.id)
    );
    assert_eq!(
        report["revision"],
        serde_json::json!(first.source_version.revision)
    );
    assert_eq!(
        report["column_profiles"][1]["null_count"],
        serde_json::json!(1)
    );
}

#[tokio::test]
async fn sampled_profile_is_bounded_and_marked_as_an_estimate() {
    let rows = SAMPLED_PROFILE_ROW_CAP + 5;
    let df = DataFrame::new(
        rows,
        vec![
            polars::prelude::Series::new(
                "ts".into(),
                (0..rows).map(|value| value as i64).collect::<Vec<_>>(),
            )
            .into(),
            polars::prelude::Series::new(
                "value".into(),
                (0..rows).map(|value| value as f64).collect::<Vec<_>>(),
            )
            .into(),
        ],
    )
    .expect("dataframe");
    let state = AppState::new(df, AppConfig::default());

    let start = start_sample_profile(State(state.clone()))
        .await
        .expect("start sample profile")
        .0;
    assert_eq!(start.algorithm_version, SAMPLED_PROFILE_ALGORITHM_VERSION);

    let mut report = None;
    for _ in 0..100 {
        let response = get_sample_profile(State(state.clone()))
            .await
            .expect("get sample profile")
            .0;
        if response.status == "ready" {
            report = response.metadata;
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    let report = report.expect("completed sampled profile");
    assert_eq!(report["profile_status"], serde_json::json!("sampled"));
    assert_eq!(
        report["profile_sampling"]["source_rows"],
        serde_json::json!(rows)
    );
    assert!(report.get("time_quality").is_none());
    let value_profile = report["column_profiles"]
        .as_array()
        .unwrap()
        .iter()
        .find(|profile| profile["name"] == "value")
        .unwrap();
    assert_eq!(value_profile["max"], serde_json::json!((rows - 1) as f64));
    assert_eq!(
        report["profile_sample_rows"],
        serde_json::json!(SAMPLED_PROFILE_ROW_CAP)
    );
    assert_eq!(
        report["total_rows"],
        serde_json::json!(SAMPLED_PROFILE_ROW_CAP)
    );
}

#[test]
fn builds_metadata_from_csv_path_without_full_ingest() {
    let file = tempfile::NamedTempFile::new().expect("tempfile");
    fs::write(
        file.path(),
        "time,value,other\n2024-01-01T00:00:00Z,1,10\n2024-01-01T00:00:01Z,2,20\n",
    )
    .expect("write csv");

    let metadata = build_dataset_metadata_from_path_with_time_column(file.path(), None)
        .expect("metadata from path");
    assert_eq!(metadata.total_rows, 2);
    assert_eq!(
        metadata.numeric_columns,
        vec!["value".to_string(), "other".to_string()]
    );
    assert!(metadata.time_range.is_some());
}

#[test]
fn lazy_csv_profile_counts_non_finite_values() {
    let file = tempfile::NamedTempFile::new().expect("tempfile");
    fs::write(
        file.path(),
        "time,value\n2024-01-01T00:00:00Z,1\n2024-01-01T00:00:01Z,NaN\n",
    )
    .expect("write csv");

    let metadata = build_dataset_metadata_from_path_with_time_column(file.path(), None)
        .expect("metadata from csv");
    let profile = metadata
        .column_profiles
        .iter()
        .find(|profile| profile.name == "value")
        .expect("value profile");
    assert_eq!(profile.non_finite_count, 1);
}

#[test]
fn builds_metadata_from_csv_path_without_time_column() {
    let file = tempfile::NamedTempFile::new().expect("tempfile");
    fs::write(file.path(), "value,other\n1,10\n2,20\n").expect("write csv");

    let metadata = build_dataset_metadata_from_path_with_time_column(file.path(), None)
        .expect("metadata from path");
    assert_eq!(metadata.total_rows, 2);
    assert_eq!(metadata.time_column, None);
    assert_eq!(metadata.time_range, None);
    assert_eq!(
        metadata.numeric_columns,
        vec!["value".to_string(), "other".to_string()]
    );
}

#[test]
fn builds_metadata_from_csv_path_with_unix_time_seconds() {
    let file = tempfile::NamedTempFile::new().expect("tempfile");
    fs::write(file.path(), "timestamp,value\n1700000000,1\n1700000001,2\n").expect("write csv");

    let metadata = build_dataset_metadata_from_path_with_time_column(file.path(), None)
        .expect("metadata from path");
    assert_eq!(metadata.total_rows, 2);
    assert!(metadata.time_range.is_some());
    let tr = metadata.time_range.unwrap();
    assert_eq!(tr.min, 1700000000000);
    assert_eq!(tr.max, 1700000001000);
}
