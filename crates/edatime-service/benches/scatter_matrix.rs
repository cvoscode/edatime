//! Shared-scan scatter-matrix Criterion coverage.

use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use edatime_service::handlers::scatter::{TimeColorMode, collect_sampled_matrix_rows_bench_target};
use polars::prelude::*;

fn fixture(rows: usize, columns: usize, categorical_color: bool) -> DataFrame {
    let mut data = Vec::with_capacity(columns + 1);
    for column in 0..columns {
        data.push(
            Series::new(
                format!("c{column}").into(),
                (0..rows)
                    .map(|row| {
                        (row as f64 * 0.001 + column as f64 * 0.17).sin()
                            + (row as f64 * 0.000_13).cos()
                    })
                    .collect::<Vec<_>>(),
            )
            .into(),
        );
    }
    if categorical_color {
        data.push(
            Series::new(
                "color".into(),
                (0..rows)
                    .map(|row| format!("category-{}", row % 1_000))
                    .collect::<Vec<_>>(),
            )
            .into(),
        );
    }
    DataFrame::new(rows, data).expect("scatter matrix fixture")
}

fn pairs(columns: usize, requested: usize) -> Vec<(String, String)> {
    let mut pairs = Vec::with_capacity(requested);
    for left in 0..columns {
        for right in (left + 1)..columns {
            pairs.push((format!("c{left}"), format!("c{right}")));
            if pairs.len() == requested {
                return pairs;
            }
        }
    }
    pairs
}

fn bench_scatter_matrix(c: &mut Criterion) {
    let mut group = c.benchmark_group("scatter_matrix_shared_scan");
    group.sample_size(10);
    for &(pair_count, rows) in &[
        (4usize, 10_000usize),
        (16, 100_000),
        (64, 100_000),
        (256, 1_000_000),
    ] {
        let columns = 24;
        let frame = fixture(rows, columns, false);
        let pairs = pairs(columns, pair_count);
        group.bench_with_input(
            BenchmarkId::new("numeric", format!("{pair_count}p_{rows}r")),
            &(pair_count, rows),
            |bench, _| {
                bench.iter(|| {
                    collect_sampled_matrix_rows_bench_target(
                        frame.clone().lazy(),
                        &pairs,
                        None,
                        2_000,
                        TimeColorMode::Bucket,
                        "criterion-numeric",
                    )
                    .expect("matrix sample")
                });
            },
        );
    }
    let frame = fixture(100_000, 24, true);
    let pairs = pairs(24, 64);
    group.bench_function("categorical_color_64p_100000r", |bench| {
        bench.iter(|| {
            collect_sampled_matrix_rows_bench_target(
                frame.clone().lazy(),
                &pairs,
                Some("color"),
                2_000,
                TimeColorMode::Bucket,
                "criterion-categorical",
            )
            .expect("categorical matrix sample")
        });
    });
    group.finish();
}

criterion_group!(benches, bench_scatter_matrix);
criterion_main!(benches);
