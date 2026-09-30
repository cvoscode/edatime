//! PCMCI algorithm — two-step causal discovery for time series.
//!
//! Step 1 (PC): Condition selection — for each variable, identify a superset
//!   of its lagged parents using the PC-stable algorithm.
//! Step 2 (MCI): Momentary Conditional Independence — test each link
//!   X^i_{t-τ} ⊥ X^j_t | parents(j), parents(i) shifted by τ.
//!
//! Reference: Runge et al. (2019), "Detecting and quantifying causal
//! associations in large nonlinear time series datasets", Science Advances.

use rayon::prelude::*;
use std::collections::HashMap;

use edatime_core::cancellation::CancellationProbe;

use super::data::{CausalDataFrame, VarLag, VarLagSeenSet};
use super::graph::{CausalGraph, CausalResult};
use super::independence::CondIndTest;
use super::pc;
use crate::error::AppError;

/// PCMCI algorithm configuration.
#[derive(Debug, Clone)]
pub struct PcmciConfig {
    /// Minimum time lag to test (default: 1 for PCMCI, 0 for PCMCI+).
    pub tau_min: usize,
    /// Maximum time lag to test.
    pub tau_max: usize,
    /// Significance level for the PC condition selection step.
    pub pc_alpha: f64,
    /// Final significance level for MCI tests.
    pub alpha_level: f64,
    /// Maximum cardinality of condition sets in the PC step.
    pub max_conds_dim: Option<usize>,
    /// Maximum number of condition subsets to test per cardinality.
    pub max_combinations: usize,
    /// Maximum number of parent conditions to use for Y in MCI.
    pub max_conds_py: Option<usize>,
    /// Maximum number of parent conditions to use for X in MCI.
    pub max_conds_px: Option<usize>,
    /// FDR correction method: "none" or "fdr_bh".
    pub fdr_method: String,
}

impl Default for PcmciConfig {
    fn default() -> Self {
        Self {
            tau_min: 1,
            tau_max: 3,
            pc_alpha: 0.2,
            alpha_level: 0.05,
            max_conds_dim: None,
            max_combinations: 1,
            max_conds_py: None,
            max_conds_px: None,
            fdr_method: "none".to_string(),
        }
    }
}

/// The PCMCI causal discovery engine.
pub struct Pcmci<'a> {
    pub df: &'a CausalDataFrame,
    pub test: &'a CondIndTest,
}

impl<'a> Pcmci<'a> {
    pub fn new(df: &'a CausalDataFrame, test: &'a CondIndTest) -> Self {
        Self { df, test }
    }

    /// Run the full PCMCI algorithm (PC + MCI).
    pub fn run(&self, config: &PcmciConfig) -> Result<CausalResult, AppError> {
        tracing::info!(
            n_vars = self.df.n_vars,
            t_len = self.df.t_len,
            tau_max = config.tau_max,
            pc_alpha = config.pc_alpha,
            alpha = config.alpha_level,
            "Starting PCMCI"
        );

        // Step 1: PC condition selection
        let pc_result = pc::run_pc_stable(
            self.df,
            self.test,
            config.tau_min,
            config.tau_max,
            config.pc_alpha,
            config.max_conds_dim,
            config.max_combinations,
        )?;

        tracing::info!(
            parents = ?pc_result.all_parents.values()
                .map(|p| p.len()).collect::<Vec<_>>(),
            "PC step complete"
        );

        // Step 2: MCI tests
        let mut graph = self.run_mci(config, &pc_result.all_parents);

        // FDR correction
        if config.fdr_method == "fdr_bh" {
            graph.fdr_correction();
        }

        // Apply threshold
        graph.threshold(config.alpha_level);

        let result = CausalResult::from_graph(&graph, &self.df.var_names);

        tracing::info!(n_links = result.links.len(), "PCMCI complete");

        Ok(result)
    }

    /// Cooperative variant of [`run`]. Checks the request-owned probe at the
    /// PC → MCI boundary so that cancelling interactive compute aborts before
    /// the expensive MCI stage. See
    /// [`crate::analytics::spectrogram::compute_spectrogram_cancellable`]
    /// for the same cancellation contract.
    pub fn run_cancellable(
        &self,
        config: &PcmciConfig,
        cancellation: &CancellationProbe,
    ) -> Result<CausalResult, AppError> {
        tracing::info!(
            n_vars = self.df.n_vars,
            t_len = self.df.t_len,
            tau_max = config.tau_max,
            pc_alpha = config.pc_alpha,
            alpha = config.alpha_level,
            "Starting PCMCI (cancellable)"
        );

        // Step 1: PC condition selection (cancellable).
        let pc_result = pc::run_pc_stable_cancellable(
            self.df,
            self.test,
            config.tau_min,
            config.tau_max,
            config.pc_alpha,
            config.max_conds_dim,
            config.max_combinations,
            cancellation,
        )?;

        tracing::info!(
            parents = ?pc_result.all_parents.values()
                .map(|p| p.len()).collect::<Vec<_>>(),
            "PC step complete"
        );

        // Cooperative checkpoint: PC is finished and bounded in wall time by
        // the number of variables; the MCI stage below is the dominant
        // spend on most workloads.
        cancellation.check()?;

        // Step 2: MCI tests
        let mut graph = self.run_mci_cancellable(config, &pc_result.all_parents, cancellation)?;

        // FDR correction
        if config.fdr_method == "fdr_bh" {
            graph.fdr_correction();
        }

        // Apply threshold
        graph.threshold(config.alpha_level);

        let result = CausalResult::from_graph(&graph, &self.df.var_names);

        tracing::info!(n_links = result.links.len(), "PCMCI complete");

        Ok(result)
    }

    /// Run FullCI — unconditional on X parents, conditions on ALL lagged
    /// variables as parents of Y. No PC selection step.
    pub fn run_fullci(&self, config: &PcmciConfig) -> CausalResult {
        let n = self.df.n_vars;
        tracing::info!(n_vars = n, tau_max = config.tau_max, "Starting FullCI");

        // Parents = all variables at all lags ≥ max(1, tau_min) up to tau_max
        let mut all_parents: HashMap<usize, Vec<VarLag>> = HashMap::new();
        for j in 0..n {
            let mut parents = Vec::new();
            for i in 0..n {
                for tau in config.tau_min.max(1)..=config.tau_max {
                    parents.push((i, -(tau as i32)));
                }
            }
            all_parents.insert(j, parents);
        }

        // Run MCI with max_conds_px=0 (no X-parent conditioning)
        let mci_config = PcmciConfig {
            max_conds_px: Some(0),
            ..config.clone()
        };
        let mut graph = self.run_mci(&mci_config, &all_parents);

        if config.fdr_method == "fdr_bh" {
            graph.fdr_correction();
        }
        graph.threshold(config.alpha_level);

        let result = CausalResult::from_graph(&graph, &self.df.var_names);
        tracing::info!(n_links = result.links.len(), "FullCI complete");
        result
    }

    /// Cooperative variant of [`run_fullci`]. Polls the request-owned probe
    /// once after the blocking MCI sweep completes.
    pub fn run_fullci_cancellable(
        &self,
        config: &PcmciConfig,
        cancellation: &CancellationProbe,
    ) -> Result<CausalResult, AppError> {
        cancellation.check()?;
        let n = self.df.n_vars;
        let all_parents = self.build_fullci_parents(config, n);
        let mci_config = PcmciConfig {
            max_conds_px: Some(0),
            ..config.clone()
        };
        let mut graph = self.run_mci_cancellable(&mci_config, &all_parents, cancellation)?;
        if config.fdr_method == "fdr_bh" {
            graph.fdr_correction();
        }
        graph.threshold(config.alpha_level);
        let result = CausalResult::from_graph(&graph, &self.df.var_names);
        cancellation.check()?;
        Ok(result)
    }

    /// Run BivCI — bivariate CI: conditions only on Y's own past
    /// (auto-dependencies). No PC selection step.
    pub fn run_bivci(&self, config: &PcmciConfig) -> CausalResult {
        let n = self.df.n_vars;
        tracing::info!(n_vars = n, tau_max = config.tau_max, "Starting BivCI");

        // Parents = only j's own past lags
        let mut all_parents: HashMap<usize, Vec<VarLag>> = HashMap::new();
        for j in 0..n {
            let parents: Vec<VarLag> = (config.tau_min.max(1)..=config.tau_max)
                .map(|tau| (j, -(tau as i32)))
                .collect();
            all_parents.insert(j, parents);
        }

        // Run MCI with max_conds_px=0 (no X-parent conditioning)
        let mci_config = PcmciConfig {
            max_conds_px: Some(0),
            ..config.clone()
        };
        let mut graph = self.run_mci(&mci_config, &all_parents);

        if config.fdr_method == "fdr_bh" {
            graph.fdr_correction();
        }
        graph.threshold(config.alpha_level);

        let result = CausalResult::from_graph(&graph, &self.df.var_names);
        tracing::info!(n_links = result.links.len(), "BivCI complete");
        result
    }

    /// Cooperative variant of [`run_bivci`].
    pub fn run_bivci_cancellable(
        &self,
        config: &PcmciConfig,
        cancellation: &CancellationProbe,
    ) -> Result<CausalResult, AppError> {
        cancellation.check()?;
        let n = self.df.n_vars;
        let mut all_parents: HashMap<usize, Vec<VarLag>> = HashMap::new();
        for j in 0..n {
            cancellation.check()?;
            let parents = (config.tau_min.max(1)..=config.tau_max)
                .map(|tau| (j, -(tau as i32)))
                .collect();
            all_parents.insert(j, parents);
        }
        let mci_config = PcmciConfig {
            max_conds_px: Some(0),
            ..config.clone()
        };
        let mut graph = self.run_mci_cancellable(&mci_config, &all_parents, cancellation)?;
        if config.fdr_method == "fdr_bh" {
            graph.fdr_correction();
        }
        graph.threshold(config.alpha_level);
        let result = CausalResult::from_graph(&graph, &self.df.var_names);
        cancellation.check()?;
        Ok(result)
    }

    /// MCI step: test each link with conditions from both parent sets.
    fn run_mci(
        &self,
        config: &PcmciConfig,
        all_parents: &HashMap<usize, Vec<VarLag>>,
    ) -> CausalGraph {
        let n = self.df.n_vars;
        let tau_max = config.tau_max;
        let tau_min = config.tau_min;

        // Build all test tasks
        let mut tasks: Vec<(usize, usize, usize)> = Vec::new();
        for j in 0..n {
            for i in 0..n {
                for tau in tau_min..=tau_max {
                    if tau == 0 && i == j {
                        continue;
                    }
                    tasks.push((i, j, tau));
                }
            }
        }

        // Run all MCI tests in parallel
        let results: Vec<(usize, usize, usize, f64, f64)> = tasks
            .par_iter()
            .map(|&(i, j, tau)| {
                let (val, pval) = self.mci_test(i, j, tau, config, all_parents);
                (i, j, tau, val, pval)
            })
            .collect();

        // Assemble graph
        let mut graph = CausalGraph::new(n, tau_max);
        for (i, j, tau, val, pval) in results {
            graph.set_val(i, j, tau, val);
            graph.set_pval(i, j, tau, pval);
        }

        graph
    }

    /// Cancellable MCI sweep. Each Rayon task checks the request-owned probe
    /// before constructing its conditioning array and the caller checks again
    /// after the parallel join. An independence test itself remains an opaque
    /// synchronous kernel, so its duration is the remaining cancellation
    /// latency bound.
    fn run_mci_cancellable(
        &self,
        config: &PcmciConfig,
        all_parents: &HashMap<usize, Vec<VarLag>>,
        cancellation: &CancellationProbe,
    ) -> Result<CausalGraph, AppError> {
        cancellation.check()?;
        let n = self.df.n_vars;
        let tau_max = config.tau_max;
        let tau_min = config.tau_min;
        let mut tasks: Vec<(usize, usize, usize)> = Vec::new();
        for j in 0..n {
            for i in 0..n {
                for tau in tau_min..=tau_max {
                    if tau == 0 && i == j {
                        continue;
                    }
                    tasks.push((i, j, tau));
                }
            }
        }

        let results: Vec<(usize, usize, usize, f64, f64)> = tasks
            .par_iter()
            .map(|&(i, j, tau)| {
                cancellation.check()?;
                let (val, pval) = self.mci_test(i, j, tau, config, all_parents);
                Ok((i, j, tau, val, pval))
            })
            .collect::<Result<Vec<_>, AppError>>()?;
        cancellation.check()?;

        let mut graph = CausalGraph::new(n, tau_max);
        for (i, j, tau, val, pval) in results {
            graph.set_val(i, j, tau, val);
            graph.set_pval(i, j, tau, pval);
        }
        Ok(graph)
    }

    fn build_fullci_parents(&self, config: &PcmciConfig, n: usize) -> HashMap<usize, Vec<VarLag>> {
        let mut all_parents = HashMap::new();
        for j in 0..n {
            let parents = (0..n)
                .flat_map(|i| {
                    (config.tau_min.max(1)..=config.tau_max).map(move |tau| (i, -(tau as i32)))
                })
                .collect();
            all_parents.insert(j, parents);
        }
        all_parents
    }

    /// Single MCI test: X^i_{t-τ} ⊥ X^j_t | parents(j) ∪ shifted_parents(i).
    fn mci_test(
        &self,
        i: usize,
        j: usize,
        tau: usize,
        config: &PcmciConfig,
        all_parents: &HashMap<usize, Vec<VarLag>>,
    ) -> (f64, f64) {
        let neg_tau = -(tau as i32);

        // X = (i, -τ)
        let x = vec![(i, neg_tau)];
        // Y = (j, 0)
        let y = vec![(j, 0i32)];

        // Z = parents(j) excluding (i, -τ), plus shifted parents(i)
        let mut z: Vec<VarLag> = Vec::new();
        let mut seen = VarLagSeenSet::new(self.df.n_vars, config.tau_max);

        // Add parents of j (up to max_conds_py), excluding (i, -τ)
        if let Some(parents_j) = all_parents.get(&j) {
            let limit = config.max_conds_py.unwrap_or(parents_j.len());
            for &p in parents_j.iter().take(limit) {
                if p != (i, neg_tau) && seen.insert(p) {
                    z.push(p);
                }
            }
        }

        // Add shifted parents of i: (k, τ_k + (-τ)) for each (k, τ_k) in parents(i)
        if let Some(parents_i) = all_parents.get(&i) {
            let limit = config.max_conds_px.unwrap_or(parents_i.len());
            for &(k, tau_k) in parents_i.iter().take(limit) {
                let shifted = (k, tau_k + neg_tau);
                // Only include if the shifted lag is within bounds
                let abs_lag = (-shifted.1) as usize;
                if abs_lag <= 2 * config.tau_max && shifted != (i, neg_tau) && seen.insert(shifted)
                {
                    z.push(shifted);
                }
            }
        }

        let (array, xyz) = self.df.construct_array(&x, &y, &z, config.tau_max);
        if array.ncols() < 5 {
            return (0.0, 1.0);
        }

        let result = self.test.run_test(&array, &xyz, config.alpha_level);
        (result.val, result.pval)
    }
}

#[cfg(test)]
mod tests;
