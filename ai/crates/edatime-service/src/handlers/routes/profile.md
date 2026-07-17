# crates/edatime-service/src/handlers/routes/profile.rs
> ⚠️ The handler implementations for `/api/v1/profile` and `/api/v1/profile/sample` are **not** in a dedicated `profile.rs` module. They live in [`metadata.rs`](./metadata.md) and are wired in [`routes/mod.rs`](./mod.md).

## Routes
- `GET /api/v1/profile` → `metadata::get_profile` (cached exact column profile for the active source).
- `POST /api/v1/profile` → `metadata::start_profile` (starts / reuses a `JobKind::Profile` job for the exact profile; `algorithm_version = "exact-v1"`).
- `GET /api/v1/profile/sample` → `metadata::get_sample_profile` (cached bounded sampled profile, marked `profile_status = "sampled"`).
- `POST /api/v1/profile/sample` → `metadata::start_sample_profile` (starts / reuses a `JobKind::Profile` job bounded to `SAMPLED_PROFILE_ROW_CAP = 10_000` rows; `algorithm_version = "sample-v1"`).

## Response shape
- `ProfileResponse { total_rows, columns, time_range, column_profiles: Vec<ColumnProfile>, profile_status: "immediate" | "exact" | "sampled", profile_sample_rows: Option<usize>, algorithm_version, ... }`

## Background work
- Both start handlers admit a session-scoped `JobKind::Profile` job; the cache key is `profile_cache_key(version, algorithm_version)`. See [`../../edatime-store/src/jobs.md`](../../edatime-store/src/jobs.md) for lifecycle semantics.

## Notes
- Immediate metadata responses (before a profile job completes) leave `column_profiles` empty and use `profile_status = "immediate"` so the frontend can render a profile grid without waiting for full statistics.
- Sampled profiles always declare `profile_status = "sampled"` and report the bounded `profile_sample_rows` value used to compute them.
