# edatime

edatime is a self-hosted, browser-based time-series exploratory data analysis (EDA) tool. You point it at a CSV or Parquet file, and it gives you an interactive multi-series chart, scatter analytics, column profiling, and filtering — all rendered with GPU-accelerated graphics directly in your browser.

The backend is written in Rust (Axum + Polars) and streams data as Apache Arrow IPC for fast, low-overhead transport. The frontend is plain HTML and JavaScript with no framework dependency, using ChartGPU for WebGPU-accelerated rendering.

---

## Installation

### Requirements

| **Rust stable toolchain** | Install from [rustup.rs](https://rustup.rs) |
| **A modern browser** | Chrome 113+, Edge 113+, or any browser with WebGPU support recommended. Firefox works via a Canvas fallback. |
| **Node.js** *(optional)* | Only needed for development workflow; runtime does not require npm |

There are no native dependencies, no database, and no external services to configure. The backend compiles to a single binary that serves the frontend itself.

### Build

Clone the repository and compile in release mode for best performance:

```bash
git clone <repo-url>
cd edatime
cargo build --release
```

The compiled binary lands at `target/release/edatime`.

For a quick development build (faster compile, slower runtime):

```bash
cargo build
```

**Note:** The build process is pure Rust - no npm or Node.js required for distribution. ChartGPU is fully vendored in `frontend/libs/chartgpu/`.

---

## Running

### Start the server

```bash
cargo run --release
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
EDATIME_SAMPLE_DATA=./my_data.csv cargo run --release
```

### Configuration

You can tune the server via a `config.toml` file or environment variables. All settings are optional — the defaults work out of the box.

**Using a config file:**

```bash
EDATIME_CONFIG=./config.toml cargo run --release
```

**Example `config.toml`:**

```toml
[server]
host = "0.0.0.0"
port = 8080

[cache]
ttl_seconds = 120
max_entries = 256
max_bytes = 67108864   # 64 MB

[rate_limit]
max_requests = 200
window_seconds = 60

[upload]
max_upload_bytes = 536870912   # 512 MB

[data]
sample_data_path = "./my_data.csv"
```

**Environment variable overrides** (take precedence over the config file):

| Variable | Default | Description |
|---|---|---|
| `EDATIME_HOST` | `127.0.0.1` | Bind address |
| `EDATIME_PORT` | `3000` | Listen port |
| `EDATIME_SAMPLE_DATA` | *(none)* | CSV/Parquet file to load on startup |
| `EDATIME_CACHE_TTL_SECONDS` | `60` | How long query cache entries live |
| `EDATIME_RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per client per window |
| `EDATIME_MAX_UPLOAD_BYTES` | `268435456` | Max upload file size (256 MB) |

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

### Scatter and density analysis — the Scatter page

Navigate via the sidebar (**S**) or press `Alt+3`.

- The page opens with **correlation suggestions** — pairs of columns ranked by how strongly they correlate, to help you pick a useful X/Y combination.
- Select an **X column** and **Y column** from the dropdowns (or pick a suggested pair).
- Switch between **Scatter** mode (individual sampled points) and **Density** mode (hexbin density heatmap).
- The current **time range and filters** from the Timeseries page are propagated into the scatter query automatically — zoom into a region on the Timeseries page, then check the Scatter page to see only those points.
- Optionally select a **color column** to encode a third variable as color. Choose a color scale from the dropdown below the chart.
- The scatter legend and stats panel shows the count of visible points and zoom level.

---

### Scatter matrix — the Matrix page

Navigate via the sidebar (**M**).

- Renders a grid of scatter plots for every pair of active numeric columns in one view.
- Click any cell to open that pair on the full Scatter page for deeper analysis.

---

### Distributions page

Navigate via the sidebar (**D**).

- Shows distribution cards (histogram + stats) for the columns currently active on the Scatter page.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+1` | Go to Upload page |
| `Alt+2` | Go to Timeseries page |
| `Alt+3` | Go to Scatter page |
| `Shift+R` | Reset chart zoom to full dataset view |
| `Ctrl+click` chip | Set series as adaptive filter target |
| `Ctrl+click` chart ×2 | Draw an adaptive filter segment |
| Double right-click chip | Open numeric range filter for that series |

---

## Runtime metrics

`GET /api/metrics` returns a JSON snapshot of server-side counters:

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
├── src/
│   ├── main.rs           — Axum router and server startup
│   ├── config.rs         — Configuration loading and defaults
│   ├── ingest.rs         — CSV / Parquet ingestion
│   ├── pipeline.rs       — Filter, downsample, and serialize pipeline
│   ├── downsample.rs     — MinMaxLTTB downsampling integration
│   ├── arrow_export.rs   — Apache Arrow IPC serialization
│   ├── query.rs          — Shared query parsing helpers
│   ├── cache.rs          — In-memory response cache
│   ├── rates.rs          — Per-client rate limiting
│   ├── metrics.rs        — Runtime counters
│   └── routes/           — HTTP route handlers
├── frontend/
│   ├── index.html        — Application shell
│   ├── css/style.css     — Dark UI styling
│   └── src/              — TypeScript source (compiled to js/ by esbuild)
│       ├── app.ts        — Bootstrap and page orchestration
│       ├── chart/
│       │   ├── DataChart.ts         — Time-series chart adapter (ChartGPU)
│       │   ├── FftChart.ts          — FFT / PSD chart adapter
│       │   ├── chartInteractions.ts — Shared chart interaction utilities
│       │   ├── colorScale.ts        — Color scale helpers
│       │   └── ticks.ts             — Axis tick formatting
│       ├── dataClient.ts — HTTP/Arrow fetch helpers
│       ├── scatter/       — Scatter/density analytics page
│       ├── state.ts      — Shared frontend state
│       ├── utils/dom.ts  — DOM utilities (debounce, escapeHtml, download)
│       └── ui/           — Series chips, toolbar, upload, profile grid
├── scripts/
│   ├── build-frontend.mjs — esbuild bundler (--prod for minification)
│   └── check-frontend.mjs — Syntax validator
├── docs/
│   └── developer-guide.md — Development, benchmarks, CI details
├── Dockerfile            — Multi-stage Docker build
├── Makefile              — Common build/run targets
├── sample.csv            — Minimal example dataset
└── Cargo.toml
```

---

## Development

See [docs/developer-guide.md](docs/developer-guide.md) for the full development workflow.

Quick reference:

```bash
# Check for compile errors
cargo check --all-targets

# Run tests
cargo test

# Validate frontend syntax
npm run check:frontend

# Type-check TypeScript
npm run typecheck

# Build frontend for production (minified)
npm run build:frontend:prod

# Run benchmarks
cargo bench --bench pipeline_bench

# Security audit
cargo install cargo-audit --locked
cargo audit
```

### Using Make

Common targets are available via the included Makefile:

```bash
make build          # cargo build (debug)
make build-release  # cargo build --release
make run            # cargo run --release
make dev            # build frontend + cargo run (debug)
make check          # cargo check + clippy + tsc
make test           # cargo test + frontend syntax check
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
