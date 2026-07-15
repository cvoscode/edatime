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
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
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
            | Self::Annotation { base, .. } => &base.id,
        }
    }

    pub fn enabled(&self) -> bool {
        match self {
            Self::TimeRange { base, .. }
            | Self::ColumnRange { base, .. }
            | Self::AdaptiveLine { base, .. }
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
    for stage in &plan.stages {
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
    use polars::prelude::{DataFrame, IntoLazy, NamedFrom, Series};

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
