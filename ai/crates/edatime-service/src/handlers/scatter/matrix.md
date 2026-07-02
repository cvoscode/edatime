# ai/crates/edatime-service/src/handlers/scatter/matrix.md
> Batched scatter-matrix HTTP handler that samples multiple cell pairs into one Arrow IPC response plus per-cell metadata headers.

## Functions
- `post_scatter_matrix(State(state): State<AppState>, Json(params): Json<ScatterMatrixQuery>) -> Result<Response, AppError>`
  - Handles `POST /api/scatter/matrix`, batches all requested pairs, scopes range filters per pair, samples rows, and returns Arrow IPC plus `x-edatime-matrix-cells`.
