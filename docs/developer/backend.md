# Backend Architecture

## Server Setup

`src/main.rs` loads configuration, ingests optional sample data, constructs shared application state, and mounts the router twice:

- `/api/*`
- `/api/v1/*`

The same binary also serves the frontend static files from `frontend/`.

## Shared State

The active dataset is held in shared state and accessed by route handlers. The repository conventions prefer short lock lifetimes and lazy Polars operations where practical.

The backend also owns:

- runtime metrics
- request-rate limiting
- upload-size enforcement
- cache state
- optional database connection state

## Route Families

`src/routes/mod.rs` groups the API into these families:

- `data`
- `aggregate`
- `metadata`
- `metrics`
- `scatter`
- `upload`
- `database`
- `config`
- `analytics`
- `export`

## Transports

EdaTime intentionally uses mixed transports:

- Arrow IPC for large tabular timeseries data
- JSON for nested metadata, scatter payloads, and control-oriented responses

This split keeps the heavy path efficient without forcing every endpoint into a columnar shape.

## Analytics Endpoints

The analytics router currently exposes:

- rolling statistics
- anomaly detection
- FFT
- spectrogram
- causal graph generation
- time distributions
- outlier removal

Dataset-changing analytics such as transforms and outlier removal should remain explicit and well-scoped because they affect every downstream page.

## Backend Extension Guidelines

- Return `Result<impl IntoResponse, AppError>` for route handlers where possible.
- Prefer `tracing` over ad-hoc printing.
- Avoid `unwrap()` and `expect()` on production paths.
- Keep Arrow serialization centralized.
- Keep new route contracts documented in both the docs site and the repository-level README or guide where appropriate.