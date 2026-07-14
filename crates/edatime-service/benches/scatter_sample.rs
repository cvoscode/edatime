//! Criterion bench for the scatter sampler.
//!
//! Phase 0.2: measures `collect_sampled_xyc_rows` (the inner-loop cost of
//! `/api/v1/scatter/points` after the lazy collect) against the synthetic
//! `wide_frame` fixture at row counts that exercise both the
//! under-effective-limit and the over-effective-limit branches.
//!
//! Compare against `benchmarks/<env>.bench.txt` for the wall-clock number
//! and `benchmarks/<env>.metrics.json` for the scatter_stages.breakdown
//! the request-level telemetry already records.

use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use edatime_service::handlers::scatter::{
    ScatterColorKind, TimeColorMode, collect_sampled_xyc_rows,
};
use polars::prelude::*;

const SEED: u64 = 0x5D5E_E5A4_DEAD_BEEF;

/// Deterministic synthetic fixture: `numeric_columns` numeric columns,
/// `rows` rows, no nulls, with a gentle sinusoidal trend so LTTB has a
/// non-trivial envelope to retain.
fn synth_frame(numeric_columns: usize, rows: usize) -> DataFrame {
    let mut state = SEED.wrapping_add(rows as u64);
    let mut ts = Vec::with_capacity(rows);
    let mut cols: Vec<Vec<f64>> =
        (0..numeric_columns).map(|_| Vec::with_capacity(rows)).collect();

    for i in 0..rows {
        // 1 ms step is irrelevant to scatter sampling — we never compare
        // the value, only the row count.
        ts.push(i as i64);
        // Column j is a phase-shifted sinusoid + per-row noise.
        for j in 0..numeric_columns {
            let phase = j as f64 * 0.37;
            let trend = (i as f64 * 0.001 + phase).sin();
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            let noise = ((state >> 33) as f64) / (u32::MAX as f64) - 0.5;
            let value = 50.0 + trend * 20.0 + noise;
            cols[j].push(value);
        }
    }

    let mut columns: Vec<Column> = Vec::with_capacity(numeric_columns + 1);
    columns.push(
        Column::new("ts".into(), ts)
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .expect("cast ts to datetime"),
    );
    for (j, col) in cols.into_iter().enumerate() {
        columns.push(Column::new(format!("col_{j}").into(), col));
    }
    DataFrame::new(rows, columns).expect("synth_frame")
}

fn bench_scatter_sample(c: &mut Criterion) {
    let mut group = c.benchmark_group("scatter_sample");
    // Effective limit is the operator-tunable scatter cap (default
    // 200_000). The bench sweeps row counts above and below it so we
    // observe both code paths.
    for &rows in &[10_000usize, 100_000, 500_000] {
        let df = synth_frame(4, rows);
        // Limit chosen so 500_000 rows exercises the bounded stride path
        // while 10_000 rows stays inside the head slice.
        let effective_limit = 200_000;
        let limit = effective_limit;
        group.bench_with_input(
            BenchmarkId::from_parameter(rows),
            &rows,
            |b, _| {
                b.iter(|| {
                    collect_sampled_xyc_rows(
                        &df,
                        "col_0",
                        "col_1",
                        Some("col_2"),
                        Some("col_3"),
                        limit,
                        effective_limit,
                        TimeColorMode::Bucket,
                    )
                    .expect("scatter sample should not error");
                });
            },
        );
    }
    group.finish();
}

fn bench_scatter_sample_color_kind(c: &mut Criterion) {
    let mut group = c.benchmark_group("scatter_sample_color_kind");
    let df = synth_frame(4, 200_000);
    let effective_limit = 200_000;
    // The categorical vs continuous split is meaningful for Phase 1
    // because the cardinality cap runs only on categorical. Capture both
    // now so any change to that branch is visible.
    group.bench_with_input(
        BenchmarkId::from_parameter("continuous"),
        &"continuous",
        |b, _| {
            b.iter(|| {
                let (_, _, kind) = collect_sampled_xyc_rows(
                    &df,
                    "col_0",
                    "col_1",
                    Some("col_2"),
                    None,
                    200_000,
                    effective_limit,
                    TimeColorMode::Bucket,
                )
                .expect("continuous sample");
                // Touch the returned kind so the compiler does not
                // optimize the dispatch away.
                let _ = matches!(kind, Some(ScatterColorKind::Continuous));
            });
        },
    );
    group.bench_with_input(
        BenchmarkId::from_parameter("categorical"),
        &"categorical",
        |b, _| {
            // Build a small categorical column on demand because
            // `synth_frame` does not produce strings.
            let labels: Vec<String> = (0..200_000)
                .map(|i| ["A", "B", "C", "D"][i % 4].to_string())
                .collect();
            let mut df_cat = df.clone();
            df_cat
                .with_column(Column::new("cat".into(), labels))
                .expect("add cat column");
            b.iter(|| {
                let (_, _, kind) = collect_sampled_xyc_rows(
                    &df_cat,
                    "col_0",
                    "col_1",
                    Some("cat"),
                    None,
                    200_000,
                    effective_limit,
                    TimeColorMode::Bucket,
                )
                .expect("categorical sample");
                let _ = matches!(kind, Some(ScatterColorKind::Categorical));
            });
        },
    );
    group.finish();
}

criterion_group!(
    benches,
    bench_scatter_sample,
    bench_scatter_sample_color_kind
);
criterion_main!(benches);
