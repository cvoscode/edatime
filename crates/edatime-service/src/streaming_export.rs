//! Bounded-memory lazy Parquet export responses.

use axum::{
    body::Body,
    http::{HeaderValue, header},
    response::Response,
};
use futures_util::{StreamExt, stream};
use polars::prelude::LazyFrame;
use tempfile::{Builder, TempPath};
use tokio_util::io::ReaderStream;

use crate::error::AppError;
use edatime_query::executor::QueryExecutor;

/// Execute a lazy plan into a temporary Parquet file and stream the completed
/// file into the HTTP body. `TempPath` remains owned by the body stream, so it
/// is removed after EOF and also when a disconnected client drops the body.
pub async fn lazy_parquet_response(
    executor: &QueryExecutor,
    frame: LazyFrame,
    download_name: &str,
) -> Result<Response, AppError> {
    let (response, _) = lazy_parquet_response_with_path(executor, frame, download_name).await?;
    Ok(response)
}

async fn lazy_parquet_response_with_path(
    executor: &QueryExecutor,
    frame: LazyFrame,
    download_name: &str,
) -> Result<(Response, std::path::PathBuf), AppError> {
    let file = Builder::new()
        .prefix("edatime-export-")
        .suffix(".parquet.tmp")
        .tempfile()
        .map_err(|error| AppError::io(format!("Create export temporary file: {error}")))?;
    let temp_path = file.into_temp_path();
    let path = temp_path.to_path_buf();
    // Polars owns file creation and truncation for the sink. TempPath keeps
    // ownership of this unique name even while no file exists at the path.
    std::fs::remove_file(&temp_path)
        .map_err(|error| AppError::io(format!("Prepare export temporary path: {error}")))?;
    executor.sink_parquet_async(frame, path.clone()).await?;

    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|error| AppError::io(format!("Open completed Parquet export: {error}")))?;
    let byte_size = file
        .metadata()
        .await
        .map_err(|error| AppError::io(format!("Read Parquet export size: {error}")))?
        .len();
    let body_stream = stream::unfold(
        (ReaderStream::new(file), temp_path),
        |(mut reader, temp_path): (ReaderStream<tokio::fs::File>, TempPath)| async move {
            reader
                .next()
                .await
                .map(|chunk| (chunk, (reader, temp_path)))
        },
    );
    let mut response = Response::new(Body::from_stream(body_stream));
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/x-parquet"),
    );
    headers.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&byte_size.to_string())
            .map_err(|error| AppError::internal(format!("Encode export size header: {error}")))?,
    );
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename={download_name}"))
            .map_err(|error| AppError::internal(format!("Encode export filename: {error}")))?,
    );
    Ok((response, path))
}

#[cfg(test)]
mod tests {
    use axum::body::to_bytes;
    use polars::prelude::{DataFrame, IntoLazy, NamedFrom, ParquetReader, SerReader, Series};

    use super::*;
    use edatime_query::executor::ExecutionContext;

    #[tokio::test(flavor = "multi_thread")]
    async fn response_stream_owns_and_removes_the_completed_temp_file() {
        let frame = DataFrame::new(2, vec![Series::new("value".into(), vec![1_i64, 2]).into()])
            .expect("frame")
            .lazy();
        let executor = QueryExecutor::new(ExecutionContext::Streaming);

        let (response, path) = lazy_parquet_response_with_path(&executor, frame, "fixture.parquet")
            .await
            .expect("streaming response");

        assert!(path.exists());
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).expect("type"),
            "application/x-parquet"
        );
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("stream body");
        assert!(!path.exists());
        let decoded = ParquetReader::new(std::io::Cursor::new(body))
            .finish()
            .expect("decode streamed parquet");
        assert_eq!(decoded.height(), 2);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn dropping_an_unread_response_removes_the_completed_temp_file() {
        let frame = DataFrame::new(1, vec![Series::new("value".into(), vec![1_i64]).into()])
            .expect("frame")
            .lazy();
        let executor = QueryExecutor::new(ExecutionContext::Streaming);
        let (response, path) = lazy_parquet_response_with_path(&executor, frame, "fixture.parquet")
            .await
            .expect("streaming response");

        assert!(path.exists());
        drop(response);
        assert!(!path.exists());
    }
}
