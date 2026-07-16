//! Typed, portable cleaning-plan validation and LazyFrame compilation.

use polars::prelude::LazyFrame;
use serde::{Deserialize, Serialize};

use edatime_core::error::AppError;

use crate::filters::{
    LineFilter, RangeFilter, apply_line_stage, apply_range_stage, apply_time_range_stage,
};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CleaningPlanDto {
    pub schema_version: u16,
    pub id: String,
    pub plan_revision: u64,
    pub source_version_id: String,
    pub dataset_revision: u64,
    pub dataset_fingerprint: Option<String>,
    pub schema_fingerprint: String,
    pub time_column: String,
    pub source_name: Option<String>,
    pub stages: Vec<CleaningStageDto>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CleaningStageBaseDto {
    pub id: String,
    pub enabled: bool,
    pub execution_class: String,
    pub scope: String,
    pub source_page: String,
    pub label: String,
    #[serde(default)]
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum CleaningStageDto {
    TimeRange {
        #[serde(flatten)]
        base: CleaningStageBaseDto,
        start_ms: f64,
        end_ms: f64,
        mode: TimeRangeMode,
    },
    ColumnRange {
        #[serde(flatten)]
        base: CleaningStageBaseDto,
        column: String,
        from: f64,
        to: f64,
        mode: RangeMode,
    },
    AdaptiveLine {
        #[serde(flatten)]
        base: CleaningStageBaseDto,
        column: String,
        x1_ms: f64,
        y1: f64,
        x2_ms: f64,
        y2: f64,
        keep_above: bool,
        apply_within_segment_only: bool,
    },
    MissingValue {
        #[serde(flatten)]
        base: CleaningStageBaseDto,
        column: String,
        drop_nulls: bool,
        drop_non_finite: bool,
    },
    Deduplicate {
        #[serde(flatten)]
        base: CleaningStageBaseDto,
        columns: Vec<String>,
        keep: DuplicateKeep,
    },
    ColumnSelect {
        #[serde(flatten)]
        base: CleaningStageBaseDto,
        columns: Vec<String>,
        mode: ColumnSelectMode,
    },
    Sort {
        #[serde(flatten)]
        base: CleaningStageBaseDto,
        columns: Vec<String>,
        descending: bool,
        nulls_last: bool,
    },
    FillNull {
        #[serde(flatten)]
        base: CleaningStageBaseDto,
        columns: Vec<String>,
        strategy: FillNullDirection,
        limit: Option<u32>,
    },
    Resample {
        #[serde(flatten)]
        base: CleaningStageBaseDto,
        every: String,
        aggregations: Vec<ResampleAggregationDto>,
    },
    Annotation {
        #[serde(flatten)]
        base: CleaningStageBaseDto,
        #[serde(default)]
        severity: Option<String>,
    },
}

impl CleaningStageDto {
    pub fn id(&self) -> &str {
        match self {
            Self::TimeRange { base, .. }
            | Self::ColumnRange { base, .. }
            | Self::AdaptiveLine { base, .. }
            | Self::MissingValue { base, .. }
            | Self::Deduplicate { base, .. }
            | Self::ColumnSelect { base, .. }
            | Self::Sort { base, .. }
            | Self::FillNull { base, .. }
            | Self::Resample { base, .. }
            | Self::Annotation { base, .. } => &base.id,
        }
    }

    pub fn enabled(&self) -> bool {
        match self {
            Self::TimeRange { base, .. }
            | Self::ColumnRange { base, .. }
            | Self::AdaptiveLine { base, .. }
            | Self::MissingValue { base, .. }
            | Self::Deduplicate { base, .. }
            | Self::ColumnSelect { base, .. }
            | Self::Sort { base, .. }
            | Self::FillNull { base, .. }
            | Self::Resample { base, .. }
            | Self::Annotation { base, .. } => base.enabled,
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TimeRangeMode {
    KeepInside,
    DropInside,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RangeMode {
    KeepInside,
    DropInside,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DuplicateKeep {
    First,
    Last,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ColumnSelectMode {
    Keep,
    Drop,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FillNullDirection { Forward, Backward }

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResampleAggregationDto {
    pub column: String,
    pub method: ResampleAggregationMethod,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ResampleAggregationMethod { Mean, Sum, Min, Max, Last }

fn parse_fixed_duration(stage_id: &str, every: &str) -> Result<polars::prelude::Duration, AppError> {
    let value = every.trim();
    let digit_count = value.bytes().take_while(u8::is_ascii_digit).count();
    let (quantity, unit) = value.split_at(digit_count);
    let valid_unit = matches!(unit, "ns" | "us" | "ms" | "s" | "m" | "h");
    let valid_quantity = !quantity.is_empty()
        && quantity.parse::<u64>().is_ok_and(|quantity| quantity > 0 && quantity <= i64::MAX as u64);
    if digit_count == value.len() || !valid_unit || !valid_quantity {
        return Err(AppError::bad_request(format!(
            "Cleaning stage '{stage_id}' requires a positive fixed duration such as '15m'; supported units are ns, us, ms, s, m, and h"
        )));
    }
    polars::prelude::Duration::try_parse(value).map_err(|error| {
        AppError::bad_request(format!("Cleaning stage '{stage_id}' has invalid duration '{value}': {error}"))
    })
}

fn ensure_finite(stage_id: &str, field: &str, value: f64) -> Result<(), AppError> {
    if value.is_finite() {
        Ok(())
    } else {
        Err(AppError::bad_request(format!(
            "Cleaning stage '{stage_id}' field '{field}' must be finite"
        )))
    }
}

pub fn validate_cleaning_plan(plan: &CleaningPlanDto) -> Result<(), AppError> {
    if plan.schema_version != 1 {
        return Err(AppError::bad_request(format!(
            "Unsupported cleaning plan schema version {}",
            plan.schema_version
        )));
    }
    if plan.source_version_id.trim().is_empty()
        || plan.schema_fingerprint.trim().is_empty()
        || plan.time_column.trim().is_empty()
    {
        return Err(AppError::bad_request(
            "Cleaning plan requires sourceVersionId, schemaFingerprint, and timeColumn",
        ));
    }
    let mut ids = std::collections::HashSet::new();
    for (index, stage) in plan.stages.iter().enumerate() {
        if stage.id().trim().is_empty() || !ids.insert(stage.id()) {
            return Err(AppError::bad_request(
                "Cleaning plan stage IDs must be unique and non-empty",
            ));
        }
        match stage {
            CleaningStageDto::TimeRange {
                base,
                start_ms,
                end_ms,
                ..
            } => {
                ensure_finite(&base.id, "startMs", *start_ms)?;
                ensure_finite(&base.id, "endMs", *end_ms)?;
            }
            CleaningStageDto::ColumnRange {
                base,
                column,
                from,
                to,
                ..
            } => {
                if column.trim().is_empty() {
                    return Err(AppError::bad_request(format!(
                        "Cleaning stage '{}' requires a column",
                        base.id
                    )));
                }
                ensure_finite(&base.id, "from", *from)?;
                ensure_finite(&base.id, "to", *to)?;
            }
            CleaningStageDto::AdaptiveLine {
                base,
                column,
                x1_ms,
                y1,
                x2_ms,
                y2,
                ..
            } => {
                if column.trim().is_empty() || x1_ms == x2_ms {
                    return Err(AppError::bad_request(format!(
                        "Cleaning stage '{}' requires a column and non-zero line segment",
                        base.id
                    )));
                }
                ensure_finite(&base.id, "x1Ms", *x1_ms)?;
                ensure_finite(&base.id, "y1", *y1)?;
                ensure_finite(&base.id, "x2Ms", *x2_ms)?;
                ensure_finite(&base.id, "y2", *y2)?;
            }
            CleaningStageDto::MissingValue {
                base,
                column,
                drop_nulls,
                drop_non_finite,
            } => {
                if column.trim().is_empty() || (!drop_nulls && !drop_non_finite) {
                    return Err(AppError::bad_request(format!(
                        "Cleaning stage '{}' requires a column and at least one removal policy",
                        base.id
                    )));
                }
            }
            CleaningStageDto::Deduplicate { base, columns, .. } => {
                if columns.is_empty()
                    || columns.iter().any(|column| column.trim().is_empty())
                    || columns.len()
                        != columns
                            .iter()
                            .collect::<std::collections::HashSet<_>>()
                            .len()
                {
                    return Err(AppError::bad_request(format!(
                        "Cleaning stage '{}' requires unique non-empty key columns",
                        base.id
                    )));
                }
            }
            CleaningStageDto::ColumnSelect { base, columns, .. } => {
                if columns.is_empty()
                    || columns.iter().any(|column| column.trim().is_empty())
                    || columns.len()
                        != columns
                            .iter()
                            .collect::<std::collections::HashSet<_>>()
                            .len()
                {
                    return Err(AppError::bad_request(format!(
                        "Cleaning stage '{}' requires unique non-empty column names",
                        base.id
                    )));
                }
            }
            CleaningStageDto::Sort { base, columns, .. } => {
                if columns.is_empty()
                    || columns.iter().any(|column| column.trim().is_empty())
                    || columns.len() != columns.iter().collect::<std::collections::HashSet<_>>().len()
                {
                    return Err(AppError::bad_request(format!(
                        "Cleaning stage '{}' requires unique non-empty sort columns",
                        base.id
                    )));
                }
            }
            CleaningStageDto::FillNull { base, columns, limit, .. } => {
                if columns.is_empty()
                    || columns.iter().any(|column| column.trim().is_empty())
                    || columns.len() != columns.iter().collect::<std::collections::HashSet<_>>().len()
                    || matches!(limit, Some(0))
                {
                    return Err(AppError::bad_request(format!(
                        "Cleaning stage '{}' requires unique non-empty columns and a positive fill limit",
                        base.id
                    )));
                }
                let has_time_sort = plan.stages[..index].iter().any(|prior| matches!(prior,
                    CleaningStageDto::Sort { columns, .. }
                    if prior.enabled() && columns.iter().any(|column| column.trim() == plan.time_column.trim())
                ));
                if !has_time_sort {
                    return Err(AppError::bad_request(format!(
                        "Cleaning stage '{}' requires an earlier enabled stable sort on the time column '{}'; add Sort before ordered null fill",
                        base.id, plan.time_column
                    )));
                }
            }
            CleaningStageDto::Resample { base, every, aggregations } => {
                parse_fixed_duration(&base.id, every)?;
                let columns = aggregations.iter().map(|aggregation| aggregation.column.trim()).collect::<Vec<_>>();
                if aggregations.is_empty()
                    || columns.iter().any(|column| column.is_empty() || *column == plan.time_column.trim())
                    || columns.len() != columns.iter().collect::<std::collections::HashSet<_>>().len()
                {
                    return Err(AppError::bad_request(format!(
                        "Cleaning stage '{}' requires unique non-time value columns with explicit aggregations",
                        base.id
                    )));
                }
                let prior_sort = plan.stages[..index].iter().rev().find(|prior| {
                    prior.enabled() && matches!(prior, CleaningStageDto::Sort { .. })
                });
                let has_ascending_time_sort = matches!(prior_sort,
                    Some(CleaningStageDto::Sort { columns, descending: false, .. })
                    if columns.first().is_some_and(|column| column.trim() == plan.time_column.trim())
                );
                if !has_ascending_time_sort {
                    return Err(AppError::bad_request(format!(
                        "Cleaning stage '{}' requires the latest earlier enabled sort to be ascending with time column '{}' first",
                        base.id, plan.time_column
                    )));
                }
            }
            CleaningStageDto::Annotation { .. } => {}
        }
    }
    Ok(())
}

/// Compile all enabled v1 portable stages in their saved order.
pub fn compile_cleaning_plan(
    mut lf: LazyFrame,
    plan: &CleaningPlanDto,
) -> Result<LazyFrame, AppError> {
    validate_cleaning_plan(plan)?;
    for stage in &plan.stages {
        if !stage.enabled() {
            continue;
        }
        lf = match stage {
            CleaningStageDto::TimeRange {
                start_ms,
                end_ms,
                mode,
                ..
            } => apply_time_range_stage(
                lf,
                &plan.time_column,
                *start_ms,
                *end_ms,
                *mode == TimeRangeMode::KeepInside,
            )?,
            CleaningStageDto::ColumnRange {
                column,
                from,
                to,
                mode,
                ..
            } => {
                let filter = RangeFilter {
                    column: column.clone(),
                    from: *from,
                    to: *to,
                };
                apply_range_stage(lf, &filter, *mode == RangeMode::KeepInside)?
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
                let filter = LineFilter {
                    id: None,
                    column: column.clone(),
                    x1: *x1_ms,
                    y1: *y1,
                    x2: *x2_ms,
                    y2: *y2,
                    keep_above: *keep_above,
                };
                apply_line_stage(lf, &plan.time_column, &filter, *apply_within_segment_only)?
            }
            CleaningStageDto::MissingValue {
                column,
                drop_nulls,
                drop_non_finite,
                ..
            } => {
                let value = polars::prelude::col(column);
                let predicate = match (*drop_nulls, *drop_non_finite) {
                    (true, true) => value.clone().is_not_null().and(value.is_finite()),
                    (true, false) => value.is_not_null(),
                    (false, true) => value.clone().is_null().or(value.is_finite()),
                    (false, false) => unreachable!("validated missing-value policy"),
                };
                lf.filter(predicate)
            }
            CleaningStageDto::Deduplicate { columns, keep, .. } => {
                let strategy = match keep {
                    DuplicateKeep::First => polars::prelude::UniqueKeepStrategy::First,
                    DuplicateKeep::Last => polars::prelude::UniqueKeepStrategy::Last,
                };
                lf.unique_stable_generic(
                    Some(columns.iter().map(polars::prelude::col).collect()),
                    strategy,
                )
            }
            CleaningStageDto::ColumnSelect { columns, mode, .. } => match mode {
                ColumnSelectMode::Keep => lf.select(columns.iter().map(polars::prelude::col).collect::<Vec<_>>()),
                ColumnSelectMode::Drop => lf.drop(polars::prelude::by_name(columns, true, false)),
            },
            CleaningStageDto::Sort { columns, descending, nulls_last, .. } => lf.sort(
                columns.iter().map(String::as_str).collect::<Vec<_>>(),
                polars::prelude::SortMultipleOptions::default()
                    .with_order_descending(*descending)
                    .with_nulls_last(*nulls_last)
                    .with_maintain_order(true),
            ),
            CleaningStageDto::FillNull { columns, strategy, limit, .. } => {
                let strategy = match strategy {
                    FillNullDirection::Forward => polars::prelude::FillNullStrategy::Forward(*limit),
                    FillNullDirection::Backward => polars::prelude::FillNullStrategy::Backward(*limit),
                };
                lf.with_columns(columns.iter().map(|column| {
                    polars::prelude::col(column).fill_null_with_strategy(strategy)
                }).collect::<Vec<_>>())
            }
            CleaningStageDto::Resample { every, aggregations, .. } => {
                let every = parse_fixed_duration(stage.id(), every)?;
                let expressions = aggregations.iter().map(|aggregation| {
                    let value = polars::prelude::col(&aggregation.column);
                    match aggregation.method {
                        ResampleAggregationMethod::Mean => value.mean(),
                        ResampleAggregationMethod::Sum => value.sum(),
                        ResampleAggregationMethod::Min => value.min(),
                        ResampleAggregationMethod::Max => value.max(),
                        ResampleAggregationMethod::Last => value.last(),
                    }.alias(&aggregation.column)
                }).collect::<Vec<_>>();
                lf.group_by_dynamic(
                    polars::prelude::col(&plan.time_column),
                    [],
                    polars::prelude::DynamicGroupOptions {
                        every,
                        period: every,
                        offset: polars::prelude::Duration::try_parse("0ns").expect("zero fixed duration is valid"),
                        label: polars::prelude::Label::Left,
                        include_boundaries: false,
                        closed_window: polars::prelude::ClosedWindow::Left,
                        start_by: polars::prelude::StartBy::WindowBound,
                        ..Default::default()
                    },
                ).agg(expressions)
            }
            CleaningStageDto::Annotation { .. } => lf,
        };
    }
    Ok(lf)
}

fn fnv1a(value: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("fnv1a-{hash:016x}")
}

fn canonical_number(value: f64) -> f64 {
    if value == 0.0 { 0.0 } else { value }
}

fn semantic_stage_value(stage: &CleaningStageDto) -> Option<serde_json::Value> {
    if !stage.enabled() {
        return None;
    }
    match stage {
        CleaningStageDto::TimeRange {
            start_ms,
            end_ms,
            mode,
            ..
        } => Some(serde_json::json!({
            "kind": "timeRange",
            "startMs": canonical_number(start_ms.min(*end_ms)),
            "endMs": canonical_number(start_ms.max(*end_ms)),
            "mode": mode,
        })),
        CleaningStageDto::ColumnRange {
            column,
            from,
            to,
            mode,
            ..
        } => Some(serde_json::json!({
            "kind": "columnRange",
            "column": column.trim(),
            "from": canonical_number(from.min(*to)),
            "to": canonical_number(from.max(*to)),
            "mode": mode,
        })),
        CleaningStageDto::AdaptiveLine {
            column,
            x1_ms,
            y1,
            x2_ms,
            y2,
            keep_above,
            apply_within_segment_only,
            ..
        } => Some(serde_json::json!({
            "kind": "adaptiveLine",
            "column": column.trim(),
            "x1Ms": canonical_number(*x1_ms),
            "y1": canonical_number(*y1),
            "x2Ms": canonical_number(*x2_ms),
            "y2": canonical_number(*y2),
            "keepAbove": keep_above,
            "applyWithinSegmentOnly": apply_within_segment_only,
        })),
        CleaningStageDto::MissingValue {
            column,
            drop_nulls,
            drop_non_finite,
            ..
        } => Some(serde_json::json!({
            "kind": "missingValue",
            "column": column.trim(),
            "dropNulls": drop_nulls,
            "dropNonFinite": drop_non_finite,
        })),
        CleaningStageDto::Deduplicate { columns, keep, .. } => Some(serde_json::json!({
            "kind": "deduplicate",
            "columns": columns.iter().map(|column| column.trim()).collect::<Vec<_>>(),
            "keep": keep,
        })),
        CleaningStageDto::ColumnSelect { columns, mode, .. } => Some(serde_json::json!({
            "kind": "columnSelect",
            "columns": columns.iter().map(|column| column.trim()).collect::<Vec<_>>(),
            "mode": mode,
        })),
        CleaningStageDto::Sort { columns, descending, nulls_last, .. } => Some(serde_json::json!({
            "kind": "sort",
            "columns": columns.iter().map(|column| column.trim()).collect::<Vec<_>>(),
            "descending": descending,
            "nullsLast": nulls_last,
        })),
        CleaningStageDto::FillNull { columns, strategy, limit, .. } => Some(serde_json::json!({
            "kind": "fillNull",
            "columns": columns.iter().map(|column| column.trim()).collect::<Vec<_>>(),
            "strategy": strategy,
            "limit": limit,
        })),
        CleaningStageDto::Resample { every, aggregations, .. } => Some(serde_json::json!({
            "kind": "resample",
            "every": every.trim(),
            "aggregations": aggregations.iter().map(|aggregation| serde_json::json!({
                "column": aggregation.column.trim(),
                "method": aggregation.method,
            })).collect::<Vec<_>>(),
        })),
        CleaningStageDto::Annotation { .. } => None,
    }
}

/// Server-owned optimistic/cache identity. Audit-only fields are excluded.
pub fn semantic_hash(plan: &CleaningPlanDto) -> Result<String, AppError> {
    validate_cleaning_plan(plan)?;
    let canonical = serde_json::json!({
        "schemaVersion": plan.schema_version,
        "sourceVersionId": plan.source_version_id,
        "datasetRevision": plan.dataset_revision,
        "datasetFingerprint": plan.dataset_fingerprint,
        "schemaFingerprint": plan.schema_fingerprint,
        "timeColumn": plan.time_column,
        "stages": plan.stages.iter().filter_map(semantic_stage_value).collect::<Vec<_>>(),
    });
    let encoded = serde_json::to_string(&canonical).map_err(|error| {
        AppError::internal(format!("Cleaning plan canonicalization failed: {error}"))
    })?;
    Ok(fnv1a(&encoded))
}

#[cfg(test)]
mod tests {
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
        assert_eq!(result.height(), 2);
    }

    #[test]
    fn drop_stage_removes_inside_values_but_preserves_nulls() {
        let plan = plan(vec![CleaningStageDto::ColumnRange {
            base: base("drop"),
            column: "value".to_string(),
            from: 1.0,
            to: 2.0,
            mode: RangeMode::DropInside,
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
        assert_eq!(result.height(), 2);
        assert_eq!(
            result
                .column("ts")
                .expect("ts")
                .i64()
                .expect("i64")
                .into_no_null_iter()
                .collect::<Vec<_>>(),
            vec![3, 4]
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
            result.column("ts").expect("ts").i64().expect("i64").into_no_null_iter().collect::<Vec<_>>(),
            vec![20, 30, 10, 40]
        );
    }

    #[test]
    fn fill_null_stage_respects_direction_and_limit() {
        let plan = plan(vec![
            CleaningStageDto::Sort { base: base("sort"), columns: vec!["ts".to_string()], descending: false, nulls_last: true },
            CleaningStageDto::FillNull {
                base: base("fill"), columns: vec!["value".to_string()],
                strategy: FillNullDirection::Forward, limit: Some(1),
            },
        ]);
        let df = DataFrame::new(4, vec![
            Series::new("ts".into(), vec![1_i64, 2, 3, 4]).into(),
            Series::new("value".into(), vec![Some(1.0_f64), None, None, Some(4.0)]).into(),
        ]).expect("frame");
        let result = compile_cleaning_plan(df.lazy(), &plan).expect("compile").collect().expect("collect");
        assert_eq!(result.column("value").expect("value").f64().expect("f64").into_iter().collect::<Vec<_>>(), vec![Some(1.0), Some(1.0), None, Some(4.0)]);
    }

    #[test]
    fn ordered_null_fill_requires_a_prior_time_sort() {
        let plan = plan(vec![CleaningStageDto::FillNull {
            base: base("fill"), columns: vec!["value".to_string()],
            strategy: FillNullDirection::Forward, limit: None,
        }]);
        let error = validate_cleaning_plan(&plan).expect_err("must reject unordered fill");
        assert!(error.to_string().contains("requires an earlier enabled stable sort"));
    }

    #[test]
    fn resample_stage_emits_left_labeled_non_empty_fixed_buckets() {
        let plan = plan(vec![
            CleaningStageDto::Sort { base: base("sort"), columns: vec!["ts".to_string()], descending: false, nulls_last: true },
            CleaningStageDto::Resample {
                base: base("resample"), every: "1m".to_string(),
                aggregations: vec![
                    ResampleAggregationDto { column: "value".to_string(), method: ResampleAggregationMethod::Mean },
                    ResampleAggregationDto { column: "volume".to_string(), method: ResampleAggregationMethod::Sum },
                ],
            },
        ]);
        let timestamps = Series::new("ts".into(), vec![0_i64, 30_000, 60_000, 90_000, 180_000])
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None)).expect("datetime");
        let df = DataFrame::new(5, vec![
            timestamps.into(),
            Series::new("value".into(), vec![1.0_f64, 3.0, 5.0, 7.0, 9.0]).into(),
            Series::new("volume".into(), vec![1_i64, 2, 3, 4, 5]).into(),
        ]).expect("frame");

        let result = compile_cleaning_plan(df.lazy(), &plan).expect("compile").collect().expect("collect");

        assert_eq!(result.height(), 3, "the empty 2-minute bucket must not be synthesized");
        assert_eq!(result.column("ts").expect("ts").datetime().expect("datetime").physical().into_no_null_iter().collect::<Vec<_>>(), vec![0, 60_000, 180_000]);
        assert_eq!(result.column("value").expect("value").f64().expect("f64").into_no_null_iter().collect::<Vec<_>>(), vec![2.0, 6.0, 9.0]);
        assert_eq!(result.column("volume").expect("volume").i64().expect("i64").into_no_null_iter().collect::<Vec<_>>(), vec![3, 7, 5]);
    }

    #[test]
    fn resample_stage_rejects_calendar_or_unordered_contracts() {
        let aggregation = vec![ResampleAggregationDto { column: "value".to_string(), method: ResampleAggregationMethod::Last }];
        let calendar = plan(vec![
            CleaningStageDto::Sort { base: base("sort"), columns: vec!["ts".to_string()], descending: false, nulls_last: true },
            CleaningStageDto::Resample { base: base("resample"), every: "1d".to_string(), aggregations: aggregation.clone() },
        ]);
        assert!(validate_cleaning_plan(&calendar).expect_err("calendar duration").to_string().contains("positive fixed duration"));

        let descending = plan(vec![
            CleaningStageDto::Sort { base: base("sort"), columns: vec!["ts".to_string()], descending: true, nulls_last: true },
            CleaningStageDto::Resample { base: base("resample"), every: "1h".to_string(), aggregations: aggregation },
        ]);
        assert!(validate_cleaning_plan(&descending).expect_err("descending sort").to_string().contains("ascending with time column"));
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
        assert_eq!(result.height(), 2);
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
}
