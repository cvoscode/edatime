# crates/edatime-core/src/http.rs
> Shared HTTP response types and helpers.

## Struct

### `ResponseMeta`
- `is_downsampled: bool`
- `returned_rows: usize`
- `target_points: Option<usize>`

## Functions

- `edatime_headers(meta: &ResponseMeta) -> HashMap<String, String>`
  - Build a header map with standard edatime headers (`x-edatime-downsampled`, `x-edatime-returned-rows`, `x-edatime-target-points`).