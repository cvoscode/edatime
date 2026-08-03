//! Bounded multi-series `/data` overview benchmark.

use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use edatime_query::pipeline::{expand_multi_time_envelope, lazy_multi_time_envelope};
use polars::prelude::*;

fn fixture(rows: usize, series: usize, color: bool) -> DataFrame {
    let ts = Series::new(
        "ts".into(),
        (0..rows).map(|row| row as i64).collect::<Vec<_>>(),
    )
    .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
    .expect("time cast");
    let mut columns = vec![ts.into()];
    for index in 0..series {
        columns.push(
            Series::new(
                format!("v{index}").into(),
                (0..rows)
                    .map(|row| (row as f64 * 0.001 + index as f64).sin())
                    .collect::<Vec<_>>(),
            )
            .into(),
        );
    }
    if color {
        columns.push(
            Series::new(
                "color".into(),
                (0..rows)
                    .map(|row| format!("c{}", row % 64))
                    .collect::<Vec<_>>(),
            )
            .into(),
        );
    }
    DataFrame::new(rows, columns).expect("multi-envelope fixture")
}

fn bench_multi_envelope(c: &mut Criterion) {
    let mut group = c.benchmark_group("data_multi_envelope");
    group.sample_size(10);
    let mut row_counts = vec![100_000usize, 1_000_000];
    if std::env::var("EDATIME_BENCH_LARGE").as_deref() == Ok("1") {
        row_counts.push(10_000_000);
    }
    for rows in row_counts {
        for series_count in [1usize, 4, 16] {
            for with_color in [false, true] {
                let frame = fixture(rows, series_count, with_color);
                let values = (0..series_count)
                    .map(|index| format!("v{index}"))
                    .collect::<Vec<_>>();
                let extra = if with_color {
                    vec!["color".to_string()]
                } else {
                    Vec::new()
                };
                for width in [50usize, 800, 4_000] {
                    let bucket_width = (rows as i64 / (width as i64 * 8)).max(1);
                    group.bench_with_input(
                        BenchmarkId::new(
                            format!("{}series_color{}", series_count, with_color as u8),
                            format!("{rows}r_{width}w"),
                        ),
                        &width,
                        |bench, _| {
                            bench.iter(|| {
                                let envelope = lazy_multi_time_envelope(
                                    frame.clone().lazy(),
                                    "ts",
                                    &values,
                                    &extra,
                                    bucket_width,
                                )
                                .expect("envelope plan")
                                .collect()
                                .expect("envelope collect");
                                expand_multi_time_envelope(&envelope, "ts", &values, &extra)
                                    .expect("expand envelope")
                            });
                        },
                    );
                }
            }
        }
    }
    group.finish();
}

criterion_group!(benches, bench_multi_envelope);
criterion_main!(benches);
