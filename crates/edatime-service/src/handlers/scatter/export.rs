//! Scatter export handlers — Parquet export of filtered scatter data.

use crate::error::AppError;
use axum::{
    Json,
    extract::State,
    http::{HeaderValue, header},
    response::Response,
};
use edatime_query::arrow_export::dataframe_to_parquet;
use edatime_store::state::AppState;

use super::collect::collect_filtered_scatter_frame;
use super::{ScatterPointsQuery, parse_scatter_filters, parse_scatter_line_filters};
use crate::handlers::routes::cleaning::compile_request_frame;

#[tracing::instrument(skip(state))]
pub async fn post_scatter_export_parquet(
    State(state): State<AppState>,
    Json(params): Json<ScatterPointsQuery>,
) -> Result<Response, AppError> {
    let lf = if let Some(envelope) = params.cleaning_plan.as_ref() {
        let (_version, _hash, frame) = compile_request_frame(&state, envelope)?;
        frame
    } else {
        state.dataset_snapshot()
    };

    let x = params.x.clone();
    let y = params.y.clone();
    let color = params.color.clone().filter(|s| !s.trim().is_empty());
    let size = params.size.clone().filter(|s| !s.trim().is_empty());
    let filters = parse_scatter_filters(params.filters.as_deref())?;
    let line_filters = parse_scatter_line_filters(params.line_filters.as_deref())?;
    let requires_time_column = params.start.zip(params.end).is_some() || !line_filters.is_empty();
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
        &filters,
        &line_filters,
    )?;
    let filtered = state.query_executor.execute_async(lazy_frame).await?;

    let bytes = dataframe_to_parquet(filtered)
        .map_err(|e| AppError::io(format!("Parquet serialization: {}", e)))?;
    let mut response = Response::new(bytes.into());
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/x-parquet"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=edatime_scatter_filtered.parquet"),
    );
    Ok(response)
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::post_scatter_export_parquet;
    use crate::handlers::scatter::ScatterPointsQuery;
    use axum::http::header;
    use axum::{Json, extract::State};
    use edatime_core::config::AppConfig;
    use edatime_store::state::AppState;
    use polars::prelude::{DataFrame, NamedFrom, Series};

    #[tokio::test(flavor = "multi_thread")]
    async fn scatter_export_accepts_line_filters_with_compatibility_id_field() {
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
            filters: None,
            line_filters: Some(
                r#"[{"id":"adaptive-1781794868781-c3v0r8","column":"HUFL","x1":1491469996428.5715,"y1":76.32572064536755,"x2":1497229179081.6326,"y2":77.28037623208502,"keepAbove":false}]"#
                    .to_string(),
            ),
            cleaning_plan: None,
            limit: 10,
            format: None,
            time_color_mode: None,
        };

        let response = post_scatter_export_parquet(State(state), Json(params))
            .await
            .expect("scatter export should accept compatibility ids");

        assert_eq!(
            response
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok()),
            Some("application/x-parquet")
        );
    }
}
