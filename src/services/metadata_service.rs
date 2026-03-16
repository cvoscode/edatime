use crate::error::AppError;
use crate::routes::metadata::{DatasetMetadata, build_dataset_metadata};
use crate::state::AppState;

#[derive(Clone)]
pub struct MetadataService {
    state: AppState,
}

impl MetadataService {
    pub fn new(state: AppState) -> Self {
        Self { state }
    }

    pub async fn get_metadata(&self) -> Result<DatasetMetadata, AppError> {
        let df = self.state.dataset_snapshot().await;
        tokio::task::spawn_blocking(move || build_dataset_metadata(&df, true))
            .await
            .map_err(|error| {
                AppError::internal(format!("Failed to join metadata task: {error:?}"))
            })?
    }
}
