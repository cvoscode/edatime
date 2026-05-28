# audit_verification.rs

**Purpose:** Audit verification tests that verify the improvements identified in the 2026-05-05 audit.

## Tests

```rust
#[tokio::test]
async fn drift_page_routing_works()
```

```rust
#[tokio::test]
async fn home_page_cls_is_zero()
```

```rust
#[tokio::test]
async fn upload_page_no_eager_fetches()
```

```rust
#[tokio::test]
async fn no_echarts_zero_size_warnings()
```

```rust
#[tokio::test]
async fn scatter_matrix_is_sub_tab()
```

```rust
#[tokio::test]
async fn api_response_times_acceptable()
```

```rust
#[tokio::test]
async fn accessibility_score_improved()
```
