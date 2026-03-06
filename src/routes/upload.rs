use axum::{
    extract::{Multipart, State},
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use std::io::Write;
use tempfile::NamedTempFile;
use crate::{
    state::AppState,
    error::AppError,
    ingest::load_dataframe_partial,
    routes::metadata::build_dataset_metadata_from_path,
};

fn parse_time_ms(text: &str) -> Option<i64> {
    let t = text.trim();
    if t.is_empty() {
        return None;
    }
    if let Ok(dt) = DateTime::parse_from_rfc3339(t) {
        let utc: DateTime<Utc> = dt.with_timezone(&Utc);
        return Some(utc.timestamp_millis());
    }
    if let Ok(ms) = t.parse::<i64>() {
        return Some(ms);
    }
    None
}

fn move_to_real_extension(mut path: std::path::PathBuf, is_parquet: bool) -> std::path::PathBuf {
    if is_parquet {
        let new_path = path.with_extension("parquet");
        std::fs::rename(&path, &new_path).ok();
        path = new_path;
    }
    path
}

async fn extract_upload_parts(
    mut multipart: Multipart,
) -> Result<(std::path::PathBuf, bool, Option<usize>, usize, Option<i64>, Option<i64>, Option<Vec<String>>, bool), AppError> {
    let mut temp_file = NamedTempFile::new().map_err(|e| AppError::IoError(e.to_string()))?;
    let mut is_parquet = false;
    let mut has_file = false;
    let mut n_rows: Option<usize> = None;
    let mut skip_rows: usize = 0;
    let mut time_start_ms: Option<i64> = None;
    let mut time_end_ms: Option<i64> = None;
    let mut selected_columns: Option<Vec<String>> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        let field_name = field.name().unwrap_or("").to_string();

        match field_name.as_str() {
            "n_rows" => {
                let text = field.text().await.unwrap_or_default();
                n_rows = text.trim().parse::<usize>().ok().filter(|&n| n > 0);
                tracing::debug!("partial load: n_rows = {:?}", n_rows);
            }
            "skip_rows" => {
                let text = field.text().await.unwrap_or_default();
                skip_rows = text.trim().parse::<usize>().unwrap_or(0);
                tracing::debug!("partial load: skip_rows = {}", skip_rows);
            }
            "time_start" => {
                let text = field.text().await.unwrap_or_default();
                time_start_ms = parse_time_ms(&text);
                tracing::debug!("partial load: time_start_ms = {:?}", time_start_ms);
            }
            "time_end" => {
                let text = field.text().await.unwrap_or_default();
                time_end_ms = parse_time_ms(&text);
                tracing::debug!("partial load: time_end_ms = {:?}", time_end_ms);
            }
            "columns" => {
                let text = field.text().await.unwrap_or_default();
                selected_columns = serde_json::from_str::<Vec<String>>(&text).ok().map(|cols| {
                    cols.into_iter()
                        .map(|col| col.trim().to_string())
                        .filter(|col| !col.is_empty())
                        .collect::<Vec<_>>()
                }).filter(|cols| !cols.is_empty());
                tracing::debug!("upload columns = {:?}", selected_columns);
            }
            _ => {
                let file_name = field.file_name().unwrap_or("unknown").to_string();
                if file_name.ends_with(".parquet") {
                    is_parquet = true;
                }
                let mut field = field;
                while let Some(chunk) = field.chunk().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
                    temp_file
                        .write_all(&chunk)
                        .map_err(|e| AppError::IoError(e.to_string()))?;
                }
                has_file = true;
            }
        }
    }

    if !has_file {
        return Err(AppError::BadRequest("No file part found in multipart upload".to_string()));
    }

    let temp_path = temp_file.into_temp_path();
    let path = temp_path
        .keep()
        .map_err(|e| AppError::IoError(e.error.to_string()))?;
    Ok((path, is_parquet, n_rows, skip_rows, time_start_ms, time_end_ms, selected_columns, has_file))
}

#[tracing::instrument(skip(state, multipart))]
pub async fn upload_data(
    State(state): State<AppState>,
    multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    tracing::info!("Received file upload request");

    let (path, is_parquet, n_rows, skip_rows, time_start_ms, time_end_ms, selected_columns, _) = extract_upload_parts(multipart).await?;

    let df = tokio::task::block_in_place(|| {
        let final_path = move_to_real_extension(path, is_parquet);

        let res = load_dataframe_partial(
            &final_path,
            n_rows,
            skip_rows,
            time_start_ms,
            time_end_ms,
            selected_columns.as_deref(),
        );

        if is_parquet {
            std::fs::remove_file(&final_path).ok();
        }
        res
    }).map_err(|e| AppError::BadRequest(format!("Failed to parse uploaded file: {}", e)))?;

    tracing::info!(
        "Uploaded {} rows (n_rows={:?}, skip_rows={}, time_start_ms={:?}, time_end_ms={:?})",
        df.height(),
        n_rows,
        skip_rows,
        time_start_ms,
        time_end_ms
    );

    {
        let mut df_lock = state.df.write().await;
        *df_lock = df.clone();
    }

    Ok(Json(serde_json::json!({
        "status": "success",
        "rows": df.height(),
        "n_rows_limit": n_rows,
        "skip_rows": skip_rows,
        "time_start_ms": time_start_ms,
        "time_end_ms": time_end_ms,
        "selected_columns": selected_columns,
    })))
}

#[tracing::instrument(skip(multipart))]
pub async fn preview_upload_data(
    mut multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    tracing::info!("Received upload preview request");

    let mut temp_file = NamedTempFile::new().map_err(|e| AppError::IoError(e.to_string()))?;
    let mut is_parquet = false;
    let mut has_file = false;

    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        let name = field.name().unwrap_or("").to_string();
        if name == "preview_rows" {
            continue;
        }

        let file_name = field.file_name().unwrap_or("unknown").to_string();
        if file_name.ends_with(".parquet") {
            is_parquet = true;
        }

        let mut field = field;
        while let Some(chunk) = field.chunk().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
            temp_file
                .write_all(&chunk)
                .map_err(|e| AppError::IoError(e.to_string()))?;
        }
        has_file = true;
    }

    if !has_file {
        return Err(AppError::BadRequest("No file selected for preview".to_string()));
    }

    let temp_path = temp_file.into_temp_path();
    let path = temp_path
        .keep()
        .map_err(|e| AppError::IoError(e.error.to_string()))?;

    let metadata = tokio::task::block_in_place(|| {
        let final_path = move_to_real_extension(path, is_parquet);

        let res = build_dataset_metadata_from_path(&final_path);

        if is_parquet {
            std::fs::remove_file(&final_path).ok();
        }
        res
    })?;

    Ok(Json(serde_json::json!({
        "status": "ok",
        "metadata": metadata,
    })))
}
