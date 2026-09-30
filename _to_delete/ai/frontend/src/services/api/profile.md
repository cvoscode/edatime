# frontend/src/services/api/profile.ts
> Dataset-profile API client. Wraps the `/api/v1/profile` and `/api/v1/profile/sample` endpoints to start and read version-keyed exact and sampled profile jobs.

## Functions
- `startDatasetProfile(options?: ApiRequestOptions): Promise<DatasetProfileResponse>` — `POST /api/v1/profile`. Starts (or reuses) the version-keyed exact profile for the active source.
- `fetchDatasetProfile(options?: ApiRequestOptions): Promise<DatasetProfileResponse>` — `GET /api/v1/profile`. Reads the current exact-profile cache and session-job state.
- `startSampledDatasetProfile(options?: ApiRequestOptions): Promise<DatasetProfileResponse>` — `POST /api/v1/profile/sample`. Starts (or reuses) the bounded sample-v1 profile for the active source.
- `fetchSampledDatasetProfile(options?: ApiRequestOptions): Promise<DatasetProfileResponse>` — `GET /api/v1/profile/sample`. Reads the sampled profile cache and session-job state.

## Types
- `DatasetProfileResponse` [deps: ../../contracts/api/v1/dataset.ts] — server response shape.

<!-- internal deps -->
[routes]: ../../contracts/api/v1/routes.md
[dataset]: ../../contracts/api/v1/dataset.md