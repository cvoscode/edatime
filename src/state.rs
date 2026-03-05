use polars::prelude::DataFrame;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    pub df: Arc<RwLock<DataFrame>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            df: Arc::new(RwLock::new(DataFrame::default())),
        }
    }
}
