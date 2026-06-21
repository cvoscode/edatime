use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use edatime_service::causal::{
    CausalDataFrame, CondIndTest, IndependenceTestKind, Lpcmci, Pcmci, PcmciPlus,
    pcmci::PcmciConfig,
};

fn next_noise(state: &mut u64) -> f64 {
    *state = state
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407);
    ((*state >> 33) as f64) / (u32::MAX as f64) - 0.5
}

fn lagged_chain_frame(n_vars: usize, n_samples: usize) -> CausalDataFrame {
    let mut state = 41u64;
    let mut cols = vec![vec![0.0; n_samples]; n_vars];
    for t in 0..n_samples {
        cols[0][t] = next_noise(&mut state);
        for v in 1..n_vars {
            cols[v][t] = if t == 0 {
                next_noise(&mut state)
            } else {
                0.55 * cols[v][t - 1] + 0.35 * cols[v - 1][t - 1] + 0.10 * next_noise(&mut state)
            };
        }
    }
    let names = (0..n_vars).map(|v| format!("v{v}")).collect();
    CausalDataFrame::new(cols, names)
}

fn contemporaneous_chain_frame(n_vars: usize, n_samples: usize) -> CausalDataFrame {
    let mut state = 73u64;
    let mut cols = vec![vec![0.0; n_samples]; n_vars];
    for t in 0..n_samples {
        cols[0][t] = next_noise(&mut state);
        for v in 1..n_vars {
            cols[v][t] = 0.75 * cols[v - 1][t] + 0.25 * next_noise(&mut state);
        }
    }
    let names = (0..n_vars).map(|v| format!("v{v}")).collect();
    CausalDataFrame::new(cols, names)
}

fn pcmci_bench(c: &mut Criterion) {
    let mut group = c.benchmark_group("pcmci_parcorr");
    for &(n_vars, n_samples) in &[(5usize, 1_000usize), (10, 5_000), (20, 10_000)] {
        let df = lagged_chain_frame(n_vars, n_samples);
        let test = CondIndTest::new(IndependenceTestKind::ParCorr);
        let engine = Pcmci::new(&df, &test);
        let config = PcmciConfig {
            tau_min: 1,
            tau_max: 2,
            pc_alpha: 0.2,
            alpha_level: 0.05,
            max_conds_dim: Some(2),
            max_combinations: 1,
            max_conds_py: Some(2),
            max_conds_px: Some(2),
            fdr_method: "none".to_string(),
        };
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{n_vars}v_{n_samples}s")),
            &(n_vars, n_samples),
            |b, _| b.iter(|| engine.run(&config)),
        );
    }
    group.finish();
}

fn pcmci_high_lag_bench(c: &mut Criterion) {
    let mut group = c.benchmark_group("pcmci_parcorr_high_lag");
    group.sample_size(10);
    let df = lagged_chain_frame(5, 5_000);
    let test = CondIndTest::new(IndependenceTestKind::ParCorr);
    let engine = Pcmci::new(&df, &test);
    let config = PcmciConfig {
        tau_min: 1,
        tau_max: 128,
        pc_alpha: 0.2,
        alpha_level: 0.05,
        max_conds_dim: Some(2),
        max_combinations: 1,
        max_conds_py: Some(2),
        max_conds_px: Some(2),
        fdr_method: "none".to_string(),
    };
    group.bench_function("5v_5000s_tau128", |b| b.iter(|| engine.run(&config)));
    group.finish();
}

fn pcmciplus_bench(c: &mut Criterion) {
    let mut group = c.benchmark_group("pcmciplus_parcorr");
    for &(n_vars, n_samples) in &[(5usize, 1_000usize), (10, 5_000), (20, 10_000)] {
        let df = contemporaneous_chain_frame(n_vars, n_samples);
        let test = CondIndTest::new(IndependenceTestKind::ParCorr);
        let engine = PcmciPlus::new(&df, &test);
        let config = PcmciConfig {
            tau_min: 0,
            tau_max: 1,
            pc_alpha: 0.05,
            alpha_level: 0.01,
            max_conds_dim: Some(2),
            max_combinations: 1,
            max_conds_py: Some(2),
            max_conds_px: Some(2),
            fdr_method: "none".to_string(),
        };
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{n_vars}v_{n_samples}s")),
            &(n_vars, n_samples),
            |b, _| b.iter(|| engine.run(&config)),
        );
    }
    group.finish();
}

fn cmi_knn_bench(c: &mut Criterion) {
    let mut group = c.benchmark_group("pcmci_cmi_knn");
    for &(n_vars, n_samples) in &[(5usize, 1_000usize), (10, 5_000), (20, 10_000)] {
        let df = lagged_chain_frame(n_vars, n_samples);
        let mut test = CondIndTest::new(IndependenceTestKind::CmiKnn);
        test.knn = 10;
        test.sig_samples = 32;
        let engine = Pcmci::new(&df, &test);
        let config = PcmciConfig {
            tau_min: 1,
            tau_max: 1,
            pc_alpha: 0.2,
            alpha_level: 0.05,
            max_conds_dim: Some(1),
            max_combinations: 1,
            max_conds_py: Some(1),
            max_conds_px: Some(1),
            fdr_method: "none".to_string(),
        };
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{n_vars}v_{n_samples}s")),
            &(n_vars, n_samples),
            |b, _| b.iter(|| engine.run(&config)),
        );
    }
    group.finish();
}

fn lpcmci_smoke(c: &mut Criterion) {
    let mut group = c.benchmark_group("lpcmci_parcorr_smoke");
    let df = lagged_chain_frame(5, 1_000);
    let test = CondIndTest::new(IndependenceTestKind::ParCorr);
    let engine = Lpcmci::new(&df, &test);
    let config = PcmciConfig {
        tau_min: 0,
        tau_max: 1,
        pc_alpha: 0.05,
        alpha_level: 0.05,
        max_conds_dim: Some(1),
        max_combinations: 1,
        max_conds_py: Some(1),
        max_conds_px: Some(1),
        fdr_method: "none".to_string(),
    };
    group.bench_function("5v_1000s", |b| b.iter(|| engine.run(&config, 1)));
    group.finish();
}

criterion_group!(
    causal_benches,
    pcmci_bench,
    pcmci_high_lag_bench,
    pcmciplus_bench,
    cmi_knn_bench,
    lpcmci_smoke
);
criterion_main!(causal_benches);
