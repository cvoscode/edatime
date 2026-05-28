# crates/edatime-core/src/error.rs
> Pure domain error types — no HTTP/Axum dependencies.

## Enum `AppError`
Variants:
- `Validation(String)`
- `BadRequest(String)`
- `NotFound(String)`
- `Query(String)`
- `Io(String)`
- `Internal(String)`

Constructors:
- `bad_request(msg: impl Into<String>) -> Self`
- `validation(msg: impl Into<String>) -> Self`
- `internal(msg: impl Into<String>) -> Self`

Impls: `From<PolarsError>`, `From<std::io::Error>`