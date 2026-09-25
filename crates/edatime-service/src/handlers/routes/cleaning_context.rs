//! Validated source-bound cleaning plan context shared by route handlers.

use polars::prelude::LazyFrame;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use edatime_query::cleaning::{CleaningPlanDto, compile_cleaning_plan, semantic_hash};
use edatime_store::state::AppState;
use edatime_store::versions::DatasetVersionRecord;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanRequestEnvelope {
    pub plan: CleaningPlanDto,
    pub expected_plan_hash: Option<String>,
    pub expected_source_version_id: String,
    pub expected_dataset_revision: u64,
}

pub(crate) struct CompiledCleaningContext {
    pub(crate) version: DatasetVersionRecord,
    pub(crate) plan_hash: String,
    pub(crate) frame: LazyFrame,
}

pub(crate) fn validate_envelope(
    state: &AppState,
    envelope: &PlanRequestEnvelope,
) -> Result<(DatasetVersionRecord, String), AppError> {
    let version = state
        .dataset_versions
        .record(&envelope.expected_source_version_id)
        .map_err(|_| {
            AppError::stale_plan("Requested cleaning-plan source version is unavailable")
        })?;
    if envelope.plan.source_version_id != version.id
        || envelope.expected_source_version_id != version.id
        || envelope.plan.dataset_revision != version.revision
        || envelope.expected_dataset_revision != version.revision
    {
        return Err(AppError::stale_plan(
            "Cleaning plan baseline no longer matches the requested source version",
        ));
    }
    if envelope.plan.dataset_fingerprint.as_deref() != Some(version.dataset_fingerprint.as_str())
        || envelope.plan.schema_fingerprint != version.schema_fingerprint
    {
        return Err(AppError::stale_plan(
            "Cleaning plan fingerprint no longer matches the requested source version",
        ));
    }
    let hash = semantic_hash(&envelope.plan).map_err(AppError::from)?;
    // A frontend hash is an optimistic scheduling hint. The backend hash is
    // authoritative and deliberately returned instead of being trusted here.
    let _ = &envelope.expected_plan_hash;
    Ok((version, hash))
}

pub(crate) fn resolve_cleaning_context(
    state: &AppState,
    envelope: &PlanRequestEnvelope,
) -> Result<CompiledCleaningContext, AppError> {
    crate::handlers::routes::shared::enforce_work_budget(
        "cleaning plan stages",
        envelope.plan.stages.len() as u128,
        state.config.budgets.max_cleaning_stages as u128,
    )?;
    let (version, plan_hash) = validate_envelope(state, envelope)?;
    let key = (version.id.clone(), plan_hash.clone());
    let cached = state
        .working_plan_cache
        .lock()
        .map_err(|_| AppError::internal("Working plan cache lock poisoned"))?
        .get(&key)
        .cloned();
    if let Some(frame) = cached {
        return Ok(CompiledCleaningContext {
            version,
            plan_hash,
            frame,
        });
    }

    let source = state.dataset_snapshot_for_version(&version.id)?;
    let frame = compile_cleaning_plan(source, &envelope.plan).map_err(AppError::from)?;
    let mut cache = state
        .working_plan_cache
        .lock()
        .map_err(|_| AppError::internal("Working plan cache lock poisoned"))?;
    if let Some(winner) = cache.get(&key) {
        return Ok(CompiledCleaningContext {
            version,
            plan_hash,
            frame: winner.clone(),
        });
    }
    if cache.len() >= 8 {
        cache.clear();
    }
    cache.insert(key, frame.clone());
    Ok(CompiledCleaningContext {
        version,
        plan_hash,
        frame,
    })
}
