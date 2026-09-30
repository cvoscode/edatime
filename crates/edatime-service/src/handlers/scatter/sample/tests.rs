use super::{
    ScatterColorKind, TimeColorMode, collect_sampled_xyc_rows, collect_sampled_xyc_rows_streaming,
};
use polars::prelude::{DataFrame, IntoLazy, NamedFrom, Series};

fn build_xy_df(n: usize) -> DataFrame {
    let xs: Vec<f64> = (0..n).map(|i| i as f64).collect();
    let ys: Vec<f64> = (0..n).map(|i| (i as f64).sin()).collect();
    DataFrame::new(
        n,
        vec![
            Series::new("x".into(), xs).into(),
            Series::new("y".into(), ys).into(),
        ],
    )
    .expect("test xy dataframe should build")
}

#[test]
fn total_points_counts_full_frame_beyond_effective_limit() {
    let df = build_xy_df(1_000);
    let (total, sampled, _) = collect_sampled_xyc_rows(
        &df,
        "x",
        "y",
        None,
        None,
        100,
        100,
        TimeColorMode::default(),
    )
    .expect("sample");
    assert_eq!(
        total, 1_000,
        "total must count every valid row, not the head slice"
    );
    assert!(
        sampled.len() <= 100,
        "sampled set must respect effective_limit"
    );
}

#[test]
fn categorical_color_labels_stay_aligned_with_xy() {
    let n = 40;
    let xs: Vec<f64> = (0..n).map(|i| i as f64).collect();
    let ys: Vec<f64> = (0..n).map(|i| i as f64 * 0.5).collect();
    let labels: Vec<&str> = (0..n)
        .map(|i| if i % 2 == 0 { "even" } else { "odd" })
        .collect();
    let df = DataFrame::new(
        n,
        vec![
            Series::new("x".into(), xs).into(),
            Series::new("y".into(), ys).into(),
            Series::new("group".into(), labels).into(),
        ],
    )
    .expect("test dataframe should build");

    let (total, sampled, kind) = collect_sampled_xyc_rows(
        &df,
        "x",
        "y",
        Some("group"),
        None,
        1_000,
        1_000,
        TimeColorMode::default(),
    )
    .expect("sample categorical");
    assert_eq!(total, n);
    assert_eq!(kind, Some(ScatterColorKind::Categorical));
    for row in &sampled {
        assert!(row.color_value.is_none());
        assert!(
            row.color_label.is_some(),
            "categorical label must be present"
        );
    }
    let x_values: Vec<f64> = sampled.iter().map(|r| r.x).collect();
    let mut sorted_x = x_values.clone();
    sorted_x.sort_by(|a, b| a.partial_cmp(b).unwrap());
    assert_eq!(
        x_values, sorted_x,
        "x values must remain finite and aligned with labels"
    );
}

#[test]
fn continuous_color_handles_missing_values_without_breaking_alignment() {
    let n = 50;
    let xs: Vec<f64> = (0..n).map(|i| i as f64).collect();
    let ys: Vec<f64> = (0..n).map(|i| i as f64 * 2.0).collect();
    let colors: Vec<Option<f64>> = (0..n)
        .map(|i| if i % 5 == 0 { None } else { Some(i as f64) })
        .collect();
    let df = DataFrame::new(
        n,
        vec![
            Series::new("x".into(), xs).into(),
            Series::new("y".into(), ys).into(),
            Series::new("c".into(), colors).into(),
        ],
    )
    .expect("test dataframe should build");

    let (total, sampled, kind) = collect_sampled_xyc_rows(
        &df,
        "x",
        "y",
        Some("c"),
        None,
        1_000,
        1_000,
        TimeColorMode::default(),
    )
    .expect("sample continuous");
    assert_eq!(total, n);
    assert_eq!(kind, Some(ScatterColorKind::Continuous));
    assert!(!sampled.is_empty());
    for row in &sampled {
        // color_value may be None when source was None; size and xy must be finite.
        assert!(row.x.is_finite() && row.y.is_finite());
    }
}

#[test]
fn size_column_stays_aligned_with_xy() {
    let n = 30;
    let xs: Vec<f64> = (0..n).map(|i| i as f64).collect();
    let ys: Vec<f64> = (0..n).map(|i| i as f64 * 1.5).collect();
    let sizes: Vec<Option<f64>> = (0..n).map(|i| Some(10.0 + i as f64)).collect();
    let df = DataFrame::new(
        n,
        vec![
            Series::new("x".into(), xs).into(),
            Series::new("y".into(), ys).into(),
            Series::new("s".into(), sizes).into(),
        ],
    )
    .expect("test dataframe should build");

    let (total, sampled, _) = collect_sampled_xyc_rows(
        &df,
        "x",
        "y",
        None,
        Some("s"),
        1_000,
        1_000,
        TimeColorMode::default(),
    )
    .expect("sample with size");
    assert_eq!(total, n);
    assert_eq!(sampled.len(), n);
    for (idx, row) in sampled.iter().enumerate() {
        assert!(row.size_value.is_some());
        assert!((row.size_value.unwrap() - (10.0 + idx as f64)).abs() < 1e-9);
    }
}

#[test]
fn full_frame_total_counted_beyond_effective_limit() {
    let df = build_xy_df(500);
    let (total, sampled, _) =
        collect_sampled_xyc_rows(&df, "x", "y", None, None, 50, 50, TimeColorMode::default())
            .expect("sample");
    assert_eq!(
        total, 500,
        "total must reflect every valid row, not the head"
    );
    assert!(
        sampled.len() <= 50,
        "sampled set must respect effective_limit"
    );
    // When rows exceed effective_limit, total must be greater than the sampled set.
    assert!(total > sampled.len());
}

#[test]
fn streaming_reservoir_is_seeded_bounded_and_repeatable() {
    let df = build_xy_df(10_000);
    let (_, first, _) = collect_sampled_xyc_rows_streaming(
        df.clone().lazy(),
        "x",
        "y",
        None,
        None,
        127,
        TimeColorMode::default(),
        "source-0|revision-1|x|y",
    )
    .expect("first streaming sample");
    let (total, second, _) = collect_sampled_xyc_rows_streaming(
        df.lazy(),
        "x",
        "y",
        None,
        None,
        127,
        TimeColorMode::default(),
        "source-0|revision-1|x|y",
    )
    .expect("second streaming sample");

    assert_eq!(total, 10_000);
    assert_eq!(first.len(), 127);
    assert_eq!(
        first.iter().map(|row| row.x).collect::<Vec<_>>(),
        second.iter().map(|row| row.x).collect::<Vec<_>>(),
        "the immutable request seed must select the same reservoir"
    );
    assert!(
        first.iter().any(|row| row.x > 9_000.0),
        "the reservoir must not be a head slice"
    );

    let (_, wider, _) = collect_sampled_xyc_rows_streaming(
        build_xy_df(10_000).lazy(),
        "x",
        "y",
        None,
        None,
        511,
        TimeColorMode::default(),
        "source-0|revision-1|x|y",
    )
    .expect("wider streaming sample");
    let wider_points = wider
        .iter()
        .map(|row| row.x as u64)
        .collect::<std::collections::HashSet<_>>();
    assert!(
        first
            .iter()
            .all(|row| wider_points.contains(&(row.x as u64))),
        "reducing capacity must retain a subset of the same seeded reservoir"
    );
}

#[test]
fn datetime_color_column_buckets_by_hour_of_day() {
    // Regression test for audit issue 3.1: a datetime color column
    // must NOT be emitted as raw epoch-ms — that produces a useless
    // continuous colorbar. Default mode buckets to hour-of-day.
    use polars::prelude::{DataType, TimeUnit};
    // Six samples: 00:30, 06:00, 12:30, 18:00, 22:30, 23:45 (UTC).
    let timestamps_ms: Vec<i64> = vec![
        30 * 60 * 1000,                  // 00:30
        6 * 3_600 * 1000,                // 06:00
        12 * 3_600 * 1000 + 30 * 60_000, // 12:30
        18 * 3_600 * 1000,               // 18:00
        22 * 3_600 * 1000 + 30 * 60_000, // 22:30
        23 * 3_600 * 1000 + 45 * 60_000, // 23:45
    ];
    let xs: Vec<f64> = (0..6).map(|i| i as f64).collect();
    let ys: Vec<f64> = (0..6).map(|i| (i as f64) * 2.0).collect();
    let ts_series = Series::new("ts".into(), timestamps_ms)
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .expect("ts cast should succeed in test");
    let df = DataFrame::new(
        6,
        vec![
            ts_series.into(),
            Series::new("x".into(), xs).into(),
            Series::new("y".into(), ys).into(),
        ],
    )
    .expect("test dataframe should build");

    let (_, sampled, kind) = collect_sampled_xyc_rows(
        &df,
        "x",
        "y",
        Some("ts"),
        None,
        1_000,
        1_000,
        TimeColorMode::Bucket,
    )
    .expect("sample bucketed datetime color");

    assert_eq!(kind, Some(ScatterColorKind::Categorical));
    let expected: Vec<&str> = vec![
        "00\u{2013}01",
        "06\u{2013}07",
        "12\u{2013}13",
        "18\u{2013}19",
        "22\u{2013}23",
        "23\u{2013}00",
    ];
    for (row, label) in sampled.iter().zip(expected.iter()) {
        assert!(
            row.color_value.is_none(),
            "bucketed color must not carry a numeric value"
        );
        assert_eq!(
            row.color_label.as_deref(),
            Some(*label),
            "wrong bucket label"
        );
    }
}

#[test]
fn datetime_color_column_raw_mode_emits_epoch_ms_when_requested() {
    // The legacy `time_color_mode=raw` mode still emits continuous
    // epoch-ms so existing clients and tests can opt in.
    use polars::prelude::{DataType, TimeUnit};
    let timestamps_ms: Vec<i64> = vec![30 * 60 * 1000, 6 * 3_600 * 1000];
    let xs: Vec<f64> = (0..2).map(|i| i as f64).collect();
    let ys: Vec<f64> = (0..2).map(|i| (i as f64) * 2.0).collect();
    let ts_series = Series::new("ts".into(), timestamps_ms)
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .expect("ts cast should succeed in test");
    let df = DataFrame::new(
        2,
        vec![
            ts_series.into(),
            Series::new("x".into(), xs).into(),
            Series::new("y".into(), ys).into(),
        ],
    )
    .expect("test dataframe should build");

    let (_, sampled, kind) = collect_sampled_xyc_rows(
        &df,
        "x",
        "y",
        Some("ts"),
        None,
        1_000,
        1_000,
        TimeColorMode::Raw,
    )
    .expect("sample raw datetime color");

    assert_eq!(kind, Some(ScatterColorKind::Continuous));
    let value: f64 = sampled[0]
        .color_value
        .expect("raw color must carry a numeric value");
    assert!((value - 30.0 * 60.0 * 1000.0).abs() < 1e-6);
    let value2: f64 = sampled[1]
        .color_value
        .expect("raw color must carry a numeric value");
    assert!((value2 - 6.0 * 3_600.0 * 1000.0).abs() < 1e-6);
}
