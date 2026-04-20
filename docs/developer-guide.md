# EdaTime Developer Guide

## Local development

Run the app:

```bash
cargo run
```

Use a custom config file:

```bash
EDATIME_CONFIG=./config.toml cargo run
```

The app serves the frontend from `frontend/` and listens on `127.0.0.1:3000` by default.

## Validation

Backend validation:

```bash
cargo check --all-targets
cargo test
```

Frontend syntax validation (pure Rust):

```bash
cargo run --bin validate_frontend
```

Optional development workflow with Node.js:

```bash
npm run check:frontend
npm run typecheck          # TypeScript type-check (no emit)
npm run build:frontend     # dev build with sourcemaps
npm run build:frontend:prod # minified production build
npm run watch:frontend     # watch mode for dev
```

Combined local validation sequence (pure Rust):

```bash
cargo fmt --check
cargo check --all-targets
cargo test
cargo run --bin validate_frontend
```

## Documentation

The repository includes a Sphinx + Read the Docs documentation site under `docs/`.

Local docs build:

```bash
python -m pip install -r docs/requirements.txt
python -m sphinx -b html docs docs/_build/html
```

Convenience Make targets:

```bash
make docs
make docs-clean
```

Start at `docs/index.md` for the structured documentation entry point.

## Benchmarks

The repository exposes a reusable library target so internal pipeline code can be benchmarked directly.

Compile and run the Criterion benchmarks:

```bash
cargo bench --bench pipeline_bench
```

Current benchmark coverage:

- Time-range filtering plus LTTB reduction on a synthetic multi-series dataset
- Metadata profiling on a synthetic dataset with histograms enabled

If you change filtering, downsampling, or metadata profiling behavior, rerun the benchmark and compare regressions before merging.

## CI and release checks

The main CI workflow lives in `.github/workflows/ci.yml` and runs:

- `cargo fmt --check`
- `cargo check --all-targets`
- `cargo test`
- `npm run check:frontend`
- `cargo bench --bench pipeline_bench --no-run`

This is intentionally a validation pipeline, not a deployment pipeline. There is no production release automation in the repository yet.

## Docker

A multi-stage `Dockerfile` is included for containerized builds:

```bash
docker build -t edatime .
docker run --rm -p 3000:3000 edatime
```

The image uses `rust:1.86-bookworm` for the build stage and `debian:bookworm-slim` for the runtime — no Node.js required. The final image contains only the compiled binary and the frontend static files.

## Makefile

Common targets:

| Target | Description |
|---|---|
| `make build` | Debug build |
| `make build-release` | Release build |
| `make run` | Run in release mode |
| `make dev` | Build frontend + run in debug mode |
| `make check` | `cargo check` + `clippy` + `tsc` |
| `make test` | `cargo test` + frontend syntax check |
| `make frontend-prod` | Minified production frontend build |
| `make docker` | Build Docker image |
| `make docker-run` | Run Docker image |

## Security process

The automated dependency audit lives in `.github/workflows/security.yml`.

Local dependency audit:

```bash
cargo install cargo-audit --locked
cargo audit
```

The current security posture in the app is centered on:

- upload-size enforcement
- request validation
- per-client rate limiting
- short-lived in-memory caches tied to dataset revision
- CSP headers for the frontend shell

See `SECURITY.md` for reporting expectations.

## Keyboard shortcuts

Current chart and navigation shortcuts:

- `Alt+1` opens the upload page
- `Alt+2` opens the main chart page
- `Alt+3` opens the scatter page
- `Alt+4` opens the scatter matrix page
- `Alt+5` opens the distributions page
- `Alt+6` opens the FFT page
- `Alt+7` opens the correlation heatmap page
- `Alt+8` opens the spectrogram page
- `Alt+9` opens the causal page
- `Shift+R` resets the main chart zoom
- `Shift+Z` zooms out one step on the main chart
- `Shift+C` clears adaptive line filters on the main chart
- `Shift+E` exports visible filtered data as CSV for the active page

## API reference

All routes are available under both `/api/` and `/api/v1/`.

### Data

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/data` | Time-filtered, downsampled series data (Arrow IPC) |
| `GET` | `/api/metadata` | Dataset schema, numeric columns, time range, profiles |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/metrics` | Runtime metrics (request counts, caching, rate limiting) |

Query params for `/api/data`: `start`, `end`, `width`, `columns`.

### Aggregation

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/aggregate` | Aggregated stats (Arrow IPC or JSON) |

### Scatter analytics

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/scatter/correlations` | Correlation suggestions and candidate columns |
| `GET` | `/api/scatter/correlations/matrix` | Full NxN Pearson + Spearman correlation matrix |
| `GET`/`POST` | `/api/scatter/points` | Scatter data points with optional color column |

### Analytics

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/analytics/remove_outliers` | Remove outliers (zscore/IQR, optional windowed) |
| `GET` | `/api/analytics/time_distributions` | Distribution histograms across time windows |
| `POST` | `/api/analytics/transform` | Apply column transforms |

### Upload

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload CSV/Parquet with optional column subset and time slicing |
| `POST` | `/api/upload/preview` | Preview upload metadata and column profiles |

### Export

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/export/parquet` | Export filtered dataset as Parquet |

### Configuration

Runtime configuration via `config.toml` or environment variables:

| Setting | Env var | Default |
|---|---|---|
| Server host | `EDATIME_HOST` | `127.0.0.1` |
| Server port | `EDATIME_PORT` | `3000` |
| Sample data path | `EDATIME_SAMPLE_DATA` | `sample.csv` |
| Cache TTL (seconds) | `EDATIME_CACHE_TTL_SECONDS` | `60` |
| Cache max entries | `EDATIME_CACHE_MAX_ENTRIES` | `64` |
| Cache max bytes | `EDATIME_CACHE_MAX_BYTES` | `67108864` |
| Rate limit requests | `EDATIME_RATE_LIMIT_MAX_REQUESTS` | `1000` |
| Rate limit window | `EDATIME_RATE_LIMIT_WINDOW_SECONDS` | `60` |
| Max upload size | `EDATIME_MAX_UPLOAD_BYTES` | `268435456` |
| Database URL | `EDATIME_DATABASE_URL` | — |
| Database backend | `EDATIME_DATABASE_BACKEND` | `none` |

## Phase 4 feature notes

The scatter page now includes:

- a compact scatter matrix tied to the active query context
- distribution cards for the selected axes and color column
- CSV and JSON export of visible filtered scatter rows

The main chart toolbar now includes CSV and JSON export of filtered series rows.