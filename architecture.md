# edatime Architecture Documentation

## Overview

**edatime** is an interactive exploratory data analysis application for time-series datasets. It combines a Rust/Axum/Polars backend with a vanilla JavaScript frontend and GPU-accelerated chart rendering via ChartGPU.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              edatime                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         FRONTEND                                     │ │
│  │   ┌──────────────┐ ┌──────────────┐ ┌────────────────────────────┐ │ │
│  │   │   ChartGPU   │ │    state.js  │ │        UI Modules          │ │ │
│  │   │   (WebGPU)   │ │              │ │  columns.js, toolbar.js    │ │ │
│  │   │              │ │   App State  │ │  upload.js, profile.js     │ │ │
│  │   │  Line/Scatter│ │  Management  │ │  chart.js, dataClient.js   │ │ │
│  │   │  Rendering   │ │   (Shared)   │ │  scatterPage.js            │ │ │
│  │   └──────────────┘ └──────────────┘ └────────────────────────────┘ │ │
│  │                                                                      │ │
│  │   ┌──────────────────────────────────────────────────────────────┐ │ │
│  │   │                    Chart Rendering Stack                      │ │ │
│  │   │  ┌────────────────┐ ┌──────────────────────────────────────┐ │ │
│  │   │  │ ChartGPU Core  │ │         Fallback Renderer             │ │ │
│  │   │  │  (WebGPU)      │ │    (Canvas 2D when WebGPU unavailable) │ │ │
│  │   │  └────────────────┘ └──────────────────────────────────────┘ │ │
│  │   └──────────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                       BACKEND (Rust)                                 │ │
│  │                                                                      │ │
│  │   ┌────────────────────────────────────────────────────────────┐   │ │
│  │   │                     Axum HTTP Server                        │   │ │
│  │   │   ┌─────────────┐ ┌─────────────┐ ┌──────────────────────┐ │   │ │
│  │   │   │  Router     │ │ Middleware  │ │   Shared State        │ │   │ │
│  │   │   │  (main.rs)  │ │ (cors, fs,  │ │   Arc<RwLock<DataFrame>││   │ │
│  │   │   │             │ │  trace, csp │ │                        ││   │ │
│  │   │   └─────────────┘ └─────────────┘ └──────────────────────┘ │   │ │
│  │   └────────────────────────────────────────────────────────────┘   │ │
│  │                                                                      │ │
│  │   ┌────────────────────────────────────────────────────────────┐   │ │
│  │   │                    Route Handlers                            │   │ │
│  │   │   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────────┐   │   │ │
│  │   │   │metadata │ │   data  │ │aggregate│ │  scatter/     │   │   │ │
│  │   │   │ endpoint│ │ endpoint│ │ endpoint│ │  correlations │   │   │ │
│  │   │   └─────────┘ └─────────┘ └─────────┘ └───────────────┘   │   │ │
│  │   │   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────────┐   │   │ │
│  │   │   │upload   │ │upload/  │ │ scatter │ │     ingest     │   │   │ │
│  │   │   │ endpoint│ │ preview │ │ points  │ │   (ingest.rs)  │   │   │ │
│  │   │   └─────────┘ └─────────┘ └─────────┘ └───────────────┘   │   │ │
│  │   └────────────────────────────────────────────────────────────┘   │ │
│  │                                                                      │ │
│  │   ┌────────────────────────────────────────────────────────────┐   │ │
│  │   │                    Data Processing Pipeline                  │   │ │
│  │   │   ┌────────────────┐ ┌───────────────────────────────────┐ │   │ │
│  │   │   │   Ingest Layer │ │          Pipeline Layer            │ │   │ │
│  │   │   │  CSV/Parquet   │ │   Filter → Reduce → Serialize      │ │   │ │
│  │   │   └────────────────┘ └───────────────────────────────────┘ │   │ │
│  │   │                                                              │   │ │
│  │   │   ┌──────────────────────────────────────────────────────┐ │   │ │
│  │   │   │            Reducers / Transformations                 │ │   │ │
│  │   │   │   ┌─────────────┐ ┌─────────────┐ ┌────────────────┐ │   │ │
│  │   │   │   │ TimeFilter  │ │   LTTB      │ │ BucketAgg      │ │   │ │
│  │   │   │   └─────────────┘ │  Downsample │ │                 │ │   │ │
│  │   │   │   ┌─────────────┐ ┌─────────────┐ ┌────────────────┐ │   │ │
│  │   │   │   │  ColumnSel  │ │  Scatter    │ │  Correlations   │ │   │ │
│  │   │   │   └─────────────┘ │  Filtered   │ │  Calculation    │ │   │ │
│  │   │   │   ┌─────────────┐ ┌─────────────┐ ┌────────────────┐ │   │ │
│  │   │   │   │  Adaptive   │ │  Adaptive   │ │  ScatterLine   │ │   │ │
│  │   │   │   │  Filters    │ │  Filtered   │ │  Filter Filter │ │   │ │
│  │   │   │   └─────────────┘ └─────────────┘ └────────────────┘ │   │ │
│  │   │   └──────────────────────────────────────────────────────┘ │   │ │
│  │   └────────────────────────────────────────────────────────────┘   │ │
│  │                                                                      │ │
│  │   ┌────────────────────────────────────────────────────────────┐   │ │
│  │   │                   Output Layer                               │   │ │
│  │   │   ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │   │ │
│  │   │   │   Arrow IPC │ │    JSON     │ │  Metadata Headers   │  │   │ │
│  │   │   │  (columnar) │ │  (nested)   │ │  (downsampled, etc.)│  │   │ │
│  │   │   └─────────────┘ └─────────────┘ └─────────────────────┘  │   │ │
│  │   └────────────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Diagram

### Backend Components

```
┌────────────────────────────────────────────────────────────┐
│                      edatime Backend                        │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                      AppState                         │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │      Arc<RwLock<DataFrame>> (shared state)      │ │ │
│  │  │          (Polars DataFrame)                     │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                    Ingest Layer                        │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │  CSV/Parquet Reader → Polars LazyFrame          │ │ │
│  │  │  - Auto-detect time column                       │ │ │
│  │  │  - Column type validation                        │ │ │
│  │  │  - Partial ingestion (row limits)                │ │ │
│  │  │  - Time-range filtering (pre-ingestion)          │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                  Pipeline Layer                        │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │  Reduction Strategies:                            │ │ │
│  │  │  - LTTB Downsampling (for large time ranges)     │ │ │
│  │  │  - Bucket Aggregation (for bar/histograms)       │ │ │
│  │  │  - None (passthrough)                            │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                   Output Layer                         │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │  Serialization:                                   │ │ │
│  │  │  - Arrow IPC (columnar, efficient for large data)│ │ │
│  │  │  - JSON (nested, for scatter points)             │ │ │
│  │  │  - Custom headers (metadata)                      │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                Scatter/Correlation Layer               │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │  - Pearson correlation calculation               │ │ │
│  │  │  - Spearman correlation (rank-based)             │ │ │
│  │  │  - Scatter point generation                       │ │ │
│  │  │  - Density histogram generation                   │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                 Adaptive Filter Layer                  │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │  Line-based filters on numeric series           │ │ │
│  │  │  - Double-click to create segments              │ │ │
│  │  │  - Filter points above/below line                │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### Frontend Components

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          edatime Frontend                                      │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                             Main Entry                                   │ │
│  │                                 app.js                                     │ │
│  │    - Bootstrap                                                            │ │
│  │    - Coordinate modules                                                   │ │
│  │    - WebGPU check                                                         │ │
│  │    - Fallback handling                                                    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                          State Management                                │ │
│  │                              state.js                                     │ │
│  │    - appState (shared state)                                             │ │
│  │    - SERIES_COLORS (per-series colors)                                   │ │
│  │    - Column range filters                                                 │ │
│  │    - Format helpers                                                       │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         Chart Rendering                                  │ │
│  │    ┌───────────────────────┐ ┌─────────────────────────────────────┐   │ │
│  │    │  ChartGPU Adapter     │ │        Fallback Renderer            │   │ │
│  │    │  (WebGPU-backed)      │ │         (Canvas 2D)                  │   │ │
│  │    │  - line type          │ │         chart.js                     │   │ │
│  │    │  - scatter type       │ │         charts/fallback.js           │   │ │
│  │    │  - adaptive filters   │ │         charts/registry.js           │   │ │
│  │    └───────────────────────┘ └─────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                        Data Fetching                                     │ │
│  │                             dataClient.js                                │ │
│  │    - Arrow IPC fetch (with decompression)                                │ │
│  │    - Aggregate endpoint access                                            │ │
│  │    - Scatter points fetch                                                  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         UI Modules                                        │ │
│  │    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐         │ │
│  │    │   columns.js    │ │   toolbar.js    │ │    upload.js    │         │ │
│  │    │  - Column chips │ │  - Zoom/Draw    │ │  - File upload  │         │ │
│  │    │  - Range chips  │ │  - Export       │ │  - Preview      │         │ │
│  │    │  - Color pickers│ │  - Pages        │ │  - Profile grid │         │ │
│  │    └─────────────────┘ └─────────────────┘ └─────────────────┘         │ │
│  │    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐         │ │
│  │    │   profile.js    │ │  scatterPage.js │ │   debug.js      │         │ │
│  │    │  - Column grid  │ │  - Linked brush │ │  - DEBUG mode    │         │ │
│  │    └─────────────────┘ └─────────────────┘ └─────────────────┘         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### Main Time-Series Page

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Main Time-Series Page Flow                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  1. Initial Load                                                                 │
│     ┌────────────────────────────────────────────────────────────────────┐     │
│     │  Frontend loads metadata from /api/metadata                        │     │
│     │  Returns: numeric_columns, time_range, dataset metadata           │     │
│     └────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  2. User selects one or more columns                                             │
│     ┌────────────────────────────────────────────────────────────────────┐     │
│     │  Frontend sends column selection to /api/data                      │     │
│     └────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  3. Server-Side Processing                                                       │
│     ┌────────────────────────────────────────────────────────────────────┐     │
│     │  Backend:                                                           │     │
│     │  a) Time range filter                                               │     │
│     │  b) LTTB downsampling (if needed)                                   │     │
│     │  c) Arrow IPC serialization                                         │     │
│     └────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  4. Response                                                                    │
│     ┌────────────────────────────────────────────────────────────────────┐     │
│     │  Arrow IPC response with custom headers:                           │     │
│     │  - x-edatime-downsampled                                            │     │
│     │  - x-edatime-returned-rows                                          │     │
│     │  - x-edatime-target-points                                          │     │
│     └────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  5. Frontend Rendering                                                          │
│     ┌────────────────────────────────────────────────────────────────────┐     │
│     │  a) Decode Arrow IPC                                                │     │
│     │  b) Render selected series                                           │     │
│     │  c) Apply local filters (column ranges, adaptive lines)             │     │
│     │  d) Update Y-range                                                  │     │
│     └────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  6. Interaction (Zoom, Filter)                                                  │
│     ┌────────────────────────────────────────────────────────────────────┐     │
│     │  a) Trigger fetchAndRender with debounce                            │     │
│     │  b) Request new data with updated range                             │     │
│     │  c) Render filtered data                                             │     │
│     └────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Scatter / Density Page

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                   Scatter / Density Page Flow                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  1. Initialize Scatter Page                                                     │
│     ┌────────────────────────────────────────────────────────────────────┐     │
│     │  Frontend requests /api/scatter/correlations                        │     │
│     │  Returns: correlations with pearson/spearman scores                │     │
│     │  - numeric_columns (sorted)                                        │     │
│     │  - suggestions (high correlation pairs)                            │     │
│     └────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  2. User selects X/Y column pair                                                │
│     ┌────────────────────────────────────────────────────────────────────┐     │
│     │  Frontend requests /api/scatter/points with:                       │     │
│     │  - x, y (column names)                                              │     │
│     │  - color (optional)                                                 │     │
│     │  - start/end (linked range)                                         │     │
│     │  - filters (column range filters)                                  │     │
│     │  - line_filters (adaptive line filters)                            │     │
│     └────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  3. Server Processing                                                           │
│     ┌────────────────────────────────────────────────────────────────────┐     │
│     │  Backend:                                                           │     │
│     │  a) Apply linked range filter                                       │     │
│     │  b) Apply column range filters                                      │     │
│     │  c) Apply adaptive line filters                                     │     │
│     │  d) Sample scatter points (limit: 1M max)                          │     │
│     │  e) Extract color values if color column selected                   │     │
│     └────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  4. Response                                                                    │
│     ┌────────────────────────────────────────────────────────────────────┐     │
│     │  JSON response with:                                                │     │
│     │  - points (x, y coordinates)                                        │     │
│     │  - total_points                                                     │     │
│     │  - returned_points                                                  │     │
│     │  - color_values, color_min, color_max                              │     │
│     └────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  5. Density Mode                                                                │
│     ┌────────────────────────────────────────────────────────────────────┐     │
│     │  Density plot renders histogram bins along diagonal                │     │
│     │  (currently using Canvas 2D, future: Apache ECharts integration)   │     │
│     └────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Upload Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Upload Flow                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  1. File Selection (Frontend)                                                   │
│     ┌────────────────────────────────────────────────────────────────────┐     │
│     │  - Drag-drop or file picker                                         │     │
│     │  - File uploaded to /api/upload/preview                             │     │
│     └────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  2. Preview Response                                                            │
│     ┌────────────────────────────────────────────────────────────────────┐     │
│     │  Returns:                                                           │     │
│     │  - column metadata (name, type, min, max, null_count)              │     │
│     │  - row count estimate                                               │     │
│     │  - dataset metadata                                                  │     │
│     └────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  3. User Makes Selection                                                        │
│     ┌────────────────────────────────────────────────────────────────────┐     │
│     │  - Select subset of columns (optional)                              │     │
│     │  - Set partial load: n_rows, skip_rows, time range                 │     │
│     └────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  4. Upload Response                                                            │
│     ┌────────────────────────────────────────────────────────────────────┐     │
│     │  - status: "success"                                                 │     │
│     │  - rows: ingested row count                                          │     │
│     │  - selected_columns                                                  │     │
│     │  - time range limits                                                 │     │
│     └────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  5. Backend Ingestion                                                           │
│     ┌────────────────────────────────────────────────────────────────────┐     │
│     │  - Parse CSV/Parquet file                                            │     │
│     │  - Apply partial ingestion parameters                                │     │
│     │  - Validate: time column, numeric column present                    │     │
│     │  - Rename time column to "ts"                                        │     │
│     │  - Sort by time                                                      │     │
│     │  - Store in shared AppState.df                                       │     │
│     └────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Layered Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Application Layer (Frontend)                              │
│  - User interactions (zoom, filter, selection, export)                          │
│  - Chart rendering via ChartGPU/WebGPU                                           │
│  - UI composition and event handling                                             │
└─────────────────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      Service Layer (HTTP/API)                                    │
│  - Route handlers (Axum)                                                         │
│  - Request validation and parsing                                                │
│  - Error handling and response building                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    Domain Layer (Business Logic)                                  │
│  - Pipeline processing (filter → reduce → serialize)                             │
│  - Ingestion (CSV/Parquet reading)                                               │
│  - Scatter/Correlation calculations                                              │
│  - Adaptive filter generation                                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│                  Infrastructure Layer (Data Access)                               │
│  - Polars DataFrame operations (lazy evaluation)                                 │
│  - Arrow IPC serialization                                                        │
│  - MinMaxLTTB downsampling                                                        │
│  - File I/O (temp files, uploads)                                                │
└─────────────────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      Shared Layer                                                 │
│  - AppState (shared dataframe via Arc<RwLock>)                                  │
│  - Query parameters types (DataQuery, AggregateQuery, etc.)                     │
│  - Error types and handling                                                      │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Rust | stable | Language |
| Axum | 0.8.8 | HTTP server/framework |
| Polars | 0.53.0 | DataFrame engine (lazy evaluation) |
| Arrow | 58.0.0 | Columnar memory/format |
| minmax-lttb | 0.1.4 | Downsampling algorithm |
| Tokio | 1.49.0 | Async runtime |

### Frontend

| Technology | Purpose |
|------------|---------|
| Vanilla JavaScript (ESM) | No framework dependencies |
| ChartGPU | GPU-accelerated chart rendering |
| Canvas API | Fallback rendering |

### Infrastructure

| Component | Usage |
|-----------|-------|
| Tempfile | Temporary file handling for uploads |
| CORS Layer | Cross-origin request handling |
| CSP Layer | Content Security Policy headers |

---

## State Management

### Backend State

```rust
pub struct AppState {
    pub df: Arc<RwLock<DataFrame>>,
}
```

- Shared in-memory DataFrame stored behind `Arc<RwLock<_>>`
- All routes access the same shared state
- Reads are concurrent, writes require synchronization

### Frontend State

```javascript
const appState = {
    metadata: {},
    chart: null,
    selectedCols: [],
    adaptiveLineFilters: [],
    columnRanges: Map(),
    currentStart: 0,
    currentEnd: 0,
    // ... more state
}
```

- Shared state across modules
- Format helpers for consistent formatting
- Column range filters applied locally

---

## Security Considerations

### Current State

- CORS: Permissive (`Any` origin)
- CSP: Restrictive (only self, unpkg.com, esm.sh)
- No authentication/authorization
- No rate limiting
- Body limit: Disabled

### Recommendations

1. Add rate limiting for upload endpoints
2. Implement API key or JWT authentication
3. Restrict CORS origins to trusted domains
4. Add request body size limits
5. Implement input validation for time ranges and column names

---

## Performance Considerations

### Current Optimizations

- Arrow IPC for columnar transport
- LTTB downsampling for large ranges
- Lazy evaluation with Polars
- Debounced fetch on zoom
- Thread-spawned blocking operations

### Areas for Improvement

1. Add HTTP caching headers for static metadata
2. Implement response caching for frequently requested ranges
3. Consider connection pooling for Arrow IPC
4. Add request timeout handling
5. Optimize scatter point sampling for very large datasets

---

## Testing Strategy

### Backend Testing

- Unit tests for pipeline functions
- Integration tests for route handlers
- Mock tests for external dependencies

### Frontend Testing

- ESM syntax validation (`node --check`)
- Manual testing in browser
- Visual regression testing for charts

### Current Testing Commands

```bash
cargo check
node --check frontend/js/app.js
node --check frontend/js/chart.js
node --check frontend/js/dataClient.js
```

---

## Documentation Structure

- `README.md` - Project overview, architecture summary, usage
- `architecture.md` - Detailed architecture documentation (this file)
- `implementation_plan.md` - Implementation roadmap and tasks
- `issues.md` - Known issues and bug reports
- `future_features.md` - Planned features and improvements

---

## Version Information

- Package: edatime v0.1.0
- Edition: Rust 2024
- Git Commit: Latest

---

## License and Attribution

[Not specified in the project files]

---

*Last updated: 2026-03-08*