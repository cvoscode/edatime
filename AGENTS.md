# edatime — Agent Instructions

## Stack

- **Backend**: Rust, Axum, Polars, Arrow IPC, minmaxlttb, tracing
- **Frontend (active)**: TypeScript + SolidJS (in `frontend/`), Vite, ChartGPU, Apache Arrow
- **Frontend (legacy)**: Vanilla JS/TypeScript in `frontend/src/`, compiled via esbuild to `frontend/js/`. DOO not read it unless you are looking for a reference implementation!!!
- **Data transport**: Apache Arrow IPC for series payloads; JSON for metadata, scatter, and correlation responses

## Build commands

```bash
# Rust only (no Node needed for distribution)
cargo build              # debug
cargo build --release    # production binary at target/release/edatime
cargo run --release --bin edatime   # run directly

# With frontend (requires Node)
make dev                 # build frontend via esbuild + cargo run
make frontend-prod       # minified frontend build (node scripts/build-frontend.mjs --prod)

# Verification
make check               # cargo check + clippy + tsc --noEmit
make test                # cargo test + node scripts/check-frontend.mjs
npm run check:frontend   # frontend syntax check only (tsc --noEmit)
cargo bench --bench pipeline_bench --no-run  # compile benchmark harness
```

## CI order

`cargo fmt --check` → `cargo check --all-targets` → `cargo test` → `npm run check:frontend`

## Architecture notes

- `src/main.rs` — Axum router and server startup
- `src/routes/` — HTTP handlers; all routes available under both `/api/*` and `/api/v1/*`
- `src/state.rs` — In-memory `DataFrame` behind `Arc<RwLock<_>>`
- `src/pipeline.rs` — Filter, downsample, serialize pipeline
- `src/arrow_export.rs` — Arrow IPC serialization
- `src/downsample.rs` — MinMaxLTTB wrapper; do not reimplement LTTB here
- Frontend compiled to `frontend/js/` (not `frontend-solid/dist/`); `frontend-solid/` contains a SolidJS rewrite still in progress
- Backend serves the frontend; no separate dev server needed

## Active issue

Scatter color-by-column is unreliable. Treat as the first implementation priority before other roadmap work. When changing scatter rendering, verify both scatter and density modes and check that the colorbar legend aligns correctly.

## Key handlers and their contracts

- `GET /api/data?start=&end=&width=&columns=` — returns Arrow IPC (`application/vnd.apache.arrow.stream`)
- `GET /api/scatter/points` (POST) — returns JSON for scatter mode; uses POST to avoid long query strings
- `POST /api/upload` and `POST /api/upload/preview` — partial ingestion, column subset, time slicing

## Development reminders

- If a change affects both the timeseries page and scatter page, verify both flows
- Keep scatter legend and color behavior aligned with render mode
- If series chip behavior changes, verify color picking, adaptive target selection, and filter modal entry points together
- Avoid `unwrap()`/`expect()` on production paths; use `tracing` instead of `println!`
- Keep read/write lock lifetimes short; use lazy Polars queries for filtering/projection work