# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
# Rust only (no Node needed for distribution)
cargo build              # debug
cargo build --release    # production binary at target/release/edatime
cargo run --release --bin edatime

# With frontend (requires Node)
make dev                 # build frontend via Vite + cargo run
make frontend-prod       # production frontend build (node scripts/build-frontend.mjs --prod)

# Verification
make check               # cargo check + clippy + tsc --noEmit
make test                # cargo test + node scripts/check-frontend.mjs

# Docker
docker build -t edatime .
docker run --rm -p 3000:3000 edatime
```

## Architecture

### Backend (Rust)
- **Axum** router with routes under both `/api/*` and `/api/v1/*`
- **Polars** for in-memory DataFrame stored in `AppState`
- **Apache Arrow IPC** for series payloads; JSON for metadata/scatter responses
- **Pipeline**: `src/pipeline.rs` handles filter → downsample → serialize
- **Downsampling**: `src/downsample.rs` wraps MinMaxLTTB (do not reimplement LTTB)
- **State**: `src/state.rs` holds `AppState` with `InMemoryDataRepository` (not a raw DataFrame)
- **Repository**: `src/repository.rs` manages the shared `LazyFrame` behind `Arc<RwLock<LazyFrame>>`
- **Scatter routes**: `src/routes/scatter/` — `points.rs` (GET/POST scatter points), `mod.rs` (correlations, matrix)
- **Analytics routes**: `src/routes/analytics.rs` — FFT, spectrogram, rolling, anomalies, causal graph

### Frontend (TypeScript + SolidJS)
- Built with **Vite**, output to `frontend/dist/`
- **ChartGPU** (WebGPU) for time-series rendering via custom chart adapters
- **SolidJS stores**: `scatterStore.ts` (Zustand-like createStore), `datasetStore.ts`, `uiStore.ts`
- **Pages**: `TimeseriesPage`, `ScatterPage`, `FftPage`, `DriftPage`, `CausalPage`, `HeatmapPage`, `UploadPage`, `HomePage`, `SettingsPage`
- **Routing**: HashRouter with lazy-loaded page components
- **API layer**: `frontend/src/services/api.ts` — getJson/postJson helpers, request deduplication for concurrent GETs
- **Arrow handling**: `fetchScatterPoints` can return either JSON or Arrow IPC — it detects via Content-Type header and parses accordingly

### Key API Endpoints
- `GET /api/data?start=&end=&width=&columns=` — Arrow IPC stream (time series)
- `GET /api/metadata` — column info, time range, null counts, column profiles
- `GET /api/scatter/points` (POST) — JSON or Arrow IPC scatter data; POST to avoid long query strings
- `POST /api/upload` and `POST /api/upload/preview` — CSV/Parquet ingestion with column/row/time slicing
- `GET /api/scatter/correlations` — correlation suggestions for scatter page
- `GET /api/scatter/correlations/matrix` — full Pearson/Spearman correlation matrix
- Analytics: `/api/analytics/fft`, `/api/analytics/spectrogram`, `/api/analytics/rolling`, `/api/analytics/anomalies`
- Database: `/api/database/connect`, `/api/database/load` — TimescaleDB integration

### Data Flow (Scatter)
1. `ScatterPage.tsx` calls `fetchScatterPoints(x, y, limit, color, size, options)`
2. Backend: `scatter_points_response()` in `routes/scatter/points.rs`
3. `collect_filtered_scatter_frame()` — applies time window and column filters via Polars
4. `collect_sampled_xyc_rows()` — iterates rows, handles continuous vs categorical color
5. Returns Arrow IPC with custom headers: `x-edatime-scatter-total`, `x-edatime-color-min/max`, etc.
6. Frontend parses Arrow via `apache-arrow` or falls back to JSON

## Critical Notes

- **Scatter color-by-column is unreliable** — treat as the first implementation priority. When changing scatter rendering, verify both scatter and density modes and check colorbar legend alignment.
- The `AppState.repository` is an `InMemoryDataRepository` wrapping `Arc<RwLock<LazyFrame>>`, not a plain DataFrame — always use the repository's accessor methods.
- Backend serves the frontend directly; no separate dev server needed.
- Avoid `unwrap()`/`expect()` on production paths; use `tracing` instead of `println!`.
- If a change affects both timeseries and scatter pages, verify both flows.
- If series chip behavior changes, verify color picking, adaptive target selection, and filter modal entry points together.
- Scatter responses may be Arrow IPC (with custom headers) or JSON — always check Content-Type header before parsing.