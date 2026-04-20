# Architecture

## Stack

EdaTime combines:

- Rust, Axum, Tokio, and Polars on the backend
- vanilla TypeScript and JavaScript on the frontend
- ChartGPU for the primary GPU-accelerated chart surfaces
- Apache Arrow IPC for large tabular series transport

## System Overview

```{mermaid}
graph TB
    subgraph Browser["Browser (Frontend)"]
        UI[Vanilla TS/JS UI]
        CG[ChartGPU Renderer]
        DC[Data Client]
    end

    subgraph Server["Rust Backend"]
        AX[Axum Router]
        MW[Middleware<br/>Rate Limit · CORS · CSP · Compression]
        subgraph Handlers["Route Handlers"]
            HD[/api/data]
            HM[/api/metadata]
            HS[/api/scatter/*]
            HA[/api/analytics/*]
            HU[/api/upload]
            HE[/api/export/*]
            HAG[/api/aggregate]
        end
        subgraph Core["Core Engine"]
            PL[Pipeline<br/>Filter → Reduce → Serialize]
            DS[Downsample<br/>MinMaxLTTB]
            FL[Filters<br/>Range · Line · Temporal]
            AR[Arrow Export]
            ST[Stats & Analytics]
        end
        subgraph State["Shared State"]
            DF[DataFrame<br/>Arc&lt;RwLock&gt;]
            CA[Response Cache]
            MT[Metrics]
            RP[Repository]
        end
    end

    UI --> DC
    DC -->|HTTP + Arrow IPC| AX
    AX --> MW --> Handlers
    HD --> PL
    PL --> DS
    PL --> FL
    PL --> AR
    HS --> FL
    HA --> ST
    Handlers --> DF
    HD --> CA
    CG -.->|WebGPU| UI
```

## Runtime Model

At runtime, the backend holds the active dataset in memory and serves both the frontend shell and the analytics API.

The frontend is page-based rather than route-based. It boots once, loads metadata, and then lazily initializes the heavier analytics pages on demand.

## Data Flow Diagrams

### Upload And Ingest

```{mermaid}
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant BE as Backend
    participant DF as DataFrame

    U->>FE: Select file
    FE->>BE: POST /api/upload/preview
    BE->>BE: Scan file, detect time column
    BE-->>FE: Preview metadata + column profiles
    U->>FE: Select columns, configure time slice
    FE->>BE: POST /api/upload (multipart)
    BE->>BE: Validate size, parse, ingest
    BE->>DF: Replace DataFrame
    BE->>BE: Bump revision, invalidate cache
    BE-->>FE: 200 OK
    FE->>BE: GET /api/metadata
    BE-->>FE: Updated schema + stats
    FE->>FE: Rebuild UI state
```

### Timeseries Query Pipeline

```{mermaid}
sequenceDiagram
    participant FE as Frontend
    participant Cache as Response Cache
    participant PL as Pipeline
    participant DF as DataFrame

    FE->>Cache: GET /api/data?start&end&width&columns
    alt Cache Hit
        Cache-->>FE: Cached Arrow IPC (x-edatime-cache: hit)
    else Cache Miss
        Cache->>PL: Forward request
        PL->>DF: Read snapshot
        PL->>PL: filter_time_range(start, end)
        PL->>PL: apply_reduction(LTTB, target=width×2)
        PL->>PL: dataframe_to_arrow_ipc()
        PL-->>Cache: Store response
        Cache-->>FE: Arrow IPC (x-edatime-cache: miss)
    end
    FE->>FE: Decode Arrow → typed arrays
    FE->>FE: Render via ChartGPU
```

### Scatter And Matrix

```{mermaid}
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend
    participant DF as DataFrame

    FE->>BE: GET /api/scatter/correlations
    BE->>DF: Compute pairwise correlations
    BE-->>FE: Correlation suggestions + numeric columns

    FE->>BE: POST /api/scatter/points {x, y, filters, color_column}
    BE->>DF: Apply linked filters (time, range, line)
    BE->>BE: Sample points if > limit
    BE-->>FE: JSON {points, color_kind, stats}
    FE->>FE: Render scatter/density/matrix
```

### Spectral And Causal Pages

- FFT and Spectrogram call dedicated analytics endpoints.
- Causal posts a parameterized request to Tigramite-backed analytics on the backend.

## Backend Module Architecture

```{mermaid}
graph LR
    subgraph Entry["Entry Points"]
        M[main.rs]
    end

    subgraph Routes["Route Layer"]
        RD[routes/data.rs]
        RM[routes/metadata.rs]
        RS[routes/scatter/]
        RA[routes/analytics.rs]
        RU[routes/upload.rs]
        RE[routes/export.rs]
        RAG[routes/aggregate.rs]
    end

    subgraph Logic["Business Logic"]
        PIP[pipeline.rs]
        FIL[filters.rs]
        DOWN[downsample.rs]
        ANA[analytics.rs]
        ING[ingest.rs]
        STAT[stats.rs]
        TEMP[temporal.rs]
    end

    subgraph Infra["Infrastructure"]
        STATE[state.rs]
        REPO[repository.rs]
        CACHE[cache.rs]
        MET[metrics.rs]
        RATE[rates.rs]
        MID[middleware.rs]
        ERR[error.rs]
        CFG[config.rs]
        VAL[validation.rs]
    end

    subgraph Export["Serialization"]
        ARR[arrow_export.rs]
        QRY[query.rs]
    end

    M --> Routes
    RD --> PIP --> DOWN
    RD --> FIL
    RD --> CACHE
    RS --> FIL
    RA --> ANA
    RU --> ING
    RE --> ARR
    RAG --> PIP
    Routes --> STATE --> REPO
    Routes --> VAL
    PIP --> ARR
    STATE --> MET
```

## Frontend Module Architecture

```{mermaid}
graph TB
    subgraph Pages["Page Controllers"]
        APP[app.ts<br/>Bootstrap & Orchestration]
        SP[scatter/scatterPage.ts<br/>Scatter Analytics]
        CP[causal/causalPage.ts]
    end

    subgraph UI["UI Components"]
        COL[ui/columns.ts<br/>Series Chips & Filters]
        TB[ui/toolbar.ts<br/>Actions & Export]
        UP[ui/upload.ts<br/>File Upload]
        PR[ui/profile.ts<br/>Column Profiling]
    end

    subgraph Chart["Chart Layer"]
        CH[chart/chartAdapter.ts<br/>ChartGPU Integration]
        REG[charts/registry.ts<br/>Chart Type Registry]
        FB[charts/fallback.ts<br/>Canvas Fallback]
    end

    subgraph Data["Data & State"]
        ST[state.ts<br/>Shared App State]
        DC[dataClient.ts<br/>API + Arrow Decode]
        FMT[formatUtils.ts]
    end

    APP --> UI
    APP --> Chart
    APP --> Data
    SP --> DC
    SP --> ST
    COL --> ST
    CH --> REG
    DC --> ST
```

## State Management

```{mermaid}
stateDiagram-v2
    [*] --> Boot: Page load
    Boot --> MetadataLoaded: GET /api/metadata
    MetadataLoaded --> ChartReady: Initialize chart + chips

    ChartReady --> Fetching: Zoom / filter change
    Fetching --> Rendering: Arrow IPC received
    Rendering --> ChartReady: Frame complete

    ChartReady --> LocalUpdate: Color / overlay change
    LocalUpdate --> ChartReady: Re-render (no fetch)

    ChartReady --> Uploading: File selected
    Uploading --> Boot: Ingest complete → re-bootstrap
```

## Source Layout

### Backend

- `src/main.rs`: app startup, middleware, frontend serving, and router mounting
- `src/routes/`: HTTP handlers grouped by route family
- `src/analytics.rs`, `src/pipeline.rs`, `src/filters.rs`: transformation and analysis logic
- `src/ingest.rs`: CSV and Parquet ingest plus time-column handling
- `src/arrow_export.rs`: Arrow IPC export logic
- `src/state.rs`: shared application state

### Frontend

- `frontend/index.html`: shell layout and page containers
- `frontend/src/app.ts`: top-level orchestration and boot sequence
- `frontend/src/ui/`: upload panel, toolbars, profile grid, column chips
- `frontend/src/scatter/`: scatter, matrix, distribution, and export logic
- `frontend/src/chart/`: ChartGPU-backed chart adapters
- `frontend/src/dataClient.ts`: API fetch helpers and Arrow decoding

## Architectural Conventions

- Prefer extending existing focused modules over adding new monoliths.
- Keep Arrow IPC as the default transport for large timeseries payloads.
- Use JSON where the payload is nested or scatter-oriented.
- Keep dataset mutation behavior explicit and easy to reason about.
- Keep the frontend framework-free.