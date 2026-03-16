# edatime Developer Guide

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

Frontend syntax validation:

```bash
npm run check:frontend
```

Combined local validation sequence:

```bash
cargo fmt --check
cargo check --all-targets
cargo test
npm run check:frontend
```

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
- `Shift+R` resets the main chart zoom
- `Shift+Z` zooms out one step on the main chart
- `Shift+C` clears adaptive line filters on the main chart
- `Shift+E` exports visible filtered data as CSV for the active page

## Phase 4 feature notes

The scatter page now includes:

- a compact scatter matrix tied to the active query context
- distribution cards for the selected axes and color column
- CSV and JSON export of visible filtered scatter rows

The main chart toolbar now includes CSV and JSON export of filtered series rows.