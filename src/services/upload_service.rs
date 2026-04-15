use std::io::Write;

use axum::extract::Multipart;
use chrono::{DateTime, Utc};
use serde_json::Value;
use tempfile::{Builder, TempPath};

use crate::error::AppError;
use crate::ingest::IngestParams;
use crate::routes::metadata::build_dataset_metadata_from_path_with_time_column;
use crate::state::AppState;
use crate::validation::validate_upload_size_with_limit;

#[derive(Clone)]
pub struct UploadService {
    state: AppState,
}

impl UploadService {
    pub fn new(state: AppState) -> Self {
        Self { state }
    }

    pub async fn upload_data(&self, multipart: Multipart) -> Result<Value, AppError> {
        let (path, ingest_params) = self.extract_upload_parts(multipart).await?;

        let df = tokio::task::spawn_blocking(move || {
            crate::ingest::load_dataframe_partial(&path, &ingest_params)
        })
        .await
        .map_err(|error| AppError::internal(format!("Failed to join upload task: {error:?}")))?
        .map_err(|error| {
            AppError::bad_request(format!("Failed to parse uploaded file: {error}"))
        })?;

        self.state.replace_dataset(df.clone()).await;

        Ok(serde_json::json!({
            "status": "success",
            "rows": df.height(),
        }))
    }

    pub async fn preview_upload_data(&self, multipart: Multipart) -> Result<Value, AppError> {
        let (path, time_column) = self.extract_preview_file(multipart).await?;
        let metadata = tokio::task::spawn_blocking(move || {
            build_dataset_metadata_from_path_with_time_column(path.as_ref(), time_column.as_deref())
        })
        .await
        .map_err(|error| AppError::internal(format!("Failed to join preview task: {error:?}")))??;

        Ok(serde_json::json!({
            "status": "ok",
            "metadata": metadata,
        }))
    }

    async fn extract_upload_parts(
        &self,
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
                            self.state.config.upload.max_upload_bytes,
                        )?;
                        temp_file
                            .as_mut()
                            .expect("upload temp file should exist")
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
        &self,
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
                            self.state.config.upload.max_upload_bytes,
                        )?;
                        temp_file
                            .as_mut()
                            .expect("preview temp file should exist")
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
