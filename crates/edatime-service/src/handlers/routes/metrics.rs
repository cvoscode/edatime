use axum::{
    Json,
    body::Body,
    extract::State,
    http::{Response, header},
};

use crate::error::AppError;
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

fn prometheus_escape(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
}
