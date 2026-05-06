use std::io::Write;

use axum::{
    Json,
    extract::{Multipart, State},
    response::IntoResponse,
};
use chrono::{DateTime, Utc};
use tempfile::{Builder, TempPath};

use crate::error::AppError;
use crate::ingest::IngestParams;
use crate::routes::metadata::build_dataset_metadata_from_path_with_time_column;
use crate::state::AppState;
use crate::validation::validate_upload_size_with_limit;

#[tracing::instrument(skip(state, multipart))]
pub async fn upload_data(
    State(state): State<AppState>,
    multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    tracing::info!("Received file upload request");

    let (path, ingest_params) = extract_upload_parts(&state, multipart).await?;

    let df = tokio::task::spawn_blocking(move || {
        crate::ingest::load_dataframe_partial(&path, &ingest_params)
    })
    .await
    .map_err(|error| AppError::internal(format!("Failed to join upload task: {error:?}")))?
    .map_err(|error| AppError::bad_request(format!("Failed to parse uploaded file: {error}")))?;

    state.replace_dataset(df.clone()).await;

    Ok(Json(serde_json::json!({
        "status": "success",
        "rows": df.height(),
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
        build_dataset_metadata_from_path_with_time_column(path.as_ref(), time_column.as_deref())
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
) -> Result<(TempPath, IngestParams), AppError> {
    let mut temp_file = None;
    let mut has_file = false;
    let mut params = IngestParams::default();
    let mut total_bytes = 0usize;

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
                    temp_file = Some(create_temp_upload_file(
                        field.file_name(),
                        "edatime-upload-",
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

    Ok((temp_path, params))
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
        .unwrap_or_else(|_| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("."));

    let file_path = base_dir.join(&name);
    if !file_path.exists() {
        return Err(AppError::bad_request("Sample dataset file not found"));
    }

    let body = tokio::task::spawn_blocking(move || {
        std::fs::read(&file_path)
    })
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
