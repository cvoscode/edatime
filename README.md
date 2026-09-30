# edatime

edatime is a self-hosted, browser-based time-series exploratory data analysis (EDA) tool. You point it at a CSV or Parquet file, and it gives you an interactive multi-series chart, scatter analytics, column profiling, and filtering — all rendered with GPU-accelerated graphics directly in your browser.

The backend is written in Rust (Axum + Polars) and streams data as Apache Arrow IPC for fast, low-overhead transport. The frontend is plain HTML and JavaScript with no framework dependency, using ChartGPU for WebGPU-accelerated rendering.

---

## Installation

### Requirements

| **Rust 1.88+ stable toolchain** | Install from [rustup.rs](https://rustup.rs) |
| **A modern browser** | Chrome 113+, Edge 113+, or any browser with WebGPU support recommended. Firefox works via a Canvas fallback. |
| **Node.js** | Required to build the packaged browser frontend from source |

There are no native dependencies, no database, and no external services to configure. The backend compiles to a single binary that serves the frontend itself.

### Build

Clone the repository and build the packaged frontend before compiling in release
mode:

```bash
git clone <repo-url>
cd edatime
npm ci
npm run build:prod
cargo build --release -p edatime-bin --bin edatime
```

The compiled binary lands at `target/release/edatime`.

For a quick development build (faster compile, slower runtime):

```bash
cargo build -p edatime-bin --bin edatime
```

`make build-release` performs the frontend build followed by the Rust release
build. ChartGPU is a local package at `frontend/libs/chartgpu/`; Vite bundles it
into the application rather than copying a second runtime library tree.

---

## Running

### Start the server

```bash
make run
```

Or run the pre-built binary directly:

```bash
./target/release/edatime
```

Then open your browser at:

```
http://127.0.0.1:3000
```

The server binds to `127.0.0.1:3000` by default.

### Start with a pre-loaded dataset

Set `EDATIME_SAMPLE_DATA` to a CSV or Parquet file path and the dataset will be loaded automatically on startup — no manual upload needed:

```bash
EDATIME_SAMPLE_DATA=./my_data.csv cargo run --release -p edatime-bin --bin edatime
```

### Configuration

You can tune the server via a `config.toml` file or environment variables. All settings are optional — the defaults work out of the box.

**Using a config file:**

```bash
EDATIME_CONFIG=./config.toml cargo run --release -p edatime-bin --bin edatime
```

**Example `config.toml`:**

```toml
[server]
host = "0.0.0.0"
port = 8080
allow_insecure_public = true # explicit opt-in: edatime has no built-in authentication

[cache]
ttl_seconds = 120
max_entries = 256
max_bytes = 67108864   # 64 MB

[rate_limit]
max_requests = 200
window_seconds = 60
max_clients = 10000

[upload]
max_upload_bytes = 536870912   # 512 MB
max_concurrent_uploads = 1     # concurrent upload/preview decoders
queue_timeout_ms = 1000        # wait before returning 503
max_estimated_resident_bytes = 2147483648 # conservative aggregate decode estimate
resident_memory_multiplier = 4            # wire bytes → decode admission estimate

[data]
artifact_dir = "./edatime-artifacts" # optional durable Parquet versions
max_artifact_bytes = 21474836480      # optional 20 GiB managed-artifact cap
max_artifact_versions = 12             # optional lineage-safe version cap
require_sorted_scan_backed = true      # false opts into Polars streaming sort

[query]
max_interactive_concurrency = 4 # interactive LazyFrame collections
max_background_concurrency = 1  # sink-backed materialization/export work
```

**Environment variable overrides** (take precedence over the config file):

| Variable | Default | Description |
|---|---|---|
| `EDATIME_HOST` | `127.0.0.1` | Bind address |
| `EDATIME_ALLOW_INSECURE_PUBLIC` | `false` | Permit a non-loopback bind without built-in authentication |
| `EDATIME_CORS_ALLOWED_ORIGINS` | unset | Comma-separated cross-origin allowlist |
| `EDATIME_TRUSTED_PROXY_IPS` | unset | Direct proxy peers trusted to supply forwarding headers |
| `EDATIME_PORT` | `3000` | Listen port |
| `EDATIME_SAMPLE_DATA` | *(none)* | CSV/Parquet file to load on startup |
| `EDATIME_CACHE_TTL_SECONDS` | `60` | How long query cache entries live |
| `EDATIME_RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per client per window |
| `EDATIME_MAX_UPLOAD_BYTES` | `268435456` | Max upload file size (256 MB) |
| `EDATIME_MAX_CONCURRENT_UPLOADS` | `1` | Concurrent upload/preview decoders |
| `EDATIME_UPLOAD_QUEUE_TIMEOUT_MS` | `1000` | Maximum upload admission wait |
| `EDATIME_ARTIFACT_DIR` | *(unset)* | Managed directory for durable Parquet versions |
| `EDATIME_MAX_INTERACTIVE_QUERIES` | `4` | Concurrent interactive query collections admitted by the shared executor |
| `EDATIME_MAX_BACKGROUND_JOBS` | `1` | Concurrent sink-backed materialization/export operations admitted by the shared executor |
| `EDATIME_MAX_ARTIFACT_BYTES` | *(unset)* | Aggregate managed-artifact disk cap |
| `EDATIME_MAX_ARTIFACT_VERSIONS` | *(unset)* | Lineage-safe cap for retained managed versions |
| `EDATIME_REQUIRE_SORTED_SCAN_BACKED` | `true` | Verify ordered timestamps before scan-backed ingest |

---

## Usage

For the full Sphinx/Read the Docs content, start at `docs/index.md` or build the docs locally with `make docs`.

For a page-by-page walkthrough of the current UI, see `docs/user-manual.md`.

### Getting data in — the Upload page

Start on the **Upload** page (sidebar: **U**) or press `Alt+1`.

1. Drag and drop a **CSV** or **Parquet** file onto the upload area, or click to browse.
2. A **preview** panel appears immediately showing every column's name, type, null count, min/max, and a small histogram — before any data is committed.
3. Optionally adjust partial-load settings:
   - **Column subset** — deselect columns you don't need to reduce memory use.
   - **Row limit / skip** — load only the first N rows, or skip the first N.
   - **Time slice** — restrict ingest to a specific date/time window.
4. Click **Ingest** to load the data. The app reloads automatically and reopens on the Upload page so you can confirm the new dataset before navigating elsewhere.

Your dataset stays in memory for the lifetime of the server process. Uploading a new file replaces the current dataset.

---

### Exploring time series — the Timeseries page

Navigate via the sidebar (**T**) or press `Alt+2`.

#### Selecting series

- Numeric columns appear as **chips** along the top of the chart area.
- Click a chip to toggle that column on/off in the chart.
- Each active series gets its own colored line. Click the **color swatch** on a chip to change it — color changes are instant and don't trigger a refetch.

#### Zooming

- **Scroll** (mouse wheel) or **drag** to zoom into a region.
- The server automatically refetches and resamples data for the new viewport.
- Use the **zoom history** buttons to step back, or press `Shift+R` to reset to the full dataset view.

#### Analysis readouts

A live status bar shows:
- Current visible time **range**
- **Y-range** of the visible portion
- **Cursor** coordinates as you hover
- **Clicked point** value when you click on the chart

#### Numeric range filters

- **Double right-click** a series chip to open its numeric range filter.
- Enter a min and/or max value to hide points outside that range in the rendered chart.
- Filters propagate to the scatter page automatically when linked filtering is active.

#### Adaptive line filters

Adaptive filters let you draw reference segments directly on the chart and filter data relative to them.

1. **Ctrl+click** a series chip to make it the adaptive filter target.
2. **Ctrl+click** two points on the chart to define a line segment.
3. Points above or below the segment are filtered out in the chart view.
4. Click **Clear Filter** to remove all adaptive segments.

#### Chart overlays and annotations

- Use the **toolbar** to add a chart title, X-axis label, or Y-axis label.
- Use **drawing tools** to place arrows or boxes on the chart for annotation.

#### Exporting

The toolbar export menu supports:

| Format | Contents |
|---|---|
| PNG | Screenshot of the current chart view |
| SVG | Vector version of the chart |
| HTML | Self-contained interactive chart file |
| CSV | Visible data points |
| JSON | Visible data points as JSON |

---

### Pair analysis — Correlation matrix and Pair plot pages

Navigate to Correlation matrix via the sidebar or press `Alt+4`, then open the Pair plot page from a matrix cell or the sidebar.

- The page opens with **correlation suggestions** — pairs of columns ranked by how strongly they correlate, to help you pick a useful X/Y combination.
- Select an **X column** and **Y column** from the dropdowns (or pick a suggested pair).
- In **Plot** view, switch between **Scatter** mode (individual sampled points) and **Density** mode (hexbin density heatmap).
- The current **time range and filters** from the Timeseries page are propagated into the scatter query automatically — zoom into a region on the Timeseries page, then check the Scatter page to see only those points.
- Optionally select a **color column** to encode a third variable as color. Choose a color scale from the dropdown below the chart.
- Use the **Plot / Matrix** toggle at the top of the page to switch into the scatter matrix without leaving the Scatter workflow.
- The matrix view renders a linked grid of pairwise cells, keeps the same filter context, and lets you click any cell to drill back into the detailed plot view.
- Distribution controls live in the same Scatter toolbar: choose `Histogram`, `KDE`, or `Box Plot` to change how the marginal views and matrix diagonals summarize the active pair.
- The scatter stats bar shows total and visible points, the current pair, and Pearson/Spearman values.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+1` | Go to Upload page |
| `Alt+2` | Go to Signals page |
| `Alt+3` | Go to Preparation page |
| `Alt+4` | Go to Correlation matrix page |
| `Alt+5` | Go to Spectrum page |
| `Alt+6` | Go to Time-frequency page |
| `Alt+7` | Go to Causality page |
| `Alt+8` | Go to Drift page |
| `Shift+R` | Reset chart zoom to full dataset view |
| `Ctrl+click` chip | Set series as adaptive filter target |
| `Ctrl+click` chart ×2 | Draw an adaptive filter segment |
| Double right-click chip | Open numeric range filter for that series |

---

## Runtime metrics

`GET /api/v1/metrics` returns a JSON snapshot of server-side counters; Prometheus-compatible text is available at `GET /api/v1/metrics/prometheus`:

- Total request counts per endpoint
- Cache hit/miss counts and current entry count
- Rate-limit rejection counts
- Scatter sampling stats
- Current dataset revision

This endpoint is useful for monitoring a shared deployment.

---

## Data format requirements

edatime expects your file to have:

- **At least one timestamp column** — ISO 8601 strings (`2023-01-15T08:30:00`), Unix epoch integers, or any format Polars can parse as datetime.
- **At least one numeric column** to plot.
- CSV files should have a header row. Parquet files are read as-is.

A minimal CSV example:

```csv
ts,temperature,pressure
2024-01-01T00:00:00,20.3,1013.2
2024-01-01T01:00:00,20.1,1013.5
2024-01-01T02:00:00,19.8,1013.8
```

---

## Project structure

```
edatime/
├── crates/
│   ├── edatime-core/     — Shared config, errors, metrics, expression and stats utilities
│   ├── edatime-ingest/   — CSV / Parquet loading, normalisation, profiling
│   ├── edatime-query/    — Query pipeline, filters, downsampling, cleaning, Arrow export
│   ├── edatime-store/    — Datasets, versions, artifacts, caches, jobs
│   ├── edatime-service/  — Axum routes, analytics, middleware, rate limiting
│   └── edatime-bin/      — The `edatime` executable (serves API + packaged frontend)
├── contracts/            — Canonical API route table (api-v1.json) and generated OpenAPI spec
├── frontend/
│   ├── index.html        — Application shell
│   ├── css/              — Plain CSS modules and design tokens
│   ├── libs/chartgpu/    — Vendored WebGPU chart library
│   └── src/              — TypeScript source, bundled by Vite
│       ├── app.ts        — Composition root; pages load lazily via app/pageModules.ts
│       ├── features/     — One folder per page (timeseries, prepare, scatter, fft, …)
│       ├── workspace/    — Cross-feature workspace store
│       └── services/api/ — HTTP / Arrow client (the only fetch boundary)
├── scripts/              — Build, dev server, contract generators, architecture checks
├── tests/                — Playwright end-to-end specs
├── docs/                 — Sphinx user, developer, and API reference docs
├── ETTm2.csv             — Built-in sample dataset
├── Dockerfile            — Multi-stage Docker build
└── Makefile              — Common build/run/check targets
```

See `AGENTS.md` for architecture rules and contributor workflow.

---

## Development

See [docs/developer-guide.md](docs/developer-guide.md) for the full development workflow.

Quick reference:

```bash
# Check all workspace targets and features
cargo check-all

# Lint with warnings treated as errors
cargo lint

# Run workspace and documentation tests
cargo test-all
cargo test-doc

# Run every Rust quality gate
make verify-rust

# Run the complete backend + frontend pre-merge gate
make verify

# Validate frontend syntax
npm run check:frontend

# Type-check TypeScript
npm run typecheck

# Build frontend for production (minified)
npm run build:frontend:prod

# Run benchmarks
cargo bench --workspace

# Security audit
cargo install cargo-audit --locked
cargo audit
```

### Using Make

Common targets are available via the included Makefile:

```bash
make build          # cargo build (debug)
make build-release  # cargo build --release
make run            # cargo run --release --bin edatime
make dev            # run Rust API + Vite frontend with live CSS/HMR
make dev-dist       # rebuild packaged frontend + cargo run --bin edatime
make check          # static Rust, frontend, contract, and hygiene checks
make test           # Rust and frontend tests
make verify-rust    # formatting, check, lint, tests, docs, benchmark build
make verify         # complete backend + frontend pre-merge gate
make frontend-prod  # minified frontend build (requires Node)
```

### Docker

Build and run as a container — no Rust toolchain or Node needed on the host:

```bash
docker build -t edatime .
docker run --rm -p 3000:3000 edatime

# Or pre-load a dataset:
docker run --rm -p 3000:3000 -v ./data:/data -e EDATIME_SAMPLE_DATA=/data/my_data.csv edatime
```
