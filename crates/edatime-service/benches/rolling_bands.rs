//! Criterion bench for the rolling bands computation.
//!
//! Phase 0.2: measures `analytics::compute_rolling_bands` against the
//! synthetic `long_numeric` fixture. The current implementation is
//! `O(rows × window × columns)` and Phase 2 plans a prefix-sum refactor;
//! these numbers pin the existing cost and let us verify the linear
//! scaling afterward.

use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use edatime_service::analytics::compute_rolling_bands;
use polars::prelude::*;

const SEED: u64 = 0x1337_BEEF_C0DE_CAFE;

/// Deterministic time-series fixture: `rows` rows, `columns` numeric
/// columns, no nulls. Used for `long_numeric` and any window sweep.
fn synth_long_frame(rows: usize, columns: usize) -> DataFrame {
    let mut state = SEED.wrapping_add(rows as u64);
    let mut ts = Vec::with_capacity(rows);
    let mut cols: Vec<Vec<f64>> = (0..columns).map(|_| Vec::with_capacity(rows)).collect();

    for i in 0..rows {
        ts.push(i as i64);
        for j in 0..columns {
            let trend = ((i as f64) * 0.0001 + j as f64 * 0.17).sin();
            let quarterly = ((i % 1440) as f64 / 1440.0 * std::f64::consts::TAU).cos();
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            let noise = ((state >> 33) as f64) / (u32::MAX as f64) - 0.5;
            cols[j].push(100.0 + trend * 30.0 + quarterly * 5.0 + noise * 0.5);
        }
    }

    let mut columns_df: Vec<Column> = Vec::with_capacity(columns + 1);
    columns_df.push(
        Column::new("ts".into(), ts)
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .expect("cast ts to datetime"),
    );
    for (j, col) in cols.into_iter().enumerate() {
        columns_df.push(Column::new(format!("v{j}").into(), col));
    }
    DataFrame::new(rows, columns_df).expect("synth_long_frame")
}

fn bench_rolling(c: &mut Criterion) {
    let mut group = c.benchmark_group("rolling_bands");
    // Three window sizes mirroring the route-level clamp (2..=10_000):
    // 50 (default), 200, 2_000. Two row counts under and over the default
    // sampling range.
    let cases: &[(usize, usize)] = &[(50_000, 50), (50_000, 200), (200_000, 50), (200_000, 2_000)];
    for &(rows, window) in cases {
        let df = synth_long_frame(rows, 3);
        let col_names: Vec<String> = (0..3).map(|j| format!("v{j}")).collect();
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{rows}r_w{window}")),
            &(rows, window),
            |b, _| {
                b.iter(|| {
                    compute_rolling_bands(&df, &col_names, window).expect("rolling bands");
                });
            },
        );
    }
    group.finish();
}

criterion_group!(benches, bench_rolling);
criterion_main!(benches);
