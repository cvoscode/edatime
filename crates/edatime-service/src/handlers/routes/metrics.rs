use axum::{
    Json,
    body::Body,
    extract::State,
    http::{Response, header},
};

use crate::error::AppError;
use edatime_core::metrics::LatencyHistogramSnapshot;
use edatime_store::state::AppState;

pub async fn get_metrics(State(state): State<AppState>) -> Json<serde_json::Value> {
    let rows = state.dataset_rows().await;
    let revision = state.dataset_revision();
    let snapshot = state.metrics.snapshot(rows, revision);
    match serde_json::to_value(snapshot) {
        Ok(mut json) => {
            if let Some(object) = json.as_object_mut() {
                object.insert(
                    "response_cache".to_string(),
                    serde_json::to_value(state.cache.snapshot()).unwrap_or_default(),
                );
                object.insert(
                    "retained_state".to_string(),
                    state
                        .retained_state_snapshot()
                        .ok()
                        .and_then(|snapshot| serde_json::to_value(snapshot).ok())
                        .unwrap_or_default(),
                );
            }
            Json(json)
        }
        Err(err) => Json(serde_json::json!({
            "error": format!("Failed to serialize metrics: {err}")
        })),
    }
}

pub async fn get_prometheus(State(state): State<AppState>) -> Result<Response<Body>, AppError> {
    let rows = state.dataset_rows().await;
    let revision = state.dataset_revision();
    let snapshot = state.metrics.snapshot(rows, revision);
    let cache = state.cache.snapshot();
    let retained = state.retained_state_snapshot()?;
    let mut output = String::new();
    metric(
        &mut output,
        "edatime_uptime_seconds",
        snapshot.uptime_seconds,
    );
    metric(
        &mut output,
        "edatime_requests_total",
        snapshot.total_requests,
    );
    metric(
        &mut output,
        "edatime_response_bytes_total",
        snapshot.body_streaming.bytes,
    );
    metric(
        &mut output,
        "edatime_bodies_completed_total",
        snapshot.body_streaming.completed,
    );
    metric(
        &mut output,
        "edatime_bodies_abandoned_total",
        snapshot.body_streaming.abandoned,
    );
    metric(
        &mut output,
        "edatime_data_requests_total",
        snapshot.data_stages.requests_total,
    );
    metric(
        &mut output,
        "edatime_data_cache_hits_total",
        snapshot.data_stages.cache_hit_total,
    );
    metric(
        &mut output,
        "edatime_data_cache_misses_total",
        snapshot.data_stages.cache_miss_total,
    );
    metric(
        &mut output,
        "edatime_data_filtered_rows_total",
        snapshot.data_stages.filtered_rows_total,
    );
    metric(
        &mut output,
        "edatime_data_candidate_rows_total",
        snapshot.data_stages.candidate_rows_total,
    );
    metric(
        &mut output,
        "edatime_data_returned_rows_total",
        snapshot.data_stages.returned_rows_total,
    );
    metric(
        &mut output,
        "edatime_data_response_bytes_total",
        snapshot.data_stages.response_bytes_total,
    );
    metric(
        &mut output,
        "edatime_data_collect_ns_total",
        snapshot.data_stages.collect_ns_total,
    );
    metric(
        &mut output,
        "edatime_data_reduce_ns_total",
        snapshot.data_stages.reduce_ns_total,
    );
    metric(
        &mut output,
        "edatime_data_serialize_ns_total",
        snapshot.data_stages.serialize_ns_total,
    );
    for (stage, histogram) in [
        ("collect", &snapshot.data_stages.stage_latency.collect),
        (
            "reduce",
            &snapshot.data_stages.stage_latency.reduce_or_sample,
        ),
        ("serialize", &snapshot.data_stages.stage_latency.serialize),
    ] {
        // Keep the original totals for dashboards that predate the histogram
        // series. The histogram below adds distribution data without a
        // breaking metric rename.
        metric_labeled(
            &mut output,
            "edatime_data_stage_observations_total",
            &[("stage", stage)],
            histogram.count,
        );
        metric_labeled(
            &mut output,
            "edatime_data_stage_duration_ns_total",
            &[("stage", stage)],
            histogram.sum_ns,
        );
        histogram_labeled(
            &mut output,
            "edatime_data_stage_duration_ms",
            stage,
            histogram,
        );
    }
    for (stage, histogram) in [
        ("collect", &snapshot.scatter_stages.stage_latency.collect),
        (
            "sample",
            &snapshot.scatter_stages.stage_latency.reduce_or_sample,
        ),
        (
            "serialize",
            &snapshot.scatter_stages.stage_latency.serialize,
        ),
    ] {
        metric_labeled(
            &mut output,
            "edatime_scatter_stage_observations_total",
            &[("stage", stage)],
            histogram.count,
        );
        metric_labeled(
            &mut output,
            "edatime_scatter_stage_duration_ns_total",
            &[("stage", stage)],
            histogram.sum_ns,
        );
        histogram_labeled(
            &mut output,
            "edatime_scatter_stage_duration_ms",
            stage,
            histogram,
        );
    }
    metric(
        &mut output,
        "edatime_cpu_queued",
        snapshot.cpu_admission.queued,
    );
    metric(
        &mut output,
        "edatime_cpu_running",
        snapshot.cpu_admission.running,
    );
    metric(
        &mut output,
        "edatime_cpu_rejected_total",
        snapshot.cpu_admission.rejected_total,
    );
    metric(&mut output, "edatime_cache_entries", cache.entries as u64);
    metric(
        &mut output,
        "edatime_cache_resident_bytes",
        cache.resident_bytes as u64,
    );
    metric(
        &mut output,
        "edatime_cache_evictions_total",
        cache.evictions,
    );
    metric(&mut output, "edatime_cache_computes_total", cache.computes);
    metric(
        &mut output,
        "edatime_cache_in_flight",
        cache.in_flight as u64,
    );
    metric(
        &mut output,
        "edatime_resident_versions",
        retained.versions.resident_versions as u64,
    );
    metric(
        &mut output,
        "edatime_resident_version_bytes",
        retained.versions.resident_bytes,
    );
    metric(
        &mut output,
        "edatime_resident_version_evictions_total",
        retained.versions.resident_evictions,
    );
    metric(
        &mut output,
        "edatime_jobs_queued",
        retained.jobs.queued as u64,
    );
    metric(
        &mut output,
        "edatime_jobs_running",
        retained.jobs.running as u64,
    );
    metric(
        &mut output,
        "edatime_jobs_terminal",
        retained.jobs.terminal as u64,
    );
    for (route, values) in snapshot.routes {
        let route = prometheus_escape(&route);
        output.push_str(&format!(
            "edatime_route_requests_total{{route=\"{route}\"}} {}\n",
            values.requests
        ));
        output.push_str(&format!(
            "edatime_route_errors_total{{route=\"{route}\"}} {}\n",
            values.errors
        ));
        output.push_str(&format!(
            "edatime_route_response_bytes_total{{route=\"{route}\"}} {}\n",
            values.response_bytes
        ));
        output.push_str(&format!(
            "edatime_route_bodies_completed_total{{route=\"{route}\"}} {}\n",
            values.bodies_completed
        ));
        output.push_str(&format!(
            "edatime_route_bodies_abandoned_total{{route=\"{route}\"}} {}\n",
            values.bodies_abandoned
        ));
        for (index, count) in values.handler_latency.cumulative_counts.iter().enumerate() {
            let bound = values
                .handler_latency
                .bounds_ms
                .get(index)
                .map(ToString::to_string)
                .unwrap_or_else(|| "+Inf".to_string());
            output.push_str(&format!(
                "edatime_route_handler_latency_ms_bucket{{route=\"{route}\",le=\"{bound}\"}} {count}\n"
            ));
        }
        output.push_str(&format!(
            "edatime_route_handler_latency_ms_count{{route=\"{route}\"}} {}\n",
            values.handler_latency.count
        ));
        output.push_str(&format!(
            "edatime_route_handler_latency_ms_sum{{route=\"{route}\"}} {:.6}\n",
            values.handler_latency.sum_ns as f64 / 1_000_000.0
        ));
        for (index, count) in values.body_latency.cumulative_counts.iter().enumerate() {
            let bound = values
                .body_latency
                .bounds_ms
                .get(index)
                .map(ToString::to_string)
                .unwrap_or_else(|| "+Inf".to_string());
            output.push_str(&format!(
                "edatime_route_body_latency_ms_bucket{{route=\"{route}\",le=\"{bound}\"}} {count}\n"
            ));
        }
        output.push_str(&format!(
            "edatime_route_body_latency_ms_count{{route=\"{route}\"}} {}\n",
            values.body_latency.count
        ));
        output.push_str(&format!(
            "edatime_route_body_latency_ms_sum{{route=\"{route}\"}} {:.6}\n",
            values.body_latency.sum_ns as f64 / 1_000_000.0
        ));
    }
    for (code, count) in snapshot.errors_by_code {
        output.push_str(&format!(
            "edatime_errors_total{{code=\"{}\"}} {count}\n",
            prometheus_escape(&code)
        ));
    }
    Response::builder()
        .header(
            header::CONTENT_TYPE,
            "text/plain; version=0.0.4; charset=utf-8",
        )
        .body(Body::from(output))
        .map_err(|error| AppError::internal(format!("Build Prometheus response: {error}")))
}

fn metric(output: &mut String, name: &str, value: u64) {
    output.push_str(name);
    output.push(' ');
    output.push_str(&value.to_string());
    output.push('\n');
}

fn metric_labeled(output: &mut String, name: &str, labels: &[(&str, &str)], value: u64) {
    output.push_str(name);
    output.push('{');
    for (index, (key, label)) in labels.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }
        output.push_str(key);
        output.push_str("=\"");
        output.push_str(&prometheus_escape(label));
        output.push('"');
    }
    output.push_str("} ");
    output.push_str(&value.to_string());
    output.push('\n');
}

/// Write a Prometheus histogram with a bounded `stage` label. The final
/// cumulative bucket stored by AppMetrics is the implicit `+Inf` bucket.
fn histogram_labeled(
    output: &mut String,
    name: &str,
    stage: &str,
    histogram: &LatencyHistogramSnapshot,
) {
    for (index, count) in histogram.cumulative_counts.iter().enumerate() {
        let bound = histogram
            .bounds_ms
            .get(index)
            .map(ToString::to_string)
            .unwrap_or_else(|| "+Inf".to_string());
        metric_labeled(
            output,
            &format!("{name}_bucket"),
            &[("stage", stage), ("le", &bound)],
            *count,
        );
    }
    metric_labeled(
        output,
        &format!("{name}_count"),
        &[("stage", stage)],
        histogram.count,
    );
    output.push_str(&format!(
        "{name}_sum{{stage=\"{}\"}} {:.6}\n",
        prometheus_escape(stage),
        histogram.sum_ns as f64 / 1_000_000.0
    ));
}

fn prometheus_escape(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
}

#[cfg(test)]
mod tests {
    use super::histogram_labeled;
    use edatime_core::metrics::LatencyHistogramSnapshot;

    #[test]
    fn stage_histogram_emits_buckets_count_and_ms_sum() {
        let histogram = LatencyHistogramSnapshot {
            count: 3,
            sum_ns: 3_500_000,
            bounds_ms: vec![1, 5],
            cumulative_counts: vec![1, 3, 3],
            p50_ms: 1,
            p95_ms: 5,
            p99_ms: 5,
        };
        let mut output = String::new();

        histogram_labeled(
            &mut output,
            "edatime_data_stage_duration_ms",
            "collect",
            &histogram,
        );

        assert!(
            output.contains("edatime_data_stage_duration_ms_bucket{stage=\"collect\",le=\"1\"} 1")
        );
        assert!(
            output.contains("edatime_data_stage_duration_ms_bucket{stage=\"collect\",le=\"5\"} 3")
        );
        assert!(
            output
                .contains("edatime_data_stage_duration_ms_bucket{stage=\"collect\",le=\"+Inf\"} 3")
        );
        assert!(output.contains("edatime_data_stage_duration_ms_count{stage=\"collect\"} 3"));
        assert!(output.contains("edatime_data_stage_duration_ms_sum{stage=\"collect\"} 3.500000"));
    }
}
