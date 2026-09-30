//! Backend-generated Python and Rust code for canonical cleaning plans.

use polars::prelude::{DataType, TimeUnit};

use crate::error::AppError;
use edatime_query::cleaning::{
    CleaningPlanDto, CleaningStageDto, ColumnSelectMode, DuplicateKeep, FillNullDirection,
    RangeMode, ResampleAggregationMethod, TimeRangeMode,
};
use edatime_query::derived::parse_derived_expression;
use edatime_store::versions::DatasetVersionRecord;

fn code_quote(value: &str) -> String {
    // JSON strings are valid quoted literals in both generated Python and
    // Rust source, and keep arbitrary column names from escaping the script.
    serde_json::to_string(value).unwrap_or_else(|_| format!("{value:?}"))
}

fn code_number(value: f64) -> String {
    if value == 0.0 {
        "0.0".to_string()
    } else {
        // Keep Rust literals floating point even for integral thresholds.
        format!("{value:?}")
    }
}

/// Match the compiler's physical comparison values for Date and Datetime
/// columns. Generated code compares `cast(Int64)` values, so emitting raw
/// epoch milliseconds would silently disagree for dates and µs/ns datetimes.
fn split_native_boundaries(
    train_end_ms: f64,
    validation_end_ms: f64,
    embargo_ms: f64,
    time_dtype: &DataType,
) -> Result<[i64; 4], AppError> {
    Ok([
        edatime_core::temporal::epoch_ms_to_native(train_end_ms, time_dtype, true)?,
        edatime_core::temporal::epoch_ms_to_native(train_end_ms + embargo_ms, time_dtype, true)?,
        edatime_core::temporal::epoch_ms_to_native(validation_end_ms, time_dtype, true)?,
        edatime_core::temporal::epoch_ms_to_native(
            validation_end_ms + embargo_ms,
            time_dtype,
            true,
        )?,
    ])
}

fn time_ms_code(column: &str, dtype: &DataType, python: bool) -> String {
    let value = if python {
        format!("pl.col({}).cast(pl.Float64)", code_quote(column))
    } else {
        format!("col({}).cast(DataType::Float64)", code_quote(column))
    };
    let scale = match dtype {
        DataType::Datetime(TimeUnit::Nanoseconds, _) => Some(("/", "1000000.0")),
        DataType::Datetime(TimeUnit::Microseconds, _) => Some(("/", "1000.0")),
        DataType::Date => Some(("*", "86400000.0")),
        _ => None,
    };
    match scale {
        Some((operator, factor)) if python => format!("({value} {operator} {factor})"),
        Some((operator, factor)) => format!("({value} {operator} lit({factor}))"),
        None => value,
    }
}

fn python_predicate(column: &str, from: f64, to: f64) -> String {
    format!(
        "(pl.col({}).cast(pl.Float64) >= {}) & (pl.col({}).cast(pl.Float64) <= {})",
        code_quote(column),
        code_number(from.min(to)),
        code_quote(column),
        code_number(from.max(to)),
    )
}

pub(super) fn generate_python_polars(
    plan: &CleaningPlanDto,
    version: &DatasetVersionRecord,
    hash: &str,
    time_dtype: &DataType,
) -> Result<String, AppError> {
    let mut lines = vec![
        "# EdaTime backend-generated canonical plan artifact (v1).".to_string(),
        format!(
            "# source version: {} @ revision {}",
            version.id, version.revision
        ),
        format!("# plan hash: {hash}"),
        "# Requires a Polars runtime compatible with the generated v1 operators.".to_string(),
        String::new(),
        "import math".to_string(),
        "import polars as pl".to_string(),
        String::new(),
        "def apply_edatime_plan(lf: pl.LazyFrame) -> pl.LazyFrame:".to_string(),
    ];
    let mut executable = false;
    for stage in &plan.stages {
        if !stage.enabled() || matches!(stage, CleaningStageDto::Annotation { .. }) {
            continue;
        }
        executable = true;
        match stage {
            CleaningStageDto::TimeRange {
                start_ms,
                end_ms,
                mode,
                ..
            } => {
                let lower = edatime_core::temporal::epoch_ms_to_native(
                    start_ms.min(*end_ms),
                    time_dtype,
                    false,
                )?;
                let upper = edatime_core::temporal::epoch_ms_to_native(
                    start_ms.max(*end_ms),
                    time_dtype,
                    true,
                )?;
                let time = code_quote(&plan.time_column);
                let predicate = format!(
                    "(pl.col({time}).cast(pl.Int64) >= {lower}) & (pl.col({time}).cast(pl.Int64) <= {upper})"
                );
                let expression = if *mode == TimeRangeMode::KeepInside {
                    predicate
                } else {
                    format!("({predicate}).not() | ({predicate}).is_null()")
                };
                lines.push(format!("    lf = lf.filter({expression})"));
            }
            CleaningStageDto::ColumnRange {
                column,
                from,
                to,
                mode,
                retain_nulls,
                ..
            } => {
                let predicate = python_predicate(column, *from, *to);
                let expression = if *mode == RangeMode::KeepInside {
                    if *retain_nulls {
                        format!("pl.col({}).is_null() | ({predicate})", code_quote(column))
                    } else {
                        predicate
                    }
                } else {
                    format!("({predicate}).not() | ({predicate}).is_null()")
                };
                lines.push(format!("    lf = lf.with_columns(pl.when({expression}).then(pl.col({0})).otherwise(None).alias({0}))", code_quote(column)));
            }
            CleaningStageDto::MissingValue {
                column,
                drop_nulls,
                drop_non_finite,
                ..
            } => {
                let value = format!("pl.col({})", code_quote(column));
                let predicate = match (*drop_nulls, *drop_non_finite) {
                    (true, true) => format!("{value}.is_not_null() & {value}.is_finite()"),
                    (true, false) => format!("{value}.is_not_null()"),
                    (false, true) => format!("{value}.is_null() | {value}.is_finite()"),
                    (false, false) => unreachable!("validated plan"),
                };
                lines.push(format!("    lf = lf.filter({predicate})"));
            }
            CleaningStageDto::Deduplicate { columns, keep, .. } => {
                let columns = columns
                    .iter()
                    .map(|column| code_quote(column))
                    .collect::<Vec<_>>()
                    .join(", ");
                let keep = if *keep == DuplicateKeep::First {
                    "first"
                } else {
                    "last"
                };
                lines.push(format!(
                    "    lf = lf.unique(subset=[{columns}], keep={keep:?}, maintain_order=True)"
                ));
            }
            CleaningStageDto::ColumnSelect { columns, mode, .. } => {
                let columns = columns
                    .iter()
                    .map(|column| code_quote(column))
                    .collect::<Vec<_>>()
                    .join(", ");
                if *mode == ColumnSelectMode::Keep {
                    lines.push(format!(
                        "    lf = lf.select([pl.col(column) for column in [{columns}]])"
                    ));
                } else {
                    lines.push(format!("    lf = lf.drop([{columns}])"));
                }
            }
            CleaningStageDto::Sort {
                columns,
                descending,
                nulls_last,
                ..
            } => {
                let columns = columns
                    .iter()
                    .map(|column| code_quote(column))
                    .collect::<Vec<_>>()
                    .join(", ");
                lines.push(format!("    lf = lf.sort(by=[{columns}], descending={}, nulls_last={}, maintain_order=True)", if *descending { "True" } else { "False" }, if *nulls_last { "True" } else { "False" }));
            }
            CleaningStageDto::FillNull {
                columns,
                strategy,
                limit,
                ..
            } => {
                let strategy = if *strategy == FillNullDirection::Forward {
                    "forward"
                } else {
                    "backward"
                };
                let limit = limit.map_or("None".to_string(), |value| value.to_string());
                let expressions = columns
                    .iter()
                    .map(|column| {
                        format!(
                            "pl.col({}).fill_null(strategy={strategy:?}, limit={limit})",
                            code_quote(column)
                        )
                    })
                    .collect::<Vec<_>>()
                    .join(", ");
                lines.push(
                    "    # Requires an earlier stable sort on the canonical time column."
                        .to_string(),
                );
                lines.push(format!("    lf = lf.with_columns([{expressions}])"));
            }
            CleaningStageDto::Resample {
                every,
                aggregations,
                ..
            } => {
                let aggregations = aggregations
                    .iter()
                    .map(|aggregation| {
                        let method = match aggregation.method {
                            ResampleAggregationMethod::Mean => "mean",
                            ResampleAggregationMethod::Sum => "sum",
                            ResampleAggregationMethod::Min => "min",
                            ResampleAggregationMethod::Max => "max",
                            ResampleAggregationMethod::Last => "last",
                        };
                        format!(
                            "pl.col({}).{}().alias({})",
                            code_quote(&aggregation.column),
                            method,
                            code_quote(&aggregation.column)
                        )
                    })
                    .collect::<Vec<_>>()
                    .join(", ");
                lines.push(
                    "    # Global fixed-duration buckets; empty buckets are not synthesized."
                        .to_string(),
                );
                lines.push(format!("    lf = lf.group_by_dynamic({}, every={}, period={}, closed=\"left\", label=\"left\", start_by=\"window\").agg([{aggregations}])", code_quote(&plan.time_column), code_quote(every), code_quote(every)));
            }
            CleaningStageDto::ChronologicalSplit {
                train_end_ms,
                validation_end_ms,
                embargo_ms,
                output_column,
                ..
            } => {
                let time = code_quote(&plan.time_column);
                let [
                    train_end,
                    train_embargo_end,
                    validation_end,
                    validation_embargo_end,
                ] = split_native_boundaries(
                    *train_end_ms,
                    *validation_end_ms,
                    *embargo_ms,
                    time_dtype,
                )?;
                lines.push(
                    "    # Compare physical Int64 time values using the source column's native unit."
                        .to_string(),
                );
                lines.push(format!("    lf = lf.with_columns(pl.when(pl.col({time}).cast(pl.Int64).is_null()).then(pl.lit(\"unassigned\")).when(pl.col({time}).cast(pl.Int64) <= {train_end}).then(pl.lit(\"train\")).when(pl.col({time}).cast(pl.Int64) <= {train_embargo_end}).then(pl.lit(\"embargo\")).when(pl.col({time}).cast(pl.Int64) <= {validation_end}).then(pl.lit(\"validation\")).when(pl.col({time}).cast(pl.Int64) <= {validation_embargo_end}).then(pl.lit(\"embargo\")).otherwise(pl.lit(\"test\")).alias({}))", code_quote(output_column)));
            }
            CleaningStageDto::DerivedColumn {
                expression,
                output_column,
                ..
            } => {
                let expression = parse_derived_expression(expression)?;
                lines.push(format!(
                    "    lf = lf.with_columns({}.alias({}))",
                    expression.to_python_polars(),
                    code_quote(output_column)
                ));
            }
            CleaningStageDto::AdaptiveLine {
                column,
                x1_ms,
                y1,
                x2_ms,
                y2,
                keep_above,
                apply_within_segment_only,
                ..
            } => {
                let time = time_ms_code(&plan.time_column, time_dtype, true);
                let line = format!(
                    "({} + (({time} - {}) * {}))",
                    code_number(*y1),
                    code_number(*x1_ms),
                    code_number((y2 - y1) / (x2_ms - x1_ms))
                );
                let comparison = format!(
                    "(pl.col({}).cast(pl.Float64) {} {line})",
                    code_quote(column),
                    if *keep_above { ">=" } else { "<=" }
                );
                let predicate = if *apply_within_segment_only {
                    format!(
                        "(~(({time} >= {}) & ({time} <= {}))) | {comparison}",
                        code_number(x1_ms.min(*x2_ms)),
                        code_number(x1_ms.max(*x2_ms))
                    )
                } else {
                    comparison
                };
                lines.push(format!("    lf = lf.with_columns(pl.when({predicate}).then(pl.col({})).otherwise(None).alias({}))", code_quote(column), code_quote(column)));
            }
            CleaningStageDto::Annotation { .. } => {}
        }
    }
    lines.push(if executable {
        "    return lf".to_string()
    } else {
        "    return lf  # no enabled executable stages".to_string()
    });
    Ok(format!("{}\n", lines.join("\n")))
}

pub(super) fn generate_rust_polars(
    plan: &CleaningPlanDto,
    version: &DatasetVersionRecord,
    hash: &str,
    time_dtype: &DataType,
) -> Result<String, AppError> {
    let mut lines = vec![
        "// EdaTime backend-generated canonical plan artifact (v1).".to_string(),
        format!(
            "// source version: {} @ revision {}",
            version.id, version.revision
        ),
        format!("// plan hash: {hash}"),
        "use polars::prelude::*;".to_string(),
        String::new(),
        "pub fn apply_edatime_plan(mut lf: LazyFrame) -> PolarsResult<LazyFrame> {".to_string(),
    ];
    for stage in &plan.stages {
        if !stage.enabled() || matches!(stage, CleaningStageDto::Annotation { .. }) {
            continue;
        }
        match stage {
            CleaningStageDto::TimeRange {
                start_ms,
                end_ms,
                mode,
                ..
            } => {
                let lower = edatime_core::temporal::epoch_ms_to_native(
                    start_ms.min(*end_ms),
                    time_dtype,
                    false,
                )?;
                let upper = edatime_core::temporal::epoch_ms_to_native(
                    start_ms.max(*end_ms),
                    time_dtype,
                    true,
                )?;
                let predicate = format!(
                    "col({}).cast(DataType::Int64).gt_eq(lit({lower}_i64)).and(col({}).cast(DataType::Int64).lt_eq(lit({upper}_i64)))",
                    code_quote(&plan.time_column),
                    code_quote(&plan.time_column),
                );
                let expression = if *mode == TimeRangeMode::KeepInside {
                    predicate
                } else {
                    format!("{predicate}.is_null().or({predicate}.not())")
                };
                lines.push(format!("    lf = lf.filter({expression});"));
            }
            CleaningStageDto::ColumnRange {
                column,
                from,
                to,
                mode,
                retain_nulls,
                ..
            } => {
                let predicate = format!(
                    "col({}).cast(DataType::Float64).gt_eq(lit({})).and(col({}).cast(DataType::Float64).lt_eq(lit({})))",
                    code_quote(column),
                    code_number(from.min(*to)),
                    code_quote(column),
                    code_number(from.max(*to))
                );
                let expression = if *mode == RangeMode::KeepInside {
                    if *retain_nulls {
                        format!("col({}).is_null().or({predicate})", code_quote(column))
                    } else {
                        predicate
                    }
                } else {
                    format!("{predicate}.is_null().or({predicate}.not())")
                };
                lines.push(format!("    lf = lf.with_columns([when({expression}).then(col({0})).otherwise(lit(NULL)).alias({0})]);", code_quote(column)));
            }
            CleaningStageDto::MissingValue {
                column,
                drop_nulls,
                drop_non_finite,
                ..
            } => {
                let value = format!("col({})", code_quote(column));
                let predicate = match (*drop_nulls, *drop_non_finite) {
                    (true, true) => format!("{value}.is_not_null().and({value}.is_finite())"),
                    (true, false) => format!("{value}.is_not_null()"),
                    (false, true) => format!("{value}.is_null().or({value}.is_finite())"),
                    (false, false) => unreachable!("validated plan"),
                };
                lines.push(format!("    lf = lf.filter({predicate});"));
            }
            CleaningStageDto::Deduplicate { columns, keep, .. } => {
                let columns = columns
                    .iter()
                    .map(|column| format!("col({})", code_quote(column)))
                    .collect::<Vec<_>>()
                    .join(", ");
                let keep = if *keep == DuplicateKeep::First {
                    "First"
                } else {
                    "Last"
                };
                lines.push(format!("    lf = lf.unique_stable_generic(Some(vec![{columns}]), UniqueKeepStrategy::{keep});"));
            }
            CleaningStageDto::ColumnSelect { columns, mode, .. } => {
                let columns = columns
                    .iter()
                    .map(|column| code_quote(column))
                    .collect::<Vec<_>>()
                    .join(", ");
                if *mode == ColumnSelectMode::Keep {
                    lines.push(format!(
                        "    lf = lf.select(vec![{0}]);",
                        columns
                            .split(", ")
                            .map(|column| format!("col({column})"))
                            .collect::<Vec<_>>()
                            .join(", ")
                    ));
                } else {
                    lines.push(format!(
                        "    lf = lf.drop(by_name([{columns}], true, false));"
                    ));
                }
            }
            CleaningStageDto::Sort {
                columns,
                descending,
                nulls_last,
                ..
            } => {
                let columns = columns
                    .iter()
                    .map(|column| code_quote(column))
                    .collect::<Vec<_>>()
                    .join(", ");
                lines.push(format!("    lf = lf.sort(vec![{columns}], SortMultipleOptions::default().with_order_descending({descending}).with_nulls_last({nulls_last}).with_maintain_order(true));"));
            }
            CleaningStageDto::FillNull {
                columns,
                strategy,
                limit,
                ..
            } => {
                let strategy = if *strategy == FillNullDirection::Forward {
                    "Forward"
                } else {
                    "Backward"
                };
                let limit = limit.map_or("None".to_string(), |value| format!("Some({value})"));
                let expressions = columns.iter().map(|column| format!("col({}).fill_null_with_strategy(FillNullStrategy::{strategy}({limit}))", code_quote(column))).collect::<Vec<_>>().join(", ");
                lines.push(format!("    lf = lf.with_columns(vec![{expressions}]);"));
            }
            CleaningStageDto::Resample {
                every,
                aggregations,
                ..
            } => {
                let aggregations = aggregations
                    .iter()
                    .map(|aggregation| {
                        let method = match aggregation.method {
                            ResampleAggregationMethod::Mean => "mean",
                            ResampleAggregationMethod::Sum => "sum",
                            ResampleAggregationMethod::Min => "min",
                            ResampleAggregationMethod::Max => "max",
                            ResampleAggregationMethod::Last => "last",
                        };
                        format!(
                            "col({}).{}().alias({})",
                            code_quote(&aggregation.column),
                            method,
                            code_quote(&aggregation.column)
                        )
                    })
                    .collect::<Vec<_>>()
                    .join(", ");
                lines.push(format!(
                    "    let every = Duration::try_parse({})?;",
                    code_quote(every)
                ));
                lines.push(format!("    lf = lf.group_by_dynamic(col({}), [], DynamicGroupOptions {{ every, period: every, offset: Duration::try_parse(\"0ns\")?, closed_window: ClosedWindow::Left, label: Label::Left, start_by: StartBy::WindowBound, ..Default::default() }}).agg([{aggregations}]);", code_quote(&plan.time_column)));
            }
            CleaningStageDto::ChronologicalSplit {
                train_end_ms,
                validation_end_ms,
                embargo_ms,
                output_column,
                ..
            } => {
                let time = code_quote(&plan.time_column);
                let [
                    train_end,
                    train_embargo_end,
                    validation_end,
                    validation_embargo_end,
                ] = split_native_boundaries(
                    *train_end_ms,
                    *validation_end_ms,
                    *embargo_ms,
                    time_dtype,
                )?;
                lines.push("    // Compare physical Int64 time values using the source column's native unit.".to_string());
                lines.push(format!("    lf = lf.with_columns(vec![when(col({time}).cast(DataType::Int64).is_null()).then(lit(\"unassigned\")).when(col({time}).cast(DataType::Int64).lt_eq(lit({train_end}))).then(lit(\"train\")).when(col({time}).cast(DataType::Int64).lt_eq(lit({train_embargo_end}))).then(lit(\"embargo\")).when(col({time}).cast(DataType::Int64).lt_eq(lit({validation_end}))).then(lit(\"validation\")).when(col({time}).cast(DataType::Int64).lt_eq(lit({validation_embargo_end}))).then(lit(\"embargo\")).otherwise(lit(\"test\")).alias({})]);", code_quote(output_column)));
            }
            CleaningStageDto::DerivedColumn {
                expression,
                output_column,
                ..
            } => {
                let expression = parse_derived_expression(expression)?;
                lines.push(format!(
                    "    lf = lf.with_column({}.alias({}));",
                    expression.to_rust_polars(),
                    code_quote(output_column)
                ));
            }
            CleaningStageDto::AdaptiveLine {
                column,
                x1_ms,
                y1,
                x2_ms,
                y2,
                keep_above,
                apply_within_segment_only,
                ..
            } => {
                let time = time_ms_code(&plan.time_column, time_dtype, false);
                let line = format!(
                    "(lit({}) + (({time} - lit({})) * lit({})))",
                    code_number(*y1),
                    code_number(*x1_ms),
                    code_number((y2 - y1) / (x2_ms - x1_ms))
                );
                let comparison = format!(
                    "col({}).cast(DataType::Float64).{}({line})",
                    code_quote(column),
                    if *keep_above { "gt_eq" } else { "lt_eq" }
                );
                let predicate = if *apply_within_segment_only {
                    format!(
                        "{time}.gt_eq(lit({})).and({time}.lt_eq(lit({}))).not().or({comparison})",
                        code_number(x1_ms.min(*x2_ms)),
                        code_number(x1_ms.max(*x2_ms))
                    )
                } else {
                    comparison
                };
                lines.push(format!("    lf = lf.with_columns([when({predicate}).then(col({})).otherwise(lit(NULL)).alias({})]);", code_quote(column), code_quote(column)));
            }
            CleaningStageDto::Annotation { .. } => {}
        }
    }
    lines.push("    Ok(lf)".to_string());
    lines.push("}".to_string());
    Ok(format!("{}\n", lines.join("\n")))
}
