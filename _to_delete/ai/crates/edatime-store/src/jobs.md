# crates/edatime-store/src/jobs.rs
> Session-scoped background-job registry. Operational metadata only — restart expires the registry; live jobs get stable IDs, observable state transitions, and cooperative cancellation.

## Enums
- `pub enum JobKind { Ingest, Profile, Materialization, Export, Analytics }` (snake_case JSON)
- `pub enum JobStatus { Queued, Running, Cancelling, Cancelled, Completed, Failed, Expired }` (snake_case JSON)

## Structs
- `pub struct JobRecord { id, kind, status, created_at, started_at?, finished_at?, progress_percent?: Option<u8>, message?: Option<String> }` — Serializable view (camelCase JSON).
- `pub struct JobHandle { id: String, cancelled: Arc<AtomicBool> }` — Cloneable handle returned to workers; `id` is `job-{16-hex}`.

## Handle methods
- `JobHandle::id() -> &str`
- `JobHandle::is_cancelled() -> bool` — Loads the cooperative cancellation flag (Acquire).

## `JobRegistry` methods
- `JobRegistry::new() -> Self`, `Default::default()`
- `JobRegistry::create(kind: JobKind) -> JobHandle` — Allocates `job-{hex}`, inserts with `status=Queued, progress=0`.
- `JobRegistry::start(handle: &JobHandle) -> bool` — Returns `false` if job missing, already cancelled (transitions to `Cancelled`), or not `Queued`. Sets `started_at`.
- `JobRegistry::update_progress(handle, percent: u8, message: Option<String>) -> bool` — Clamps `percent` to `100`; rejects unless status is `Running`.
- `JobRegistry::complete(handle) -> bool` / `JobRegistry::fail(handle, message: String) -> bool` — Terminal transitions; `finish()` short-circuits to `Cancelled` if `cancelled` is set.
- `JobRegistry::cancel(id: &str) -> Option<JobRecord>` — From `Queued`: cancels immediately. From `Running`/`Cancelling`: stores cancellation flag and moves to `Cancelling`. Other statuses are no-ops (returns current record).
- `JobRegistry::record(id: &str) -> Option<JobRecord>` — Single lookup (cloned).
- `JobRegistry::list() -> Vec<JobRecord>` — Snapshot of all jobs in insertion order.

## Module-private helpers
- `fn lock_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T>` — Recovers from poisoning by returning the inner value.

## Notes
- `Arc<AtomicBool>` is the cooperative cancellation signal; long stages must call `JobHandle::is_cancelled()` at safe boundaries (see cleaning::apply).
- No persistence: restart drops all records (treated as `Expired` from a client perspective).
