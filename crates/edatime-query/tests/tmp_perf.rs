use edatime_query::executor::{ExecutionContext, QueryExecutor};
use polars::prelude::*;
use std::sync::Arc;
use std::time::{Duration, Instant};

fn frame(n: i64) -> LazyFrame {
    let ts: Vec<i64> = (0..n).map(|i| 1_700_000_000_000 + i * 1000).collect();
    let cols: Vec<Column> = std::iter::once(
        Column::new("ts".into(), ts).cast(&DataType::Datetime(TimeUnit::Milliseconds, None)).unwrap(),
    )
    .chain((0..4).map(|c| {
        Column::new(format!("v{c}").into(), (0..n).map(|i| ((i + c) as f64).sin()).collect::<Vec<f64>>())
    }))
    .collect();
    DataFrame::new(n as usize, cols).unwrap().lazy()
}

#[test]
fn perf_probe_vs_envelope() {
    let lf = frame(2_000_000);
    let cols: Vec<String> = (0..4).map(|c| format!("v{c}")).collect();
    let sorted = lf.sort(["ts"], SortMultipleOptions::default().with_maintain_order(true));
    let cap = 4000u32;
    let t = Instant::now();
    for _ in 0..3 { let _ = sorted.clone().slice(0, cap + 1).collect().unwrap(); }
    println!("PROBE (sort+slice): {:?}", t.elapsed() / 3);
    let env = edatime_query::pipeline::lazy_multi_time_envelope(sorted, "ts", &cols, &[], 2_000_000_000 / 1000).unwrap();
    let t = Instant::now();
    for _ in 0..3 { let _ = env.clone().collect().unwrap(); }
    println!("ENVELOPE: {:?}", t.elapsed() / 3);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn perf_concurrent_collects() {
    let exec = Arc::new(QueryExecutor::new(ExecutionContext::Parallel).with_admission(4, 2, 2, 8, Duration::from_secs(60)));
    let lf = frame(1_000_000);
    let q = lf
        .group_by_dynamic(col("ts"), [], DynamicGroupOptions {
            every: polars::prelude::Duration::parse("1m"),
            period: polars::prelude::Duration::parse("1m"),
            offset: polars::prelude::Duration::parse("0ns"),
            ..Default::default()
        })
        .agg([col("v0").mean(), col("v1").max(), col("v2").min(), col("v3").std(1)]);
    let t = Instant::now();
    let mut set = tokio::task::JoinSet::new();
    for _ in 0..16 {
        let (e, q) = (Arc::clone(&exec), q.clone());
        set.spawn(async move { e.execute_async(q).await.unwrap().height() });
    }
    while set.join_next().await.is_some() {}
    println!("CONCURRENT 16x: {:?} (POLARS_MAX_THREADS={:?})", t.elapsed(), std::env::var("POLARS_MAX_THREADS"));
}
