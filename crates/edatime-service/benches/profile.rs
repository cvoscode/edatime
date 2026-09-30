#![allow(clippy::unwrap_used, clippy::expect_used)]
//! Criterion benchmark for exact high-cardinality numeric profiling.

use criterion::{Criterion, criterion_group, criterion_main};
use edatime_service::handlers::routes::metadata::build_dataset_metadata;
use polars::prelude::{Column, DataFrame};

fn high_cardinality_frame(rows: usize) -> DataFrame {
    let values = (0..rows)
        .map(|index| index as f64 * 0.75 + 0.125)
        .collect::<Vec<_>>();
    DataFrame::new(rows, vec![Column::new("signal".into(), values)])
        .expect("profile benchmark frame")
}

fn bench_exact_profile(c: &mut Criterion) {
    for rows in [100_000, 1_000_000] {
        let frame = high_cardinality_frame(rows);
        c.bench_function(&format!("exact_profile_{rows}_high_cardinality"), |bench| {
            bench.iter(|| build_dataset_metadata(&frame, false, None).expect("profile"));
        });
    }
}

criterion_group!(benches, bench_exact_profile);
criterion_main!(benches);
