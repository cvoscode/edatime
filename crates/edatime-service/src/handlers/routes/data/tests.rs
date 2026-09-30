use super::*;
use axum::{Json, extract::State};
use edatime_core::config::AppConfig;
use edatime_store::state::AppState;
use polars::prelude::{DataFrame, NamedFrom, Series};

/// Build a small frame with a single numeric column and a datetime
/// `date` column covering 2018.
fn build_test_state() -> AppState {
    let ts_ms: Vec<i64> = vec![
        1_514_764_800_000, // 2018-01-01
        1_517_424_000_000, // 2018-01-15
        1_520_169_600_000, // 2018-02-01
    ];
    let xs: Vec<f64> = vec![1.0, 2.0, 3.0];
    let ts_series = Series::new("ts".into(), ts_ms)
        .cast(&polars::prelude::DataType::Datetime(
            polars::prelude::TimeUnit::Milliseconds,
            None,
        ))
        .expect("cast date column");
    let df = DataFrame::new(
        3,
        vec![ts_series.into(), Series::new("HUFL".into(), xs).into()],
    )
    .expect("test dataframe should build");
    AppState::new(df, AppConfig::default())
}

fn build_duplicate_timestamp_state() -> AppState {
    let rows = 1_000usize;
    let timestamps = vec![1_514_764_800_000_i64; rows];
    let values = (0..rows).map(|index| index as f64).collect::<Vec<_>>();
    let ts = Series::new("ts".into(), timestamps)
        .cast(&polars::prelude::DataType::Datetime(
            polars::prelude::TimeUnit::Milliseconds,
            None,
        ))
        .expect("duplicate timestamp cast");
    let frame = DataFrame::new(
        rows,
        vec![ts.into(), Series::new("HUFL".into(), values).into()],
    )
    .expect("duplicate timestamp frame");
    AppState::new(frame, AppConfig::default())
}

fn build_large_nan_state() -> AppState {
    let rows = 10_000usize;
    let ts_ms: Vec<i64> = (0..rows)
        .map(|index| 1_514_764_800_000_i64 + index as i64 * 1_000)
        .collect();
    let mut values: Vec<f64> = (0..rows).map(|index| (index as f64 * 0.01).sin()).collect();
    values[rows / 2] = f64::NAN;
    let ts_series = Series::new("ts".into(), ts_ms)
        .cast(&polars::prelude::DataType::Datetime(
            polars::prelude::TimeUnit::Milliseconds,
            None,
        ))
        .expect("cast date column");
    let df = DataFrame::new(
        rows,
        vec![ts_series.into(), Series::new("HUFL".into(), values).into()],
    )
    .expect("test dataframe should build");
    AppState::new(df, AppConfig::default())
}

fn baseline_data_request(
    state: &AppState,
    start: &str,
    end: &str,
    width: usize,
) -> PlanAwareDataQuery {
    let version = state.current_dataset_version().expect("source version");
    serde_json::from_value(serde_json::json!({
        "start": start,
        "end": end,
        "width": width,
        "columns": "HUFL",
        "cleaning_plan": {
            "plan": {
                "schemaVersion": 1,
                "id": "baseline-plan",
                "planRevision": 1,
                "sourceVersionId": version.id,
                "datasetRevision": version.revision,
                "datasetFingerprint": version.dataset_fingerprint,
                "schemaFingerprint": version.schema_fingerprint,
                "timeColumn": "ts",
                "sourceName": null,
                "stages": [],
                "createdAt": "2026-07-15T00:00:00Z",
                "updatedAt": "2026-07-15T00:00:00Z"
            },
            "expectedPlanHash": null,
            "expectedSourceVersionId": version.id,
            "expectedDatasetRevision": version.revision
        }
    }))
    .expect("baseline plan-aware data request")
}

#[test]
fn plan_aware_data_query_requires_a_cleaning_plan() {
    let request = serde_json::json!({
        "start": "2018-01-01T00:00:00Z",
        "end": "2018-01-02T00:00:00Z",
        "width": 400,
        "columns": "HUFL"
    });
    assert!(serde_json::from_value::<PlanAwareDataQuery>(request).is_err());
}

/// Regression test for audit issue 2.3: a future time window used
/// to return an empty Arrow payload without any signal that no
/// data was found. The handler now sets `x-edatime-empty: 1` on
/// the response so the frontend can render an explicit
/// "no data in range" message.
#[tokio::test(flavor = "multi_thread")]
async fn post_data_emits_empty_header_when_no_rows_match() {
    let state = build_test_state();
    let request =
        baseline_data_request(&state, "2030-01-01T00:00:00Z", "2031-01-01T00:00:00Z", 400);
    let response = post_data(State(state), Json(request))
        .await
        .expect("future window should be a valid request that returns empty");
    let empty = response
        .headers()
        .get("x-edatime-empty")
        .and_then(|v| v.to_str().ok());
    assert_eq!(
        empty,
        Some("1"),
        "empty future window must set x-edatime-empty: 1"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn post_data_emits_empty_zero_header_when_rows_match() {
    let state = build_test_state();
    let request =
        baseline_data_request(&state, "2018-01-01T00:00:00Z", "2018-02-01T00:00:00Z", 400);
    let response = post_data(State(state), Json(request))
        .await
        .expect("normal window should succeed");
    let empty = response
        .headers()
        .get("x-edatime-empty")
        .and_then(|v| v.to_str().ok());
    assert_eq!(
        empty,
        Some("0"),
        "non-empty window must set x-edatime-empty: 0"
    );
    assert_eq!(
        response
            .headers()
            .get("x-edatime-downsampled")
            .and_then(|value| value.to_str().ok()),
        Some("0"),
        "an untouched exact window must not be marked downsampled"
    );
}

/// Regression test for audit issue 1.4: the response must expose
/// `x-edatime-filtered-rows` and `x-edatime-dropped-rows` so the
/// frontend can tell when a range produced zero rows because the
/// time window itself was empty (filtered_rows == 0) vs. because
/// filters / non-finite cleanup removed rows after the time
/// filter. The `build_test_state` fixture has 3 rows total; a
/// normal in-range request should report filtered_rows == 2 and
/// dropped_rows == 0 (LTTB `width=400` is far above the row
/// count so no LTTB reduction kicks in).
#[tokio::test(flavor = "multi_thread")]
async fn post_data_emits_filtered_and_dropped_rows_headers() {
    let state = build_test_state();
    let request =
        baseline_data_request(&state, "2018-01-01T00:00:00Z", "2018-02-01T00:00:00Z", 400);
    let response = post_data(State(state), Json(request))
        .await
        .expect("normal window should succeed");

    let filtered = response
        .headers()
        .get("x-edatime-filtered-rows")
        .and_then(|v| v.to_str().ok());
    let dropped = response
        .headers()
        .get("x-edatime-dropped-rows")
        .and_then(|v| v.to_str().ok());
    assert_eq!(
        filtered,
        Some("2"),
        "x-edatime-filtered-rows must equal the pre-LTTB row count"
    );
    assert_eq!(
        dropped,
        Some("0"),
        "x-edatime-dropped-rows must be 0 when the LTTB target is above the filtered row count"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn post_data_keeps_nan_series_at_the_viewport_cap() {
    let state = build_large_nan_state();
    let request = baseline_data_request(&state, "2018-01-01T00:00:00Z", "2018-01-02T00:00:00Z", 50);

    let response = post_data(State(state), Json(request))
        .await
        .expect("NaN-containing time series should remain renderable");
    let returned = response
        .headers()
        .get("x-edatime-returned-rows")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<usize>().ok())
        .expect("returned rows");
    assert!(
        returned <= 100,
        "one NaN must not bypass the viewport-derived cap"
    );
    assert_eq!(
        response
            .headers()
            .get("x-edatime-sampling-algorithm")
            .and_then(|value| value.to_str().ok()),
        Some("envelope-lttb-v1")
    );
    assert_eq!(
        response
            .headers()
            .get("x-edatime-downsampled")
            .and_then(|value| value.to_str().ok()),
        Some("1")
    );
    assert!(
        response
            .headers()
            .get("x-edatime-candidate-rows")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<usize>().ok())
            .is_some_and(|candidates| candidates <= 400),
        "bounded envelope must cap the collected candidates"
    );
}

fn request_with_sort(
    state: &AppState,
    start: &str,
    end: &str,
    width: usize,
    column: &str,
    descending: bool,
) -> PlanAwareDataQuery {
    let mut request = baseline_data_request(state, start, end, width);
    request.query.format = Some("json".to_string());
    request.cleaning_plan.plan.stages = vec![
        serde_json::from_value(serde_json::json!({
            "kind": "sort",
            "id": "sort-for-test",
            "enabled": true,
            "executionClass": "polarsExpression",
            "scope": "row",
            "sourcePage": "timeseries",
            "label": "test ordering",
            "note": null,
            "createdAt": "2026-07-15T00:00:00Z",
            "updatedAt": "2026-07-15T00:00:00Z",
            "columns": [column],
            "descending": descending,
            "nullsLast": true
        }))
        .expect("sort stage"),
    ];
    request
}

async fn json_timestamps(response: Response, time_column: &str) -> Vec<f64> {
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("JSON body");
    let payload: serde_json::Value = serde_json::from_slice(&bytes).expect("JSON payload");
    payload[time_column]
        .as_array()
        .expect("timestamp array")
        .iter()
        .map(|value| value.as_f64().expect("numeric timestamp"))
        .collect()
}

fn build_high_resolution_state(unit: polars::prelude::TimeUnit) -> AppState {
    let rows = 1_000usize;
    let multiplier = match unit {
        polars::prelude::TimeUnit::Milliseconds => 1_i64,
        polars::prelude::TimeUnit::Microseconds => 1_000_i64,
        polars::prelude::TimeUnit::Nanoseconds => 1_000_000_i64,
    };
    let origin_ms = 1_704_067_200_000_i64;
    let timestamps = (0..rows)
        .map(|index| origin_ms * multiplier + index as i64 * 1_000 * multiplier)
        .collect::<Vec<_>>();
    let ts = Series::new("ts".into(), timestamps)
        .cast(&polars::prelude::DataType::Datetime(unit, None))
        .expect("timestamp cast");
    let values = (0..rows)
        .map(|index| (index as f64).sin())
        .collect::<Vec<_>>();
    let frame = DataFrame::new(
        rows,
        vec![ts.into(), Series::new("HUFL".into(), values).into()],
    )
    .expect("high-resolution frame");
    AppState::new(frame, AppConfig::default())
}

fn build_daily_date_state() -> AppState {
    let rows = 1_000usize;
    let first_day_since_epoch = 18_262_i32; // 2020-01-01
    let timestamps = (0..rows)
        .map(|index| first_day_since_epoch + index as i32)
        .collect::<Vec<_>>();
    let ts = Series::new("ts".into(), timestamps)
        .cast(&polars::prelude::DataType::Date)
        .expect("daily Date cast");
    let values = (0..rows)
        .map(|index| (index as f64).sin())
        .collect::<Vec<_>>();
    let frame = DataFrame::new(
        rows,
        vec![ts.into(), Series::new("HUFL".into(), values).into()],
    )
    .expect("daily Date frame");
    AppState::new(frame, AppConfig::default())
}

fn build_date_state() -> AppState {
    let days_since_epoch = vec![19_723_i32, 19_724, 19_725];
    let ts = Series::new("ts".into(), days_since_epoch)
        .cast(&polars::prelude::DataType::Date)
        .expect("date cast");
    let frame = DataFrame::new(
        3,
        vec![
            ts.into(),
            Series::new("HUFL".into(), vec![1.0_f64, 2.0, 3.0]).into(),
        ],
    )
    .expect("date frame");
    AppState::new(frame, AppConfig::default())
}

#[tokio::test(flavor = "multi_thread")]
async fn post_data_restores_chronological_order_after_cleaning_sorts() {
    let state = build_test_state();
    for sort_column in ["ts", "HUFL"] {
        let request = request_with_sort(
            &state,
            "2018-01-01T00:00:00Z",
            "2018-03-01T00:00:00Z",
            400,
            sort_column,
            true,
        );
        let response = post_data(State(state.clone()), Json(request))
            .await
            .expect("sorted Signals response");
        let timestamps = json_timestamps(response, "ts").await;
        assert!(
            timestamps.windows(2).all(|pair| pair[0] <= pair[1]),
            "Signals timestamps should be ascending after a {sort_column} sort"
        );
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn post_data_uses_epoch_ms_envelope_width_for_ms_us_and_ns() {
    let mut candidate_counts = Vec::new();
    for unit in [
        polars::prelude::TimeUnit::Milliseconds,
        polars::prelude::TimeUnit::Microseconds,
        polars::prelude::TimeUnit::Nanoseconds,
    ] {
        let state = build_high_resolution_state(unit);
        let mut unit_candidate_counts = Vec::new();
        for sort_column in ["ts", "HUFL"] {
            let request = request_with_sort(
                &state,
                "2024-01-01T00:00:00Z",
                "2024-01-01T00:16:40Z",
                50,
                sort_column,
                true,
            );
            let response = post_data(State(state.clone()), Json(request))
                .await
                .expect("high-resolution Signals response");
            assert_eq!(
                response
                    .headers()
                    .get("x-edatime-filtered-rows")
                    .and_then(|value| value.to_str().ok()),
                Some("1000"),
                "all source units should filter the same requested rows"
            );
            let candidate_count = response
                .headers()
                .get("x-edatime-candidate-rows")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse::<usize>().ok())
                .expect("candidate row count");
            assert!(
                candidate_count > 4 && candidate_count <= 400,
                "{unit:?} {sort_column} candidate count was {candidate_count}"
            );
            unit_candidate_counts.push(candidate_count);
            let timestamps = json_timestamps(response, "ts").await;
            assert!(timestamps.windows(2).all(|pair| pair[0] <= pair[1]));
        }
        assert_eq!(unit_candidate_counts[0], unit_candidate_counts[1]);
        candidate_counts.push(unit_candidate_counts[0]);
    }
    assert!(
        candidate_counts
            .iter()
            .all(|count| *count == candidate_counts[0]),
        "equivalent ms/us/ns sources should produce comparable envelope sizes: {candidate_counts:?}"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn post_data_date_window_excludes_midnights_outside_requested_bounds() {
    let state = build_date_state();
    for (start, end, expected) in [
        (
            "2024-01-01T12:00:00Z",
            "2024-01-02T12:00:00Z",
            vec![1_704_153_600_000.0],
        ),
        ("2024-01-01T12:00:00Z", "2024-01-01T18:00:00Z", vec![]),
        (
            "2024-01-01T00:00:00Z",
            "2024-01-02T00:00:00Z",
            vec![1_704_067_200_000.0, 1_704_153_600_000.0],
        ),
    ] {
        let mut request = baseline_data_request(&state, start, end, 400);
        request.query.format = Some("json".to_string());
        let response = post_data(State(state.clone()), Json(request))
            .await
            .expect("Date viewport response");
        assert_eq!(
            json_timestamps(response, "ts").await,
            expected,
            "{start} to {end}"
        );
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn post_data_converts_epoch_ms_bounds_for_date_columns() {
    let state = build_date_state();
    let request =
        baseline_data_request(&state, "2024-01-01T00:00:00Z", "2024-01-04T00:00:00Z", 400);
    let response = post_data(State(state), Json(request))
        .await
        .expect("Date column Signals response");
    assert_eq!(
        response
            .headers()
            .get("x-edatime-filtered-rows")
            .and_then(|value| value.to_str().ok()),
        Some("3")
    );

    let state = build_daily_date_state();
    let request = request_with_sort(
        &state,
        "2020-01-01T00:00:00Z",
        "2022-09-27T00:00:00Z",
        50,
        "HUFL",
        true,
    );
    let response = post_data(State(state), Json(request))
        .await
        .expect("downsampled Date column Signals response");
    assert_eq!(
        response
            .headers()
            .get("x-edatime-filtered-rows")
            .and_then(|value| value.to_str().ok()),
        Some("1000")
    );
    let candidates = response
        .headers()
        .get("x-edatime-candidate-rows")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<usize>().ok())
        .expect("Date candidate count");
    assert!(candidates > 4 && candidates <= 408);
    let timestamps = json_timestamps(response, "ts").await;
    assert!(timestamps.windows(2).all(|pair| pair[0] <= pair[1]));
}

#[tokio::test(flavor = "multi_thread")]
async fn envelope_only_reduction_is_reported_as_downsampled() {
    let state = build_duplicate_timestamp_state();
    let request = baseline_data_request(&state, "2018-01-01T00:00:00Z", "2018-01-01T00:01:00Z", 50);
    let response = post_data(State(state), Json(request))
        .await
        .expect("duplicate timestamp response");
    assert_eq!(
        response
            .headers()
            .get("x-edatime-filtered-rows")
            .and_then(|value| value.to_str().ok()),
        Some("1000")
    );
    assert_eq!(
        response
            .headers()
            .get("x-edatime-candidate-rows")
            .and_then(|value| value.to_str().ok()),
        Some("4")
    );
    assert_eq!(
        response
            .headers()
            .get("x-edatime-returned-rows")
            .and_then(|value| value.to_str().ok()),
        Some("4")
    );
    assert_eq!(
        response
            .headers()
            .get("x-edatime-approximate")
            .and_then(|value| value.to_str().ok()),
        Some("1")
    );
    assert_eq!(
        response
            .headers()
            .get("x-edatime-downsampled")
            .and_then(|value| value.to_str().ok()),
        Some("1")
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn post_data_applies_cleaning_plan_before_reduction() {
    let state = build_test_state();
    let version = state.current_dataset_version().expect("source version");
    let request: PlanAwareDataQuery = serde_json::from_value(serde_json::json!({
        "start": "2018-01-01T00:00:00Z",
        "end": "2018-04-01T00:00:00Z",
        "width": 400,
        "columns": "HUFL",
        "color_column": null,
        "lookaround_ms": null,
        "format": null,
        "cleaning_plan": {
            "plan": {
                "schemaVersion": 1,
                "id": "plan-1",
                "planRevision": 1,
                "sourceVersionId": version.id,
                "datasetRevision": version.revision,
                "datasetFingerprint": version.dataset_fingerprint,
                "schemaFingerprint": version.schema_fingerprint,
                "timeColumn": "ts",
                "sourceName": null,
                "stages": [{
                    "kind": "columnRange",
                    "id": "range-1",
                    "enabled": true,
                    "executionClass": "polarsExpression",
                    "scope": "row",
                    "sourcePage": "timeseries",
                    "label": "keep upper values",
                    "note": null,
                    "createdAt": "2026-07-15T00:00:00Z",
                    "updatedAt": "2026-07-15T00:00:00Z",
                    "column": "HUFL",
                    "from": 2.0,
                    "to": 3.0,
                    "mode": "keepInside"
                }],
                "createdAt": "2026-07-15T00:00:00Z",
                "updatedAt": "2026-07-15T00:00:00Z"
            },
            "expectedPlanHash": null,
            "expectedSourceVersionId": version.id,
            "expectedDatasetRevision": version.revision
        }
    }))
    .expect("plan-aware data request");

    let response = post_data(State(state), Json(request))
        .await
        .expect("plan-aware data response");

    assert_eq!(
        response
            .headers()
            .get("x-edatime-filtered-rows")
            .and_then(|value| value.to_str().ok()),
        Some("3"),
    );
    assert!(
        response
            .headers()
            .get("x-edatime-plan-hash")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| !value.is_empty()),
    );
    assert_eq!(
        response
            .headers()
            .get("x-edatime-source-version")
            .and_then(|value| value.to_str().ok()),
        Some("source-0"),
    );
    assert!(
        response
            .headers()
            .get("x-edatime-schema-fingerprint")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with("fnv1a-"))
    );
}
