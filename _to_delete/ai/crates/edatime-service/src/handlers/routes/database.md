# crates/edatime-service/src/handlers/routes/database.rs
> Database connection management: Postgres/TimescaleDB/Sqlite.

## Handlers

- `post_connect(...) -> Result<impl IntoResponse, AppError>`
  - Connect to a database via connection string.
- `delete_connect(...) -> Result<impl IntoResponse, AppError>`
  - Disconnect from the database.
- `get_status(...) -> Result<impl IntoResponse, AppError>`
- `get_tables(...) -> Result<impl IntoResponse, AppError>`
- `get_columns(...) -> Result<impl IntoResponse, AppError>`
- `post_load(...) -> Result<impl IntoResponse, AppError>`
  - Load a table from the connected database into the repository.