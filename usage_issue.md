# EdaTime Usage Issues — Current Code-Grounded Audit

This file is a corrected audit of the current `/home/crispy/edatime` checkout.
It keeps the original Data Scientist perspective, but it now distinguishes:

- `Confirmed`: current defect or contract gap in live code
- `Fixed/Stale`: no longer true in the current checkout
- `Enhancement`: valid improvement idea, but not a current bug

Dataset used for the original walkthrough: **ETTm2**
(`date, HUFL, HULL, MUFL, MULL, LUFL, LULL, OT`, 69,680 rows, 15-minute cadence).

---

## 1. Navigation & startup

### 1.1 Sample dataset button on the home page does nothing
**Status:** Confirmed  
**Severity:** High

**Current root cause:** The sample-dataset handlers are still wired lazily via
[frontend/src/app/shell/deferredSubsystems.ts](frontend/src/app/shell/deferredSubsystems.ts),
but the initial home-page navigation can run before `window.__edatime.ensureSubsystem`
is installed.

- [frontend/src/app/shell/core.ts](frontend/src/app/shell/core.ts) calls `initPages()`.
- That reaches [frontend/src/ui/pageNavigation.ts](frontend/src/ui/pageNavigation.ts),
  which immediately calls `showPage(getHashPage() ?? 'home')`.
- Inside that first `showPage('home')`, `win.__edatime?.ensureSubsystem?.('home')`
  is still optional and can be absent.
- The bridge is only attached later in
  [frontend/src/app/shell.ts](frontend/src/app/shell.ts).

**Effect:** The initial home render can skip `ensureSubsystem('home')`, so
[frontend/src/app/shell/sampleDatasets.ts](frontend/src/app/shell/sampleDatasets.ts)
never binds the click handlers for the sample dataset cards.

**DS impact:** First-run onboarding is broken without manual upload or API usage.

### 1.2 URL hash duplicates on every navigation
**Status:** Fixed/Stale

The current router implementation in
[frontend/src/utils/router.ts](frontend/src/utils/router.ts) uses
`URLSearchParams.set('page', ...)` and I did not find a second live hash writer
that appends duplicate `page=` entries. Keep this out of the active issue list
unless it is reproduced again in the browser.

### 1.3 Initial page sometimes sticks on "Home"
**Status:** Fixed/Stale

The old suspicion is no longer accurate. Session restore now explicitly prefers
the hash page when one is present:

- [frontend/src/bootstrap/sessionBootstrap.ts](frontend/src/bootstrap/sessionBootstrap.ts)
  passes `preferHashPage: !!getHashPage()`
- [frontend/src/utils/session.ts](frontend/src/utils/session.ts) skips saved-page
  navigation when that flag is set

### 1.4 Ship ETTm2 preloaded
**Status:** Enhancement

This is a product/workflow suggestion, not a root cause of the startup bug.

---

## 2. Time-series data path (`GET /api/data`)

### 2.1 `width` is capped at 20,000 pixels
**Status:** Confirmed  
**Severity:** Medium

**Current root cause:** This is an intentional validation cap, not an accidental
limit hidden deeper in the stack.

- [crates/edatime-query/src/validation.rs](crates/edatime-query/src/validation.rs)
  rejects widths above `limits.max_viewport_width`
- [crates/edatime-core/src/config.rs](crates/edatime-core/src/config.rs)
  sets that default to `20_000`

### 2.2 `width=1` returns raw data instead of downsampling
**Status:** Confirmed  
**Severity:** Medium

**Current root cause:** The reduction target is derived as `width * 2`, and
the downsampler intentionally keeps every row when the target is below `3`.

- [crates/edatime-service/src/handlers/routes/data.rs](crates/edatime-service/src/handlers/routes/data.rs)
  sets `target_points = params.width * 2`
- [crates/edatime-query/src/downsample.rs](crates/edatime-query/src/downsample.rs)
  returns all rows when `target_points < 3`

So `width=1` effectively becomes a raw-data escape hatch.

### 2.3 Future / out-of-range windows silently return an empty Arrow payload
**Status:** Confirmed  
**Severity:** Medium

**Current root cause:** The route filters and serializes whatever remains, but
it does not add any explicit empty-range signal.

- [crates/edatime-service/src/handlers/routes/data.rs](crates/edatime-service/src/handlers/routes/data.rs)
  validates the time order and width, then executes the filter pipeline
- No dataset-boundary precheck or `x-edatime-empty` header is emitted

### 2.4 Reversed time range returns a specific 400
**Status:** Not an issue

The validation path is already good here:
[crates/edatime-query/src/validation.rs](crates/edatime-query/src/validation.rs)
returns `Start time must be before end time`.

### 2.5 `width=0` raw-data sentinel does not exist
**Status:** Enhancement

This is currently unsupported by design. The route rejects `width == 0` in
[crates/edatime-query/src/validation.rs](crates/edatime-query/src/validation.rs).

### 2.6 No response metadata for rows dropped by filtering / non-finite cleanup
**Status:** Confirmed  
**Severity:** Low

**Current root cause:** Standard response metadata only tracks:

- downsampled flag
- returned rows
- target points

That header set is assembled in
[crates/edatime-store/src/cache.rs](crates/edatime-store/src/cache.rs), and the
pipeline does not expose finer-grained drop reasons as response metadata.

---

## 3. Scatter / density

### 3.1 Datetime color columns are encoded as raw epoch milliseconds
**Status:** Confirmed  
**Severity:** High

**Current root cause:** Temporal color columns are still classified as
continuous numeric values.

- [crates/edatime-service/src/handlers/scatter/sample.rs](crates/edatime-service/src/handlers/scatter/sample.rs)
  treats `Datetime(_, _)` and `Date` as continuous
- [crates/edatime-service/src/handlers/scatter/collect.rs](crates/edatime-service/src/handlers/scatter/collect.rs)
  converts temporal columns to epoch-ms `f64`

That makes the color bar technically valid but semantically poor for DS use.

### 3.2 String / categorical color has no documented or enforced cardinality policy
**Status:** Confirmed  
**Severity:** Medium

**Current root cause:** Non-numeric color columns are passed through as labels
without cardinality reduction.

- [crates/edatime-service/src/handlers/scatter/collect.rs](crates/edatime-service/src/handlers/scatter/collect.rs)
  simply casts to strings in `series_to_label_values(...)`

There is no cap, hashing, bucketing, or legend summary policy in the current path.

### 3.3 Scatter LTTB can undershoot the requested `limit`
**Status:** Confirmed  
**Severity:** Medium

**Current root cause:** Sampling delegates to `minmaxlttb`, then sorts and
deduplicates the selected indices.

- [crates/edatime-query/src/downsample.rs](crates/edatime-query/src/downsample.rs)
  calls `minmaxlttb(...)`
- the sampled indices are later `sort_unstable()` + `dedup()`

The handler already exposes both requested and actual counts, but the contract
still reads like `limit == exact returned rows`.

### 3.4 `format=json` is ignored on `/api/scatter/points`
**Status:** Confirmed  
**Severity:** Medium

**Current root cause:** The query struct exposes `format`, but the response path
always constructs an Arrow response.

- [crates/edatime-service/src/handlers/scatter/mod.rs](crates/edatime-service/src/handlers/scatter/mod.rs)
  defines `format: Option<String>`
- [crates/edatime-service/src/handlers/scatter/points.rs](crates/edatime-service/src/handlers/scatter/points.rs)
  always ends with `CachedResponse::arrow(...)`

The `format` value currently only influences the cache key.

### 3.5 `Accept: application/json` is ignored on scatter, and aggregate also always returns Arrow
**Status:** Confirmed  
**Severity:** Low

There is no content negotiation path for scatter, and
[crates/edatime-service/src/handlers/routes/aggregate.rs](crates/edatime-service/src/handlers/routes/aggregate.rs)
also always serializes Arrow even though `AggregateQuery` includes a `format` field.

### 3.6 `/api/scatter/points` defaults `limit` to 1,000,000
**Status:** Confirmed  
**Severity:** Low

**Current root cause:** [crates/edatime-service/src/handlers/scatter/mod.rs](crates/edatime-service/src/handlers/scatter/mod.rs)
still sets `default_scatter_limit()` to `1_000_000`.

### 3.7 Scatter caching works, but the TTL is short
**Status:** Enhancement

This is no longer a correctness bug. Identical requests can hit cache correctly.
The real limitation is the short cache policy:

- [crates/edatime-store/src/cache.rs](crates/edatime-store/src/cache.rs)
  uses `ttl = 60s`
- the emitted response header is `cache-control: public, max-age=60`

---

## 4. Upload preview vs ingest dtype mismatch

### 4.1 Preview reports pre-normalized temporal dtype
**Status:** Confirmed  
**Severity:** Medium

**Current root cause:** Preview metadata and real ingest take different paths.

- Preview uses
  [crates/edatime-service/src/handlers/routes/upload.rs](crates/edatime-service/src/handlers/routes/upload.rs)
  -> [crates/edatime-service/src/handlers/routes/metadata.rs](crates/edatime-service/src/handlers/routes/metadata.rs),
  which reports the scanned dtype string
- Real ingest uses
  [crates/edatime-ingest/src/ingest.rs](crates/edatime-ingest/src/ingest.rs),
  which normalizes temporal columns to `Datetime(Milliseconds)`

So the mismatch is a metadata/display inconsistency, not a storage inconsistency.

---

## 5. Analytics endpoint contracts

This section needed correction. The old version overstated a single shared root
cause. The current picture is narrower and more specific.

### 5.1 `remove_outliers` and `causal` expect comma-separated `columns`, not `string[]`
**Status:** Confirmed  
**Severity:** Medium

**Current root cause:** Both request structs still deserialize `columns` as
`Option<String>`, not `Vec<String>`.

- [crates/edatime-service/src/handlers/routes/analytics.rs](crates/edatime-service/src/handlers/routes/analytics.rs)
  defines `OutlierRemovalRequest.columns: Option<String>`
- the same file defines `CausalGraphRequest.columns: Option<String>`

The frontend already follows this contract by sending `columns.join(',')`.

### 5.2 Sending singular `column` to those endpoints produces a misleading validation error
**Status:** Confirmed  
**Severity:** Medium

**Current root cause:** These serde structs do not use `deny_unknown_fields`.
`column` is silently ignored, `columns` stays `None`, and later validation emits
`No valid numeric columns were requested`.

This is a real contract sharp edge.

### 5.3 `POST /api/transform` is strict by design, not part of the same drift
**Status:** Correction

The transform route intentionally requires:

- `expression`
- `output_name`

That contract is defined in
[crates/edatime-service/src/handlers/routes/analytics.rs](crates/edatime-service/src/handlers/routes/analytics.rs)
and the frontend already matches it in
[frontend/src/services/api/analytics.ts](frontend/src/services/api/analytics.ts).

### 5.4 `POST /api/drift/investigate` is a different, stricter contract
**Status:** Correction

`/api/drift/investigate` is intentionally not part of the same issue:

- [crates/edatime-service/src/handlers/routes/drift.rs](crates/edatime-service/src/handlers/routes/drift.rs)
  defines `columns: Vec<String>`
- it also uses `deny_unknown_fields`

So sending singular `column` fails immediately and correctly there.

### 5.5 Missing contract documentation remains a real gap
**Status:** Confirmed  
**Severity:** Medium

The backend contracts are still uneven enough that an API reference or OpenAPI
surface would save time and reduce trial-and-error.

---

## 6. Performance observations

### 6.1 `/api/data` performance is solid
**Status:** Informational

No current issue here.

### 6.2 `/api/drift/stats` returns a heavy payload on large windows
**Status:** Confirmed  
**Severity:** Medium

**Current root cause:** Every drift window carries repeated distribution payloads:

- histogram bin edges and counts
- ECDF arrays
- quantiles and descriptive stats

Those fields are part of
[crates/edatime-service/src/analytics/drift.rs](crates/edatime-service/src/analytics/drift.rs)
via `WindowDistributionStats` and `DriftWindowStats`.

### 6.3 `/api/analytics/fft` ignores FFT tuning params the page might conceptually want
**Status:** Confirmed  
**Severity:** Low

**Current root cause:** The route contract is intentionally narrow.

- [crates/edatime-service/src/handlers/routes/analytics.rs](crates/edatime-service/src/handlers/routes/analytics.rs)
  defines `FftQuery` with only `start`, `end`, `columns`, and `max_points`

So extra params like `window_size` are not being "forgotten" later; they are not
part of the route contract at all.

---

## 7. Smaller issues and enhancements

### 7.1 `/api/health` only returns `{ "status": "ok" }`
**Status:** Enhancement

This is still true in
[crates/edatime-service/src/handlers/routes/mod.rs](crates/edatime-service/src/handlers/routes/mod.rs).

### 7.2 Timeseries fetches do not short-circuit no-op requests
**Status:** Confirmed  
**Severity:** Low

**Current root cause:** The page controller always refetches when the state is
valid; there is no last-request equivalence check.

- [frontend/src/pages/timeseriesPage.ts](frontend/src/pages/timeseriesPage.ts)
  recomputes the request and fetches on each selection change
- [frontend/src/services/api/timeseries.ts](frontend/src/services/api/timeseries.ts)
  uses `cache: 'no-store'`

There is in-flight dedupe, but no reuse of the previous identical response body.

### 7.3 Matrix metadata is base64-encoded in a response header
**Status:** Enhancement

This is a transport clarity problem, not a correctness bug.

- [crates/edatime-service/src/handlers/scatter/matrix.rs](crates/edatime-service/src/handlers/scatter/matrix.rs)
  base64-encodes `x-edatime-matrix-cells`
- [frontend/src/services/api/scatter.ts](frontend/src/services/api/scatter.ts)
  decodes it client-side

### 7.4 `column_profiles[*].histogram` is always `null`
**Status:** Fixed/Stale

This is no longer true. The metadata builder now fills histograms for numeric
and temporal columns when metadata is requested via `/api/metadata`:
[crates/edatime-service/src/handlers/routes/metadata.rs](crates/edatime-service/src/handlers/routes/metadata.rs).

### 7.5 Scatter responses do not expose richer legend metadata
**Status:** Enhancement

Scatter currently exposes:

- `x-edatime-color-min`
- `x-edatime-color-max`
- `x-edatime-scatter-color-kind`

but not categorical value summaries or a human-friendly legend description.

---

## 8. Current priority list

If this file is used as an active work queue, the highest-signal current items are:

1. Fix the home sample-dataset startup wiring bug (`1.1`).
2. Stop treating datetime scatter color as raw continuous epoch-ms (`3.1`).
3. Make scatter output-format behavior honest: implement JSON or remove the contract (`3.4`, `3.5`).
4. Clean up analytics body-shape inconsistencies and misleading `column` failures (`5.1`, `5.2`).
5. Align preview dtype reporting with post-ingest dtype normalization (`4.1`).
6. Add an explicit empty-range signal for `/api/data` (`2.3`).
7. Prevent pathological `width=1` requests from the frontend (`2.2`).
8. Reduce the payload size of `/api/drift/stats` on large windows (`6.2`).

Do **not** treat `1.2`, `1.3`, or `7.4` as active issues in the current checkout
unless they are re-reproduced.

---

## 9. Minimal repro set for current confirmed issues

```bash
# 1. Confirm the data API still enforces the width cap
curl -sS "http://localhost:5173/api/data?start=2016-07-01T00:00:00Z&end=2016-07-02T00:00:00Z&columns=HUFL&width=20001"

# 2. Confirm width=1 behaves like raw data
curl -sS -D - "http://localhost:5173/api/data?start=2016-07-01T00:00:00Z&end=2018-06-26T00:00:00Z&columns=HUFL&width=1" -o /dev/null

# 3. Confirm future windows return an empty success payload rather than an explicit empty-range signal
curl -sS -D - "http://localhost:5173/api/data?start=2030-01-01T00:00:00Z&end=2031-01-01T00:00:00Z&columns=HUFL&width=400" -o /dev/null

# 4. Confirm datetime scatter color is still emitted as continuous epoch-ms
curl -sS -X POST -H 'Content-Type: application/json' \
  -d '{"x":"HUFL","y":"HULL","color":"date","limit":100}' \
  http://localhost:5173/api/scatter/points -D - -o /dev/null | grep -i color

# 5. Confirm scatter still ignores format=json
curl -sS -D - "http://localhost:5173/api/scatter/points?x=HUFL&y=HULL&limit=200&format=json" -o /dev/null

# 6. Confirm preview dtype still differs from post-ingest metadata dtype
curl -sS -X POST -F file=@ETTm2.csv http://localhost:5173/api/upload/preview | jq '.metadata.column_profiles[0].dtype'
curl -sS http://localhost:5173/api/metadata | jq '.columns[0].dtype'
```
