# Configuration Reference

EdaTime loads configuration from defaults, an optional `config.toml`, and environment-variable overrides.

## Config File

Use:

```bash
EDATIME_CONFIG=./config.toml cargo run --bin edatime
```

Example:

```toml
[server]
host = "0.0.0.0"
port = 8080

[cache]
ttl_seconds = 120
max_entries = 256
max_bytes = 67108864

[rate_limit]
max_requests = 200
window_seconds = 60

[upload]
max_upload_bytes = 536870912

[data]
sample_data_path = "./my_data.csv"
```

## Environment Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `EDATIME_HOST` | Bind address | `127.0.0.1` |
| `EDATIME_PORT` | Listen port | `3000` |
| `EDATIME_SAMPLE_DATA` | Preload CSV or Parquet at startup | `sample.csv` |
| `EDATIME_CONFIG` | Path to a config file | unset |
| `EDATIME_CACHE_TTL_SECONDS` | Cache entry lifetime | `60` |
| `EDATIME_CACHE_MAX_ENTRIES` | Cache entry count limit | `64` |
| `EDATIME_CACHE_MAX_BYTES` | Cache size limit | `67108864` |
| `EDATIME_RATE_LIMIT_MAX_REQUESTS` | Per-client request budget | `1000` |
| `EDATIME_RATE_LIMIT_WINDOW_SECONDS` | Rate-limit window | `60` |
| `EDATIME_MAX_UPLOAD_BYTES` | Maximum upload size in bytes | `268435456` |
| `EDATIME_DATABASE_URL` | Database connection string | unset |
| `EDATIME_DATABASE_BACKEND` | Preferred database backend | `none` |
| `EDATIME_FRONTEND_DIR` | Override the frontend static directory | `frontend/` in the repo |

## Operational Notes

- The sample data path is loaded at startup. If the file cannot be loaded, the app starts with an empty dataset.
- The frontend static directory can be overridden for custom deployment layouts.
- Large uploads are bounded both by frontend workflow and server-side body limits.