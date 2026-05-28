# crates/edatime-service/src/handlers/routes/config.rs
> `GET /api/config/database`, `POST /api/config/database` — database configuration.

## Handlers

- `get_database_config(...) -> Result<impl IntoResponse, AppError>`
- `post_database_config(...) -> Result<impl IntoResponse, AppError>`