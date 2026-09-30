use axum::{Json, extract::State};
use polars::prelude::{LazyFrame, NamedFrom, Series, col, len, lit};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use edatime_core::stats;
use edatime_store::{
    jobs::{JobKind, JobRecord, JobStatus},
    state::{AppState, ProfileCacheEntry},
    versions::DatasetVersionRecord,
};

const PROFILE_ALGORITHM_VERSION: &str = "exact-v1";
const SAMPLED_PROFILE_ALGORITHM_VERSION: &str = "sample-v2";
const SAMPLED_PROFILE_ROW_CAP: usize = 10_000;

mod profile;
pub use profile::{
    build_dataset_metadata, build_dataset_metadata_from_path_with_time_column,
    build_immediate_dataset_metadata_from_path_with_time_column,
};
// Crate-private helpers used by the handlers below and by the tests.
use profile::*;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileResponse {
    pub algorithm_version: String,
    pub source_version: DatasetVersionRecord,
    pub status: String,
    pub job: Option<JobRecord>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetMetadata {
    pub revision: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_version_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_version_revision: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub root_source_version_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_source_version_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dataset_fingerprint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema_fingerprint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    pub profile_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_sample_rows: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_sampling: Option<ProfileSampling>,
    pub total_rows: usize,
    pub columns: Vec<ColumnMetadata>,
    pub numeric_columns: Vec<String>,
    pub time_column: Option<String>,
    pub time_range: Option<TimeRange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_quality: Option<TimeQuality>,
    pub column_profiles: Vec<ColumnProfile>,
}

/// Sampling applies to distribution estimates only, not adjacency/run statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileSampling {
    pub method: String,
    pub source_rows: usize,
    pub sampled_rows: usize,
    pub seed: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnMetadata {
    pub name: String,
    pub dtype: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TimeRange {
    pub min: i64,
    pub max: i64,
}

/// Ordered-source quality facts for the detected time column.
///
/// These facts are deliberately only produced by a completed sampled or exact
/// profile. Immediate metadata reports the time range without pretending it
/// has inspected source ordering or duplicate timestamps.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TimeQuality {
    pub non_null_count: usize,
    pub null_count: usize,
    pub unique_timestamp_count: usize,
    /// Rows beyond the first occurrence for each duplicate timestamp.
    pub duplicate_timestamp_count: usize,
    pub is_monotonic_non_decreasing: bool,
    /// Adjacent source-order timestamp pairs where the latter is earlier.
    pub out_of_order_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_gap_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub median_gap_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_gap_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnProfile {
    pub name: String,
    pub dtype: String,
    pub non_null_count: usize,
    pub null_count: usize,
    pub non_finite_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finite_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zero_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub longest_zero_run: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub longest_zero_run_start_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub longest_zero_run_end_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distinct_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_constant: Option<bool>,
    pub min: Option<f64>,
    pub max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Native integer minimum as a decimal string; `min` can round beyond f64 precision.
    pub min_exact: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Native integer maximum as a decimal string; `max` can round beyond f64 precision.
    pub max_exact: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub q25: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub median: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub q75: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interquartile_range: Option<f64>,
    pub histogram: Option<stats::Histogram>,
}

#[tracing::instrument(skip(state))]
pub async fn get_metadata(
    State(state): State<AppState>,
) -> Result<Json<DatasetMetadata>, AppError> {
    let version = state.current_dataset_version()?;
    let metadata_key = immediate_metadata_cache_key(&version);
    if let Some(cached) = state.cached_immediate_metadata(&metadata_key) {
        let mut metadata: DatasetMetadata = serde_json::from_value(cached)
            .map_err(|error| AppError::internal(format!("Decode cached metadata: {error}")))?;
        metadata.display_name = version.display_name;
        return Ok(Json(metadata));
    }
    // Resolve the immutable source before yielding to the admitted worker.
    // The active repository may be replaced by another upload while metadata
    // is being computed, but this response must remain internally consistent.
    let source = state.dataset_snapshot_for_version(&version.id)?;
    let worker_time_column = version.time_column.clone();

    let metadata = state
        .query_executor
        .run_interactive(edatime_core::metrics::CpuStage::Query, move || {
            build_immediate_dataset_metadata_from_lazyframe(source, worker_time_column.as_deref())
        })
        .await
        .map_err(AppError::from)??;

    let mut metadata = metadata;
    metadata.revision = version.revision;
    metadata.source_version_id = Some(version.id);
    metadata.source_version_revision = Some(version.revision);
    metadata.root_source_version_id = Some(version.root_id);
    metadata.parent_source_version_id = version.parent_id;
    metadata.dataset_fingerprint = Some(version.dataset_fingerprint);
    metadata.schema_fingerprint = Some(version.schema_fingerprint);
    metadata.source_name = version.source_name;
    metadata.display_name = version.display_name;
    state.store_immediate_metadata(metadata_key, serde_json::to_value(&metadata)?);
    Ok(Json(metadata))
}

fn immediate_metadata_cache_key(version: &DatasetVersionRecord) -> String {
    format!(
        "{}:{}:{}",
        version.id,
        version.revision,
        version.time_column.as_deref().unwrap_or("")
    )
}

fn profile_cache_key(version: &DatasetVersionRecord, algorithm_version: &str) -> String {
    format!(
        "{algorithm_version}:{}:{}:{}",
        version.id, version.revision, version.dataset_fingerprint
    )
}

fn profile_response(
    state: &AppState,
    algorithm_version: &'static str,
) -> Result<ProfileResponse, AppError> {
    let version = state.current_dataset_version()?;
    let key = profile_cache_key(&version, algorithm_version);
    let mut entry = state.cached_profile(&key);
    let job = entry
        .as_ref()
        .and_then(|entry| state.jobs.record(&entry.job_id));
    // Publication stores the result before completing the job. The worker can
    // finish between these two reads; refresh the earlier cache snapshot so a
    // completed profile is never incorrectly reported as not_started.
    if job
        .as_ref()
        .is_some_and(|job| job.status == JobStatus::Completed)
    {
        entry = state.cached_profile(&key);
    }
    let status = match (
        entry.as_ref().and_then(|entry| entry.result.as_ref()),
        job.as_ref(),
    ) {
        (Some(_), _) => "ready",
        (None, Some(job)) if job.status == JobStatus::Queued => "queued",
        (None, Some(job)) if job.status == JobStatus::Running => "running",
        (None, Some(job)) if job.status == JobStatus::Cancelling => "cancelling",
        (None, Some(job)) if job.status == JobStatus::Cancelled => "cancelled",
        (None, Some(job)) if job.status == JobStatus::Failed => "failed",
        _ => "not_started",
    };
    Ok(ProfileResponse {
        algorithm_version: algorithm_version.to_string(),
        source_version: version,
        status: status.to_string(),
        job,
        metadata: entry.and_then(|entry| entry.result),
    })
}

/// Report the exact profile cache state for the selected immutable source.
/// Metadata remains available to existing consumers while this dedicated
/// endpoint distinguishes a complete exact report from an in-flight job.
pub async fn get_profile(State(state): State<AppState>) -> Result<Json<ProfileResponse>, AppError> {
    Ok(Json(profile_response(&state, PROFILE_ALGORITHM_VERSION)?))
}

/// Report the bounded sampled profile cache independently from the exact
/// profile. Its metadata always declares `profile_status: sampled` and a
/// sample-row count so callers cannot treat it as an exact report.
pub async fn get_sample_profile(
    State(state): State<AppState>,
) -> Result<Json<ProfileResponse>, AppError> {
    Ok(Json(profile_response(
        &state,
        SAMPLED_PROFILE_ALGORITHM_VERSION,
    )?))
}

/// Start (or reuse) an admitted exact profile job for the active source. The
/// job publishes only a fully computed result, so callers never confuse a
/// partial aggregate with an exact quality finding.
pub async fn start_profile(
    State(state): State<AppState>,
) -> Result<Json<ProfileResponse>, AppError> {
    start_profile_mode(state, PROFILE_ALGORITHM_VERSION, None).await
}

/// Deterministic stratified sample spanning the source order, with endpoint
/// coverage. Gathering retains at most the cap; the source count scan is admitted.
pub async fn start_sample_profile(
    State(state): State<AppState>,
) -> Result<Json<ProfileResponse>, AppError> {
    start_profile_mode(
        state,
        SAMPLED_PROFILE_ALGORITHM_VERSION,
        Some(SAMPLED_PROFILE_ROW_CAP),
    )
    .await
}

async fn start_profile_mode(
    state: AppState,
    algorithm_version: &'static str,
    sample_row_cap: Option<usize>,
) -> Result<Json<ProfileResponse>, AppError> {
    let version = state.current_dataset_version()?;
    let key = profile_cache_key(&version, algorithm_version);
    if let Some(entry) = state.cached_profile(&key) {
        let active = state.jobs.record(&entry.job_id).is_some_and(|job| {
            matches!(
                job.status,
                JobStatus::Queued | JobStatus::Running | JobStatus::Cancelling
            )
        });
        if entry.result.is_some() || active {
            return Ok(Json(profile_response(&state, algorithm_version)?));
        }
    }
    // Capture the immutable source before publishing a job. A failed lookup is
    // a request error, never a reason to profile whichever source is current
    // by the time a background task begins.
    let mut snapshot = state.dataset_snapshot_for_version(&version.id)?;

    let job = state
        .jobs
        .create_with_request_id(JobKind::Profile, crate::middleware::current_request_id());
    state.store_profile(
        key.clone(),
        ProfileCacheEntry {
            job_id: job.id().to_string(),
            result: None,
        },
    );

    let worker_state = state.clone();
    let worker_version = version.clone();
    tokio::spawn(async move {
        if !worker_state.jobs.start(&job) {
            return;
        }
        worker_state.jobs.update_progress(
            &job,
            5,
            Some(if sample_row_cap.is_some() {
                format!("collecting bounded {algorithm_version} source profile")
            } else {
                "collecting exact source profile".to_string()
            }),
        );
        if job.is_cancelled() {
            worker_state.jobs.complete(&job);
            return;
        }

        let source_rows = if let Some(cap) = sample_row_cap {
            let count = match worker_state
                .query_executor
                .execute_queued_background_async(snapshot.clone().select([len().alias("rows")]))
                .await
            {
                Ok(frame) => frame
                    .column("rows")
                    .ok()
                    .and_then(|c| c.u32().ok())
                    .and_then(|c| c.get(0))
                    .map(|n| n as usize),
                Err(error) => {
                    worker_state.jobs.fail(&job, error.to_string());
                    return;
                }
            };
            let Some(rows) = count else {
                worker_state
                    .jobs
                    .fail(&job, "Could not count the sampled source".to_string());
                return;
            };
            snapshot = match worker_state
                .query_executor
                .run_queued_background(
                    edatime_core::metrics::CpuStage::Analytics,
                    move || -> Result<LazyFrame, AppError> {
                        let schema = snapshot.collect_schema()?;
                        let indices = lit(Series::new(
                            "profile_indices".into(),
                            profile_sample_indices(rows, cap),
                        ));
                        Ok(snapshot.select(
                            schema
                                .iter_names()
                                .map(|name| col(name.as_str()).gather(indices.clone()))
                                .collect::<Vec<_>>(),
                        ))
                    },
                )
                .await
            {
                Ok(Ok(selected)) => selected,
                Ok(Err(error)) => {
                    worker_state.jobs.fail(&job, error.to_string());
                    return;
                }
                Err(error) => {
                    worker_state.jobs.fail(&job, error.to_string());
                    return;
                }
            };
            Some(rows)
        } else {
            None
        };

        let frame = match worker_state
            .query_executor
            .execute_queued_background_async(snapshot)
            .await
        {
            Ok(frame) => frame,
            Err(error) => {
                worker_state.jobs.fail(&job, error.to_string());
                return;
            }
        };
        if job.is_cancelled() {
            worker_state.jobs.complete(&job);
            return;
        }
        worker_state.jobs.update_progress(
            &job,
            70,
            Some(if sample_row_cap.is_some() {
                "building sampled quality report".to_string()
            } else {
                "building exact quality report".to_string()
            }),
        );
        let time_column = worker_version.time_column.clone();
        let report = match worker_state
            .query_executor
            .run_queued_background(edatime_core::metrics::CpuStage::Analytics, move || {
                build_dataset_metadata(&frame, true, time_column.as_deref())
            })
            .await
        {
            Ok(Ok(report)) => report,
            Ok(Err(error)) => {
                worker_state.jobs.fail(&job, error.to_string());
                return;
            }
            Err(error) => {
                worker_state.jobs.fail(&job, error.to_string());
                return;
            }
        };
        if job.is_cancelled() {
            worker_state.jobs.complete(&job);
            return;
        }

        let mut report = report;
        if sample_row_cap.is_some() {
            report.profile_status = "sampled".to_string();
            report.profile_sample_rows = Some(report.total_rows);
            report.profile_sampling = Some(ProfileSampling {
                method: "stratified_source_rows_with_endpoints".into(),
                source_rows: source_rows.unwrap_or(report.total_rows),
                sampled_rows: report.total_rows,
                seed: 0xeda71,
            });
            // Sampled rows are not adjacent observations. Run lengths and cadence
            // computed on them would be false source-quality claims.
            report.time_quality = None;
            for column in &mut report.column_profiles {
                column.longest_zero_run = None;
                column.longest_zero_run_start_ms = None;
                column.longest_zero_run_end_ms = None;
            }
        }
        report.revision = worker_version.revision;
        report.source_version_id = Some(worker_version.id.clone());
        report.source_version_revision = Some(worker_version.revision);
        report.root_source_version_id = Some(worker_version.root_id.clone());
        report.parent_source_version_id = worker_version.parent_id.clone();
        report.dataset_fingerprint = Some(worker_version.dataset_fingerprint.clone());
        report.schema_fingerprint = Some(worker_version.schema_fingerprint.clone());
        report.source_name = worker_version.source_name.clone();
        report.display_name = worker_version.display_name.clone();
        match serde_json::to_value(report) {
            Ok(result) => {
                worker_state.store_profile(
                    key,
                    ProfileCacheEntry {
                        job_id: job.id().to_string(),
                        result: Some(result),
                    },
                );
                worker_state.jobs.complete(&job);
            }
            Err(error) => {
                worker_state
                    .jobs
                    .fail(&job, format!("Could not serialize profile: {error}"));
            }
        }
    });

    Ok(Json(profile_response(&state, algorithm_version)?))
}

#[cfg(test)]
mod tests;
