//! Scatter correlation handler — GET /api/scatter/correlations

use axum::{
    Json,
    extract::{Query, State},
};
use serde::Deserialize;

use crate::error::AppError;
use edatime_core::stats;
use edatime_store::cache::CorrelationMatrixCacheEntry;
use edatime_store::state::AppState;
use polars::prelude::LazyFrame;

use super::{CorrelationItem, SuggestionItem, collect_xy_pairs, numeric_columns};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScatterCorrelationsQuery {
    pub base: Option<String>,
    pub threshold: Option<f64>,
}

#[derive(Debug, serde::Serialize)]
pub struct ScatterCorrelationsResponse {
    pub base_column: String,
    pub threshold: f64,
    pub numeric_columns: Vec<String>,
    pub correlations: Vec<CorrelationItem>,
    pub suggestions: Vec<SuggestionItem>,
}

#[tracing::instrument(skip(state))]
pub async fn get_scatter_correlations(
    State(state): State<AppState>,
    Query(params): Query<ScatterCorrelationsQuery>,
) -> Result<Json<ScatterCorrelationsResponse>, AppError> {
    tracing::info!(
        "get_scatter_correlations called with base={:?}, threshold={:?}",
        params.base,
        params.threshold
    );

    let lf = state.dataset_snapshot();

    let threshold = params.threshold.unwrap_or(0.7).clamp(0.0, 1.0);
    let requested_base = params.base.clone();
    let revision = state.dataset_revision();

    if let Some(entry) = state.cached_correlation_matrix(revision) {
        return Ok(Json(build_scatter_correlations_from_cached_matrix(
            entry,
            requested_base.as_deref(),
            threshold,
        )?));
    }

    let data = tokio::task::spawn_blocking(move || compute_correlation_matrix(lf))
        .await
        .map_err(|e| AppError::internal(format!("Failed to join scatter correlation task: {:?}", e)))??;
    state.store_correlation_matrix_if_current(revision, data.clone().into_cache());
    Ok(Json(build_scatter_correlations_from_matrix_data(
        &data,
        requested_base.as_deref(),
        threshold,
    )?))
}

// ── Full NxN Correlation Matrix ────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
pub struct CorrelationMatrixResponse {
    pub columns: Vec<String>,
    pub pearson: Vec<Vec<Option<f64>>>,
    pub spearman: Vec<Vec<Option<f64>>>,
}

#[derive(Debug, Clone)]
struct CorrelationMatrixData {
    columns: Vec<String>,
    pearson: Vec<Vec<Option<f64>>>,
    spearman: Vec<Vec<Option<f64>>>,
    counts: Vec<Vec<usize>>,
}

impl CorrelationMatrixData {
    fn from_cache(entry: CorrelationMatrixCacheEntry) -> Self {
        Self {
            columns: entry.columns,
            pearson: entry.pearson,
            spearman: entry.spearman,
            counts: entry.counts,
        }
    }

    fn into_cache(self) -> CorrelationMatrixCacheEntry {
        CorrelationMatrixCacheEntry {
            columns: self.columns,
            pearson: self.pearson,
            spearman: self.spearman,
            counts: self.counts,
        }
    }

    fn to_response(&self) -> CorrelationMatrixResponse {
        CorrelationMatrixResponse {
            columns: self.columns.clone(),
            pearson: self.pearson.clone(),
            spearman: self.spearman.clone(),
        }
    }
}

fn compute_correlation_matrix(lf: LazyFrame) -> Result<CorrelationMatrixData, AppError> {
    let mut numeric = numeric_columns(lf.clone());
    numeric.sort();

    if numeric.is_empty() {
        return Ok(CorrelationMatrixData {
            columns: vec![],
            pearson: vec![],
            spearman: vec![],
            counts: vec![],
        });
    }

    let n = numeric.len();
    let mut pearson = vec![vec![None; n]; n];
    let mut spearman = vec![vec![None; n]; n];
    let mut counts = vec![vec![0; n]; n];

    let df = lf
        .with_new_streaming(true)
        .collect()
        .map_err(|e| AppError::internal(format!("correlation matrix collect: {}", e)))?;

    for i in 0..n {
        pearson[i][i] = Some(1.0);
        spearman[i][i] = Some(1.0);
        counts[i][i] = df.height();
        for j in (i + 1)..n {
            let pairs = collect_xy_pairs(&df, &numeric[i], &numeric[j])?;
            let p = stats::pearson(&pairs);
            let s = stats::spearman(&pairs);
            let count = pairs.len();
            pearson[i][j] = p;
            pearson[j][i] = p;
            spearman[i][j] = s;
            spearman[j][i] = s;
            counts[i][j] = count;
            counts[j][i] = count;
        }
    }

    Ok(CorrelationMatrixData {
        columns: numeric,
        pearson,
        spearman,
        counts,
    })
}

fn build_scatter_correlations_from_matrix_data(
    data: &CorrelationMatrixData,
    requested_base: Option<&str>,
    threshold: f64,
) -> Result<ScatterCorrelationsResponse, AppError> {
    if data.columns.len() < 2 {
        return Ok(ScatterCorrelationsResponse {
            base_column: data.columns.first().cloned().unwrap_or_default(),
            threshold,
            numeric_columns: data.columns.clone(),
            correlations: vec![],
            suggestions: vec![],
        });
    }

    let base_column = if let Some(base) = requested_base {
        if !data.columns.iter().any(|column| column == base) {
            return Err(AppError::bad_request(format!(
                "Base column '{}' is not numeric/temporal",
                base
            )));
        }
        base.to_string()
    } else {
        data.columns
            .iter()
            .find(|column| column.as_str() != "ts")
            .cloned()
            .unwrap_or_else(|| data.columns[0].clone())
    };

    let base_index = data
        .columns
        .iter()
        .position(|column| column == &base_column)
        .ok_or_else(|| AppError::internal("Cached correlation base column missing"))?;

    let mut correlations = data
        .columns
        .iter()
        .enumerate()
        .filter(|(_, column)| *column != &base_column)
        .map(|(index, column)| CorrelationItem {
            column: column.clone(),
            count: data.counts[base_index][index],
            pearson: data.pearson[base_index][index],
            spearman: data.spearman[base_index][index],
        })
        .collect::<Vec<_>>();

    correlations.sort_by(|a, b| {
        let a_score = a
            .pearson
            .map(|v| v.abs())
            .unwrap_or(0.0)
            .max(a.spearman.map(|v| v.abs()).unwrap_or(0.0));
        let b_score = b
            .pearson
            .map(|v| v.abs())
            .unwrap_or(0.0)
            .max(b.spearman.map(|v| v.abs()).unwrap_or(0.0));
        b_score.total_cmp(&a_score)
    });

    let suggestions = correlations
        .iter()
        .filter(|item| {
            item.pearson.map(|v| v.abs()).unwrap_or(0.0) >= threshold
                || item.spearman.map(|v| v.abs()).unwrap_or(0.0) >= threshold
        })
        .map(|item| SuggestionItem {
            x: base_column.clone(),
            y: item.column.clone(),
            correlation: item.pearson.unwrap_or(item.spearman.unwrap_or(0.0)),
        })
        .collect();

    Ok(ScatterCorrelationsResponse {
        base_column,
        threshold,
        numeric_columns: data.columns.clone(),
        correlations,
        suggestions,
    })
}

fn build_scatter_correlations_from_cached_matrix(
    entry: CorrelationMatrixCacheEntry,
    requested_base: Option<&str>,
    threshold: f64,
) -> Result<ScatterCorrelationsResponse, AppError> {
    let data = CorrelationMatrixData::from_cache(entry);
    build_scatter_correlations_from_matrix_data(&data, requested_base, threshold)
}

pub fn spawn_correlation_matrix_warmup(state: AppState) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let revision = state.dataset_revision();
        if state.cached_correlation_matrix(revision).is_some() {
            return;
        }
        let lf = state.dataset_snapshot();
        match tokio::task::spawn_blocking(move || compute_correlation_matrix(lf)).await {
            Ok(Ok(data)) => {
                state.store_correlation_matrix_if_current(revision, data.into_cache());
            }
            Ok(Err(error)) => {
                tracing::debug!("correlation matrix warmup skipped: {}", error);
            }
            Err(error) => {
                tracing::warn!("correlation matrix warmup task failed: {:?}", error);
            }
        }
    })
}

#[tracing::instrument(skip(state))]
pub async fn get_correlation_matrix(
    State(state): State<AppState>,
) -> Result<Json<CorrelationMatrixResponse>, AppError> {
    let revision = state.dataset_revision();
    if let Some(entry) = state.cached_correlation_matrix(revision) {
        return Ok(Json(CorrelationMatrixData::from_cache(entry).to_response()));
    }

    let lf = state.dataset_snapshot();
    let data = tokio::task::spawn_blocking(move || compute_correlation_matrix(lf))
        .await
        .map_err(|e| {
            AppError::internal(format!("Failed to join correlation matrix task: {:?}", e))
        })??;
    state.store_correlation_matrix_if_current(revision, data.clone().into_cache());
    Ok(Json(data.to_response()))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use edatime_core::config::AppConfig;
    use edatime_core::IntoLazy;
    use polars::prelude::{DataFrame, NamedFrom, Series};
    use axum::extract::{Query, State};

    #[test]
    fn cached_matrix_builds_sorted_correlations_for_requested_base() {
        let cached = edatime_store::cache::CorrelationMatrixCacheEntry {
            columns: vec!["a".to_string(), "b".to_string(), "c".to_string()],
            pearson: vec![
                vec![Some(1.0), Some(0.25), Some(0.9)],
                vec![Some(0.25), Some(1.0), Some(-0.8)],
                vec![Some(0.9), Some(-0.8), Some(1.0)],
            ],
            spearman: vec![
                vec![Some(1.0), Some(0.3), Some(0.7)],
                vec![Some(0.3), Some(1.0), Some(-0.6)],
                vec![Some(0.7), Some(-0.6), Some(1.0)],
            ],
            counts: vec![vec![3, 3, 3], vec![3, 3, 3], vec![3, 3, 3]],
        };

        let response = build_scatter_correlations_from_cached_matrix(cached, Some("b"), 0.7)
            .expect("cached matrix should build response");

        assert_eq!(response.base_column, "b");
        assert_eq!(response.numeric_columns, vec!["a", "b", "c"]);
        assert_eq!(
            response
                .correlations
                .iter()
                .map(|item| item.column.as_str())
                .collect::<Vec<_>>(),
            vec!["c", "a"]
        );
        assert_eq!(response.correlations[0].pearson, Some(-0.8));
        assert_eq!(response.correlations[0].spearman, Some(-0.6));
        assert_eq!(response.correlations[0].count, 3);
        assert_eq!(response.suggestions.len(), 1);
        assert_eq!(response.suggestions[0].x, "b");
        assert_eq!(response.suggestions[0].y, "c");
        assert_eq!(response.suggestions[0].correlation, -0.8);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn warm_correlation_matrix_cache_populates_current_revision() {
        let df = DataFrame::new(
            3,
            vec![
                Series::new("a".into(), [1.0_f64, 2.0, 3.0]).into(),
                Series::new("b".into(), [2.0_f64, 4.0, 6.0]).into(),
                Series::new("c".into(), [3.0_f64, 2.0, 1.0]).into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());
        let revision = state.dataset_revision();

        spawn_correlation_matrix_warmup(state.clone())
            .await
            .expect("warmup task should join");

        let cached = state
            .cached_correlation_matrix(revision)
            .expect("warmup should populate matrix cache");
        assert_eq!(cached.columns, vec!["a", "b", "c"]);
        assert_eq!(cached.pearson[0][1], Some(1.0));
        assert_eq!(cached.pearson[0][2], Some(-1.0));
        assert_eq!(cached.spearman[0][1], Some(1.0));
        assert_eq!(cached.counts[0][1], 3);
    }

    #[test]
    fn correlation_matrix_returns_empty_payload_when_no_numeric_columns_exist() {
        let df = DataFrame::new(
            3,
            vec![
                Series::new("label".into(), ["a", "b", "c"]).into(),
                Series::new("group".into(), ["x", "y", "z"]).into(),
            ],
        )
        .expect("dataframe should build");

        let result = compute_correlation_matrix(df.lazy()).expect("matrix should not error");

        assert!(result.columns.is_empty());
        assert!(result.pearson.is_empty());
        assert!(result.spearman.is_empty());
        assert!(result.counts.is_empty());
    }

    #[test]
    fn correlation_matrix_returns_singleton_diagonal_when_one_numeric_column_exists() {
        let df = DataFrame::new(
            3,
            vec![
                Series::new("only".into(), [1.0_f64, 2.0, 3.0]).into(),
                Series::new("label".into(), ["x", "y", "z"]).into(),
            ],
        )
        .expect("dataframe should build");

        let result = compute_correlation_matrix(df.lazy()).expect("matrix should not error");

        assert_eq!(result.columns, vec!["only"]);
        assert_eq!(result.pearson, vec![vec![Some(1.0)]]);
        assert_eq!(result.spearman, vec![vec![Some(1.0)]]);
        assert_eq!(result.counts, vec![vec![3]]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn warm_correlation_matrix_cache_stores_empty_payload_for_insufficient_numeric_columns() {
        let df = DataFrame::new(
            3,
            vec![Series::new("label".into(), ["x", "y", "z"]).into()],
        )
        .expect("dataframe should build");
        let state = AppState::new(df, AppConfig::default());
        let revision = state.dataset_revision();

        spawn_correlation_matrix_warmup(state.clone())
            .await
            .expect("warmup task should join");

        let cached = state
            .cached_correlation_matrix(revision)
            .expect("warmup should cache empty matrix payload");
        assert!(cached.columns.is_empty());
        assert!(cached.pearson.is_empty());
        assert!(cached.spearman.is_empty());
        assert!(cached.counts.is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn scatter_correlations_miss_populates_matrix_cache() {
        let df = DataFrame::new(
            3,
            vec![
                Series::new("a".into(), [1.0_f64, 2.0, 3.0]).into(),
                Series::new("b".into(), [2.0_f64, 4.0, 6.0]).into(),
                Series::new("c".into(), [3.0_f64, 2.0, 1.0]).into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());
        let revision = state.dataset_revision();

        let response = get_scatter_correlations(
            State(state.clone()),
            Query(ScatterCorrelationsQuery {
                base: Some("a".to_string()),
                threshold: Some(0.7),
            }),
        )
        .await
        .expect("scatter correlations request should succeed");

        assert_eq!(response.0.base_column, "a");
        let cached = state
            .cached_correlation_matrix(revision)
            .expect("cold miss should populate the shared matrix cache");
        assert_eq!(cached.columns, vec!["a", "b", "c"]);
    }
}
