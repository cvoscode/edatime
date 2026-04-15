use criterion::{Criterion, black_box, criterion_group, criterion_main};
use edatime::pipeline::{Reduction, apply_reduction, filter_time_range};
use edatime::routes::metadata::build_dataset_metadata;
use polars::prelude::{DataFrame, DataType, NamedFrom, Series, TimeUnit};

fn build_frame(rows: usize, series_count: usize) -> DataFrame {
    let timestamps: Vec<i64> = (0..rows)
        .map(|index| 1_700_000_000_000i64 + index as i64 * 1_000)
        .collect();
    let ts = Series::new("ts".into(), timestamps)
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .expect("cast ts to datetime")
        .into();

    let mut columns = vec![ts];
    for series_index in 0..series_count {
        let name = format!("value_{}", series_index);
        let values: Vec<f64> = (0..rows)
            .map(|index| {
                let x = index as f64 / 113.0;
                x.sin() * 100.0 + x.cos() * 25.0 + series_index as f64 * 5.0
            })
            .collect();
        columns.push(Series::new(name.into(), values).into());
    }

    DataFrame::new(rows, columns).expect("synthetic benchmark dataframe")
}

fn value_columns(series_count: usize) -> Vec<String> {
    (0..series_count)
        .map(|series_index| format!("value_{}", series_index))
        .collect()
}

fn bench_time_filter_and_downsample(c: &mut Criterion) {
    let df = build_frame(200_000, 3);
    let columns = value_columns(3);
    let start = 1_700_025_000_000i64;
    let end = 1_700_145_000_000i64;
    let reduction = Reduction::Lttb {
        target_points: 2_400,
    };

    c.bench_function("time_filter_and_lttb_200k_3_series", |b| {
        b.iter(|| {
            let filtered = filter_time_range(
                black_box(df.clone()),
                black_box(start),
                black_box(end),
                black_box(&columns),
            )
            .expect("filter time range");
            let (reduced, was_downsampled) = apply_reduction(
                black_box(&filtered),
                black_box(&columns),
                black_box(&[] as &[String]),
                black_box(&reduction),
            )
            .expect("apply lttb reduction");
            black_box((reduced.height(), was_downsampled));
        })
    });
}

fn bench_metadata_profile(c: &mut Criterion) {
    let df = build_frame(75_000, 4);

    c.bench_function("metadata_profile_75k_4_series", |b| {
        b.iter(|| {
            let metadata = build_dataset_metadata(black_box(&df), black_box(true))
                .expect("build dataset metadata");
            black_box((metadata.total_rows, metadata.numeric_columns.len()));
        })
    });
}

criterion_group!(
    pipeline_benches,
    bench_time_filter_and_downsample,
    bench_metadata_profile
);
criterion_main!(pipeline_benches);
