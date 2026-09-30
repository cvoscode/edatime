# crates/edatime-store/src/db.rs
> Database connection pool abstraction (Postgres/Sqlite/TimescaleDB).

## Struct

### `DbPool`
- Abstract database connection pool.

## Methods
- `new(url: &str) -> Result<Self, AppError>` [deps: [../../edatime-core/src/error][1]]
- `execute(&self, sql: &str) -> Result<(), AppError>`
- `query(&self, sql: &str) -> Result<Vec<serde_json::Value>, AppError>`

---
[1]: ../../edatime-core/src/error.md