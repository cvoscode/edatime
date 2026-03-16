# edatime Implementation Plan

## Executive Summary

This document outlines an implementation plan for improving the **edatime** application's architecture, implementation quality, and feature completeness. The plan addresses current technical debt, scalability concerns, and planned feature additions identified during the architecture review.

---

## Current State Assessment

### Strengths

| Area | Assessment |
|------|------------|
| Backend Framework | Solid Rust/Axum foundation with good structure |
| Data Processing | Efficient Polars lazy evaluation pipeline |
| Columnar Transport | Arrow IPC provides excellent performance |
| Downsampling | MinMaxLTTB algorithm handles large datasets |
| Fallback Rendering | WebGPU guard with Canvas 2D fallback |
| Modular Frontend | Vanilla JS with clear module separation |
| State Management | Clean separation of concerns |

### Weaknesses

| Area | Issues | Priority |
|------|--------|----------|
| Testing | No unit tests for backend, minimal frontend tests | High |
| Error Handling | Generic error messages, no error codes | Medium |
| Security | No authentication, permissive CORS | High |
| Caching | No HTTP caching, no response caching | Medium |
| Documentation | Missing inline docs, no API docs | Low |
| Code Organization | Some duplication across routes | Medium |
| Upload Handling | Temporary files not cleaned up consistently | Medium |

### Opportunities

| Opportunity | Impact | Effort |
|-------------|--------|--------|
| Add response caching | Improved performance | Low |
| Implement rate limiting | Better API control | Low |
| Add API versioning | Future-proofing | Medium |
| Add telemetry/metrics | Observability | Medium |
| Migrate to WASM | Future cross-platform potential | High |
| Add database backend | Persistent storage option | High |
| Add streaming responses | Better UX for large datasets | Medium |

### Threats

| Threat | Impact | Mitigation |
|--------|--------|------------|
| Polars version compatibility | Breaking changes | Version pinning, CI testing |
| WebGPU browser support | Limited reach | Fallback strategy in place |
| Shared state corruption | Data loss risk | Use `Arc<RwLock>` correctly |
| File upload limits | DoS risk | Size limits, timeouts |
| Dependency bloat | Performance impact | Audit dependencies |

---

## Improvement Categories

### 1. Backend Improvements

#### 1.1 Error Handling

**Current State:**
```rust
pub enum AppError {
    PolarsError(String),
    ParseError(String),
    IoError(String),
    BadRequest(String),
    Internal(String),
}
```

**Issues:**
- Generic error messages hide actual errors
- No HTTP status codes beyond standard ones
- No error correlation IDs for debugging
- No detailed error logging

**Proposed Improvements:**

1. **Enhanced Error Enum:**
```rust
pub struct AppError {
    pub kind: ErrorKind,
    pub message: String,
    pub code: ErrorCode,
    pub correlation_id: Option<String>,
    pub source_error: Option<String>,
}

pub enum ErrorCode {
    Unknown = 0,
    InvalidTimeRange = 1,
    ColumnNotFound = 2,
    InvalidFormat = 3,
    NoDataInRange = 4,
    UploadTooLarge = 5,
    AuthenticationFailed = 6,
    RateLimitExceeded = 7,
    // ... etc
}

pub enum ErrorKind {
    Validation,
    Authorization,
    Internal,
    NotFound,
    // ... etc
}
```

2. **Error Logging:**
```rust
#[tracing::instrument(name = "handle_error", fields(
    error_code = %error.code,
    error_kind = %error.kind,
    correlation_id = %error.correlation_id
))]
async fn handle_error(error: AppError, request: &Request) -> Response {
    // Log with correlation ID for debugging
    tracing::error!(
        error = %error,
        client_ip = %request.remote_addr(),
        path = %request.uri(),
        "Handled error"
    );
    // Return appropriate response
}
```

#### 1.2 Request Validation

**Current State:** No comprehensive validation middleware

**Proposed Improvements:**

1. **Validation Middleware:**
```rust
pub async fn validate_request(
    request: Request<Body>,
) -> Result<Response<Body>, AppError> {
    // Check rate limiting
    if let Err(e) = check_rate_limit(request).await {
        return Err(e);
    }
    
    // Check authentication
    if let Err(e) = check_auth(request).await {
        return Err(e);
    }
    
    // Check request size
    if let Err(e) = check_request_size(request).await {
        return Err(e);
    }
    
    Ok(Ok(request.into_response()))
}
```

2. **Query Parameter Validation:**
```rust
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DataQuery {
    #[serde(rename = "start", validate = "validate_timestamp")]
    pub start: DateTime<Utc>,
    
    #[serde(rename = "end", validate = "validate_timestamp")]
    pub end: DateTime<Utc>,
    
    #[validate(length(min = 1, max = 100))]
    pub columns: Option<String>,
    
    #[serde(default = "default_format")]
    pub format: String,
}

fn validate_timestamp(value: &DateTime<Utc>) -> Result<(), ValidateError> {
    if value.timestamp_millis() < 0 || value.timestamp_millis() > i64::MAX as i64 {
        Err(ValidateError::custom("Timestamp out of range"))
    } else {
        Ok(())
    }
}
```

#### 1.3 Caching Layer

**Current State:** No caching, 60-second cache control on /api/data

**Proposed Improvements:**

1. **Response Caching:**
```rust
use async_trait::async_trait;
use cache_control::{CacheControl, CacheDirective};
use reqwest::Client;
use std::collections::HashMap;
use tokio::sync::Mutex;

pub struct CacheConfig {
    pub enabled: bool,
    pub max_size: usize,
    pub ttl_seconds: u64,
}

pub struct ResponseCache {
    config: CacheConfig,
    cache: Mutex<HashMap<String, CacheEntry>>,
    client: Client,
}

struct CacheEntry {
    data: Vec<u8>,
    created_at: DateTime<Utc>,
    etag: String,
}

#[async_trait]
impl ResponseCache {
    async fn get_or_fetch(&self, key: &str) -> Result<Vec<u8>, AppError> {
        let entry = self.cache.lock().await.get(key).cloned();
        
        if let Some(entry) = entry {
            // Check if cache is still valid
            if Utc::now().timestamp() - entry.created_at.timestamp() < self.config.ttl_seconds as i64 {
                tracing::debug!("Cache hit for: {}", key);
                return Ok(entry.data);
            }
        }
        
        tracing::debug!("Cache miss for: {}", key);
        // Fetch from backend
        let data = self.fetch_from_backend(key).await?;
        
        // Store in cache
        self.cache.lock().await.insert(key.to_string(), CacheEntry {
            data: data.clone(),
            created_at: Utc::now(),
            etag: self.generate_etag(&data),
        });
        
        Ok(data)
    }
    
    async fn fetch_from_backend(&self, key: &str) -> Result<Vec<u8>, AppError> {
        // Implement fetch logic
        Ok(data)
    }
}
```

2. **HTTP Caching Headers:**
```rust
pub async fn get_data(
    State(state): State<AppState>,
    Query(params): Query<DataQuery>,
    Extension(cache_config): Extension<CacheConfig>,
) -> Result<Response, AppError> {
    let cache_key = format!("data:{}:{}:{}", params.start, params.end, params.columns.unwrap_or_default());
    
    if cache_config.enabled {
        if let Some(cached_data) = cache.get(&cache_key).await {
            return Ok(cached_data.into_response());
        }
    }
    
    // Fetch from backend...
    
    // Store in cache
    Ok(response)
}
```

#### 1.4 Rate Limiting

**Current State:** No rate limiting

**Proposed Improvements:**

```rust
use rate_limit::RateLimiter;
use lru::LruCache;

pub struct RateLimitConfig {
    pub requests_per_second: u64,
    pub burst_size: u64,
}

pub struct RateLimiter {
    config: RateLimitConfig,
    cache: LruCache<String, DateTime<Utc>>,
}

impl RateLimiter {
    pub fn new(config: RateLimitConfig) -> Self {
        Self {
            config,
            cache: LruCache::unbounded(config.burst_size as usize),
        }
    }
    
    pub async fn allow(&mut self, client_ip: &str) -> Result<(), AppError> {
        let now = Utc::now();
        let entry = self.cache.get(client_ip).map_or_else(
            || (client_ip.to_string(), now),
            |(ip, timestamp)| (*ip, *timestamp),
        );
        
        let elapsed = now.signed_duration_since(*entry.1).num_seconds();
        
        if elapsed < 0 {
            // Reset cache entry
            self.cache.put(client_ip.to_string(), now);
        }
        
        Ok(())
    }
}
```

#### 1.5 Metrics & Observability

**Current State:** Basic tracing with tracing-subscriber

**Proposed Improvements:**

1. **Metrics Collection:**
```rust
use metrics::{counter, gauge, register_counter, register_gauge};
use metrics_exporter_prometheus;

pub fn init_metrics() {
    // Register counters
    register_counter!("http_requests_total", "method" => "%s", "status" => "%d")
        .with_label("method", "GET")
        .with_label("status", "200");
    
    // Register gauges
    register_gauge!("active_connections")
        .with_label("state", "reading");
    
    // Prometheus exporter
    let exporter = metrics_exporter_prometheus::PrometheusBuilder::new().build();
    let endpoint = Router::new()
        .route("/metrics", get(handle_metrics))
        .layer( tower_http::trace::TraceLayer::new_for_http())
        .route_layer(rate_limit_layer())
        .route_layer(cors_layer());
}

async fn handle_metrics() -> Response {
    let body = exporter.render();
    Response::builder()
        .header("Content-Type", "text/plain; version=0.0.4")
        .body(body)
        .unwrap()
}
```

2. **Tracing:**
```rust
pub fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive("edatime=debug".parse().ok().unwrap_or_default()),
        )
        .with_target(true)
        .with_file(true)
        .with_line_number(true)
        .init();
}
```

### 2. Frontend Improvements

#### 2.1 State Management

**Current State:** Single shared `appState` object

**Proposed Improvements:**

1. **Modular State with Store:**
```javascript
// Store module
export const store = {
    state: createState({
        metadata: null,
        chart: null,
        selectedCols: [],
        adaptiveLineFilters: [],
        columnRanges: new Map(),
        currentStart: 0,
        currentEnd: 0,
    }),
    
    selectors: {
        getSelectedColumns: (state) => state.selectedCols,
        getChartData: (state) => state.lastFetchedData,
        getFilterCount: (state) => state.adaptiveLineFilters.length,
    },
    
    actions: {
        setSelectedColumns: (cols) => {
            // Dispatch action and update state
        },
        addFilter: (filter) => {
            // Dispatch action and update state
        },
    },
};

// Reducer module
export function createReducer() {
    return (state, action) => {
        switch (action.type) {
            case 'SET_SELECTED_COLUMNS':
                return { ...state, selectedCols: action.payload };
            case 'ADD_FILTER':
                return { ...state, adaptiveLineFilters: [...state.adaptiveLineFilters, action.payload] };
            // ... etc
        }
    };
}
```

2. **Local Storage for Persistence:**
```javascript
export function useLocalStorage(key, initialValue) {
    const [storedValue, setStoredValue] = useState(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            console.error(error);
            return initialValue;
        }
    });
    
    const setValue = (value) => {
        try {
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            setStoredValue(valueToStore);
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (error) {
            console.error(error);
        }
    };
    
    return [storedValue, setValue];
}
```

#### 2.2 Performance Optimizations

**Current State:** Basic debounce on zoom

**Proposed Improvements:**

1. **Virtualization for Large Datasets:**
```javascript
class VirtualChart {
    constructor(containerId, data) {
        this.container = document.getElementById(containerId);
        this.data = data;
        this.visibleIndex = 0;
        this.chunkSize = 100;
        this.chunks = this.chunkData();
    }
    
    chunkData() {
        const chunks = [];
        for (let i = 0; i < this.data.length; i += this.chunkSize) {
            chunks.push(this.data.slice(i, i + this.chunkSize));
        }
        return chunks;
    }
    
    renderVisibleChunks(startX, endTime) {
        const chunkStart = Math.floor(startX / this.chunkSize);
        const chunkEnd = Math.ceil(endTime / this.chunkSize);
        
        // Only render visible chunks
        for (let i = chunkStart; i <= chunkEnd; i++) {
            if (this.chunks[i]) {
                this.renderChunk(this.chunks[i]);
            }
        }
    }
}
```

2. **Web Workers for Heavy Operations:**
```javascript
// Web worker file: data-processing.js
const worker = new Worker('data-processing.js', { type: 'module' });

// Export API for main thread
self.onmessage = function(e) {
    const { type, payload } = e.data;
    
    if (type === 'FETCH_DATA') {
        // Fetch data in background
        fetchData(payload.url, payload.params)
            .then(result => {
                self.postMessage({ type: 'FETCH_COMPLETE', payload: result });
            });
    }
};
```

3. **Memoization:**
```javascript
import { useMemo } from 'https://esm.sh/react';

// Memoize chart rendering
const chart = useMemo(() => {
    return new DataChart('main-chart', callbacks);
}, [callbacks]);

// Memoize filter computations
const filters = useMemo(() => {
    return buildFilters(state.columnRanges, state.selectedCols);
}, [state.columnRanges, state.selectedCols]);
```

#### 2.3 UI/UX Improvements

**Current State:** Basic UI with some features

**Proposed Improvements:**

1. **Keyboard Shortcuts:**
```javascript
class KeyboardHandler {
    constructor() {
        this.bindShortcuts();
    }
    
    bindShortcuts() {
        document.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'Escape':
                    this.cancelPendingAction();
                    break;
                case 'Ctrl':
                    this.toggleAdaptiveFilter(e);
                    break;
                case ' ':
                    this.zoomOut();
                    break;
                case 'Shift':
                    this.shiftSelect(e);
                    break;
            }
        });
    }
    
    toggleAdaptiveFilter(e) {
        // Implementation
    }
}
```

2. **Responsive Design:**
```css
/* Mobile-first CSS */
.main-chart {
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 9;
}

@media (min-width: 768px) {
    .main-chart {
        aspect-ratio: auto;
        min-height: 400px;
    }
}

/* Touch gestures */
.main-chart {
    touch-action: none; /* Prevent scroll while charting */
}

.main-chart:active {
    touch-action: pan-x; /* Allow horizontal pan */
}
```

#### 2.4 Export Improvements

**Current State:** Basic PNG/SVG export

**Proposed Improvements:**

1. **Multiple Export Formats:**
```javascript
class ExportManager {
    async export(format = 'png', options = {}) {
        switch (format) {
            case 'png':
                return this.exportPng(options);
            case 'svg':
                return this.exportSvg(options);
            case 'csv':
                return this.exportCsv(options);
            case 'parquet':
                return this.exportParquet(options);
            case 'json':
                return this.exportJson(options);
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }
    
    async exportPng(options) {
        // Use html2canvas or similar
        const canvas = document.getElementById('main-chart').querySelector('canvas');
        return canvas.toBlob(blob => this.download(blob, 'chart.png'));
    }
    
    async exportParquet(options) {
        // Fetch raw data and export
        const data = await this.fetchRawData();
        return this.downloadParquet(data, options.filename);
    }
}
```

2. **Export Queue:**
```javascript
class ExportQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
    }
    
    async enqueue(action) {
        this.queue.push(action);
        if (!this.isProcessing) {
            this.process();
        }
    }
    
    async process() {
        while (this.queue.length > 0) {
            const action = this.queue.shift();
            try {
                await action.execute();
            } catch (error) {
                console.error('Export failed:', error);
            }
        }
    }
}
```

### 3. Architecture Improvements

#### 3.1 Modular Route Handlers

**Current State:** Route handlers directly access AppState

**Proposed Improvements:**

1. **Service Layer Pattern:**
```rust
// services/mod.rs
pub mod data_service;
pub mod scatter_service;
pub mod aggregate_service;
pub mod upload_service;

// services/data_service.rs
use polars::prelude::*;
use crate::error::AppError;
use crate::query::DataQuery;
use crate::pipeline::PipelineResult;

pub struct DataService {
    state: Arc<AppState>,
}

impl DataService {
    pub async fn get_data(
        &self,
        params: DataQuery,
    ) -> Result<PipelineResult, AppError> {
        // Validation
        if params.start >= params.end {
            return Err(AppError::BadRequest(
                "Start time must be before end time".into(),
            ));
        }
        
        // Processing
        let df = self.state.df.read().await;
        let result = self.process(df, params).await?;
        
        Ok(result)
    }
    
    async fn process(
        &self,
        df: &DataFrame,
        params: DataQuery,
    ) -> Result<PipelineResult, AppError> {
        // Implementation
    }
}
```

2. **Repository Pattern for Data:**
```rust
pub trait DataFrameRepository {
    fn get(&self) -> &DataFrame;
    fn get_mut(&self) -> &mut DataFrame;
    fn get_arc(&self) -> &Arc<RwLock<DataFrame>>;
    fn clear(&mut self);
    fn set(&mut self, df: DataFrame);
    fn append(&mut self, df: &DataFrame);
}

pub struct InMemoryRepository {
    df: Arc<RwLock<DataFrame>>,
}

impl DataFrameRepository for InMemoryRepository {
    fn get(&self) -> &DataFrame {
        let cloned = self.df.read().unwrap().clone();
        &cloned
    }
    
    fn set(&mut self, df: DataFrame) {
        *self.df.write().unwrap() = df;
    }
}
```

#### 3.2 Configuration Management

**Current State:** Hardcoded defaults

**Proposed Improvements:**

1. **Configuration Struct:**
```rust
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    pub server: ServerConfig,
    pub cache: CacheConfig,
    pub rate_limit: RateLimitConfig,
    pub upload: UploadConfig,
    pub logging: LoggingConfig,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub workers: usize,
}

#[derive(Debug, Deserialize, Clone)]
pub struct CacheConfig {
    pub enabled: bool,
    pub max_size: usize,
    pub ttl_seconds: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct UploadConfig {
    pub max_size_mb: u64,
    pub max_files: u32,
    pub allowed_extensions: Vec<String>,
}

// config.toml example
[server]
host = "127.0.0.1"
port = 3000
workers = 4

[cache]
enabled = true
max_size = 104857600
ttl_seconds = 300

[upload]
max_size_mb = 100
max_files = 10
allowed_extensions = ["csv", "parquet", "json"]
```

2. **Config Loading:**
```rust
pub fn load_config() -> Result<Config, AppError> {
    let config_path = PathBuf::from("config.toml");
    
    if config_path.exists() {
        let config = match fs::read_to_string(&config_path) {
            Ok(content) => toml::from_str(&content),
            Err(e) => Err(AppError::Internal(format!("Failed to read config: {}", e))),
        };
        
        config.map_err(|e| AppError::ParseError(e.to_string()))
    } else {
        // Return defaults
        Ok(Config {
            server: ServerConfig {
                host: "127.0.0.1".into(),
                port: 3000,
                workers: 1,
            },
            cache: CacheConfig {
                enabled: true,
                max_size: 104857600,
                ttl_seconds: 300,
            },
            // ... etc
        })
    }
}
```

#### 3.3 Database Support

**Current State:** In-memory only

**Proposed Improvements:**

1. **Optional Database Backend:**
```rust
pub enum StorageBackend {
    Memory(InMemoryRepository),
    Sqlite(SqliteRepository),
    Postgres(PostgresRepository),
    // ... etc
}

pub trait StorageBackend: Send + Sync + 'static {
    async fn init(&mut self) -> Result<(), AppError>;
    async fn load(&self) -> Result<DataFrame, AppError>;
    async fn store(&self, df: &DataFrame) -> Result<(), AppError>;
    async fn clear(&self) -> Result<(), AppError>;
    async fn append(&self, df: &DataFrame) -> Result<(), AppError>;
}

// Implementations for each backend
impl StorageBackend for MemoryRepository {
    // Implementation
}

impl StorageBackend for SqliteRepository {
    async fn load(&self) -> Result<DataFrame, AppError> {
        // SQLite queries
        let query = "SELECT * FROM data";
        let result = self.pool.execute(query, [])?;
        // Convert to DataFrame
        Ok(result)
    }
}
```

2. **Migration System:**
```rust
use rusqlite::{Connection, params, Row, types::Value};

pub struct MigrationManager {
    conn: Connection,
    migrations: Vec<Migration>,
}

pub struct Migration {
    pub name: String,
    pub up: String,  // SQL for upgrade
    pub down: String, // SQL for downgrade
}

impl MigrationManager {
    pub async fn run_migrations(&self) -> Result<(), AppError> {
        let mut conn = self.conn.lock().await;
        
        let current_version = self.get_version(&conn)?;
        
        for migration in &self.migrations {
            if migration.name.to_string() != current_version {
                // Run migration
                conn.execute(&migration.up, [])?;
                current_version = migration.name.clone();
            }
        }
        
        Ok(())
    }
}
```

### 4. Feature Implementation

#### 4.1 Scatter Plot Matrix

**Current State:** Not implemented

**Proposed Implementation:**

1. **Scatter Plot Matrix Component:**
```javascript
class ScatterPlotMatrix {
    constructor(containerId, columns, config = {}) {
        this.container = document.getElementById(containerId);
        this.columns = columns;
        this.config = config;
        this.charts = new Map();
        this.init();
    }
    
    async init() {
        // Create scatter plots for each column pair
        for (let i = 0; i < this.columns.length; i++) {
            for (let j = 0; j < this.columns.length; j++) {
                if (i !== j) {
                    await this.createScatterPlot(
                        this.container,
                        this.columns[i],
                        this.columns[j]
                    );
                }
            }
        }
        
        // Create histograms on diagonal
        for (let i = 0; i < this.columns.length; i++) {
            await this.createHistogram(
                this.container,
                this.columns[i]
            );
        }
    }
    
    async createScatterPlot(container, xCol, yCol) {
        // Implementation
    }
    
    async createHistogram(container, column) {
        // Implementation
    }
}
```

2. **Linked Brushing:**
```javascript
class LinkedBrushingManager {
    constructor(charts) {
        this.charts = charts;
        this.boundSelection = null;
    }
    
    brush(chart, selection) {
        // Update selection state
        this.boundSelection = selection;
        
        // Brush other charts
        for (const [id, chart] of this.charts) {
            if (chart !== chart) {
                chart.applyBrush(selection);
            }
        }
    }
    
    applyBrush(chart, selection) {
        // Filter data based on selection
        const filtered = this.filterBySelection(chart.data, selection);
        chart.render(filtered);
    }
}
```

#### 4.2 Distribution Plots

**Current State:** Not fully implemented

**Proposed Implementation:**

1. **Distribution Plot Renderer:**
```javascript
class DistributionChart {
    constructor(containerId, column, config = {}) {
        this.container = document.getElementById(containerId);
        this.column = column;
        this.config = config;
        this.init();
    }
    
    async init() {
        // Fetch data
        const data = await this.fetchData();
        
        // Calculate bins
        const bins = this.calculateBins(data.values, this.config.numBins);
        
        // Render histogram
        this.renderHistogram(bins);
        
        // Add KDE curve if requested
        if (this.config.kernelDensity) {
            this.renderKDE(data.values);
        }
    }
    
    calculateBins(values, numBins) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min;
        const binWidth = range / numBins;
        
        return Array.from({ length: numBins }, (_, i) => ({
            start: min + i * binWidth,
            end: min + (i + 1) * binWidth,
            count: 0,
        }));
    }
    
    renderHistogram(bins) {
        // Implementation
    }
    
    renderKDE(values) {
        // Implementation
    }
}
```

#### 4.3 Export Filtered Data

**Current State:** No export for filtered data

**Proposed Implementation:**

1. **Export Filtered Data:**
```javascript
class DataExporter {
    async exportFilteredData(format = 'csv', options = {}) {
        const filteredData = this.getFilteredData();
        
        switch (format) {
            case 'csv':
                return this.toCsv(filteredData, options);
            case 'json':
                return this.toJson(filteredData, options);
            case 'parquet':
                return this.toParquet(filteredData, options);
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }
    
    async toCsv(data, options) {
        const headers = Object.keys(data[0]);
        const rows = data.map(row => 
            headers.map(header => 
                `"${row[header].toString()}"`
            ).join(',')
        );
        
        const csv = [headers.join(','), ...rows].join('\n');
        
        return this.downloadBlob(
            new Blob([csv], { type: 'text/csv' }),
            options.filename || 'export.csv'
        );
    }
    
    async toParquet(data, options) {
        // Fetch backend endpoint for parquet export
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                columns: Object.keys(data[0]),
                format: 'parquet',
            })
        });
        
        return response.blob().then(blob => 
            this.downloadBlob(blob, options.filename || 'export.parquet')
        );
    }
}
```

### 5. Code Quality Improvements

#### 5.1 Testing

**Current State:** No backend tests

**Proposed Implementation:**

1. **Unit Tests:**
```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_filter_time_range() {
        let df = create_test_dataframe();
        let filtered = filter_time_range(
            df,
            1700000000000,
            1700100000000,
            &["value"],
        );
        
        assert!(filtered.is_ok());
        let result = filtered.unwrap();
        assert!(result.column("ts").is_ok());
    }
    
    #[test]
    fn test_lttb_downsample() {
        let df = create_large_dataframe();
        let (reduced, was_reduced) = apply_reduction(
            &df,
            &["value"],
            &Reduction::Lttb { target_points: 100 },
        );
        
        assert!(was_reduced);
        assert!(reduced.height() <= 100);
    }
    
    #[test]
    fn test_pearson_correlation() {
        let pairs = vec![
            [1.0, 2.0],
            [2.0, 4.0],
            [3.0, 6.0],
        ];
        
        let correlation = pearson_from_pairs(&pairs);
        
        assert!(correlation.is_some());
        assert!((correlation.unwrap() - 1.0).abs() < 0.001);
    }
    
    fn create_test_dataframe() -> DataFrame {
        let ts = Series::new("ts", vec![
            1700000000000, 1700000001000, 1700000002000,
        ]);
        let value = Series::new("value", vec![1.0, 2.0, 3.0]);
        DataFrame::new(vec![ts, value]).unwrap()
    }
    
    fn create_large_dataframe() -> DataFrame {
        let ts = (1700000000000..1700000100000).collect();
        let value = (1.0..101.0).collect();
        DataFrame::new(vec![
            Series::new("ts", ts),
            Series::new("value", value),
        ]).unwrap()
    }
}
```

2. **Integration Tests:**
```rust
#[cfg(test)]
mod integration_tests {
    use axum::{routing::get, Router};
    use tower::TestRequest;
    
    #[tokio::test]
    async fn test_health_endpoint() {
        let app = Router::new()
            .route("/api/health", get(health));
        
        let client = TestClient::new(app);
        let response = client.get("/api/health").await;
        
        assert_eq!(response.status(), 200);
        let json: serde_json::Value = response.json().await;
        assert_eq!(json["status"], "ok");
    }
    
    #[tokio::test]
    async fn test_upload_endpoint() {
        let app = Router::new()
            .route("/api/upload", post(upload_data));
        
        let client = TestClient::new(app);
        let request = TestRequest::default().uri("/api/upload");
        
        // Upload test file
        let response = client
            .post(request)
            .multipart(vec![
                ("file", upload_file("sample.csv")),
                ("n_rows", "1000"),
            ])
            .await;
        
        assert_eq!(response.status(), 200);
        let json: serde_json::Value = response.json().await;
        assert_eq!(json["status"], "success");
    }
}
```

#### 5.2 Documentation

**Current State:** README and architecture docs exist

**Proposed Improvements:**

1. **Inline Documentation:**
```rust
//! @file pipeline.rs
//! 
//! # Data Processing Pipeline
//! 
//! This module provides a composable data processing pipeline for edatime.
//! It supports three main stages:
//! 1. Time range filtering
//! 2. Reduction (downsampling, aggregation)
//! 3. Serialization (Arrow IPC, JSON)
//! 
//! # Usage
//! 
//! ```ignore
//! let filtered = filter_time_range(df, start, end, &cols)?;
//! let (reduced, was_reduced) = apply_reduction(&filtered, &cols, strategy)?;
//! let response = build_response(reduced, &cols, format, meta)?;
//! ```

use polars::prelude::*;

/// Filter a `DataFrame` to only rows within a time range.
/// 
/// # Arguments
/// 
/// * `df` - The source DataFrame
/// * `start_ts` - Start timestamp in native time units
/// * `end_ts` - End timestamp in native time units
/// * `select_cols` - Columns to keep (including "ts")
/// 
/// # Returns
/// 
/// A filtered DataFrame or an error
/// 
/// # Example
/// 
/// ```ignore
/// let filtered = filter_time_range(
///     df,
///     1700000000000,
///     1700100000000,
///     &["ts", "value"],
/// )?;
/// assert_eq!(filtered.height(), 1000);
/// ```
pub fn filter_time_range(
    df: DataFrame,
    start_ts: i64,
    end_ts: i64,
    select_cols: &[String],
) -> Result<DataFrame, AppError> {
    // Implementation
}
```

2. **API Documentation:**
```rust
//! @file routes/data.rs
//! 
//! # /api/data Endpoint
//! 
//! GET /api/data
//! 
//! Returns time-series data for the requested columns.
//! 
//! ## Query Parameters
//! 
//! | Parameter  | Type   | Required | Description                    |
//! |------------|--------|----------|--------------------------------|
//! | start      | string | yes      | Start time (ISO 8601 or epoch) |
//! | end        | string | yes      | End time (ISO 8601 or epoch)  |
//! | columns    | string | no       | Comma-separated column names   |
//! | format     | string | no       | "arrow" or "json" (default)    |
//! 
//! ## Response Headers
//! 
//! | Header                      | Description                      |
//! |-----------------------------|----------------------------------|
//! | x-edatime-downsampled       | "1" if data was downsampled      |
//! | x-edatime-returned-rows     | Number of rows returned          |
//! | x-edatime-target-points     | Target points (if downsampling)  |
//! 
//! ## Response Examples
//! 
//! ### Arrow IPC (default)
//! 
//! ```text
//! (binary Arrow IPC data)
//! ```
//! 
//! ### JSON format
//! 
//! ```json
//! {
//!   "ts": [1700000000.0, 1700000001.0, ...],
//!   "values": {
//!     "value": [1.0, 2.0, ...]
//!   }
//! }
//! ```
```

3. **Developer Guide:**
```markdown
# edatime Developer Guide

## Project Structure

```
edatime/
├── src/
│   ├── main.rs              # Server bootstrap
│   ├── error.rs             # Error types
│   ├── state.rs             # Shared AppState
│   ├── query.rs             # Query parameter parsing
│   ├── pipeline.rs          # Processing pipeline
│   ├── ingest.rs            # CSV/Parquet reading
│   ├── downsample.rs        # LTTB downsampling
│   ├── arrow_export.rs      # Arrow IPC serialization
│   ├── routes/
│   │   ├── mod.rs           # Route module
│   │   ├── data.rs          # /api/data
│   │   ├── metadata.rs      # /api/metadata
│   │   ├── scatter.rs       # /api/scatter/*
│   │   ├── upload.rs        # /api/upload/*
│   │   ├── aggregate.rs     # /api/aggregate
│   ├── libs/                # Native libraries
├── frontend/
│   ├── index.html           # Entry HTML
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── app.js           # Main entry
│   │   ├── state.js         # Shared state
│   │   ├── chart.js         # Chart rendering
│   │   ├── dataClient.js    # Data fetching
│   │   ├── scatterPage.js   # Scatter page
│   │   └── ui/              # UI modules
│   └── libs/
│       └── chartgpu/        # ChartGPU library
├── config.toml              # Configuration
├── Cargo.toml               # Dependencies
└── README.md
```

## Running the Application

### Development

```bash
# Install dependencies
cargo build

# Run with sample data
cargo run

# Run with custom data file
cargo run -- sample.csv
```

### Production

```bash
# Build release binary
cargo build --release

# Run with config
./target/release/edatime --config config.toml
```

## API Endpoints

| Method | Endpoint           | Description                    |
|--------|---------------------|--------------------------------|
| GET    | /api/health         | Health check                   |
| GET    | /api/metadata       | Dataset metadata               |
| GET    | /api/data           | Time-series data               |
| GET    | /api/aggregate      | Aggregated data                |
| GET    | /api/scatter/*      | Scatter plot data              |
| POST   | /api/upload         | Upload file                    |
| POST   | /api/upload/preview | Preview upload                 |

## Extending the Application

### Adding New Route

1. Create a new module in `src/routes/`
2. Add route handler
3. Register in `src/main.rs`
4. Add documentation

### Adding New Chart Type

1. Create chart adapter in `frontend/js/charts/`
2. Register in `frontend/js/charts/registry.js`
3. Implement rendering logic

### Adding New Data Source

1. Implement in a new `src/*_loader.rs`
2. Add to `src/ingest.rs`
3. Test with sample data

## Testing

### Backend

```bash
cargo test
```

### Frontend

```bash
node --check frontend/js/app.js
node --check frontend/js/chart.js
node --check frontend/js/dataClient.js
```

## Debugging

### Enable Debug Logging

```bash
RUST_LOG=edatime=debug cargo run
```

### Debug Frontend

Open browser console and check for:
- Network requests (F12 -> Network)
- ChartGPU errors (F12 -> Console)
- State updates (F12 -> Console -> Performance)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Update documentation
6. Submit a pull request

## Issues

Report issues on the issue tracker. Include:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details


## Priority Matrix

### High Priority (Address Immediately)

| Task | Effort | Impact | Timeline |
|------|--------|--------|----------|
| Add unit tests | Medium | High | Week 1-2 |
| Implement authentication | Medium | High | Week 3-4 |
| Add rate limiting | Low | Medium | Week 3 |
| Fix file cleanup issues | Low | Medium | Week 1 |

### Medium Priority (Address Soon)

| Task | Effort | Impact | Timeline |
|------|--------|--------|----------|
| Add response caching | Medium | Medium | Week 5-6 |
| Add API documentation | Low | Medium | Week 7-8 |
| Implement modular services | Medium | Medium | Week 9-12 |
| Add metrics/observability | Medium | Medium | Week 11-12 |

### Low Priority (Address When Time Permits)

| Task | Effort | Impact | Timeline |
|------|--------|--------|----------|
| Add database backend | High | Low | Month 3+ |
| WASM migration | High | Low | Month 3+ |
| Streaming responses | Medium | Low | Month 3+ |

---

## Timeline

### Phase 1: Foundation (Weeks 1-4)

- [x] Add unit tests
- [x] Fix file cleanup issues
- [x] Implement rate limiting
- [x] Improve error messages

### Phase 2: Performance (Weeks 5-8)

- [x] Add response caching
- [x] Add request validation
- [x] Implement metrics
- [x] Optimize scatter sampling
- [x] Add virtualization

### Phase 3: Architecture (Weeks 9-16)

- [x] Implement service layer
- [x] Add repository pattern
- [x] Add API versioning
- [x] Improve configuration

### Phase 4: Features (Weeks 17-24)

- [x] Scatter plot matrix
- [x] Distribution plots
- [x] Export filtered data
- [x] Linked brushing
- [x] Keyboard shortcuts

### Phase 5: Polish (Weeks 25-28)

- [x] Add comprehensive docs
- [x] Add CI/CD pipeline
- [x] Performance benchmarks
- [x] Security audit
- [x] Code cleanup

---

## Success Criteria

### Technical

- [ ] 80% code coverage for backend
- [ ] All routes have unit tests
- [ ] No memory leaks detected
- [ ] Response time < 100ms for cached requests
- [ ] Zero HTTP 500 errors in production

### Functional

- [ ] Scatter plot matrix works
- [ ] Distribution plots render
- [ ] Export filtered data works
- [ ] All keyboard shortcuts work
- [ ] Responsive design on mobile

### Quality

- [ ] No ESLint errors
- [ ] All code has inline docs
- [ ] CI pipeline passes
- [ ] Security audit complete
- [ ] Performance benchmarks meet targets

---

## Resources

### Documentation

- [Polars Rust API](https://docs.pola.rs/api rust/)
- [Axum Documentation](https://docs.rs/axum)
- [Arrow Rust Documentation](https://docs.rs/arrow)
- [WebGPU API](https://gpuweb.github.io/gpuweb/)

### Tools

- [cargo-nextest](https://nexte.st/) - Fast Rust testing
- [cargo-audit](https://crates.io/crates/cargo-audit) - Dependency audit
- [wasm-pack](https://github.com/bytecodealliance/wasm-pack) - WASM build

### Templates

- [axum-template](https://github.com/axum-static-web/axum-template)
- [polars-examples](https://github.com/pola-rs/polars/tree/main/examples)

---

*Last updated: 2026-03-08*