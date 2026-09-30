//! Typed, portable cleaning-plan validation and LazyFrame compilation.

use polars::prelude::LazyFrame;
use serde::{Deserialize, Serialize};

use edatime_core::{error::DomainError, temporal};

use crate::derived::{parse_derived_expression, validate_derived_expression_columns};
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
        #[serde(default)]
        retain_nulls: bool,
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
    ChronologicalSplit {
        #[serde(flatten)]
        base: CleaningStageBaseDto,
        train_end_ms: f64,
        validation_end_ms: f64,
        #[serde(default)]
        embargo_ms: f64,
        output_column: String,
    },
    DerivedColumn {
        #[serde(flatten)]
        base: CleaningStageBaseDto,
        expression: String,
        output_column: String,
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
            | Self::ChronologicalSplit { base, .. }
            | Self::DerivedColumn { base, .. }
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
            | Self::ChronologicalSplit { base, .. }
            | Self::DerivedColumn { base, .. }
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
pub enum FillNullDirection {
    Forward,
    Backward,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResampleAggregationDto {
    pub column: String,
    pub method: ResampleAggregationMethod,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ResampleAggregationMethod {
    Mean,
    Sum,
    Min,
    Max,
    Last,
}

fn parse_fixed_duration(
    stage_id: &str,
    every: &str,
) -> Result<polars::prelude::Duration, DomainError> {
    let value = every.trim();
    let digit_count = value.bytes().take_while(u8::is_ascii_digit).count();
    let (quantity, unit) = value.split_at(digit_count);
    let valid_unit = matches!(unit, "ns" | "us" | "ms" | "s" | "m" | "h");
    let valid_quantity = !quantity.is_empty()
        && quantity
            .parse::<u64>()
            .is_ok_and(|quantity| quantity > 0 && quantity <= i64::MAX as u64);
    if digit_count == value.len() || !valid_unit || !valid_quantity {
        return Err(DomainError::bad_request(format!(
            "Cleaning stage '{stage_id}' requires a positive fixed duration such as '15m'; supported units are ns, us, ms, s, m, and h"
        )));
    }
    polars::prelude::Duration::try_parse(value).map_err(|error| {
        DomainError::bad_request(format!(
            "Cleaning stage '{stage_id}' has invalid duration '{value}': {error}"
        ))
    })
}

fn ensure_finite(stage_id: &str, field: &str, value: f64) -> Result<(), DomainError> {
    if value.is_finite() {
        Ok(())
    } else {
        Err(DomainError::bad_request(format!(
            "Cleaning stage '{stage_id}' field '{field}' must be finite"
        )))
    }
}

pub fn validate_cleaning_plan(plan: &CleaningPlanDto) -> Result<(), DomainError> {
    if plan.schema_version != 1 {
        return Err(DomainError::bad_request(format!(
            "Unsupported cleaning plan schema version {}",
            plan.schema_version
        )));
    }
    if plan.source_version_id.trim().is_empty()
        || plan.schema_fingerprint.trim().is_empty()
        || plan.time_column.trim().is_empty()
    {
        return Err(DomainError::bad_request(
            "Cleaning plan requires sourceVersionId, schemaFingerprint, and timeColumn",
        ));
    }
    let mut ids = std::collections::HashSet::new();
    for (index, stage) in plan.stages.iter().enumerate() {
        if stage.id().trim().is_empty() || !ids.insert(stage.id()) {
            return Err(DomainError::bad_request(
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
                    return Err(DomainError::bad_request(format!(
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
                    return Err(DomainError::bad_request(format!(
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
                    return Err(DomainError::bad_request(format!(
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
                    return Err(DomainError::bad_request(format!(
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
                    return Err(DomainError::bad_request(format!(
                        "Cleaning stage '{}' requires unique non-empty column names",
                        base.id
                    )));
                }
            }
            CleaningStageDto::Sort { base, columns, .. } => {
                if columns.is_empty()
                    || columns.iter().any(|column| column.trim().is_empty())
                    || columns.len()
                        != columns
                            .iter()
                            .collect::<std::collections::HashSet<_>>()
                            .len()
                {
                    return Err(DomainError::bad_request(format!(
                        "Cleaning stage '{}' requires unique non-empty sort columns",
                        base.id
                    )));
                }
            }
            CleaningStageDto::FillNull {
                base,
                columns,
                limit,
                ..
            } => {
                if columns.is_empty()
                    || columns.iter().any(|column| column.trim().is_empty())
                    || columns.len()
                        != columns
                            .iter()
                            .collect::<std::collections::HashSet<_>>()
                            .len()
                    || matches!(limit, Some(0))
                {
                    return Err(DomainError::bad_request(format!(
                        "Cleaning stage '{}' requires unique non-empty columns and a positive fill limit",
                        base.id
                    )));
                }
                let has_time_sort = plan.stages[..index].iter().any(|prior| matches!(prior,
                    CleaningStageDto::Sort { columns, .. }
                    if prior.enabled() && columns.iter().any(|column| column.trim() == plan.time_column.trim())
                ));
                if !has_time_sort {
                    return Err(DomainError::bad_request(format!(
                        "Cleaning stage '{}' requires an earlier enabled stable sort on the time column '{}'; add Sort before ordered null fill",
                        base.id, plan.time_column
                    )));
                }
            }
            CleaningStageDto::Resample {
                base,
                every,
                aggregations,
            } => {
                parse_fixed_duration(&base.id, every)?;
                let columns = aggregations
                    .iter()
                    .map(|aggregation| aggregation.column.trim())
                    .collect::<Vec<_>>();
                if aggregations.is_empty()
                    || columns
                        .iter()
                        .any(|column| column.is_empty() || *column == plan.time_column.trim())
                    || columns.len()
                        != columns
                            .iter()
                            .collect::<std::collections::HashSet<_>>()
                            .len()
                {
                    return Err(DomainError::bad_request(format!(
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
                    return Err(DomainError::bad_request(format!(
                        "Cleaning stage '{}' requires the latest earlier enabled sort to be ascending with time column '{}' first",
                        base.id, plan.time_column
                    )));
                }
            }
            CleaningStageDto::ChronologicalSplit {
                base,
                train_end_ms,
                validation_end_ms,
                embargo_ms,
                output_column,
            } => {
                ensure_finite(&base.id, "trainEndMs", *train_end_ms)?;
                ensure_finite(&base.id, "validationEndMs", *validation_end_ms)?;
                ensure_finite(&base.id, "embargoMs", *embargo_ms)?;
                if train_end_ms >= validation_end_ms
                    || *embargo_ms < 0.0
                    || output_column.trim().is_empty()
                {
                    return Err(DomainError::bad_request(format!(
                        "Cleaning stage '{}' requires trainEndMs before validationEndMs, a non-negative embargoMs, and an output column",
                        base.id
                    )));
                }
            }
            CleaningStageDto::DerivedColumn {
                base,
                expression,
                output_column,
            } => {
                if output_column.trim().is_empty()
                    || output_column.trim() == plan.time_column.trim()
                {
                    return Err(DomainError::bad_request(format!(
                        "Cleaning stage '{}' requires a non-time output column",
                        base.id
                    )));
                }
                parse_derived_expression(expression)?;
            }
            CleaningStageDto::Annotation { .. } => {}
        }
    }
    Ok(())
}

/// A cleaning plan whose cross-stage prerequisites have been checked.
///
/// Preview code can apply a saved stage prefix without revalidating each stage
/// as a standalone plan, which would discard earlier ordering context.
pub struct ValidatedCleaningPlan<'a> {
    plan: &'a CleaningPlanDto,
}

impl<'a> ValidatedCleaningPlan<'a> {
    pub fn new(plan: &'a CleaningPlanDto) -> Result<Self, DomainError> {
        validate_cleaning_plan(plan)?;
        Ok(Self { plan })
    }

    pub fn compile(&self, mut lf: LazyFrame) -> Result<LazyFrame, DomainError> {
        for index in 0..self.plan.stages.len() {
            lf = self.compile_stage(lf, index)?;
        }
        Ok(lf)
    }

    /// Apply the stage at `index`; prerequisite validation belongs to `new`.
    pub fn compile_stage(&self, lf: LazyFrame, index: usize) -> Result<LazyFrame, DomainError> {
        let stage = self.plan.stages.get(index).ok_or_else(|| {
            DomainError::bad_request(format!("Cleaning stage index {index} is out of range"))
        })?;
        compile_validated_stage(lf, self.plan, stage)
    }
}

/// Compile all enabled v1 portable stages in their saved order.
pub fn compile_cleaning_plan(
    lf: LazyFrame,
    plan: &CleaningPlanDto,
) -> Result<LazyFrame, DomainError> {
    ValidatedCleaningPlan::new(plan)?.compile(lf)
}

fn compile_validated_stage(
    lf: LazyFrame,
    plan: &CleaningPlanDto,
    stage: &CleaningStageDto,
) -> Result<LazyFrame, DomainError> {
    if !stage.enabled() {
        return Ok(lf);
    }
    let lf = match stage {
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
            retain_nulls,
            ..
        } => {
            let filter = RangeFilter {
                column: column.clone(),
                from: *from,
                to: *to,
            };
            apply_range_stage(lf, &filter, *mode == RangeMode::KeepInside, *retain_nulls)?
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
            ColumnSelectMode::Keep => {
                lf.select(columns.iter().map(polars::prelude::col).collect::<Vec<_>>())
            }
            ColumnSelectMode::Drop => lf.drop(polars::prelude::by_name(columns, true, false)),
        },
        CleaningStageDto::Sort {
            columns,
            descending,
            nulls_last,
            ..
        } => lf.sort(
            columns.iter().map(String::as_str).collect::<Vec<_>>(),
            polars::prelude::SortMultipleOptions::default()
                .with_order_descending(*descending)
                .with_nulls_last(*nulls_last)
                .with_maintain_order(true),
        ),
        CleaningStageDto::FillNull {
            columns,
            strategy,
            limit,
            ..
        } => {
            let strategy = match strategy {
                FillNullDirection::Forward => polars::prelude::FillNullStrategy::Forward(*limit),
                FillNullDirection::Backward => polars::prelude::FillNullStrategy::Backward(*limit),
            };
            lf.with_columns(
                columns
                    .iter()
                    .map(|column| polars::prelude::col(column).fill_null_with_strategy(strategy))
                    .collect::<Vec<_>>(),
            )
        }
        CleaningStageDto::Resample {
            every,
            aggregations,
            ..
        } => {
            let every = parse_fixed_duration(stage.id(), every)?;
            let expressions = aggregations
                .iter()
                .map(|aggregation| {
                    let value = polars::prelude::col(&aggregation.column);
                    match aggregation.method {
                        ResampleAggregationMethod::Mean => value.mean(),
                        ResampleAggregationMethod::Sum => value.sum(),
                        ResampleAggregationMethod::Min => value.min(),
                        ResampleAggregationMethod::Max => value.max(),
                        ResampleAggregationMethod::Last => value.last(),
                    }
                    .alias(&aggregation.column)
                })
                .collect::<Vec<_>>();
            lf.group_by_dynamic(
                polars::prelude::col(&plan.time_column),
                [],
                polars::prelude::DynamicGroupOptions {
                    every,
                    period: every,
                    offset: crate::pipeline::zero_offset()?,
                    label: polars::prelude::Label::Left,
                    include_boundaries: false,
                    closed_window: polars::prelude::ClosedWindow::Left,
                    start_by: polars::prelude::StartBy::WindowBound,
                    ..Default::default()
                },
            )
            .agg(expressions)
        }
        CleaningStageDto::ChronologicalSplit {
            train_end_ms,
            validation_end_ms,
            embargo_ms,
            output_column,
            ..
        } => {
            let schema = lf.clone().collect_schema().map_err(|error| {
                DomainError::bad_request(format!("Failed to inspect split time column: {error}"))
            })?;
            let dtype = schema.get(&plan.time_column).ok_or_else(|| {
                DomainError::bad_request(format!(
                    "Missing time column '{}' for chronological split",
                    plan.time_column
                ))
            })?;
            let train_end = temporal::epoch_ms_to_native(*train_end_ms, dtype, true)?;
            let validation_end = temporal::epoch_ms_to_native(*validation_end_ms, dtype, true)?;
            let train_embargo_end =
                temporal::epoch_ms_to_native(*train_end_ms + *embargo_ms, dtype, true)?;
            let validation_embargo_end =
                temporal::epoch_ms_to_native(*validation_end_ms + *embargo_ms, dtype, true)?;
            let time =
                polars::prelude::col(&plan.time_column).cast(polars::prelude::DataType::Int64);
            lf.with_columns([polars::prelude::when(time.clone().is_null())
                .then(polars::prelude::lit("unassigned"))
                .when(time.clone().lt_eq(polars::prelude::lit(train_end)))
                .then(polars::prelude::lit("train"))
                .when(time.clone().lt_eq(polars::prelude::lit(train_embargo_end)))
                .then(polars::prelude::lit("embargo"))
                .when(time.clone().lt_eq(polars::prelude::lit(validation_end)))
                .then(polars::prelude::lit("validation"))
                .when(time.lt_eq(polars::prelude::lit(validation_embargo_end)))
                .then(polars::prelude::lit("embargo"))
                .otherwise(polars::prelude::lit("test"))
                .alias(output_column)])
        }
        CleaningStageDto::DerivedColumn {
            expression,
            output_column,
            ..
        } => {
            let schema = lf.clone().collect_schema().map_err(|error| {
                DomainError::bad_request(format!(
                    "Failed to inspect derived expression columns: {error}"
                ))
            })?;
            let expression = parse_derived_expression(expression)?;
            validate_derived_expression_columns(&expression, &schema)?;
            lf.with_column(expression.to_polars_expr().alias(output_column))
        }
        CleaningStageDto::Annotation { .. } => lf,
    };
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
            retain_nulls,
            ..
        } => Some(serde_json::json!({
            "kind": "columnRange",
            "column": column.trim(),
            "from": canonical_number(from.min(*to)),
            "to": canonical_number(from.max(*to)),
            "mode": mode,
            "retainNulls": retain_nulls,
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
        CleaningStageDto::Sort {
            columns,
            descending,
            nulls_last,
            ..
        } => Some(serde_json::json!({
            "kind": "sort",
            "columns": columns.iter().map(|column| column.trim()).collect::<Vec<_>>(),
            "descending": descending,
            "nullsLast": nulls_last,
        })),
        CleaningStageDto::FillNull {
            columns,
            strategy,
            limit,
            ..
        } => Some(serde_json::json!({
            "kind": "fillNull",
            "columns": columns.iter().map(|column| column.trim()).collect::<Vec<_>>(),
            "strategy": strategy,
            "limit": limit,
        })),
        CleaningStageDto::Resample {
            every,
            aggregations,
            ..
        } => Some(serde_json::json!({
            "kind": "resample",
            "every": every.trim(),
            "aggregations": aggregations.iter().map(|aggregation| serde_json::json!({
                "column": aggregation.column.trim(),
                "method": aggregation.method,
            })).collect::<Vec<_>>(),
        })),
        CleaningStageDto::ChronologicalSplit {
            train_end_ms,
            validation_end_ms,
            embargo_ms,
            output_column,
            ..
        } => Some(serde_json::json!({
            "kind": "chronologicalSplit",
            "trainEndMs": canonical_number(*train_end_ms),
            "validationEndMs": canonical_number(*validation_end_ms),
            "embargoMs": canonical_number(*embargo_ms),
            "outputColumn": output_column.trim(),
        })),
        CleaningStageDto::DerivedColumn {
            expression,
            output_column,
            ..
        } => Some(serde_json::json!({
            "kind": "derivedColumn",
            "expression": expression.trim(),
            "outputColumn": output_column.trim(),
        })),
        CleaningStageDto::Annotation { .. } => None,
    }
}

/// Server-owned optimistic/cache identity. Audit-only fields are excluded.
pub fn semantic_hash(plan: &CleaningPlanDto) -> Result<String, DomainError> {
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
        DomainError::internal(format!("Cleaning plan canonicalization failed: {error}"))
    })?;
    Ok(fnv1a(&encoded))
}

#[cfg(test)]
mod tests;
