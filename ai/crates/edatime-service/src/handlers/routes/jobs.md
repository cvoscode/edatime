# crates/edatime-service/src/handlers/routes/jobs.rs
> Read-only operational visibility for session-scoped admitted work. The registry itself lives in `edatime-store/jobs`; these handlers wrap it as HTTP.

## Handlers
- `pub async fn list_jobs(State(state): State<AppState>) -> Json<Vec<JobRecord>>` → `GET /api/v1/jobs`
  - Returns the current snapshot of all jobs in insertion order.
- `pub async fn get_job(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<JobRecord>, AppError>` → `GET /api/v1/jobs/{id}`
  - 400 `bad_request` (`"Unknown session job"`) when `id` is not in the registry.
- `pub async fn cancel_job(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<JobRecord>, AppError>` → `DELETE /api/v1/jobs/{id}`
  - Same 400 sentinel when unknown; for known jobs, transitions per `JobRegistry::cancel` (`Queued` → `Cancelled`, `Running`/`Cancelling` → `Cancelling`, others → no-op).

## Cross-references
- `JobRecord`, `JobKind`, `JobStatus`, `JobRegistry`, `JobHandle`: see [`../../edatime-store/src/jobs.md`](../../edatime-store/src/jobs.md).
- `AppState`: see [`../../edatime-store/src/state.md`](../../edatime-store/src/state.md).
- Producer routes (the only routes that create jobs in the registry today): `cleaning::apply` (`POST /api/v1/cleaning/apply` → `JobKind::Materialization`), `metadata::start_profile_mode` (`POST /api/v1/profile`, `POST /api/v1/profile/sample` → `JobKind::Profile`).

## Notes
- These handlers expose the live `JobRegistry` directly; there is no pagination, filtering, or persistence — restart drops all records (the registry is session-scoped).
- Cancellation is cooperative: producers must check `JobHandle::is_cancelled()` at safe stage boundaries.
