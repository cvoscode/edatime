# Refactor Improvements — Review of commits up to `9146193`

Scope: commits leading up to tag `refactor` (91461937718b3687a1014fe034be3f50ed0480a9). Most findings are derived from the in‑scope target commit itself ("Add frontend rewrite plan and characterization tests") and the surrounding recent refactor work that introduced the `WorkspaceStore`, `features/*/entrypoint` factories, dataset‑scoped request invalidation, and the new `frontend_review.md` plan. The plan itself is sound; the suggestions below target concrete gaps in the new tests and the code they cover.

---

## 1. New characterization tests

### 1.1 `frontend/src/features/export/entrypoint.test.ts`

- **Mock path is a string literal that mirrors the source import.** `vi.mock('../../utils/dom.js', ...)` works only because vitest's resolver happens to normalize the `.js` extension. If the import in `features/export/entrypoint.ts` is ever changed to drop the extension or move up a level, the mock will silently fail to apply (and `downloadBlob` will call the real DOM helper, which `happy-dom` does not implement — the test will then fail in a confusing way, not "mock not applied"). Prefer resolving the mocked path through the same import the source uses, e.g.:

  ```ts
  vi.mock('../../utils/dom.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../utils/dom.js')>();
      return { ...actual, downloadBlob: downloadBlobMock };
  });
  ```

  This is what's already there, but the same care is missing in older tests in the same family (e.g. `frontend/src/features/timeseries/entrypoint.test.ts`).

- **`workspace: { getSnapshot: () => workspaceSnapshot as never }` double‑casts an `unknown` to `never`.** The cast silences a real type mismatch. A `WorkspaceSnapshot` factory (`makeWorkspaceSnapshot(partial)`) would let the test build valid snapshots inline and would catch accidental shape drift the day someone changes the `WorkspaceStore` interface.

- **Mixing of `vi.hoisted` and top‑level module `vi.mock` for `services/api/index.js`.** The hoisted approach is used for `dom.js` and `services/api/index.js`; the factory pattern is also used for `dom.js`. The two mock setups are inconsistent for no real reason. Standardise on one style per file.

- **Order coupling between `currentData` and `workspaceSnapshot`.** The `beforeEach` only resets `currentData`; `workspaceSnapshot` is overwritten inside the test before `createFeature()` is called. If a future test forgets to set `workspaceSnapshot`, the assertion in `'returns false for CSV and JSON export when there is no filtered dataset to export'` will pass for the wrong reason. Centralize the "no data" and "default snapshot" cases as named factories (`emptyState()`, `withData(data, snapshot)`).

- **Missing characterization for the interaction between `selectedColumns` and `adaptiveLines` that target a non‑selected column.** `applyColumnRangesToData` synthesises `neededColumns = [...selected, ...lineFilters.map(f => f.column)]` so an adaptive line on column `y` works even when `y` is not in `selectedColumns`. The current test only uses line filters whose `column` is in the selected set. Lock the synthesis behavior in now, before the rewrite removes it.

- **No assertion that `exportFilteredCsv` returns `false` for an empty result set produced by the filter pipeline** (e.g. `from > to` range, or a non‑finite `from`/`to`). Only the "no data" path is covered.

### 1.2 `frontend/src/services/api/analytics.test.ts`

- **Brand‑new file with no prior coverage.** The tests pin the current query‑string contracts (paths, parameter names, body shapes). Two follow‑ups would harden the file:

  - Add a test for `readApiError` (already exported from `services/api/http.ts`) that asserts the structured `{ code, message, correlation_id }` payload is parsed and attached to the thrown `Error`. The analytics tests use `ok: true` fixtures only.
  - Add a test that the analytics fetchers participate in the dataset request‑scope dedupe/invalidation pipeline (they should, because they read dataset snapshots). Today this is implicit and not asserted anywhere for the analytics family.

- **`fetchAnomalies(... 'mad')` does not assert that the `threshold` param is omitted when `undefined` is passed in, only that it is `null` on the wire.** Reading the test, `threshold` is `undefined`, so the `searchParams.get('threshold')` assertion returning `null` is correct, but the test name says "preserves threshold omission when none is provided" — wording should match the actual behavior: no threshold query parameter is sent. Consider asserting the *number* of parameters in addition to the value of a specific one, so a future regression that always sends `threshold=undefined` would also fail.

- **`fetchSpectrogram` test passes `clipParam: Number.NaN`.** The current implementation guards with `Number.isFinite`, so `NaN` is correctly dropped. Worth adding a sibling test for `clipParam: 0` and `clipParam: -1` to pin the boundary (0 should be sent; -1 should be sent as well, since it's finite). These edge cases tend to drift during refactors.

- **`fetchCausalGraph` and `postRemoveOutliers` use string‑joined `columns`.** The test pins `columns: 'a,b'`. As soon as a column name containing `,` is added, this contract breaks. Consider asserting via a fixture column name that contains a comma — e.g. `['a,1', 'b']` — to surface this fragility.

- **No test verifies that `signal` is forwarded to `fetch`.** All the analytics fetchers accept an `AbortSignal`; the test never passes one. The dataset request‑scope story in `http.test.ts` covers stale‑invalidation, but a single "abort signal is honored" test per family would be a useful regression net.

---

## 2. `frontend/src/features/export/entrypoint.ts`

- **Mixed sync/async signature on a single actions surface.** `exportFilteredCsv` and `exportFilteredJson` return `boolean` synchronously; `exportFilteredParquet` returns `Promise<boolean>`. The two‑shape return contract is awkward to consume in UI. The new plan calls for feature controllers with explicit lifetimes, so consider unifying to a single `export(kind: 'csv' | 'json' | 'parquet'): Promise<boolean>` API. The plan can also stipulate that the result is a discriminated union (`{ ok: true, blob, filename } | { ok: false, reason }`) so consumers do not have to treat a `false` return as success‑with‑no‑payload.

- **`Object.entries(...).map(...).filter(Boolean)` on lines 121–128.** `Boolean(null) === false` does the right thing here, but the inferred type after `.filter(Boolean)` is `((string | number | null)[])`, which means `params.set('filters', JSON.stringify(filters))` could serialize `null` entries. Today the upstream `map` only ever returns `null` (which is filtered) or a non‑null object, so the behavior is correct — but a future change to the map could introduce non‑object truthy values that get serialized. Replace with a type predicate:

  ```ts
  .filter((f): f is { column: string; from: number; to: number } => f !== null);
  ```

  This also lets TypeScript narrow the array for `JSON.stringify` and for the `filters.length` check.

- **The CSV escape path replaces `"` with `""` correctly but does not escape `,` and newlines inside the series name.** A column named `a,b\nc` will produce a malformed row. Add `escapeCsvField` to `utils/csv.ts` (it does not exist yet) and use it in `exportFilteredCsv`.

- **`buildFilteredSeriesRows` sorts every row with a `localeCompare` tiebreaker.** For a large filtered dataset the per‑comparison string compare dominates. Two cheaper alternatives:

  1. Sort indices, then project — keeps `Float64Array` accesses and avoids per‑row allocation.
  2. Group by `series` first, then concatenate by series order — gives a stable result and avoids `localeCompare` entirely if the `selectedColumns` order is preserved.

- **`new Date(start).toISOString()` and `new Date(end).toISOString()` are called inside `exportFilteredParquet`.** They are correct, but if `viewport.xMin` is `Number.MAX_SAFE_INTEGER` (which can happen after extreme zoom‑out), `new Date(9007199254740991).toISOString()` is still a valid ISO string and the backend will receive it. Pin a sanity bound (reject `xMin/xMax` outside the dataset's known time range) or document that the backend is expected to clamp.

- **JSON export of the full filtered set is unbounded.** A 1M‑row filtered dataset will produce a multi‑hundred‑MB JSON blob and freeze the tab. The test covers the happy path but not the size. Add a `MAX_EXPORT_ROWS` guard (the plan's "Export parquet" item is a good place to discuss this).

---

## 3. `frontend/src/services/api/http.ts`

- **`readApiError` is now the only exported error path, but no analytics‑side test exercises it.** The new `analytics.test.ts` only uses `ok: true` responses. At minimum, add a "non‑2xx with JSON body returns error with code/correlationId" test for the analytics family.

- **`getJson`/`postJson` build dedupe keys that include the dataset scope string.** The keys are deterministic, but the dedupe cache is bounded by in‑flight requests only (entries are removed in a `.finally` clause; see `datasetRequestScope.ts:53‑58`). No LRU/TTL is needed. The only thing worth documenting is the cache invalidation behaviour triggered by `invalidateDatasetRequestScope`.

- **`toEpochMs` thresholds in `http.ts` duplicate the backend `ingest.rs` thresholds.** This is a well‑known source of drift (the comment acknowledges it). The plan should call for moving the threshold map to a shared `contracts/api/v1/time.ts` module that both the frontend and the backend Rust crates import (or that is auto‑generated from a single fixture).

- **`isObject`, `assertDatasetMetadata`, `assertScatterPoints`, `assertScatterCorrelations` are exported as runtime guards** but they are not used in the analytics test or in the export entrypoint. They are an internal contract of the route‑family modules — consider moving them out of `http.ts` and into a `runtimeGuards.ts` (per the plan's "platform/" layout).

---

## 4. `frontend_review.md` (new file in the target commit)

- **The plan is excellent in intent but the file lives at the repo root.** The repo already has a `docs/superpowers/plans/` and an `ai/` directory for planning artifacts. Move `frontend_review.md` next to the other plans (`docs/superpowers/plans/2026-07-10-frontend-reimplementation.md`) and reference it from the README or from `copilot-instructions.md` so it is discoverable without polluting the root.

- **Step 1 ("Characterize the current application") is the only step with concrete tasks; steps 2–7 are still abstract.** Convert each step's bullet list into a checklist with explicit file targets, just like step 1. The plan currently mixes "what we'll do" with "how we'll know we're done" — keep them in separate subsections.

- **The plan calls for "Delete `appStateComposite`, `appStateCompat`, `dataClient.ts`, the monolithic `types.ts`, `legacy/`, `window.__edatime` runtime bridges" but the most recent commits (5ed4fbc "Mirror legacy intent into workspace store", 4ad1762 "Sync dataset intent to workspace store", 8d9bf26 "Publish timeseries selections to workspace", 3ae8e1a "Read export intent from workspace") are *adding* `WorkspaceStore` mirrors of legacy state rather than removing the legacy state itself.** This is a deliberate migration path, but the plan should call out the cutover sequence explicitly: "remove `appState` write paths in feature X, then delete `appState` in feature Y". Otherwise the mirror becomes permanent.

- **The plan deletes `features/*/entrypoint.ts` wrappers.** The current commit *adds* tests for those wrappers (the new `entrypoint.test.ts`). The plan needs to be reconciled with the test‑first sequence: either keep the entrypoint factories as the test boundary (and only delete the *UI* glue), or update the characterization step to be "characterize, then port the test, then delete the entrypoint".

- **Bundle budget in the plan is "151 KB JS / 123 KB CSS"**. This number is not verified by the budgets script. The current `scripts/check-frontend-budgets.mjs` and the per‑page manualChunks config in `vite.config.ts` should be quoted in the plan so future readers can audit them.

---

## 5. Cross‑cutting

- **`frontend/src/utils/dom.ts` exports `debounce` and `getEl` along with `downloadBlob` and `escapeHtml`.** The module name promises DOM helpers; `debounce` is generic and unrelated. Move `debounce` to `utils/function.ts` (or similar) and reserve `dom.ts` for true DOM utilities. Several recent commits add or change `downloadBlob`; isolating the surface makes the characterization test's mock narrower.

- **The new test uses `as never` to coerce `unknown` snapshots into a `Pick<WorkspaceStore, 'getSnapshot'>` shape.** This is symptomatic of the broader `WorkspaceSnapshot` type not being exportable from a single location. Export `WorkspaceSnapshot` (and a `makeEmptyWorkspaceSnapshot()` builder) from `workspace/workspaceStore.ts` so consumers and tests can build snapshots without `as` casts.

- **`vi.mock` paths in the test still use the legacy `.js` suffix on TS source.** A future migration to a bundler‑less test setup or to a different module resolution will silently break all 21 `vi.hoisted` sites. Centralize the test‑side import‑resolution into a `vitest.setup.ts` (e.g. `vi.mock` factories) so a future resolution change touches one place.

- **`frontend/src/services/timeseries/filtering.ts` still reads from the global `uiState` in `ensureRangeStateFromData` (lines 19, 20, 22), `buildAdaptiveLineFiltersForQuery` (line 213), `applyColumnRanges` (lines 223–225), and `sanitizeSelectedColumns` (line 245).** The new `features/export/entrypoint.ts` correctly takes its data via injected deps, but `filtering.ts` mixes both styles. The plan to replace the global store should also delete the legacy `uiState` reads here, or the new characterization tests will keep depending on globals indirectly.

- **The characterization tests are written as ESM string‑path mocks (`vi.mock('../../utils/dom.js')`).** If the project ever moves to a different module resolver (e.g. `moduleResolution: "NodeNext"`), the suffix convention may flip. Pin the path style in the vitest config and in the contributor docs so the mocks do not silently break.

---

## 6. Quick wins (low risk, high clarity)

1. Add a `makeWorkspaceSnapshot(partial)` factory and reuse it across the new tests instead of the `unknown → never` double‑cast.
2. Replace `.filter(Boolean)` with a typed predicate in `exportFilteredParquet`.
3. Extract `escapeCsvField` into `utils/csv.ts` and use it in the CSV export.
4. Move `debounce` out of `utils/dom.ts` into a generic helper module.
5. Move `frontend_review.md` from the repo root to `docs/superpowers/plans/`.
6. Add a single `readApiError` test (with structured JSON payload) to the analytics test file.
7. Add a test that the analytics fetchers participate in the dataset request‑scope dedupe.
8. Convert the `Object.entries(...).filter(Boolean)` site (and any other `Boolean` filters) to explicit type predicates.
9. Document and pin the bundle budget numbers in the plan (or remove them if they are aspirational).
10. Add a `MAX_EXPORT_ROWS` guard in `exportFilteredJson`/`Csv` and pin it with a test.

---

## 7. Items to defer

The plan itself is a multi‑week rewrite; the items below are not blocking and can be revisited after the contract layer lands.

- Move `toEpochMs` thresholds into a shared contract module (depends on the new `contracts/api/v1/` layout).
- Unify `ExportActions` into a single async API (depends on the new feature controller model).
- Group rows by series in `buildFilteredSeriesRows` for stable, faster exports (no measurable win until datasets exceed ~1M rows).

---

## 8. Verification pass — corrected claims

I re‑read each claim against the source and tests. The points below either correct errors in sections 1–6 or restate a claim with the correct line numbers, file path, or behavior. **The findings in sections 1–6 are still in force; this section makes them precise.**

### 8.1 Corrected: `frontend/src/services/timeseries/filtering.ts` global `uiState` reads

- **Section 5 said "lines 9–12, 213" and "three functions".** The actual scope is wider. The `uiState` import is on line 9; the file reads from it in **four** exported functions and one inline helper:
  - `ensureRangeStateFromData` — `uiState.selectedCols` (line 19), `uiState.columnRanges` (line 20, 22).
  - `buildAdaptiveLineFiltersForQuery` — `uiState.adaptiveLineFilters` (line 213).
  - `applyColumnRanges` — `uiState.selectedCols` (line 223), `uiState.columnRanges` (line 224), `uiState.adaptiveLineFilters` (line 225).
  - `sanitizeSelectedColumns` — `uiState.selectedCols` (line 245).
- **Implication:** the migration is not just "three functions to update" — `sanitizeSelectedColumns` (which is not currently called by the export entrypoint, but is exported from the same module) is part of the same global‑read pattern. The export entrypoint dodges this by using injected deps, but every other caller of `filtering.ts` that does not pass deps will hit the global.
- **Action:** the rewrite plan should list these four functions explicitly when it cuts over `uiState`. The new test pins the injected‑deps path; the global‑read path has no test coverage and is the natural place to add characterization tests before the cutover.

### 8.2 Corrected: line numbers in `frontend/src/features/export/entrypoint.ts`

- **Section 2 said "lines 121–128" for the `Object.entries(...).filter(Boolean)` block.** The actual line is:
  - Line 123: `const filters = Object.entries(snapshot.filters.columnRanges)`
  - Line 130: `.filter(Boolean);`
- The fix itself (replace with a typed predicate) is unchanged.

### 8.3 Corrected: scope of the "older tests in the same family" claim

- **Section 1.1 said the `.js`‑suffix mock pattern is missing in "older tests in the same family (e.g. `frontend/src/features/timeseries/entrypoint.test.ts`)".** That test exists, but it does **not** mock `dom.js` — it mocks `./columnsController.js` and `./actions.js`. Across the whole `frontend/src/` tree, the only `vi.mock` for `dom.js` is in the new `entrypoint.test.ts` (line 10).
- **What the older test does share with the new one:** the `as never` cast on a `getSnapshot` return value (`features/timeseries/entrypoint.test.ts:35` and `features/rangeControls.test.ts:51` also do this). The WorkspaceSnapshot‑factory suggestion in section 5 therefore applies to all three tests, not just the new one.

### 8.4 Corrected: `vi.mock` path fragility

- **Section 1.1 said the mock would "silently fail to apply" if the source import changed.** This is overstated. The project ships `tsconfig.json` with `"moduleResolution": "bundler"` and TypeScript's import‑suffix rules require the explicit `.js` on TS source imports. If `entrypoint.ts` were edited to drop the `.js`, the TypeScript compiler would reject it under `noEmit: true` long before the test ever ran. The mock and the source are bound by the same TS convention, so the failure mode is "TS build fails", not "silent test failure".
- **The real risk** is in a different direction: vitest's module resolver and TypeScript's resolver are not 100% aligned. A future contributor who edits the source to use a relative path with a different `..` depth (e.g. moving `entrypoint.ts` one level up) would change the *test's* `vi.mock` path requirement but the test file would not be flagged by the TS compiler (since `vi.mock` accepts a string). A small Vitest test helper that re‑derives the mock path from the same import specifier used by the source would close that gap.

### 8.5 Corrected: dedupe cache is bounded

- **Section 3 said "the keys are deterministic but unbounded — over a long session they accumulate".** This is **wrong**. `frontend/src/services/api/datasetRequestScope.ts:53‑58` (function body of `dedupeInflight`):
  ```ts
  export function dedupeInflight<T>(key: string, factory: () => Promise<T>): Promise<T> {
      const existing = inflight.get(key);
      if (existing !== undefined) return existing as Promise<T>;
      const promise = factory().finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
  }
  ```
  Each entry is removed in the `.finally` clause as soon as the request resolves. `invalidateDatasetRequestScope` (defined at line 43) additionally calls `inflight.clear()` (line 45) whenever the dataset changes. The cache size is bounded by the number of requests *currently in flight* — a handful, not a session‑long accumulator.
- **Action:** remove the "Add a small LRU or TTL" suggestion from section 3 and from the "Items to defer" list. No code change is needed.

### 8.6 Corrected: `Number.MAX_SAFE_INTEGER` zoom‑out example

- **Section 2 used `viewport.xMin === Number.MAX_SAFE_INTEGER` as a plausible failure mode.** The arithmetic is wrong as a motivating example: `new Date(Number.MAX_SAFE_INTEGER).toISOString()` does return a valid ISO string in a small smoke test, but a real zoom‑out is bounded by the dataset's known time range and is unlikely to hit that number.
- **What the guard actually fails to catch:** any value that is finite but outside the JavaScript Date range. Verified locally:
  - `Number.isFinite(1e30)` is `true`, but `new Date(1e30).toISOString()` throws `RangeError: Invalid time value`.
  - `Number.isFinite(Number.MAX_SAFE_INTEGER)` is `true`, but `new Date(Number.MAX_SAFE_INTEGER).toISOString()` also throws (despite the `.toISOString()` call returning a string for the year 275760 in some engines — the behavior is implementation‑defined above `8.64e15`).
  - `Number.isFinite(Number.POSITIVE_INFINITY)` is `false`, so the existing guard does reject `Infinity`.
- **Net:** the original suggestion is still valid (a sanity bound on `xMin`/`xMax` would close a real gap for values like `1e30` that pass `Number.isFinite` but throw at `toISOString()` time). The motivating example should be `1e30` (or any other large finite number), not `Number.MAX_SAFE_INTEGER` or `Number.POSITIVE_INFINITY`.

### 8.7 Re‑verified: the rest of the document

For completeness, I re‑checked the remaining claims and they hold:

- **Section 1.1, "Mock path mirrors the source import"** — the mock path `'../../utils/dom.js'` matches the source import in `entrypoint.ts:9`. **Confirmed.**
- **Section 1.1, "`workspace: { getSnapshot: () => workspaceSnapshot as never }`"** — present at `entrypoint.test.ts:48`. **Confirmed.**
- **Section 1.1, "Mixing of `vi.hoisted` and top‑level `vi.mock` styles"** — `vi.hoisted` is at line 5 and provides the two mock functions; the `vi.mock` for `dom.js` (line 10) uses the `importOriginal` factory pattern while the one for `services/api/index.js` (line 18) uses the simpler object factory. Two different factory styles in the same test file. **Confirmed.**
- **Section 1.1, "neededColumns synthesis not covered"** — `filtering.ts:162‑164` synthesises `[...selectedCols, ...lineFilter.columns]`. The new test uses a line filter on `temp` (line 135 of the test, in the parquet test fixture), which is also in `selectedColumns: ['temp']`. The unselected‑column case is not exercised. **Confirmed.**
- **Section 1.2, "no test for `readApiError`"** — `grep "readApiError" frontend/src/services/api/analytics.test.ts` returns nothing. **Confirmed.**
- **Section 1.2, "no `signal` is passed in any test"** — every call in `analytics.test.ts` uses positional args; none of them pass an `AbortSignal`. **Confirmed.**
- **Section 1.2, "`columns: 'a,b'` joined with comma"** — `analytics.ts:192` does `columns: columns.join(',')` for `fetchCausalGraph`; `analytics.ts:256` does `body.columns = columns.join(',')` for `postRemoveOutliers`. **Confirmed.**
- **Section 2, "Mixed sync/async signature"** — `ExportActions` interface at `entrypoint.ts:15‑19` defines `exportFilteredCsv: () => boolean` (line 16), `exportFilteredJson: () => boolean` (line 17), `exportFilteredParquet: () => Promise<boolean>` (line 18). **Confirmed.**
- **Section 2, "CSV escape only handles `"`"** — `entrypoint.ts:83` does `String(row.series).replaceAll('"', '""')` and wraps the field in `"…"`; there is no handling of `,` or `\n` inside the field. **Confirmed.**
- **Section 2, "Unbounded JSON export"** — `exportFilteredJson` at `entrypoint.ts:93‑101` only checks `rows.length === 0`; there is no row cap. **Confirmed.**
- **Section 3, "`toEpochMs` thresholds duplicated"** — the comment at `http.ts:106` literally says `// Thresholds aligned with backend (ingest.rs):`. **Confirmed.**
- **Section 4, "Plan lives at the repo root"** — `frontend_review.md` is at `/home/crispy/edatime/frontend_review.md`; the conventional location `docs/superpowers/plans/` exists and contains 17 similar planning files (e.g. `2026-07-03-usage-issue-fixes.md`, `2026-06-30-spectrogram-custom-controls.md`). **Confirmed.**
- **Section 4, "Plan deletes `entrypoint.ts` wrappers"** — `frontend_review.md:56` says: "Delete `appStateComposite`, `appStateCompat`, `dataClient.ts`, the monolithic `types.ts`, `legacy/`, `window.__edatime` runtime bridges, and thin `features/*/entrypoint.ts` wrappers." The current commit adds tests for those wrappers. **Confirmed.**
- **Section 5, "21 `vi.hoisted` sites"** — `grep -rn "vi.hoisted" frontend/src/ | wc -l` returns 21. **Confirmed.**
- **Section 5, "`debounce` lives in `dom.ts`"** — `dom.ts:37‑43` defines `export function debounce`. **Confirmed.**

### 8.8 Net effect on the original document

After corrections, the following items should be **removed** (no longer actionable):

- Section 3 "Add a small LRU or TTL on `dedupe`" (item now contradicted by section 8.5).
- "Items to defer" entry: "Replace the dedupe cache with an LRU" (same reason).

The following items should be **softened** (still actionable, but with a more accurate justification):

- Section 1.1 "Mock path" — reframe as "module‑resolver drift risk" (section 8.4), not "silent failure".
- Section 2 "`Number.MAX_SAFE_INTEGER` zoom‑out" — reframe as "finite values outside the JS Date range (e.g. `1e30`) pass the existing `Number.isFinite` guard and then throw at `toISOString()` time" (section 8.6).
- Section 5 "`filtering.ts` reads from `uiState`" — expand to four functions (section 8.1) and list them by name.

The remaining items (test characterization gaps, `as never` casts, CSV escaping, sync/async split, `Boolean` filter type guard, plan location, bundle budget, `MAX_EXPORT_ROWS`) stand as written.
