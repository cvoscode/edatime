# crates/edatime-service/src/handlers/scatter/scatter/correlations.rs
> Scatter correlation handler — GET /api/scatter/correlations, GET /api/scatter/correlations/matrix.

## Struct: ScatterCorrelationsQuery
- `{ base: Option<String>, threshold: Option<f64> }`

## Struct: ScatterCorrelationsResponse
- `{ base_column: String, threshold: f64, numeric_columns: Vec<String>, correlations: Vec<CorrelationItem>, suggestions: Vec<SuggestionItem> }`

## Struct: CorrelationItem
- `{ column: String, count: usize, pearson: Option<f64>, spearman: Option<f64> }`

## Struct: SuggestionItem
- `{ x: String, y: String, correlation: f64 }`

## Struct: CorrelationMatrixResponse
- `{ columns: Vec<String>, pearson: Vec<Vec<Option<f64>>>, spearman: Vec<Vec<Option<f64>>> }`

## Handlers
- `pub async fn get_scatter_correlations(State(state): State<AppState>, Query(params): Query<ScatterCorrelationsQuery>) -> Result<Json<ScatterCorrelationsResponse>, AppError>`
- `pub async fn get_correlation_matrix(State(state): State<AppState>) -> Result<Json<CorrelationMatrixResponse>, AppError>`