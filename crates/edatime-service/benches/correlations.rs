//! Criterion bench for the correlation matrix computation.
//!
//! Phase 0.2: measures `compute_correlation_matrix` (the inner loop of
//! `/api/v1/scatter/correlations` and the cache-miss / warmup path)
//! against the synthetic wide_frame fixture. The matrix is currently
//! O(n^2 × pair_cost) plus O(n × col_cost) extraction per pair; Phase 3
//! will refactor the extraction and may move this bench to a different
//! entry point.

use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
// `compute_correlation_matrix` lives in a private module. The bench
// reaches it through the `*_bench_target` re-export on the public
// scatter module surface (`#[doc(hidden)]`).
use edatime_core::metrics::AppMetrics;
use edatime_service::handlers::scatter::compute_correlation_matrix_bench_target as compute_correlation_matrix;
use polars::prelude::*;
use std::sync::Arc;

const SEED: u64 = 0xA5A5_A5A5_5A5A_5A5A;

/// Deterministic wide numeric frame: `columns` numeric columns, `rows`
/// rows, no nulls. Used to exercise the O(n^2) correlation loop with a
/// non-trivial pair count.
fn synth_wide_frame(columns: usize, rows: usize) -> DataFrame {
    let mut state = SEED.wrapping_add(rows as u64).wrapping_add(columns as u64);
    let mut ts = Vec::with_capacity(rows);
    let mut cols: Vec<Vec<f64>> = (0..columns).map(|_| Vec::with_capacity(rows)).collect();

    for i in 0..rows {
        ts.push(i as i64);
        for j in 0..columns {
            let trend = ((i as f64) * 0.001 + j as f64 * 0.5).cos();
            let shared = ((i as f64) * 0.0003).sin() * (j as f64 * 0.2).cos() * 25.0;
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            let noise = ((state >> 33) as f64) / (u32::MAX as f64) - 0.5;
            cols[j].push(50.0 + trend * 15.0 + shared + noise);
        }
    }

    let mut columns_df: Vec<Column> = Vec::with_capacity(columns + 1);
    columns_df.push(
        Column::new("ts".into(), ts)
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .expect("cast ts to datetime"),
    );
    for (j, col) in cols.into_iter().enumerate() {
        columns_df.push(Column::new(format!("c{j}").into(), col));
    }
    DataFrame::new(rows, columns_df).expect("synth_wide_frame")
}

fn bench_correlations(c: &mut Criterion) {
    let mut group = c.benchmark_group("correlations_matrix");
    // Numeric column counts sweep the upper-triangle pair count from
    // 6 pairs (4 columns) to 120 pairs (16 columns). Row count stays
    // moderate so the bench finishes in a reasonable time.
    for &cols in &[4usize, 8, 16] {
        let df = synth_wide_frame(cols, 5_000);
        let metrics = Arc::new(AppMetrics::new());
        let lazy = df.lazy();
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{cols}c_5k_rows")),
            &cols,
            |b, _| {
                b.iter(|| {
                    compute_correlation_matrix(lazy.clone(), Arc::clone(&metrics))
                        .expect("correlation matrix");
                });
            },
        );
    }
    group.finish();
}

criterion_group!(benches, bench_correlations);
criterion_main!(benches);
