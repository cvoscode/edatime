# edatime — AI Repository Map

> Data visualization and analysis tool with a Rust backend (Axum + Polars) and TypeScript frontend (Solid.js, WebGPU charts).

## Project Structure

```
edatime/
├── crates/
│   ├── edatime-core/      # Pure types, pipeline IR, config, error
│   ├── edatime-store/     # Data repository, state, storage adapters
│   ├── edatime-query/     # LazyFrame query engine, aggregations, downsampling
│   ├── edatime-ingest/    # Data ingestion, CSV/Parquet loading
│   ├── edatime-service/   # Axum HTTP handlers, routing, analytics, causal
│   └── edatime-bin/       # Main binary entry point
└── frontend/src/
    ├── app.ts             # Main bootstrapping
    ├── state.ts           # Legacy state wrapper
    ├── bootstrap/         # App shell, page loaders
    ├── pages/             # timeseries, fft, spectrogram, heatmap
    ├── scatter/           # Scatter plot page
    ├── causal/            # Causal graph page
    ├── drift/             # Temporal drift page
    ├── chart/             # DataChart (WebGPU), FftChart, overlays, ticks
    ├── store/             # Central pub/sub store (index, events, chartState, etc.)
    ├── services/api/      # HTTP client, data fetching
    ├── services/timeseries/ # filtering, profile
    ├── components/        # atoms, molecules, organisms
    ├── types/             # TypeScript interfaces
    └── utils/             # Helpers
```

## Backend Tech Stack
- **Runtime:** tokio async runtime
- **HTTP:** Axum + tower-http (CORS, compression, tracing)
- **Data:** Polars DataFrame/LazyFrame
- **Rate limiting:** Token-bucket per IP

## Frontend Tech Stack
- **Framework:** Solid.js
- **Build:** Vite
- **Charts:** WebGPU (ChartGPU library), ECharts fallback
- **State:** Custom pub/sub store

## Key Entry Points
- Backend binary: `crates/edatime-bin/src/main.rs`
- Backend router: `crates/edatime-service/src/handlers/routes/mod.rs`
- Frontend app: `frontend/src/app.ts`
- Frontend store: `frontend/src/store/index.ts`
- API client: `frontend/src/services/api/index.ts`