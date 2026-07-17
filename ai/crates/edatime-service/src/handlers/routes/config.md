# crates/edatime-service/src/handlers/routes/config.rs
> `GET /api/v1/config/database`, `POST /api/v1/config/database` — database configuration.

## Handlers

- `get_database_config(...) -> Result<impl IntoResponse, AppError>`
- `post_database_config(...) -> Result<impl IntoResponse, AppError>`