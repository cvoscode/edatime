# api_integration.rs

**Purpose:** Integration tests for the edatime HTTP API that exercise the full route stack (handlers, state, pipeline) using an in-memory fixture dataset.

## Functions

```rust
fn test_dataframe() -> DataFrame
```

```rust
fn test_app() -> Router
```

## Tests

```rust
#[tokio::test(flavor = "multi_thread")]
async fn health_returns_ok()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn health_v1_alias_works()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn metadata_returns_dataset_info()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn metadata_includes_column_profiles()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn data_returns_arrow_ipc()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn data_rejects_invalid_time_window()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn data_rejects_zero_width()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn data_rejects_unknown_column()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn data_rejects_missing_columns_without_hardcoded_default()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn data_sets_downsample_headers()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn data_multiple_columns()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn metrics_returns_counters()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn scatter_correlations_returns_suggestions()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn scatter_points_post()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn analytics_fft()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn analytics_rolling()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn analytics_anomalies()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn upload_requires_multipart()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn upload_parses_csv_file()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn upload_preview_returns_metadata()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn aggregate_returns_json_by_default()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn export_parquet_returns_data()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn second_data_request_hits_cache()
```

```rust
#[tokio::test(flavor = "multi_thread")]
async fn database_status_without_connection()
```
