use super::super::independence::IndependenceTestKind;
use super::*;
use crate::causal::PcmciPlus;
use crate::error::ErrorCode;
use edatime_core::cancellation::cancellation_pair;

#[test]
fn test_pcmci_simple_chain() {
    // Create X → Y → Z with lag 1
    let n = 500;
    let mut x = vec![0.0f64; n];
    let mut y = vec![0.0f64; n];
    let mut z = vec![0.0f64; n];

    // Use deterministic pseudo-random
    let mut state = 42u64;
    let mut next_rand = || -> f64 {
        state = state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        ((state >> 33) as f64) / (u32::MAX as f64) - 0.5
    };

    x[0] = next_rand();
    y[0] = next_rand();
    z[0] = next_rand();
    for t in 1..n {
        x[t] = next_rand();
        y[t] = 0.7 * x[t - 1] + 0.3 * next_rand();
        z[t] = 0.7 * y[t - 1] + 0.3 * next_rand();
    }

    let df = CausalDataFrame::new(vec![x, y, z], vec!["X".into(), "Y".into(), "Z".into()]);
    let test = CondIndTest::new(IndependenceTestKind::ParCorr);
    let pcmci = Pcmci::new(&df, &test);
    let config = PcmciConfig {
        tau_min: 1,
        tau_max: 2,
        pc_alpha: 0.2,
        alpha_level: 0.05,
        ..Default::default()
    };

    let result = pcmci.run(&config).unwrap();

    // Should find X → Y and Y → Z links
    let has_x_to_y = result
        .links
        .iter()
        .any(|l| l.source == "X" && l.target == "Y" && l.lag == 1);
    let has_y_to_z = result
        .links
        .iter()
        .any(|l| l.source == "Y" && l.target == "Z" && l.lag == 1);
    assert!(
        has_x_to_y,
        "Should detect X → Y at lag 1: {:?}",
        result.links
    );
    assert!(
        has_y_to_z,
        "Should detect Y → Z at lag 1: {:?}",
        result.links
    );
}

#[test]
fn test_fullci_and_bivci_preserve_direct_chain_links() {
    let n = 600;
    let mut x = vec![0.0f64; n];
    let mut y = vec![0.0f64; n];
    let mut z = vec![0.0f64; n];

    let mut state = 7u64;
    let mut next_rand = || -> f64 {
        state = state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        ((state >> 33) as f64) / (u32::MAX as f64) - 0.5
    };

    x[0] = next_rand();
    y[0] = next_rand();
    z[0] = next_rand();
    for t in 1..n {
        x[t] = 0.6 * x[t - 1] + 0.4 * next_rand();
        y[t] = 0.5 * y[t - 1] + 0.7 * x[t - 1] + 0.3 * next_rand();
        z[t] = 0.4 * z[t - 1] + 0.7 * y[t - 1] + 0.3 * next_rand();
    }

    let df = CausalDataFrame::new(vec![x, y, z], vec!["X".into(), "Y".into(), "Z".into()]);
    let test = CondIndTest::new(IndependenceTestKind::ParCorr);
    let pcmci = Pcmci::new(&df, &test);
    let config = PcmciConfig {
        tau_min: 1,
        tau_max: 2,
        pc_alpha: 0.2,
        alpha_level: 0.05,
        ..Default::default()
    };

    let fullci = pcmci.run_fullci(&config);
    let bivci = pcmci.run_bivci(&config);

    assert!(
        fullci
            .links
            .iter()
            .any(|l| l.source == "X" && l.target == "Y" && l.lag == 1)
    );
    assert!(
        fullci
            .links
            .iter()
            .any(|l| l.source == "Y" && l.target == "Z" && l.lag == 1)
    );
    assert!(
        bivci
            .links
            .iter()
            .any(|l| l.source == "X" && l.target == "Y" && l.lag == 1)
    );
    assert!(
        bivci
            .links
            .iter()
            .any(|l| l.source == "Y" && l.target == "Z" && l.lag == 1)
    );
}

#[test]
fn cancellable_engine_short_circuits_on_pre_cancellation() {
    // 3-vars × 32 samples to keep the PC-stable sweep cheap.
    let columns = vec![
        (0..32).map(|i| i as f64).collect::<Vec<_>>(),
        (0..32).map(|i| (i as f64).sin()).collect::<Vec<_>>(),
        (0..32).map(|i| (i as f64).cos()).collect::<Vec<_>>(),
    ];
    let df = CausalDataFrame::new(columns, vec!["a".into(), "b".into(), "c".into()]);
    let test = CondIndTest::new(IndependenceTestKind::ParCorr);
    let config = PcmciConfig {
        tau_min: 1,
        tau_max: 1,
        pc_alpha: 0.05,
        alpha_level: 0.05,
        max_combinations: 1,
        fdr_method: "none".to_string(),
        ..Default::default()
    };

    let (handle, probe) = cancellation_pair();
    handle.cancel();

    let pcmci = Pcmci::new(&df, &test);
    let err = pcmci
        .run_cancellable(&config, &probe)
        .expect_err("pre-cancelled PCMCI must surface AppError::Cancelled");
    assert_eq!(err.code, ErrorCode::RequestCancelled);

    // FullCI/BivCI also bounce the cancellation guard before any work.
    let pcmci_fullci = Pcmci::new(&df, &test);
    let err = pcmci_fullci
        .run_fullci_cancellable(&config, &probe)
        .expect_err("pre-cancelled FullCI must surface AppError::Cancelled");
    assert_eq!(err.code, ErrorCode::RequestCancelled);

    let pcmci_bivci = Pcmci::new(&df, &test);
    let err = pcmci_bivci
        .run_bivci_cancellable(&config, &probe)
        .expect_err("pre-cancelled BivCI must surface AppError::Cancelled");
    assert_eq!(err.code, ErrorCode::RequestCancelled);
}

#[test]
fn pcmciplus_cancellable_short_circuits_on_pre_cancellation() {
    let columns = vec![
        (0..32).map(|i| i as f64).collect::<Vec<_>>(),
        (0..32).map(|i| (i as f64).sin()).collect::<Vec<_>>(),
        (0..32).map(|i| (i as f64).cos()).collect::<Vec<_>>(),
    ];
    let df = CausalDataFrame::new(columns, vec!["a".into(), "b".into(), "c".into()]);
    let test = CondIndTest::new(IndependenceTestKind::ParCorr);
    let config = PcmciConfig {
        tau_min: 0,
        tau_max: 1,
        pc_alpha: 0.05,
        alpha_level: 0.05,
        max_combinations: 1,
        fdr_method: "none".to_string(),
        ..Default::default()
    };

    let (handle, probe) = cancellation_pair();
    handle.cancel();

    let engine = PcmciPlus::new(&df, &test);
    let err = engine
        .run_cancellable(&config, &probe)
        .expect_err("pre-cancelled PCMCI+ must surface AppError::Cancelled");
    assert_eq!(err.code, ErrorCode::RequestCancelled);
}
