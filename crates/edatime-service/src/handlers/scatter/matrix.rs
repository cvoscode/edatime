//! Scatter matrix batch handler — POST /api/v1/scatter/matrix.

use axum::{Json, extract::State, response::Response};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use polars::prelude::*;
use std::sync::Arc;

use crate::error::AppError;
use edatime_query::arrow_export::dataframe_to_arrow_ipc;
use edatime_query::validation::{validate_scatter_limit, validate_time_window};
use edatime_store::cache::{CacheReservation, CachedResponse};
use edatime_store::state::AppState;

use super::sample::collect_sampled_matrix_rows_streaming;
use super::{
    ScatterColorKind, ScatterMatrixPair, ScatterMatrixQuery, TimeColorMode, clamp_limit,
    collect_filtered_scatter_columns_frame, resolved_scatter_limit,
};
use crate::handlers::routes::cleaning::compile_request_frame;
use crate::handlers::routes::shared::{ExecutionIdentity, cached_response, enforce_work_budget};

#[derive(Debug, serde::Serialize)]
struct ScatterMatrixCellMeta {
    cell_id: String,
    x: String,
    y: String,
    total_points: usize,
    returned_points: usize,
    color_min: Option<f64>,
    color_max: Option<f64>,
    color_kind: Option<&'static str>,
}

fn normalize_pairs(pairs: Vec<ScatterMatrixPair>) -> Vec<ScatterMatrixPair> {
    let mut seen = std::collections::HashSet::new();
    let mut normalized = Vec::with_capacity(pairs.len());
    for pair in pairs {
        let x = pair.x.trim().to_string();
        let y = pair.y.trim().to_string();
        if x.is_empty() || y.is_empty() {
            continue;
        }
        let key = format!("{x}|{y}");
        if seen.insert(key) {
            normalized.push(ScatterMatrixPair { x, y });
        }
    }
    normalized
}

#[tracing::instrument(skip(state))]
pub async fn post_scatter_matrix(
    State(state): State<AppState>,
    Json(params): Json<ScatterMatrixQuery>,
) -> Result<Response, AppError> {
    scatter_matrix_response(state, params).await
}

async fn scatter_matrix_response(
    state: AppState,
    params: ScatterMatrixQuery,
) -> Result<Response, AppError> {
    let pairs = normalize_pairs(params.pairs);
    if pairs.is_empty() {
        return Err(AppError::bad_request(
            "Scatter matrix request requires at least one valid pair",
        ));
    }

    let color_col = params
        .color
        .clone()
        .filter(|value| !value.trim().is_empty());
    let start = params.start;
    let end = params.end;
    let requires_time_column = start.zip(end).is_some();

    // `params.limit == 0` is the sentinel emitted by serde when the client
    // omits the field; substitute the configured default so operators can
    // tune the baseline via `config.toml` (audit issue 2.6). Any explicit
    // value the client sent is preserved before clamping against the
    // configured upper bound.
    let parsed_limit = if params.limit == 0 {
        resolved_scatter_limit(&state.config.validation)
    } else {
        params.limit
    };
    let limit = clamp_limit(parsed_limit, &state.config.validation);
    validate_scatter_limit(limit, &state.config.validation)?;
    let time_color_mode = TimeColorMode::from_query(params.time_color_mode.as_deref());
    if let (Some(start_ms), Some(end_ms)) = (start, end) {
        let start_dt = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(start_ms as i64)
            .ok_or_else(|| {
                AppError::bad_request(
                    "Scatter matrix start is outside the supported timestamp range",
                )
            })?;
        let end_dt = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(end_ms as i64)
            .ok_or_else(|| {
                AppError::bad_request("Scatter matrix end is outside the supported timestamp range")
            })?;
        validate_time_window(start_dt, end_dt)?;
    }

    let (version, hash, lf) = compile_request_frame(&state, &params.cleaning_plan)?;
    let identity = ExecutionIdentity::from_version(version, Some(hash));

    let pairs_key = serde_json::to_string(&pairs)
        .map_err(|error| AppError::internal(format!("Serialize scatter matrix pairs: {error}")))?;
    let cache_key = format!(
        "scatter-matrix:source={}:revision={}:pairs={}:color={}:start={}:end={}:plan={}",
        identity.source_version_id,
        identity.source_revision,
        pairs_key,
        color_col.as_deref().unwrap_or(""),
        start.map(|value| value.to_string()).unwrap_or_default(),
        end.map(|value| value.to_string()).unwrap_or_default(),
        identity.plan_hash.as_deref().unwrap_or("none"),
    );
    let sample_seed_prefix = format!(
        "scatter-matrix-reservoir:source={}:revision={}:color={}:start={}:end={}:plan={}",
        identity.source_version_id,
        identity.source_revision,
        color_col.as_deref().unwrap_or(""),
        start.map(|value| value.to_string()).unwrap_or_default(),
        end.map(|value| value.to_string()).unwrap_or_default(),
        identity.plan_hash.as_deref().unwrap_or("none"),
    );
    let cache_key = format!("{cache_key}:{limit}");
    let _cache_producer = match state.cache.reserve(&cache_key).await {
        CacheReservation::Hit {
            response,
            coalesced,
        } => {
            state.metrics.record_cache_hit();
            return Ok(cached_response(
                response,
                if coalesced { "coalesced" } else { "hit" },
            ));
        }
        CacheReservation::Producer(producer) => {
            state.metrics.record_cache_miss();
            producer
        }
    };

    let time_column = if requires_time_column {
        Some(state.ts_context(&lf)?.ts_col)
    } else {
        None
    };
    let effective_limit = limit.min(state.config.validation.max_scatter_effective_points);
    enforce_work_budget(
        "scatter matrix pair count",
        pairs.len() as u128,
        state.config.budgets.max_scatter_matrix_pairs as u128,
    )?;
    enforce_work_budget(
        "scatter matrix output points",
        (pairs.len() as u128).saturating_mul(effective_limit as u128),
        state.config.budgets.max_scatter_matrix_points as u128,
    )?;
    let mut projected_columns = Vec::new();
    for pair in &pairs {
        for name in [&pair.x, &pair.y] {
            if !projected_columns.contains(name) {
                projected_columns.push(name.clone());
            }
        }
    }
    if let Some(color) = color_col.as_ref()
        && !projected_columns.contains(color)
    {
        projected_columns.push(color.clone());
    }
    let lazy_frame = collect_filtered_scatter_columns_frame(
        lf,
        &projected_columns,
        time_column.as_deref(),
        start,
        end,
    )?;
    let pair_axes = pairs
        .iter()
        .map(|pair| (pair.x.clone(), pair.y.clone()))
        .collect::<Vec<_>>();
    let metrics = Arc::clone(&state.metrics);
    let color_col_for_headers = color_col.clone();

    let (metadata, returned_points, total_points, arrow_bytes) = state
        .query_executor
        .run_interactive(edatime_core::metrics::CpuStage::Scatter, move || {
            let mut cell_ids: Vec<String> = Vec::new();
            let mut x_values: Vec<f64> = Vec::new();
            let mut y_values: Vec<f64> = Vec::new();
            let mut color_values: Vec<f64> = Vec::new();
            let mut color_labels: Vec<Option<String>> = Vec::new();
            let mut metadata: Vec<ScatterMatrixCellMeta> = Vec::with_capacity(pairs.len());
            let mut total_points = 0_usize;
            let mut returned_points = 0_usize;

            let sampled_cells = collect_sampled_matrix_rows_streaming(
                lazy_frame,
                &pair_axes,
                color_col.as_deref(),
                effective_limit,
                time_color_mode,
                &sample_seed_prefix,
            )?;
            for (pair, (cell_total, sampled_rows, color_kind)) in
                pairs.into_iter().zip(sampled_cells)
            {
                let returned_for_cell = sampled_rows.len();

                total_points += cell_total;
                returned_points += returned_for_cell;

                let mut color_min = f64::INFINITY;
                let mut color_max = f64::NEG_INFINITY;
                let cell_id = format!("{}|{}", pair.x, pair.y);
                for row in sampled_rows {
                    cell_ids.push(cell_id.clone());
                    x_values.push(row.x);
                    y_values.push(row.y);

                    match color_kind {
                        Some(ScatterColorKind::Continuous) => {
                            let value = row.color_value.unwrap_or(f64::NAN);
                            if value.is_finite() {
                                color_min = color_min.min(value);
                                color_max = color_max.max(value);
                            }
                            color_values.push(value);
                            color_labels.push(None);
                        }
                        Some(ScatterColorKind::Categorical) => {
                            color_values.push(f64::NAN);
                            color_labels.push(row.color_label);
                        }
                        None => {
                            color_values.push(f64::NAN);
                            color_labels.push(None);
                        }
                    }
                }

                metadata.push(ScatterMatrixCellMeta {
                    cell_id,
                    x: pair.x,
                    y: pair.y,
                    total_points: cell_total,
                    returned_points: returned_for_cell,
                    color_min: color_min.is_finite().then_some(color_min),
                    color_max: color_max.is_finite().then_some(color_max),
                    color_kind: match color_kind {
                        Some(ScatterColorKind::Continuous) => Some("continuous"),
                        Some(ScatterColorKind::Categorical) => Some("categorical"),
                        None => None,
                    },
                });
            }

            let columns: Vec<Column> = vec![
                Series::new(PlSmallStr::from("cell_id"), cell_ids.as_slice()).into_column(),
                Series::new(PlSmallStr::from("x"), x_values.as_slice()).into_column(),
                Series::new(PlSmallStr::from("y"), y_values.as_slice()).into_column(),
                Series::new(PlSmallStr::from("color_value"), color_values.as_slice()).into_column(),
                Series::new(PlSmallStr::from("color_label"), color_labels.as_slice()).into_column(),
            ];
            let matrix_df = DataFrame::new(x_values.len(), columns).map_err(|error| {
                AppError::internal(format!("build scatter matrix dataframe: {error}"))
            })?;
            let arrow_bytes = dataframe_to_arrow_ipc(matrix_df)
                .map_err(|error| AppError::internal(format!("Arrow serialization: {error}")))?;

            Ok::<_, AppError>((metadata, returned_points, total_points, arrow_bytes))
        })
        .await
        .map_err(AppError::from)??;

    metrics.record_scatter_sampling(total_points, returned_points);

    let header_json = serde_json::to_vec(&metadata).map_err(|error| {
        AppError::internal(format!("Serialize scatter matrix metadata: {error}"))
    })?;
    let mut extra_headers = identity.headers();
    extra_headers.push((
        "x-edatime-sampling-algorithm".to_string(),
        "reservoir-stream-v1".to_string(),
    ));
    extra_headers.push((
        "x-edatime-matrix-cells".to_string(),
        BASE64_STANDARD.encode(header_json),
    ));
    if let Some(color) = color_col_for_headers {
        extra_headers.push(("x-edatime-scatter-color".to_string(), color));
    }

    let cached = CachedResponse::arrow(arrow_bytes, false, returned_points, limit, None)
        .with_extra_headers(extra_headers);
    state.cache.insert(cache_key, cached.clone()).await;
    Ok(cached_response(cached, "miss"))
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::post_scatter_matrix;
    use crate::handlers::routes::cleaning::PlanRequestEnvelope;
    use crate::handlers::scatter::ScatterMatrixQuery;
    use axum::{Json, extract::State};
    use base64::prelude::*;
    use edatime_core::config::AppConfig;
    use edatime_query::cleaning::CleaningPlanDto;
    use edatime_store::state::AppState;
    use polars::prelude::{DataFrame, NamedFrom, Series};

    fn envelope(state: &AppState) -> PlanRequestEnvelope {
        let version = state.current_dataset_version().expect("version");
        PlanRequestEnvelope {
            expected_plan_hash: None,
            expected_source_version_id: version.id.clone(),
            expected_dataset_revision: version.revision,
            plan: CleaningPlanDto {
                schema_version: 1,
                id: "scatter-matrix-test-plan".to_string(),
                plan_revision: 1,
                source_version_id: version.id,
                dataset_revision: version.revision,
                dataset_fingerprint: Some(version.dataset_fingerprint),
                schema_fingerprint: version.schema_fingerprint,
                time_column: "ts".to_string(),
                source_name: None,
                stages: vec![],
                created_at: "now".to_string(),
                updated_at: "now".to_string(),
            },
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn scatter_matrix_returns_arrow_with_cell_metadata_for_multiple_pairs() {
        let df = DataFrame::new(
            4,
            vec![
                Series::new("HUFL".into(), [1.0_f64, 2.0, 3.0, 4.0]).into(),
                Series::new("HULL".into(), [10.0_f64, 20.0, 30.0, 40.0]).into(),
                Series::new("OT".into(), [5.0_f64, 6.0, 7.0, 8.0]).into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());
        let params = ScatterMatrixQuery {
            pairs: vec![
                crate::handlers::scatter::ScatterMatrixPair {
                    x: "HUFL".to_string(),
                    y: "HULL".to_string(),
                },
                crate::handlers::scatter::ScatterMatrixPair {
                    x: "OT".to_string(),
                    y: "HULL".to_string(),
                },
            ],
            color: None,
            start: None,
            end: None,
            cleaning_plan: envelope(&state),
            limit: 10,
            time_color_mode: None,
        };

        let response = post_scatter_matrix(State(state), Json(params))
            .await
            .expect("scatter matrix request should succeed");

        assert_eq!(
            response
                .headers()
                .get("content-type")
                .and_then(|value| value.to_str().ok()),
            Some("application/vnd.apache.arrow.stream")
        );
        assert_eq!(
            response
                .headers()
                .get("x-edatime-source-version")
                .and_then(|value| value.to_str().ok()),
            Some("source-0")
        );
        assert!(
            response
                .headers()
                .get("x-edatime-plan-hash")
                .and_then(|value| value.to_str().ok())
                .is_some_and(|value| !value.is_empty()),
            "plan-aware requests must expose their plan hash"
        );
        assert_eq!(
            response
                .headers()
                .get("x-edatime-sampling-algorithm")
                .and_then(|value| value.to_str().ok()),
            Some("reservoir-stream-v1")
        );
        assert!(
            response
                .headers()
                .get("x-edatime-schema-fingerprint")
                .and_then(|value| value.to_str().ok())
                .is_some_and(|value| value.starts_with("fnv1a-"))
        );
        let encoded = response
            .headers()
            .get("x-edatime-matrix-cells")
            .and_then(|value| value.to_str().ok())
            .expect("matrix metadata header should be present");
        let decoded = BASE64_STANDARD
            .decode(encoded)
            .expect("matrix metadata header should decode");
        let metadata: serde_json::Value =
            serde_json::from_slice(&decoded).expect("matrix metadata should be JSON");
        let cells = metadata
            .as_array()
            .expect("matrix metadata should be an array");
        assert_eq!(cells.len(), 2);
        assert_eq!(cells[0]["cell_id"], "HUFL|HULL");
        assert_eq!(cells[1]["cell_id"], "OT|HULL");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn scatter_matrix_cache_reuses_identical_requests() {
        let df = DataFrame::new(
            3,
            vec![
                Series::new("LULL".into(), [1.0_f64, 2.0, 3.0]).into(),
                Series::new("HULL".into(), [10.0_f64, 20.0, 30.0]).into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());
        let params = ScatterMatrixQuery {
            pairs: vec![crate::handlers::scatter::ScatterMatrixPair {
                x: "LULL".to_string(),
                y: "HULL".to_string(),
            }],
            color: None,
            start: None,
            end: None,
            cleaning_plan: envelope(&state),
            limit: 10,
            time_color_mode: None,
        };

        let first = post_scatter_matrix(State(state.clone()), Json(params.clone()))
            .await
            .expect("first scatter matrix request should succeed");
        let second = post_scatter_matrix(State(state), Json(params))
            .await
            .expect("second scatter matrix request should succeed");

        assert_eq!(
            first
                .headers()
                .get("x-edatime-cache")
                .and_then(|value| value.to_str().ok()),
            Some("miss")
        );
        assert_eq!(
            second
                .headers()
                .get("x-edatime-cache")
                .and_then(|value| value.to_str().ok()),
            Some("hit")
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn scatter_matrix_preserves_categorical_color_metadata() {
        let df = DataFrame::new(
            4,
            vec![
                Series::new("HUFL".into(), [1.0_f64, 2.0, 3.0, 4.0]).into(),
                Series::new("HULL".into(), [10.0_f64, 20.0, 30.0, 40.0]).into(),
                Series::new("group".into(), ["a", "b", "a", "b"]).into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());
        let params = ScatterMatrixQuery {
            pairs: vec![crate::handlers::scatter::ScatterMatrixPair {
                x: "HUFL".to_string(),
                y: "HULL".to_string(),
            }],
            color: Some("group".to_string()),
            start: None,
            end: None,
            cleaning_plan: envelope(&state),
            limit: 10,
            time_color_mode: None,
        };

        let response = post_scatter_matrix(State(state), Json(params))
            .await
            .expect("scatter matrix request with categorical color should succeed");
        let encoded = response
            .headers()
            .get("x-edatime-matrix-cells")
            .and_then(|value| value.to_str().ok())
            .expect("matrix metadata header should be present");
        let decoded = BASE64_STANDARD
            .decode(encoded)
            .expect("matrix metadata header should decode");
        let metadata: serde_json::Value =
            serde_json::from_slice(&decoded).expect("matrix metadata should be JSON");
        assert_eq!(metadata[0]["color_kind"], "categorical");
        assert_eq!(
            response
                .headers()
                .get("x-edatime-scatter-color")
                .and_then(|value| value.to_str().ok()),
            Some("group")
        );
    }
}
