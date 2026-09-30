# frontend/src/contracts/api/v1/
> Canonical TypeScript contract registry for every `/api/v1/*` endpoint.
> **Single source of truth** for URL paths and request/response payload shapes
> on the frontend side. Pinning tests live in `routes.test.ts`.

## Files

| File | Role |
| --- | --- |
| `routes.ts` | Canonical URL path constants for every `/api/v1/*` endpoint. Adding a new endpoint? Add the path here first. |
| `routes.test.ts` | Pinned-path test suite — fails if a route is renamed without updating callers. |
| `dataset.ts` | Dataset metadata + upload preview types. |
| `scatter.ts` | Scatter points / matrix / correlations types. |
| `analytics.ts` | Anomalies / FFT / spectrogram / spectral-filter / rolling / outlier / transform / causal types. |
| `index.ts` | Public re-exports. |

> Backend matcher: `crates/edatime-service/src/handlers/routes/mod.rs` and
> `crates/edatime-service/src/handlers/scatter/{points,matrix,correlations,export}.rs`.
