use super::*;
use polars::prelude::{DataFrame, DataType, IntoLazy, NamedFrom, Series, TimeUnit};

fn base(id: &str) -> CleaningStageBaseDto {
    CleaningStageBaseDto {
        id: id.to_string(),
        enabled: true,
        execution_class: "polarsExpression".to_string(),
        scope: "row".to_string(),
        source_page: "timeseries".to_string(),
        label: id.to_string(),
        note: None,
        created_at: "now".to_string(),
        updated_at: "now".to_string(),
    }
}

fn plan(stages: Vec<CleaningStageDto>) -> CleaningPlanDto {
    CleaningPlanDto {
        schema_version: 1,
        id: "plan".to_string(),
        plan_revision: 1,
        source_version_id: "source-0".to_string(),
        dataset_revision: 0,
        dataset_fingerprint: Some("frame".to_string()),
        schema_fingerprint: "schema".to_string(),
        time_column: "ts".to_string(),
        source_name: None,
        stages,
        created_at: "now".to_string(),
        updated_at: "now".to_string(),
    }
}

#[test]
fn trace_masks_preserve_timestamps_and_other_columns() {
    let stages = vec![
        CleaningStageDto::ColumnRange {
            base: base("range"),
            column: "value".into(),
            from: 2.0,
            to: 4.0,
            mode: RangeMode::KeepInside,
            retain_nulls: false,
        },
        CleaningStageDto::AdaptiveLine {
            base: base("line"),
            column: "value".into(),
            x1_ms: 2.0,
            y1: 3.0,
            x2_ms: 3.0,
            y2: 3.0,
            keep_above: true,
            apply_within_segment_only: true,
        },
    ];
    let df = DataFrame::new(
        4,
        vec![
            Series::new("ts".into(), [1_i64, 2, 3, 4]).into(),
            Series::new("value".into(), [1.0_f64, 2.0, 3.0, 4.0]).into(),
            Series::new("other".into(), [10.0_f64, 20.0, 30.0, 40.0]).into(),
        ],
    )
    .expect("frame");
    let result = compile_cleaning_plan(df.clone().lazy(), &plan(stages))
        .expect("compile")
        .collect()
        .expect("collect");
    assert_eq!(result.height(), df.height());
    assert_eq!(result.column("ts").unwrap(), df.column("ts").unwrap());
    assert_eq!(result.column("other").unwrap(), df.column("other").unwrap());
    assert_eq!(
        result
            .column("value")
            .unwrap()
            .f64()
            .unwrap()
            .into_iter()
            .collect::<Vec<_>>(),
        vec![None, None, Some(3.0), Some(4.0)]
    );
}

#[test]
fn compiles_enabled_stages_in_order() {
    let plan = plan(vec![
        CleaningStageDto::TimeRange {
            base: base("time"),
            start_ms: 1.0,
            end_ms: 3.0,
            mode: TimeRangeMode::KeepInside,
        },
        CleaningStageDto::ColumnRange {
            base: base("range"),
            column: "value".to_string(),
            from: 2.0,
            to: 3.0,
            mode: RangeMode::KeepInside,
            retain_nulls: false,
        },
    ]);
    let df = DataFrame::new(
        3,
        vec![
            Series::new("ts".into(), vec![1_i64, 2, 3]).into(),
            Series::new("value".into(), vec![1.0_f64, 2.0, 3.0]).into(),
        ],
    )
    .expect("frame");
    let result = compile_cleaning_plan(df.lazy(), &plan)
        .expect("compile")
        .collect()
        .expect("collect");
    assert_eq!(result.height(), 3);
    assert_eq!(
        result
            .column("value")
            .expect("value")
            .f64()
            .expect("f64")
            .into_iter()
            .collect::<Vec<_>>(),
        vec![None, Some(2.0), Some(3.0)]
    );
}

#[test]
fn derived_column_stage_is_schema_changing_and_can_use_prior_columns() {
    let plan = plan(vec![CleaningStageDto::DerivedColumn {
        base: base("derived"),
        expression: "value + temp * 2".to_string(),
        output_column: "score".to_string(),
    }]);
    let df = DataFrame::new(
        2,
        vec![
            Series::new("ts".into(), vec![1_i64, 2]).into(),
            Series::new("value".into(), vec![1.0_f64, 2.0]).into(),
            Series::new("temp".into(), vec![3.0_f64, 4.0]).into(),
        ],
    )
    .expect("frame");
    let result = compile_cleaning_plan(df.lazy(), &plan)
        .expect("compile")
        .collect()
        .expect("collect");
    assert_eq!(
        result
            .column("score")
            .expect("score")
            .f64()
            .expect("f64")
            .into_no_null_iter()
            .collect::<Vec<_>>(),
        vec![7.0, 10.0]
    );
}

#[test]
fn drop_stage_removes_inside_values_but_preserves_nulls() {
    let plan = plan(vec![CleaningStageDto::ColumnRange {
        base: base("drop"),
        column: "value".to_string(),
        from: 1.0,
        to: 2.0,
        mode: RangeMode::DropInside,
        retain_nulls: false,
    }]);
    let df = DataFrame::new(
        4,
        vec![
            Series::new("ts".into(), vec![1_i64, 2, 3, 4]).into(),
            Series::new(
                "value".into(),
                vec![Some(1.0_f64), Some(2.0), Some(3.0), None],
            )
            .into(),
        ],
    )
    .expect("frame");
    let result = compile_cleaning_plan(df.lazy(), &plan)
        .expect("compile")
        .collect()
        .expect("collect");
    assert_eq!(result.height(), 4);
    assert_eq!(
        result
            .column("value")
            .expect("value")
            .f64()
            .expect("f64")
            .into_iter()
            .collect::<Vec<_>>(),
        vec![None, None, Some(3.0), None]
    );
    assert_eq!(
        result
            .column("ts")
            .expect("ts")
            .i64()
            .expect("i64")
            .into_no_null_iter()
            .collect::<Vec<_>>(),
        vec![1, 2, 3, 4]
    );
}

#[test]
fn keep_range_can_retain_nulls_without_retaining_non_finite_values() {
    let plan = plan(vec![CleaningStageDto::ColumnRange {
        base: base("outlier-bounds"),
        column: "value".to_string(),
        from: 0.0,
        to: 2.0,
        mode: RangeMode::KeepInside,
        retain_nulls: true,
    }]);
    let df = DataFrame::new(
        4,
        vec![
            Series::new("ts".into(), vec![1_i64, 2, 3, 4]).into(),
            Series::new(
                "value".into(),
                vec![Some(1.0_f64), None, Some(f64::NAN), Some(4.0)],
            )
            .into(),
        ],
    )
    .expect("frame");
    let result = compile_cleaning_plan(df.lazy(), &plan)
        .expect("compile")
        .collect()
        .expect("collect");
    assert_eq!(result.column("value").expect("value").null_count(), 3);
    assert_eq!(
        result
            .column("ts")
            .expect("ts")
            .i64()
            .expect("i64")
            .into_no_null_iter()
            .collect::<Vec<_>>(),
        vec![1, 2, 3, 4]
    );
}

#[test]
fn missing_value_stage_drops_null_and_non_finite_rows() {
    let plan = plan(vec![CleaningStageDto::MissingValue {
        base: base("missing"),
        column: "value".to_string(),
        drop_nulls: true,
        drop_non_finite: true,
    }]);
    let df = DataFrame::new(
        5,
        vec![
            Series::new("ts".into(), vec![1_i64, 2, 3, 4, 5]).into(),
            Series::new(
                "value".into(),
                vec![
                    Some(1.0_f64),
                    None,
                    Some(f64::NAN),
                    Some(f64::INFINITY),
                    Some(2.0),
                ],
            )
            .into(),
        ],
    )
    .expect("frame");
    let result = compile_cleaning_plan(df.lazy(), &plan)
        .expect("compile")
        .collect()
        .expect("collect");
    assert_eq!(result.height(), 2);
}

#[test]
fn deduplicate_stage_keeps_last_row_and_preserves_kept_row_order() {
    let plan = plan(vec![CleaningStageDto::Deduplicate {
        base: base("duplicates"),
        columns: vec!["key".to_string()],
        keep: DuplicateKeep::Last,
    }]);
    let df = DataFrame::new(
        3,
        vec![
            Series::new("ts".into(), vec![1_i64, 2, 3]).into(),
            Series::new("key".into(), vec!["a", "a", "b"]).into(),
        ],
    )
    .expect("frame");
    let result = compile_cleaning_plan(df.lazy(), &plan)
        .expect("compile")
        .collect()
        .expect("collect");
    assert_eq!(
        result
            .column("ts")
            .expect("ts")
            .i64()
            .expect("i64")
            .into_no_null_iter()
            .collect::<Vec<_>>(),
        vec![2, 3]
    );
}

#[test]
fn column_select_stage_projects_saved_order_or_drops_named_columns() {
    let df = DataFrame::new(
        2,
        vec![
            Series::new("ts".into(), vec![1_i64, 2]).into(),
            Series::new("value".into(), vec![10.0_f64, 20.0]).into(),
            Series::new("device".into(), vec!["a", "b"]).into(),
        ],
    )
    .expect("frame");
    let keep_plan = plan(vec![CleaningStageDto::ColumnSelect {
        base: base("select"),
        columns: vec!["device".to_string(), "ts".to_string()],
        mode: ColumnSelectMode::Keep,
    }]);
    let kept = compile_cleaning_plan(df.clone().lazy(), &keep_plan)
        .expect("compile")
        .collect()
        .expect("collect");
    assert_eq!(
        kept.get_column_names()
            .iter()
            .map(|name| name.as_str())
            .collect::<Vec<_>>(),
        vec!["device", "ts"]
    );

    let drop_plan = plan(vec![CleaningStageDto::ColumnSelect {
        base: base("drop"),
        columns: vec!["value".to_string()],
        mode: ColumnSelectMode::Drop,
    }]);
    let dropped = compile_cleaning_plan(df.lazy(), &drop_plan)
        .expect("compile")
        .collect()
        .expect("collect");
    assert!(dropped.column("value").is_err());
    assert_eq!(dropped.width(), 2);
}

#[test]
fn sort_stage_is_stable_and_honors_null_placement() {
    let plan = plan(vec![CleaningStageDto::Sort {
        base: base("sort"),
        columns: vec!["key".to_string()],
        descending: false,
        nulls_last: true,
    }]);
    let df = DataFrame::new(
        4,
        vec![
            Series::new("ts".into(), vec![10_i64, 20, 30, 40]).into(),
            Series::new("key".into(), vec![Some(2_i64), Some(1), Some(1), None]).into(),
        ],
    )
    .expect("frame");
    let result = compile_cleaning_plan(df.lazy(), &plan)
        .expect("compile")
        .collect()
        .expect("collect");
    assert_eq!(
        result
            .column("ts")
            .expect("ts")
            .i64()
            .expect("i64")
            .into_no_null_iter()
            .collect::<Vec<_>>(),
        vec![20, 30, 10, 40]
    );
}

#[test]
fn fill_null_stage_respects_direction_and_limit() {
    let plan = plan(vec![
        CleaningStageDto::Sort {
            base: base("sort"),
            columns: vec!["ts".to_string()],
            descending: false,
            nulls_last: true,
        },
        CleaningStageDto::FillNull {
            base: base("fill"),
            columns: vec!["value".to_string()],
            strategy: FillNullDirection::Forward,
            limit: Some(1),
        },
    ]);
    let df = DataFrame::new(
        4,
        vec![
            Series::new("ts".into(), vec![1_i64, 2, 3, 4]).into(),
            Series::new("value".into(), vec![Some(1.0_f64), None, None, Some(4.0)]).into(),
        ],
    )
    .expect("frame");
    let result = compile_cleaning_plan(df.lazy(), &plan)
        .expect("compile")
        .collect()
        .expect("collect");
    assert_eq!(
        result
            .column("value")
            .expect("value")
            .f64()
            .expect("f64")
            .into_iter()
            .collect::<Vec<_>>(),
        vec![Some(1.0), Some(1.0), None, Some(4.0)]
    );
}

#[test]
fn ordered_null_fill_requires_a_prior_time_sort() {
    let plan = plan(vec![CleaningStageDto::FillNull {
        base: base("fill"),
        columns: vec!["value".to_string()],
        strategy: FillNullDirection::Forward,
        limit: None,
    }]);
    let error = validate_cleaning_plan(&plan).expect_err("must reject unordered fill");
    assert!(
        error
            .to_string()
            .contains("requires an earlier enabled stable sort")
    );
}

#[test]
fn resample_stage_emits_left_labeled_non_empty_fixed_buckets() {
    let plan = plan(vec![
        CleaningStageDto::Sort {
            base: base("sort"),
            columns: vec!["ts".to_string()],
            descending: false,
            nulls_last: true,
        },
        CleaningStageDto::Resample {
            base: base("resample"),
            every: "1m".to_string(),
            aggregations: vec![
                ResampleAggregationDto {
                    column: "value".to_string(),
                    method: ResampleAggregationMethod::Mean,
                },
                ResampleAggregationDto {
                    column: "volume".to_string(),
                    method: ResampleAggregationMethod::Sum,
                },
            ],
        },
    ]);
    let timestamps = Series::new("ts".into(), vec![0_i64, 30_000, 60_000, 90_000, 180_000])
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .expect("datetime");
    let df = DataFrame::new(
        5,
        vec![
            timestamps.into(),
            Series::new("value".into(), vec![1.0_f64, 3.0, 5.0, 7.0, 9.0]).into(),
            Series::new("volume".into(), vec![1_i64, 2, 3, 4, 5]).into(),
        ],
    )
    .expect("frame");

    let result = compile_cleaning_plan(df.lazy(), &plan)
        .expect("compile")
        .collect()
        .expect("collect");

    assert_eq!(
        result.height(),
        3,
        "the empty 2-minute bucket must not be synthesized"
    );
    assert_eq!(
        result
            .column("ts")
            .expect("ts")
            .datetime()
            .expect("datetime")
            .physical()
            .into_no_null_iter()
            .collect::<Vec<_>>(),
        vec![0, 60_000, 180_000]
    );
    assert_eq!(
        result
            .column("value")
            .expect("value")
            .f64()
            .expect("f64")
            .into_no_null_iter()
            .collect::<Vec<_>>(),
        vec![2.0, 6.0, 9.0]
    );
    assert_eq!(
        result
            .column("volume")
            .expect("volume")
            .i64()
            .expect("i64")
            .into_no_null_iter()
            .collect::<Vec<_>>(),
        vec![3, 7, 5]
    );
}

#[test]
fn resample_stage_rejects_calendar_or_unordered_contracts() {
    let aggregation = vec![ResampleAggregationDto {
        column: "value".to_string(),
        method: ResampleAggregationMethod::Last,
    }];
    let calendar = plan(vec![
        CleaningStageDto::Sort {
            base: base("sort"),
            columns: vec!["ts".to_string()],
            descending: false,
            nulls_last: true,
        },
        CleaningStageDto::Resample {
            base: base("resample"),
            every: "1d".to_string(),
            aggregations: aggregation.clone(),
        },
    ]);
    assert!(
        validate_cleaning_plan(&calendar)
            .expect_err("calendar duration")
            .to_string()
            .contains("positive fixed duration")
    );

    let descending = plan(vec![
        CleaningStageDto::Sort {
            base: base("sort"),
            columns: vec!["ts".to_string()],
            descending: true,
            nulls_last: true,
        },
        CleaningStageDto::Resample {
            base: base("resample"),
            every: "1h".to_string(),
            aggregations: aggregation,
        },
    ]);
    assert!(
        validate_cleaning_plan(&descending)
            .expect_err("descending sort")
            .to_string()
            .contains("ascending with time column")
    );
}

#[test]
fn full_line_stage_is_not_limited_to_its_drawn_segment() {
    let plan = plan(vec![CleaningStageDto::AdaptiveLine {
        base: base("line"),
        column: "value".to_string(),
        x1_ms: 1.0,
        y1: 2.0,
        x2_ms: 2.0,
        y2: 2.0,
        keep_above: true,
        apply_within_segment_only: false,
    }]);
    let df = DataFrame::new(
        3,
        vec![
            Series::new("ts".into(), vec![1_i64, 2, 3]).into(),
            Series::new("value".into(), vec![1.0_f64, 2.0, 3.0]).into(),
        ],
    )
    .expect("frame");
    let result = compile_cleaning_plan(df.lazy(), &plan)
        .expect("compile")
        .collect()
        .expect("collect");
    assert_eq!(result.height(), 3);
    assert_eq!(
        result
            .column("value")
            .expect("value")
            .f64()
            .expect("f64")
            .into_iter()
            .collect::<Vec<_>>(),
        vec![None, Some(2.0), Some(3.0)]
    );
}

#[test]
fn parses_the_frontend_stage_shape_without_dropping_audit_fields() {
    let raw = serde_json::json!({
        "schemaVersion": 1,
        "id": "plan-1",
        "planRevision": 1,
        "sourceVersionId": "source-0",
        "datasetRevision": 0,
        "datasetFingerprint": "frame",
        "schemaFingerprint": "schema",
        "timeColumn": "ts",
        "sourceName": null,
        "createdAt": "now",
        "updatedAt": "now",
        "stages": [{
            "id": "range-1",
            "kind": "columnRange",
            "executionClass": "polarsExpression",
            "scope": "row",
            "enabled": true,
            "sourcePage": "timeseries",
            "label": "Keep value",
            "note": "from chart",
            "createdAt": "now",
            "updatedAt": "now",
            "column": "value",
            "from": 1.0,
            "to": 2.0,
            "mode": "keepInside"
        }]
    });

    let parsed = serde_json::from_value::<CleaningPlanDto>(raw).expect("frontend DTO");
    assert_eq!(parsed.stages.len(), 1);
    assert_eq!(parsed.stages[0].id(), "range-1");
}

#[test]
fn parses_frontend_adaptive_line_fields_as_camel_case() {
    let raw = serde_json::json!({
        "schemaVersion": 1,
        "id": "plan-1",
        "planRevision": 1,
        "sourceVersionId": "source-0",
        "datasetRevision": 0,
        "datasetFingerprint": "frame",
        "schemaFingerprint": "schema",
        "timeColumn": "ts",
        "sourceName": null,
        "createdAt": "now",
        "updatedAt": "now",
        "stages": [{
            "id": "line-1",
            "kind": "adaptiveLine",
            "executionClass": "polarsExpression",
            "scope": "row",
            "enabled": true,
            "sourcePage": "timeseries",
            "label": "Keep above trend",
            "note": null,
            "createdAt": "now",
            "updatedAt": "now",
            "column": "value",
            "x1Ms": 1.0,
            "y1": 2.0,
            "x2Ms": 3.0,
            "y2": 4.0,
            "keepAbove": true,
            "applyWithinSegmentOnly": true
        }]
    });

    let parsed = serde_json::from_value::<CleaningPlanDto>(raw).expect("frontend DTO");
    let CleaningStageDto::AdaptiveLine {
        x1_ms,
        x2_ms,
        keep_above,
        apply_within_segment_only,
        ..
    } = &parsed.stages[0]
    else {
        panic!("expected adaptive line stage");
    };
    assert_eq!((*x1_ms, *x2_ms), (1.0, 3.0));
    assert!(*keep_above);
    assert!(*apply_within_segment_only);
}

#[test]
fn semantic_hash_ignores_audit_fields_but_tracks_executable_changes() {
    let mut original = plan(vec![CleaningStageDto::ColumnRange {
        base: base("range-a"),
        column: "value".to_string(),
        from: 1.0,
        to: 2.0,
        mode: RangeMode::KeepInside,
        retain_nulls: false,
    }]);
    let expected = semantic_hash(&original).expect("original hash");

    original.id = "renamed-plan".to_string();
    original.plan_revision += 1;
    original.updated_at = "later".to_string();
    if let CleaningStageDto::ColumnRange { base, .. } = &mut original.stages[0] {
        base.id = "range-b".to_string();
        base.label = "New label".to_string();
        base.note = Some("audit note".to_string());
        base.updated_at = "later".to_string();
    }
    assert_eq!(semantic_hash(&original).expect("audit-only hash"), expected);

    if let CleaningStageDto::ColumnRange { to, .. } = &mut original.stages[0] {
        *to = 3.0;
    }
    assert_ne!(semantic_hash(&original).expect("changed hash"), expected);
}

#[test]
fn chronological_split_labels_train_validation_test_and_embargo() {
    let df = DataFrame::new(
        6,
        vec![
            Series::new(
                "ts".into(),
                vec![
                    Some(1_000_i64),
                    Some(2_000),
                    Some(3_000),
                    Some(4_000),
                    Some(5_000),
                    None,
                ],
            )
            .into(),
            Series::new("value".into(), vec![1.0_f64; 6]).into(),
        ],
    )
    .expect("frame");
    let plan = plan(vec![CleaningStageDto::ChronologicalSplit {
        base: base("split"),
        train_end_ms: 1_000.0,
        validation_end_ms: 3_000.0,
        embargo_ms: 1_000.0,
        output_column: "split".to_string(),
    }]);
    let output = compile_cleaning_plan(df.lazy(), &plan)
        .expect("compile")
        .collect()
        .expect("collect");
    assert_eq!(
        output
            .column("split")
            .expect("split")
            .str()
            .expect("str")
            .into_iter()
            .collect::<Vec<_>>(),
        vec![
            Some("train"),
            Some("embargo"),
            Some("validation"),
            Some("embargo"),
            Some("test"),
            Some("unassigned")
        ]
    );
}
