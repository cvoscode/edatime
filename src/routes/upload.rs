use axum::{
    extract::{Multipart, State},
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use std::io::Write;
use tempfile::NamedTempFile;
use crate::{state::AppState, error::AppError, ingest::load_dataframe_partial};

#[tracing::instrument(skip(state, multipart))]
pub async fn upload_data(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    tracing::info!("Received file upload request");

    let mut temp_file = NamedTempFile::new().map_err(|e| AppError::IoError(e.to_string()))?;
    let mut is_parquet = false;
    let mut has_file = false;
    let mut n_rows: Option<usize> = None;
    let mut skip_rows: usize = 0;
    let mut time_start_ms: Option<i64> = None;
    let mut time_end_ms: Option<i64> = None;

    fn parse_time_ms(text: &str) -> Option<i64> {
        let t = text.trim();
        if t.is_empty() {
            return None;
        }
        // Prefer RFC3339 (frontend sends toISOString() with 'Z').
        if let Ok(dt) = DateTime::parse_from_rfc3339(t) {
            let utc: DateTime<Utc> = dt.with_timezone(&Utc);
            return Some(utc.timestamp_millis());
        }
        // Best-effort: unix ms.
        if let Ok(ms) = t.parse::<i64>() {
            return Some(ms);
        }
        None
    }

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
            _ => {
                // Treat any other field as the file
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
    let file_path = temp_path.to_string_lossy().to_string();

    let df = tokio::task::block_in_place(|| {
        let mut final_path = std::path::PathBuf::from(file_path.clone());
        if is_parquet {
            let new_path = final_path.with_extension("parquet");
            std::fs::rename(&final_path, &new_path).ok();
            final_path = new_path;
        }

        let res = load_dataframe_partial(&final_path, n_rows, skip_rows, time_start_ms, time_end_ms);

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
    })))
}
