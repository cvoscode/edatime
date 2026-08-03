//! Full metrics implementation — shared across all crates.
//!
//! Phase 0.1 telemetry: per-stage counters and nanosecond timers for the
//! four hot paths (scatter points, correlations, rolling analytics,
//! CPU admission). All buckets are low-cardinality enumerations — no
//! column names, filter values, query strings, or client addresses are
//! used as labels. Use these counts to drive Phase 0.3 baseline gates
//! before any algorithmic change.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Instant;

use serde::Serialize;

/// Coarse CPU-admission stage label. Used as a low-cardinality bucket —
/// never include column, filter, or client data here.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CpuStage {
    Query,
    Materialization,
    Scatter,
    Correlations,
    Analytics,
}

/// Which scatter-points stage produced the timing sample. The enum keeps
/// the call sites self-documenting; the underlying counter is a u64 of
/// accumulated nanoseconds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScatterStage {
    Collect,
    Sample,
    Serialize,
}

/// Which correlations stage produced the timing sample.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CorrelationStage {
    Collect,
    Extract,
    PairCalc,
}

/// Closed-set request/work label for correlation telemetry. Keeping this as
/// an enum prevents callers from accidentally adding a user-controlled label
/// to the metrics map.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CorrelationTelemetryMode {
    PearsonRaw,
    SpearmanRaw,
    KendallRaw,
    PearsonDiff,
    SpearmanDiff,
    KendallDiff,
    AllModes,
}

fn cpu_stage_label(stage: CpuStage) -> &'static str {
    match stage {
        CpuStage::Query => "query",
        CpuStage::Materialization => "materialization",
        CpuStage::Scatter => "scatter",
        CpuStage::Correlations => "correlations",
        CpuStage::Analytics => "analytics",
    }
}

fn correlation_mode_label(mode: CorrelationTelemetryMode) -> &'static str {
    match mode {
        CorrelationTelemetryMode::PearsonRaw => "pearson_raw",
        CorrelationTelemetryMode::SpearmanRaw => "spearman_raw",
        CorrelationTelemetryMode::KendallRaw => "kendall_raw",
        CorrelationTelemetryMode::PearsonDiff => "pearson_diff",
        CorrelationTelemetryMode::SpearmanDiff => "spearman_diff",
        CorrelationTelemetryMode::KendallDiff => "kendall_diff",
        CorrelationTelemetryMode::AllModes => "all_modes",
    }
}

fn lock_recover<'a, T>(mutex: &'a Mutex<T>, name: &str) -> MutexGuard<'a, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            tracing::error!("metrics {name} mutex poisoned; recovering its inner state");
            mutex.clear_poison();
            poisoned.into_inner()
        }
    }
}

#[derive(Debug, Default, Serialize)]
pub struct ScatterSamplingSnapshot {
    pub requests: u64,
    pub total_points_seen: u64,
    pub total_points_returned: u64,
}

/// Aggregated scatter-points telemetry. All counters are running totals;
/// divide by `requests` for averages.
#[derive(Debug, Default, Serialize)]
pub struct ScatterStagesSnapshot {
    pub filtered_rows_total: u64,
    pub valid_points_total: u64,
    pub returned_total: u64,
    pub response_bytes_total: u64,
    pub cache_hit_total: u64,
    pub cache_miss_total: u64,
    /// nanoseconds
    pub collect_ns_total: u64,
    /// nanoseconds
    pub sample_ns_total: u64,
    /// nanoseconds
    pub serialize_ns_total: u64,
}

/// Aggregated correlations telemetry. `mode_breakdown` keeps a low-cardinality
/// count per requested mode (a closed set of six CorrelationMode values) so
/// we can see single-mode vs all-mode traffic without using column names
/// or thresholds as labels.
#[derive(Debug, Default, Serialize)]
pub struct CorrelationsStagesSnapshot {
    pub requests_total: u64,
    pub cache_hit_total: u64,
    pub cache_miss_total: u64,
    pub warmup_dispatched_total: u64,
    pub all_modes_total: u64,
    pub single_flight_total: u64,
    pub numeric_columns_total: u64,
    pub input_rows_total: u64,
    /// nanoseconds
    pub collect_ns_total: u64,
    /// nanoseconds
    pub extract_ns_total: u64,
    /// nanoseconds
    pub pair_calc_ns_total: u64,
    pub mode_breakdown: HashMap<String, u64>,
}

/// Aggregated rolling-bands telemetry.
#[derive(Debug, Default, Serialize)]
pub struct RollingStagesSnapshot {
    pub requests_total: u64,
    pub rows_total: u64,
    pub columns_total: u64,
    pub response_bytes_total: u64,
    /// nanoseconds
    pub compute_ns_total: u64,
}

/// Aggregated CPU-admission telemetry separated by coarse stage label.
#[derive(Debug, Default, Serialize)]
pub struct CpuAdmissionSnapshot {
    pub submitted_total: u64,
    pub started_total: u64,
    pub completed_total: u64,
    pub rejected_total: u64,
    pub cancelled_total: u64,
    pub queued: u64,
    pub running: u64,
    /// nanoseconds spent waiting in queues before a worker started
    pub queue_wait_ns_total: u64,
    pub by_stage: HashMap<String, CpuAdmissionStageSnapshot>,
}

#[derive(Debug, Default, Clone, Serialize)]
pub struct CpuAdmissionStageSnapshot {
    pub submitted: u64,
    pub started: u64,
    pub completed: u64,
    pub rejected: u64,
    pub cancelled: u64,
    pub queued: u64,
    pub running: u64,
    /// nanoseconds
    pub queue_wait_ns: u64,
}

#[derive(Debug, Serialize)]
pub struct MetricsSnapshot {
    pub uptime_seconds: u64,
    pub total_requests: u64,
    pub cache_hits: u64,
    pub cache_misses: u64,
    pub rate_limited_requests: u64,
    pub scatter_sampling: ScatterSamplingSnapshot,
    pub scatter_stages: ScatterStagesSnapshot,
    pub correlations_stages: CorrelationsStagesSnapshot,
    pub rolling_stages: RollingStagesSnapshot,
    pub cpu_admission: CpuAdmissionSnapshot,
    pub request_counts: HashMap<String, u64>,
    pub average_request_ms: f64,
    pub dataset_rows: usize,
    pub dataset_revision: u64,
}

/// Full metrics shared by AppState (store) and middleware (service).
#[derive(Debug)]
pub struct AppMetrics {
    started_at: Instant,
    total_requests: AtomicU64,
    total_request_duration_ns: AtomicU64,
    cache_hits: AtomicU64,
    cache_misses: AtomicU64,
    rate_limited_requests: AtomicU64,
    scatter_requests: AtomicU64,
    scatter_points_seen: AtomicU64,
    scatter_points_returned: AtomicU64,
    request_counts: Mutex<HashMap<String, u64>>,
    // ── Phase 0.1 stage telemetry ──────────────────────────────────────────
    // Scatter points (live by `record_scatter_stages_*` from the handler).
    scatter_filtered_rows: AtomicU64,
    scatter_valid_points: AtomicU64,
    scatter_returned: AtomicU64,
    scatter_response_bytes: AtomicU64,
    scatter_cache_hits: AtomicU64,
    scatter_cache_misses: AtomicU64,
    scatter_collect_ns: AtomicU64,
    scatter_sample_ns: AtomicU64,
    scatter_serialize_ns: AtomicU64,
    // Correlations (live by `record_correlation_*` from the handler/warmup).
    correlations_requests: AtomicU64,
    correlations_cache_hits: AtomicU64,
    correlations_cache_misses: AtomicU64,
    correlations_warmup_dispatched: AtomicU64,
    correlations_all_modes: AtomicU64,
    correlations_single_flight: AtomicU64,
    correlations_numeric_columns: AtomicU64,
    correlations_input_rows: AtomicU64,
    correlations_collect_ns: AtomicU64,
    correlations_extract_ns: AtomicU64,
    correlations_pair_calc_ns: AtomicU64,
    correlations_mode_breakdown: Mutex<HashMap<String, u64>>,
    // Rolling analytics.
    rolling_requests: AtomicU64,
    rolling_rows: AtomicU64,
    rolling_columns: AtomicU64,
    rolling_response_bytes: AtomicU64,
    rolling_compute_ns: AtomicU64,
    // CPU admission by stage.
    cpu_admission: Mutex<CpuAdmissionState>,
}

#[derive(Debug, Default)]
struct CpuAdmissionState {
    submitted_total: u64,
    started_total: u64,
    completed_total: u64,
    rejected_total: u64,
    cancelled_total: u64,
    queued: u64,
    running: u64,
    queue_wait_ns_total: u64,
    by_stage: HashMap<String, CpuAdmissionStageSnapshot>,
}

impl Default for AppMetrics {
    fn default() -> Self {
        Self::new()
    }
}

impl AppMetrics {
    pub fn new() -> Self {
        Self {
            started_at: Instant::now(),
            total_requests: AtomicU64::new(0),
            total_request_duration_ns: AtomicU64::new(0),
            cache_hits: AtomicU64::new(0),
            cache_misses: AtomicU64::new(0),
            rate_limited_requests: AtomicU64::new(0),
            scatter_requests: AtomicU64::new(0),
            scatter_points_seen: AtomicU64::new(0),
            scatter_points_returned: AtomicU64::new(0),
            request_counts: Mutex::new(HashMap::new()),
            scatter_filtered_rows: AtomicU64::new(0),
            scatter_valid_points: AtomicU64::new(0),
            scatter_returned: AtomicU64::new(0),
            scatter_response_bytes: AtomicU64::new(0),
            scatter_cache_hits: AtomicU64::new(0),
            scatter_cache_misses: AtomicU64::new(0),
            scatter_collect_ns: AtomicU64::new(0),
            scatter_sample_ns: AtomicU64::new(0),
            scatter_serialize_ns: AtomicU64::new(0),
            correlations_requests: AtomicU64::new(0),
            correlations_cache_hits: AtomicU64::new(0),
            correlations_cache_misses: AtomicU64::new(0),
            correlations_warmup_dispatched: AtomicU64::new(0),
            correlations_all_modes: AtomicU64::new(0),
            correlations_single_flight: AtomicU64::new(0),
            correlations_numeric_columns: AtomicU64::new(0),
            correlations_input_rows: AtomicU64::new(0),
            correlations_collect_ns: AtomicU64::new(0),
            correlations_extract_ns: AtomicU64::new(0),
            correlations_pair_calc_ns: AtomicU64::new(0),
            correlations_mode_breakdown: Mutex::new(HashMap::new()),
            rolling_requests: AtomicU64::new(0),
            rolling_rows: AtomicU64::new(0),
            rolling_columns: AtomicU64::new(0),
            rolling_response_bytes: AtomicU64::new(0),
            rolling_compute_ns: AtomicU64::new(0),
            cpu_admission: Mutex::new(CpuAdmissionState::default()),
        }
    }

    pub fn record_request(&self, method: &str, path: &str, status: u16, duration_ns: u64) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
        self.total_request_duration_ns
            .fetch_add(duration_ns, Ordering::Relaxed);
        let key = format!("{} {} {}", method, path, status);
        let mut counts = lock_recover(&self.request_counts, "request_counts");
        *counts.entry(key).or_insert(0) += 1;
    }

    pub fn record_cache_hit(&self) {
        self.cache_hits.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_cache_miss(&self) {
        self.cache_misses.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_rate_limited(&self) {
        self.rate_limited_requests.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_scatter_sampling(&self, total_points: usize, returned_points: usize) {
        self.scatter_requests.fetch_add(1, Ordering::Relaxed);
        self.scatter_points_seen
            .fetch_add(total_points as u64, Ordering::Relaxed);
        self.scatter_points_returned
            .fetch_add(returned_points as u64, Ordering::Relaxed);
    }

    // ── Phase 0.1 stage recorders ────────────────────────────────────────────
    // Each method takes explicit counts/durations so the call sites are
    // unambiguous. Do not overload these with high-cardinality data.

    pub fn record_scatter_filtered_rows(&self, rows: u64) {
        self.scatter_filtered_rows
            .fetch_add(rows, Ordering::Relaxed);
    }

    pub fn record_scatter_valid_points(&self, points: u64) {
        self.scatter_valid_points
            .fetch_add(points, Ordering::Relaxed);
    }

    pub fn record_scatter_response(&self, bytes: u64, returned: u64) {
        self.scatter_response_bytes
            .fetch_add(bytes, Ordering::Relaxed);
        self.scatter_returned.fetch_add(returned, Ordering::Relaxed);
    }

    pub fn record_scatter_cache(&self, hit: bool) {
        if hit {
            self.scatter_cache_hits.fetch_add(1, Ordering::Relaxed);
        } else {
            self.scatter_cache_misses.fetch_add(1, Ordering::Relaxed);
        }
    }

    /// `stage_ns` is the elapsed wall-clock time for one stage in nanoseconds.
    /// Callers MUST pass finite, non-negative values.
    pub fn record_scatter_stage(&self, stage: ScatterStage, duration_ns: u64) {
        let target = match stage {
            ScatterStage::Collect => &self.scatter_collect_ns,
            ScatterStage::Sample => &self.scatter_sample_ns,
            ScatterStage::Serialize => &self.scatter_serialize_ns,
        };
        target.fetch_add(duration_ns, Ordering::Relaxed);
    }

    pub fn record_correlation_request(&self, cache_hit: bool, mode: CorrelationTelemetryMode) {
        self.correlations_requests.fetch_add(1, Ordering::Relaxed);
        if cache_hit {
            self.correlations_cache_hits.fetch_add(1, Ordering::Relaxed);
        } else {
            self.correlations_cache_misses
                .fetch_add(1, Ordering::Relaxed);
        }
        let mode_label = correlation_mode_label(mode);
        let mut map = lock_recover(
            &self.correlations_mode_breakdown,
            "correlations_mode_breakdown",
        );
        *map.entry(mode_label.to_string()).or_insert(0) += 1;
    }

    /// Record dimensions for a completed correlation computation. These are
    /// deliberately separate from request accounting: cache misses learn the
    /// exact values only after their worker has collected the input frame.
    pub fn record_correlation_input(&self, numeric_columns: u64, input_rows: u64) {
        self.correlations_numeric_columns
            .fetch_add(numeric_columns, Ordering::Relaxed);
        self.correlations_input_rows
            .fetch_add(input_rows, Ordering::Relaxed);
    }

    pub fn record_correlation_warmup_dispatched(&self) {
        self.correlations_warmup_dispatched
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_correlation_stage(&self, stage: CorrelationStage, duration_ns: u64) {
        let target = match stage {
            CorrelationStage::Collect => &self.correlations_collect_ns,
            CorrelationStage::Extract => &self.correlations_extract_ns,
            CorrelationStage::PairCalc => &self.correlations_pair_calc_ns,
        };
        target.fetch_add(duration_ns, Ordering::Relaxed);
    }

    pub fn record_correlation_all_modes(&self) {
        self.correlations_all_modes.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_correlation_single_flight(&self) {
        self.correlations_single_flight
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_rolling(&self, rows: u64, columns: u64, response_bytes: u64, duration_ns: u64) {
        self.rolling_requests.fetch_add(1, Ordering::Relaxed);
        self.rolling_rows.fetch_add(rows, Ordering::Relaxed);
        self.rolling_columns.fetch_add(columns, Ordering::Relaxed);
        self.rolling_response_bytes
            .fetch_add(response_bytes, Ordering::Relaxed);
        self.rolling_compute_ns
            .fetch_add(duration_ns, Ordering::Relaxed);
    }

    pub fn record_cpu_submit(&self, stage: CpuStage) {
        let label = cpu_stage_label(stage);
        let mut state = lock_recover(&self.cpu_admission, "cpu_admission");
        state.submitted_total += 1;
        state.queued += 1;
        let entry = state.by_stage.entry(label.to_string()).or_default();
        entry.submitted += 1;
        entry.queued += 1;
    }

    pub fn record_cpu_started(&self, stage: CpuStage, queue_wait_ns: u64) {
        let label = cpu_stage_label(stage);
        let mut state = lock_recover(&self.cpu_admission, "cpu_admission");
        state.started_total += 1;
        state.queue_wait_ns_total += queue_wait_ns;
        state.queued = state.queued.saturating_sub(1);
        state.running += 1;
        let entry = state.by_stage.entry(label.to_string()).or_default();
        entry.started += 1;
        entry.queue_wait_ns += queue_wait_ns;
        entry.queued = entry.queued.saturating_sub(1);
        entry.running += 1;
    }

    pub fn record_cpu_completed(&self, stage: CpuStage) {
        let label = cpu_stage_label(stage);
        let mut state = lock_recover(&self.cpu_admission, "cpu_admission");
        state.completed_total += 1;
        state.running = state.running.saturating_sub(1);
        let entry = state.by_stage.entry(label.to_string()).or_default();
        entry.completed += 1;
        entry.running = entry.running.saturating_sub(1);
    }

    pub fn record_cpu_rejected(&self, stage: CpuStage) {
        let label = cpu_stage_label(stage);
        let mut state = lock_recover(&self.cpu_admission, "cpu_admission");
        state.rejected_total += 1;
        state.queued = state.queued.saturating_sub(1);
        let entry = state.by_stage.entry(label.to_string()).or_default();
        entry.rejected += 1;
        entry.queued = entry.queued.saturating_sub(1);
    }

    pub fn record_cpu_cancelled(&self, stage: CpuStage) {
        let label = cpu_stage_label(stage);
        let mut state = lock_recover(&self.cpu_admission, "cpu_admission");
        state.cancelled_total += 1;
        state.queued = state.queued.saturating_sub(1);
        let entry = state.by_stage.entry(label.to_string()).or_default();
        entry.cancelled += 1;
        entry.queued = entry.queued.saturating_sub(1);
    }

    pub fn record_requests(&self, count: u64) {
        self.total_requests.fetch_add(count, Ordering::Relaxed);
    }

    pub fn uptime_seconds(&self) -> u64 {
        self.started_at.elapsed().as_secs()
    }

    /// Returns a full snapshot for JSON serialization.
    pub fn snapshot(&self, dataset_rows: usize, dataset_revision: u64) -> MetricsSnapshot {
        let total = self.total_requests.load(Ordering::Relaxed);
        let total_ns = self.total_request_duration_ns.load(Ordering::Relaxed);
        let avg_ms = if total > 0 {
            (total_ns as f64 / total as f64) / 1_000_000.0
        } else {
            0.0
        };
        let request_counts = lock_recover(&self.request_counts, "request_counts").clone();
        let correlations_mode_breakdown = lock_recover(
            &self.correlations_mode_breakdown,
            "correlations_mode_breakdown",
        )
        .clone();
        let cpu_admission = build_cpu_admission_snapshot(&self.cpu_admission);
        MetricsSnapshot {
            uptime_seconds: self.started_at.elapsed().as_secs(),
            total_requests: total,
            cache_hits: self.cache_hits.load(Ordering::Relaxed),
            cache_misses: self.cache_misses.load(Ordering::Relaxed),
            rate_limited_requests: self.rate_limited_requests.load(Ordering::Relaxed),
            scatter_sampling: ScatterSamplingSnapshot {
                requests: self.scatter_requests.load(Ordering::Relaxed),
                total_points_seen: self.scatter_points_seen.load(Ordering::Relaxed),
                total_points_returned: self.scatter_points_returned.load(Ordering::Relaxed),
            },
            scatter_stages: ScatterStagesSnapshot {
                filtered_rows_total: self.scatter_filtered_rows.load(Ordering::Relaxed),
                valid_points_total: self.scatter_valid_points.load(Ordering::Relaxed),
                returned_total: self.scatter_returned.load(Ordering::Relaxed),
                response_bytes_total: self.scatter_response_bytes.load(Ordering::Relaxed),
                cache_hit_total: self.scatter_cache_hits.load(Ordering::Relaxed),
                cache_miss_total: self.scatter_cache_misses.load(Ordering::Relaxed),
                collect_ns_total: self.scatter_collect_ns.load(Ordering::Relaxed),
                sample_ns_total: self.scatter_sample_ns.load(Ordering::Relaxed),
                serialize_ns_total: self.scatter_serialize_ns.load(Ordering::Relaxed),
            },
            correlations_stages: CorrelationsStagesSnapshot {
                requests_total: self.correlations_requests.load(Ordering::Relaxed),
                cache_hit_total: self.correlations_cache_hits.load(Ordering::Relaxed),
                cache_miss_total: self.correlations_cache_misses.load(Ordering::Relaxed),
                warmup_dispatched_total: self
                    .correlations_warmup_dispatched
                    .load(Ordering::Relaxed),
                all_modes_total: self.correlations_all_modes.load(Ordering::Relaxed),
                single_flight_total: self.correlations_single_flight.load(Ordering::Relaxed),
                numeric_columns_total: self.correlations_numeric_columns.load(Ordering::Relaxed),
                input_rows_total: self.correlations_input_rows.load(Ordering::Relaxed),
                collect_ns_total: self.correlations_collect_ns.load(Ordering::Relaxed),
                extract_ns_total: self.correlations_extract_ns.load(Ordering::Relaxed),
                pair_calc_ns_total: self.correlations_pair_calc_ns.load(Ordering::Relaxed),
                mode_breakdown: correlations_mode_breakdown,
            },
            rolling_stages: RollingStagesSnapshot {
                requests_total: self.rolling_requests.load(Ordering::Relaxed),
                rows_total: self.rolling_rows.load(Ordering::Relaxed),
                columns_total: self.rolling_columns.load(Ordering::Relaxed),
                response_bytes_total: self.rolling_response_bytes.load(Ordering::Relaxed),
                compute_ns_total: self.rolling_compute_ns.load(Ordering::Relaxed),
            },
            cpu_admission,
            request_counts,
            average_request_ms: avg_ms,
            dataset_rows,
            dataset_revision,
        }
    }
}

fn build_cpu_admission_snapshot(state: &Mutex<CpuAdmissionState>) -> CpuAdmissionSnapshot {
    let guard = lock_recover(state, "cpu_admission");
    CpuAdmissionSnapshot {
        submitted_total: guard.submitted_total,
        started_total: guard.started_total,
        completed_total: guard.completed_total,
        rejected_total: guard.rejected_total,
        cancelled_total: guard.cancelled_total,
        queued: guard.queued,
        running: guard.running,
        queue_wait_ns_total: guard.queue_wait_ns_total,
        by_stage: guard.by_stage.clone(),
    }
}

#[cfg(test)]
mod metrics_stage_tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    fn approx_ns(d: Duration) -> u64 {
        d.as_nanos() as u64
    }

    #[test]
    fn scatter_stage_timers_accumulate() {
        let m = AppMetrics::new();
        m.record_scatter_stage(ScatterStage::Collect, 1_000);
        m.record_scatter_stage(ScatterStage::Collect, 2_000);
        m.record_scatter_stage(ScatterStage::Sample, 5_000);
        m.record_scatter_stage(ScatterStage::Serialize, 7_000);
        m.record_scatter_cache(true);
        m.record_scatter_cache(false);
        m.record_scatter_cache(false);
        m.record_scatter_filtered_rows(100);
        m.record_scatter_valid_points(80);
        m.record_scatter_response(2_048, 40);

        let snap = m.snapshot(0, 0);
        assert_eq!(snap.scatter_stages.collect_ns_total, 3_000);
        assert_eq!(snap.scatter_stages.sample_ns_total, 5_000);
        assert_eq!(snap.scatter_stages.serialize_ns_total, 7_000);
        assert_eq!(snap.scatter_stages.cache_hit_total, 1);
        assert_eq!(snap.scatter_stages.cache_miss_total, 2);
        assert_eq!(snap.scatter_stages.filtered_rows_total, 100);
        assert_eq!(snap.scatter_stages.valid_points_total, 80);
        assert_eq!(snap.scatter_stages.response_bytes_total, 2_048);
        assert_eq!(snap.scatter_stages.returned_total, 40);
    }

    #[test]
    fn correlation_mode_breakdown_is_low_cardinality() {
        let m = AppMetrics::new();
        m.record_correlation_request(false, CorrelationTelemetryMode::PearsonRaw);
        m.record_correlation_input(7, 70_000);
        m.record_correlation_request(true, CorrelationTelemetryMode::PearsonRaw);
        m.record_correlation_input(7, 70_000);
        m.record_correlation_request(false, CorrelationTelemetryMode::KendallDiff);
        m.record_correlation_warmup_dispatched();
        m.record_correlation_input(7, 70_000);
        let snap = m.snapshot(0, 0);
        assert_eq!(snap.correlations_stages.requests_total, 3);
        assert_eq!(snap.correlations_stages.cache_hit_total, 1);
        assert_eq!(snap.correlations_stages.cache_miss_total, 2);
        assert_eq!(snap.correlations_stages.warmup_dispatched_total, 1);
        assert_eq!(
            snap.correlations_stages.mode_breakdown.get("pearson_raw"),
            Some(&2)
        );
        assert_eq!(
            snap.correlations_stages.mode_breakdown.get("kendall_diff"),
            Some(&1)
        );
        assert_eq!(snap.correlations_stages.numeric_columns_total, 21);
        assert_eq!(snap.correlations_stages.input_rows_total, 210_000);
    }

    #[test]
    fn rolling_telemetry_sums_rows_columns_bytes_and_time() {
        let m = AppMetrics::new();
        m.record_rolling(1_000, 3, 8_192, 9_000);
        m.record_rolling(2_000, 5, 16_384, approx_ns(Duration::from_millis(1)));
        let snap = m.snapshot(0, 0);
        assert_eq!(snap.rolling_stages.requests_total, 2);
        assert_eq!(snap.rolling_stages.rows_total, 3_000);
        assert_eq!(snap.rolling_stages.columns_total, 8);
        assert_eq!(snap.rolling_stages.response_bytes_total, 24_576);
        // 9_000 ns + ~1ms in ns — exact equality is brittle; assert >= sum.
        assert!(snap.rolling_stages.compute_ns_total >= 1_009_000);
    }

    #[test]
    fn cpu_admission_records_lifecycle_per_stage() {
        let m = AppMetrics::new();
        m.record_cpu_submit(CpuStage::Scatter);
        m.record_cpu_started(CpuStage::Scatter, 500);
        m.record_cpu_completed(CpuStage::Scatter);
        m.record_cpu_submit(CpuStage::Correlations);
        m.record_cpu_started(CpuStage::Correlations, 800);
        m.record_cpu_submit(CpuStage::Materialization);
        m.record_cpu_started(CpuStage::Materialization, 200);
        m.record_cpu_completed(CpuStage::Materialization);

        let snap = m.snapshot(0, 0);
        assert_eq!(snap.cpu_admission.submitted_total, 3);
        assert_eq!(snap.cpu_admission.started_total, 3);
        assert_eq!(snap.cpu_admission.completed_total, 2);
        assert_eq!(snap.cpu_admission.queue_wait_ns_total, 1_500);
        let scatter = snap
            .cpu_admission
            .by_stage
            .get("scatter")
            .expect("scatter stage entry");
        assert_eq!(scatter.submitted, 1);
        assert_eq!(scatter.started, 1);
        assert_eq!(scatter.completed, 1);
        assert_eq!(scatter.queue_wait_ns, 500);
        let corr = snap
            .cpu_admission
            .by_stage
            .get("correlations")
            .expect("correlations stage entry");
        assert_eq!(corr.submitted, 1);
        assert_eq!(corr.completed, 0);
        assert_eq!(corr.queue_wait_ns, 800);
        let materialization = snap
            .cpu_admission
            .by_stage
            .get("materialization")
            .expect("materialization stage entry");
        assert_eq!(materialization.completed, 1);
        assert_eq!(materialization.queue_wait_ns, 200);
    }

    #[test]
    fn concurrent_recorders_do_not_panic() {
        // Smoke test for atomic counters and mutex-backed maps under
        // contention. We do not assert exact totals — only that no
        // recorder races panics or hangs.
        use std::sync::Arc;
        let m = Arc::new(AppMetrics::new());
        let mut handles = Vec::new();
        for _ in 0..4 {
            let m2 = Arc::clone(&m);
            handles.push(thread::spawn(move || {
                for _ in 0..1000 {
                    m2.record_scatter_stage(ScatterStage::Sample, 10);
                    m2.record_correlation_request(false, CorrelationTelemetryMode::PearsonRaw);
                    m2.record_correlation_input(1, 10);
                    m2.record_cpu_submit(CpuStage::Analytics);
                    m2.record_cpu_started(CpuStage::Analytics, 10);
                    m2.record_cpu_completed(CpuStage::Analytics);
                }
            }));
        }
        for h in handles {
            h.join().expect("worker thread join");
        }
        let snap = m.snapshot(0, 0);
        assert_eq!(snap.scatter_stages.sample_ns_total, 4_000 * 10);
        assert_eq!(snap.correlations_stages.requests_total, 4_000);
        assert_eq!(snap.cpu_admission.submitted_total, 4_000);
        assert_eq!(snap.cpu_admission.completed_total, 4_000);
    }

    #[test]
    fn poisoned_stage_mutexes_recover_and_keep_recording() {
        use std::sync::Arc;

        let m = Arc::new(AppMetrics::new());
        let poisoned = Arc::clone(&m);
        let _ = thread::spawn(move || {
            let _guard = poisoned
                .correlations_mode_breakdown
                .lock()
                .expect("lock correlation telemetry");
            panic!("deliberately poison correlation telemetry mutex");
        })
        .join();

        m.record_correlation_request(false, CorrelationTelemetryMode::PearsonRaw);
        let snap = m.snapshot(0, 0);
        assert_eq!(
            snap.correlations_stages.mode_breakdown.get("pearson_raw"),
            Some(&1)
        );
    }
}
