//! Criterion coverage for the shared time-series downsampler.
//!
//! These cases represent a 1M-row uploaded series reduced to a 2,000-point
//! viewport. One case is the normal monotonically increasing timestamp path;
//! the other has one NaN in the primary value column and must stay bounded.

use criterion::{BenchmarkId, Criterion, black_box, criterion_group, criterion_main};
use edatime_query::downsample::downsample_indices;

const ROWS: usize = 1_000_000;
const TARGET: usize = 2_000;

fn fixture(with_nan: bool) -> (Vec<f64>, Vec<f64>) {
    let x: Vec<f64> = (0..ROWS).map(|index| index as f64).collect();
    let mut y: Vec<f64> = (0..ROWS)
        .map(|index| (index as f64 * 0.001).sin() + (index as f64 * 0.000_001))
        .collect();
    if with_nan {
        y[ROWS / 2] = f64::NAN;
    }
    (x, y)
}

fn bench_downsample(c: &mut Criterion) {
    let mut group = c.benchmark_group("downsample_indices");
    let sorted = fixture(false);
    group.bench_with_input(
        BenchmarkId::new("sorted", format!("{ROWS}r_to_{TARGET}")),
        &sorted,
        |b, (x, y)| {
            b.iter(|| {
                black_box(downsample_indices(black_box(x), black_box(y), TARGET));
            });
        },
    );

    let with_nan = fixture(true);
    group.bench_with_input(
        BenchmarkId::new("one_nan", format!("{ROWS}r_to_{TARGET}")),
        &with_nan,
        |b, (x, y)| {
            b.iter(|| {
                black_box(downsample_indices(black_box(x), black_box(y), TARGET));
            });
        },
    );
    group.finish();
}

criterion_group!(benches, bench_downsample);
criterion_main!(benches);
