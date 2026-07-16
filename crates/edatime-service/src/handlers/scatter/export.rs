//! Scatter export handlers — Parquet export of filtered scatter data.

use crate::error::AppError;
use axum::{Json, extract::State, response::Response};
use edatime_store::state::AppState;

use super::ScatterPointsQuery;
use super::collect::collect_filtered_scatter_frame;
use crate::handlers::routes::cleaning::compile_request_frame;
use crate::handlers::routes::shared::{ExecutionIdentity, add_execution_identity_headers};
use crate::streaming_export::lazy_parquet_response;

#[tracing::instrument(skip(state))]
pub async fn post_scatter_export_parquet(
    State(state): State<AppState>,
    Json(params): Json<ScatterPointsQuery>,
) -> Result<Response, AppError> {
    let (version, hash, lf) = compile_request_frame(&state, &params.cleaning_plan)?;
    let identity = ExecutionIdentity::from_version(version, Some(hash));

    let x = params.x.clone();
    let y = params.y.clone();
    let color = params.color.clone().filter(|s| !s.trim().is_empty());
    let size = params.size.clone().filter(|s| !s.trim().is_empty());
    let requires_time_column = params.start.zip(params.end).is_some();
    let time_column = if requires_time_column {
        Some(state.ts_context(&lf)?.ts_col)
    } else {
        None
    };

    let lazy_frame = collect_filtered_scatter_frame(
        lf,
        &x,
        &y,
        color.as_deref(),
        size.as_deref(),
        time_column.as_deref(),
        params.start,
        params.end,
    )?;
    let response = lazy_parquet_response(
        &state.query_executor,
        lazy_frame,
        "edatime_scatter_filtered.parquet",
    )
    .await?;
    Ok(add_execution_identity_headers(response, &identity))
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::post_scatter_export_parquet;
    use crate::handlers::routes::cleaning::PlanRequestEnvelope;
    use crate::handlers::scatter::ScatterPointsQuery;
    use axum::http::header;
    use axum::{Json, extract::State};
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
                id: "scatter-export-test-plan".to_string(),
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
    async fn scatter_export_executes_the_canonical_plan() {
        let df = DataFrame::new(
            3,
            vec![
                Series::new(
                    "ts".into(),
                    [
                        1_467_331_200_000_i64,
                        1_491_469_996_429_i64,
                        1_530_042_300_000_i64,
                    ],
                )
                .into(),
                Series::new("HUFL".into(), [70.0_f64, 80.0, 90.0]).into(),
                Series::new("HULL".into(), [10.0_f64, 20.0, 30.0]).into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());
        let params = ScatterPointsQuery {
            x: "HUFL".to_string(),
            y: "HULL".to_string(),
            color: None,
            size: None,
            start: Some(1_467_331_200_000.0),
            end: Some(1_530_042_300_000.0),
            cleaning_plan: envelope(&state),
            limit: 10,
            format: None,
            time_color_mode: None,
        };

        let response = post_scatter_export_parquet(State(state), Json(params))
            .await
            .expect("scatter export should execute its canonical plan");

        assert_eq!(
            response
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok()),
            Some("application/x-parquet")
        );
        assert_eq!(
            response
                .headers()
                .get("x-edatime-source-version")
                .and_then(|v| v.to_str().ok()),
            Some("source-0")
        );
    }
}
