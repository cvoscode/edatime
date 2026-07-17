# crates/edatime-query/src/temporal.rs
> Lazy helper that normalizes every temporal column in a `LazyFrame` to `Datetime(Milliseconds, None)`. Used by both the upload preview path and the ingest path so pre/post-ingest metadata agree on the timestamp unit.

## Function
- `pub fn normalize_temporal_columns_to_ms(lf: LazyFrame) -> LazyFrame`
  - Iterates the lazy frame's schema; for each column with dtype `Datetime(_, _)` or `Date` whose unit is not already `Milliseconds`, replaces it with a `cast(Datetime(Milliseconds, None))` projection under the same name.
  - `Datetime(_, _)` casts rescale automatically (µs → ms divides by 1000, ns → ms divides by 1_000_000).
  - `Date` columns (days since epoch) are first cast to `Int64` and then to `Datetime(Milliseconds, None)` so the unit conversion is explicit and auditable.
  - If `collect_schema` fails (rare — a malformed schema), the original `LazyFrame` is returned unchanged.

## Notes
- Only the column shape changes; row order, nulls, and finite values are preserved.
- This is a column projection: it does not collect the frame, so it composes with the rest of the lazy pipeline (see `pipeline.md`).
- The canonical representation across edatime is `Datetime(Milliseconds, None)` — see `state.ts_context`, `validation::ts_context`, and the upload preview path.
- Test coverage (in the source file) verifies both µs → ms rescaling and the no-op passthrough when the column is already `datetime[ms]`.
