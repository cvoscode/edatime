# edatime — AI Repository Map

> Data visualization and analysis tool with a Rust backend (Axum + Polars) and TypeScript frontend (vanilla TypeScript + DOM, WebGPU charts via ChartGPU).

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
    ├── app/               # App-level helpers (pageLifecycle, pageRegistry, runtime, shell)
    ├── state.ts           # Centralised app state, format helpers, column-range filtering
    ├── bootstrap/         # App shell, page loaders, analytics overlay, session bootstrap
    ├── pages/             # timeseries, fft, spectrogram, heatmap
    ├── scatter/           # Scatter plot page
    ├── causal/            # Causal graph page
    ├── drift/             # Temporal drift page
    ├── chart/             # DataChart (ChartGPU WebGPU), FftChart, overlays, ticks
    ├── store/             # Central pub/sub store (index, events, chartState, etc.)
    ├── services/api/      # HTTP client, data fetching
    ├── features/          # Feature-scoped entrypoints (timeseries, fft, heatmap, scatter, spectrogram, causal, drift)
    ├── ui/                # Shared UI surface — primitives (Button, Chip, ColorInput, …) and composites (SeriesChip, RangeControls, …)
    ├── components/        # DEPRECATED — re-exports from ui/; will be removed once no internal imports remain
    ├── types/             # TypeScript interfaces
    └── utils/             # Helpers (chartExport, bindExportButtons, platform, router, etc.)
```

## Backend Tech Stack
- **Runtime:** tokio async runtime
- **HTTP:** Axum + tower-http (CORS, compression, tracing)
- **Data:** Polars DataFrame/LazyFrame
- **Rate limiting:** Token-bucket per IP

## Frontend Tech Stack
- **Framework:** Vanilla TypeScript + DOM (no Solid.js or other UI framework)
- **Build:** Vite
- **Charts:** WebGPU via ChartGPU library, ECharts fallback, Canvas 2D fallback chart
- **State:** Custom pub/sub store (`store/index.ts`), module-level `appState` wrapper

## Planning Notes

- `ai/frontend/refactor/2026-05-30-broad-frontend-consolidation.md` — approved target architecture and migration status for the broad frontend consolidation and legacy archive refactor.

## Key Architecture Notes

- **`frontend/src/ui/`** is the canonical shared component surface. `primitives/` holds basic building blocks (Button, Chip, ColorInput, IconButton, Select, TextInput). `composites/` holds domain-aware components (SeriesChip, RangeControls, ColumnSelector, etc.).
- **`frontend/src/components/`** is a deprecated adapter layer that re-exports from `ui/`. It exists only during migration and will be removed once `rg "components/" frontend/src` returns no internal runtime imports.
- **`frontend/src/app/pageLifecycle.ts`** provides shared page lifecycle wiring (one-time init, page-change listeners, onVisible hooks) used by fftPage, heatmapPage, and spectrogramPage.
- **`frontend/src/ui/seriesChipList.ts`** provides shared SeriesChip list orchestration (rendering, keyboard activation, color update plumbing) used by columnsController, fftPage, and causalPage.
- **`frontend/src/utils/bindExportButtons.ts`** provides declarative PNG/SVG/HTML/CSV button wiring used by fftPage, heatmapPage, and spectrogramPage.

## Key Entry Points
- Backend binary: `crates/edatime-bin/src/main.rs`
- Backend router: `crates/edatime-service/src/handlers/routes/mod.rs`
- Frontend app: `frontend/src/app.ts`
- Frontend store: `frontend/src/store/index.ts`
- API client: `frontend/src/services/api/index.ts`
