use std::io::Write;

use axum::{
    Json,
    extract::{Multipart, State},
    response::IntoResponse,
};
use chrono::{DateTime, Utc};
use tempfile::{Builder, TempPath};

use crate::error::AppError;
use crate::handlers::routes::metadata::build_dataset_metadata_from_path_with_time_column;
use crate::handlers::scatter::spawn_correlation_matrix_warmup;
use edatime_ingest::ingest::IngestParams;
use edatime_query::validation::validate_upload_size_with_limit;
use edatime_store::state::AppState;

#[tracing::instrument(skip(state, multipart))]
pub async fn upload_data(
    State(state): State<AppState>,
    multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    tracing::info!("Received file upload request");

    let (path, ingest_params, file_name) = extract_upload_parts(&state, multipart).await?;
    let source_path = path.to_path_buf();
    let (row_count, column_names, numeric_columns, time_column_name) = if state
        .artifact_store
        .is_some()
    {
        let require_sorted_scan_backed = state.config.data.require_sorted_scan_backed;
        let lazy = tokio::task::spawn_blocking(move || {
                let lazy = edatime_ingest::ingest::load_lazyframe_scan_backed(
                    &source_path,
                    &ingest_params,
                )?;
                if require_sorted_scan_backed {
                    let time_column = lazy.time_column_name.as_deref().ok_or_else(|| {
                        polars::prelude::PolarsError::ComputeError(
                            "Uploaded dataset has no resolved time column".into(),
                        )
                    })?;
                    if !edatime_ingest::ingest::time_column_is_non_decreasing(
                        lazy.frame.clone(),
                        time_column,
                    )? {
                        return Err(polars::prelude::PolarsError::ComputeError(
                            "Managed scan-backed upload requires timestamps in non-decreasing order. Sort before upload or set data.require_sorted_scan_backed=false to opt into Polars streaming sort."
                                .into(),
                        ));
                    }
                }
                Ok(lazy)
            })
            .await
            .map_err(|error| AppError::internal(format!("Failed to join upload task: {error:?}")))?
            .map_err(|error| {
                AppError::bad_request(format!("Failed to parse uploaded file: {error}"))
            })?;
        let time_column_name = lazy
            .time_column_name
            .clone()
            .ok_or_else(|| AppError::bad_request("Uploaded dataset has no resolved time column"))?;
        let column_names = lazy.column_names;
        let numeric_columns = lazy.numeric_columns;
        state
            .replace_dataset_lazy_root(
                lazy.frame,
                Some(file_name.clone()),
                time_column_name.clone(),
            )
            .await?;
        (
            state.dataset_rows().await,
            column_names,
            numeric_columns,
            Some(time_column_name),
        )
    } else {
        let loaded = tokio::task::spawn_blocking(move || {
            edatime_ingest::ingest::load_dataframe_partial(&source_path, &ingest_params)
        })
        .await
        .map_err(|error| AppError::internal(format!("Failed to join upload task: {error:?}")))?
        .map_err(|error| {
            AppError::bad_request(format!("Failed to parse uploaded file: {error}"))
        })?;
        let row_count = loaded.df.height();
        state
            .replace_dataset(loaded.df)
            .await
            .map_err(|error| AppError::internal(format!("Failed to store dataset: {error}")))?;
        (
            row_count,
            loaded.column_names,
            loaded.numeric_columns,
            loaded.time_column_name,
        )
    };

    state.set_time_column_display_name(time_column_name.clone());
    if state.artifact_store.is_none() {
        let _warmup = spawn_correlation_matrix_warmup(state.clone());
    } else {
        // A scan-backed upload must not immediately trigger an unbudgeted
        // full-column correlation warmup. Exact warmup belongs in the future
        // admitted background-job path.
        tracing::debug!("Skipping eager correlation warmup for scan-backed upload");
    }

    Ok(Json(serde_json::json!({
        "status": "success",
        "rows": row_count,
        "columns": column_names,
        "numeric_columns": numeric_columns,
        "timestamp_column": time_column_name,
        "file_name": file_name,
    })))
}

#[tracing::instrument(skip(state, multipart))]
pub async fn preview_upload_data(
    State(state): State<AppState>,
    multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    tracing::info!("Received upload preview request");

    let (path, time_column) = extract_preview_file(&state, multipart).await?;
    let metadata = tokio::task::spawn_blocking(move || {
        let raw = build_dataset_metadata_from_path_with_time_column(
            path.as_ref(),
            time_column.as_deref(),
        )?;
        // Normalize temporal dtypes in the returned metadata so the
        // preview aligns with the post-ingest dtype that the rest of
        // the pipeline assumes. (Audit issue 4.1.)
        let mut metadata = raw;
        for profile in &mut metadata.column_profiles {
            if profile.dtype.starts_with("datetime") && !profile.dtype.starts_with("datetime[ms]") {
                profile.dtype = "datetime[ms]".to_string();
            }
        }
        for col in &mut metadata.columns {
            if col.dtype.starts_with("datetime") && !col.dtype.starts_with("datetime[ms]") {
                col.dtype = "datetime[ms]".to_string();
            }
        }
        Ok::<_, AppError>(metadata)
    })
    .await
    .map_err(|error| AppError::internal(format!("Failed to join preview task: {error:?}")))??;

    Ok(Json(serde_json::json!({
        "status": "ok",
        "metadata": metadata,
    })))
}

async fn extract_upload_parts(
    state: &AppState,
    mut multipart: Multipart,
) -> Result<(TempPath, IngestParams, String), AppError> {
    let mut temp_file = None;
    let mut has_file = false;
    let mut params = IngestParams::default();
    let mut total_bytes = 0usize;
    let mut file_name = String::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|error| AppError::bad_request(error.to_string()))?
    {
        let field_name = field.name().unwrap_or("").to_string();

        match field_name.as_str() {
            "n_rows" => {
                let text = field.text().await.unwrap_or_default();
                params.n_rows = text.trim().parse::<usize>().ok().filter(|count| *count > 0);
            }
            "skip_rows" => {
                let text = field.text().await.unwrap_or_default();
                params.skip_rows = text.trim().parse::<usize>().unwrap_or(0);
            }
            "time_start" => {
                let text = field.text().await.unwrap_or_default();
                params.time_start_ms = parse_time_ms(&text);
            }
            "time_end" => {
                let text = field.text().await.unwrap_or_default();
                params.time_end_ms = parse_time_ms(&text);
            }
            "columns" => {
                let text = field.text().await.unwrap_or_default();
                params.selected_columns = serde_json::from_str::<Vec<String>>(&text)
                    .ok()
                    .map(|columns| {
                        columns
                            .into_iter()
                            .map(|column| column.trim().to_string())
                            .filter(|column| !column.is_empty())
                            .collect::<Vec<_>>()
                    })
                    .filter(|columns| !columns.is_empty());
            }
            "time_column" => {
                let text = field.text().await.unwrap_or_default();
                params.time_column = Some(text.trim().to_string()).filter(|v| !v.is_empty());
            }
            _ => {
                if temp_file.is_none() {
                    let name = field.file_name().unwrap_or("").to_string();
                    file_name = name.clone();
                    temp_file = Some(create_temp_upload_file(Some(&name), "edatime-upload-")?);
                }

                let mut field = field;
                while let Some(chunk) = field
                    .chunk()
                    .await
                    .map_err(|error| AppError::bad_request(error.to_string()))?
                {
                    total_bytes = total_bytes.saturating_add(chunk.len());
                    validate_upload_size_with_limit(
                        total_bytes,
                        state.config.upload.max_upload_bytes,
                    )?;
                    temp_file
                        .as_mut()
                        .ok_or_else(|| AppError::internal("Upload temp file unexpectedly absent"))?
                        .write_all(&chunk)
                        .map_err(|error| AppError::io(error.to_string()))?;
                }
                has_file = true;
            }
        }
    }

    if !has_file {
        return Err(AppError::bad_request(
            "No file part found in multipart upload",
        ));
    }

    let temp_path = temp_file
        .ok_or_else(|| AppError::bad_request("No file part found in multipart upload"))?
        .into_temp_path();

    Ok((temp_path, params, file_name))
}

async fn extract_preview_file(
    state: &AppState,
    mut multipart: Multipart,
) -> Result<(TempPath, Option<String>), AppError> {
    let mut temp_file = None;
    let mut has_file = false;
    let mut total_bytes = 0usize;
    let mut time_column: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|error| AppError::bad_request(error.to_string()))?
    {
        let field_name = field.name().unwrap_or("").to_string();

        match field_name.as_str() {
            "time_column" => {
                let text = field.text().await.unwrap_or_default();
                time_column = Some(text.trim().to_string()).filter(|v| !v.is_empty());
            }

            _ => {
                if temp_file.is_none() {
                    temp_file = Some(create_temp_upload_file(
                        field.file_name(),
                        "edatime-preview-",
                    )?);
                }

                let mut field = field;
                while let Some(chunk) = field
                    .chunk()
                    .await
                    .map_err(|error| AppError::bad_request(error.to_string()))?
                {
                    total_bytes = total_bytes.saturating_add(chunk.len());
                    validate_upload_size_with_limit(
                        total_bytes,
                        state.config.upload.max_upload_bytes,
                    )?;
                    temp_file
                        .as_mut()
                        .ok_or_else(|| AppError::internal("Preview temp file unexpectedly absent"))?
                        .write_all(&chunk)
                        .map_err(|error| AppError::io(error.to_string()))?;
                }
                has_file = true;
            }
        }
    }

    if !has_file {
        return Err(AppError::bad_request("No file selected for preview"));
    }

    Ok((
        temp_file
            .ok_or_else(|| AppError::bad_request("No file selected for preview"))?
            .into_temp_path(),
        time_column,
    ))
}

fn parse_time_ms(text: &str) -> Option<i64> {
    let value = text.trim();
    if value.is_empty() {
        return None;
    }
    if let Ok(dt) = DateTime::parse_from_rfc3339(value) {
        return Some(dt.with_timezone(&Utc).timestamp_millis());
    }
    value.parse::<i64>().ok()
}

fn create_temp_upload_file(
    file_name: Option<&str>,
    prefix: &str,
) -> Result<tempfile::NamedTempFile, AppError> {
    let suffix = file_name
        .and_then(|name| std::path::Path::new(name).extension())
        .map(|ext| format!(".{}", ext.to_string_lossy()))
        .unwrap_or_default();

    Builder::new()
        .prefix(prefix)
        .suffix(&suffix)
        .tempfile()
        .map_err(|error| AppError::io(error.to_string()))
}

/// Serve a built-in sample dataset file (e.g. ETTm2.csv).
/// Used by the "Try with sample data" cards on the home page.
#[tracing::instrument(skip(_state))]
pub async fn serve_sample_file(
    State(_state): State<AppState>,
    axum::extract::Path(name): axum::extract::Path<String>,
) -> Result<impl IntoResponse, AppError> {
    // Sandbox: only allow known sample dataset names
    let allowed = ["ETTm1.csv", "ETTm2.csv", "ETTm1.parquet", "ETTm2.parquet"];
    if !allowed.contains(&name.as_str()) {
        return Err(AppError::bad_request("Sample dataset not found"));
    }

    let base_dir = std::env::var("EDATIME_SAMPLE_DATA_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.."));

    let file_path = base_dir.join(&name);
    if !file_path.exists() {
        return Err(AppError::bad_request("Sample dataset file not found"));
    }

    let body = tokio::task::spawn_blocking(move || std::fs::read(&file_path))
        .await
        .map_err(|e| AppError::internal(format!("{e:?}")))?;

    match body {
        Ok(bytes) => {
            let mime = if name.ends_with(".csv") {
                "text/csv"
            } else {
                "application/octet-stream"
            };
            Ok(axum::response::Response::builder()
                .header(axum::http::header::CONTENT_TYPE, mime)
                .body(axum::body::Body::from(bytes))
                .map_err(|e| AppError::internal(e.to_string()))?)
        }
        Err(e) => Err(AppError::io(e.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use chrono::Utc;
    use polars::prelude::DataFrame;

    use super::*;
    use edatime_core::config::AppConfig;

    #[tokio::test(flavor = "multi_thread")]
    async fn configured_csv_ingest_streams_a_sorted_scan_backed_root() {
        let artifact_dir = std::env::temp_dir().join(format!(
            "edatime-upload-lazy-root-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let source = create_temp_upload_file(Some("fixture.csv"), "edatime-upload-test-")
            .expect("source temp file")
            .into_temp_path();
        fs::write(
            &source,
            "time,value\n2024-01-01T00:00:00Z,1\n2024-01-01T00:00:01Z,2\n2024-01-01T00:00:02Z,3\n",
        )
        .expect("source CSV");
        let mut config = AppConfig::default();
        config.data.artifact_dir = Some(artifact_dir.clone());
        let state = AppState::new(DataFrame::default(), config);
        let loaded =
            edatime_ingest::ingest::load_lazyframe_partial(&source, &IngestParams::default())
                .expect("lazy CSV ingest plan");

        let record = state
            .replace_dataset_lazy_root(
                loaded.frame,
                Some("fixture.csv".to_string()),
                loaded.time_column_name.expect("time column"),
            )
            .await
            .expect("stream CSV to managed root");

        assert!(record.id.starts_with("artifact-"));
        assert_eq!(record.source_name.as_deref(), Some("fixture.csv"));
        let active = state
            .query_executor
            .execute_async(state.dataset_snapshot())
            .await
            .expect("active scan");
        assert_eq!(active.height(), 3);
        assert_eq!(
            active
                .column("value")
                .expect("value")
                .i64()
                .expect("i64")
                .into_no_null_iter()
                .collect::<Vec<_>>(),
            vec![1, 2, 3]
        );
        fs::remove_dir_all(artifact_dir).expect("clean artifact directory");
    }
}
