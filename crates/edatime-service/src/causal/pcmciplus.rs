//! PCMCI+ algorithm — discovers both lagged AND contemporaneous causal links.
//!
//! Four-step procedure:
//! 1. Lagged PC condition selection (same as PCMCI)
//! 2. Skeleton estimation with contemporaneous conditions
//! 3. Collider orientation (v-structures)
//! 4. Meek orientation rules propagation
//!
//! Reference: Runge (2020), "Discovering contemporaneous and lagged causal
//! relations in autocorrelated nonlinear time series datasets".

use rayon::prelude::*;
use std::collections::HashMap;

use edatime_core::cancellation::CancellationProbe;

use super::data::{CausalDataFrame, VarLag, VarLagSeenSet};
use super::graph::{CausalGraph, CausalResult, LinkType};
use super::independence::CondIndTest;
use super::pc;
use super::pcmci::PcmciConfig;
use crate::error::AppError;

/// PCMCI+ engine — extends PCMCI with contemporaneous link discovery and
/// orientation via collider detection and Meek rules.
pub struct PcmciPlus<'a> {
    pub df: &'a CausalDataFrame,
    pub test: &'a CondIndTest,
}

impl<'a> PcmciPlus<'a> {
    pub fn new(df: &'a CausalDataFrame, test: &'a CondIndTest) -> Self {
        Self { df, test }
    }

    /// Run the full PCMCI+ algorithm.
    pub fn run(&self, config: &PcmciConfig) -> CausalResult {
        let n = self.df.n_vars;
        let tau_max = config.tau_max;

        tracing::info!(
            n_vars = n,
            t_len = self.df.t_len,
            tau_max = tau_max,
            pc_alpha = config.pc_alpha,
            alpha = config.alpha_level,
            "Starting PCMCI+"
        );

        // Step 1: Lagged PC condition selection (tau_min=1)
        let pc_result = pc::run_pc_stable(
            self.df,
            self.test,
            1, // Always start lagged from tau=1
            tau_max,
            config.pc_alpha,
            config.max_conds_dim,
            config.max_combinations,
        );

        tracing::info!("PCMCI+ Step 1 (lagged PC) complete");

        // Step 2: Skeleton with contemporaneous conditions via MCI
        let mut graph = self.skeleton_step(config, &pc_result.all_parents);

        tracing::info!("PCMCI+ Step 2 (skeleton) complete");

        // Apply threshold to skeleton
        graph.threshold(config.alpha_level);

        // Step 3: Collider orientation
        self.orient_colliders(&mut graph);
        tracing::info!("PCMCI+ Step 3 (colliders) complete");

        // Step 4: Meek rules
        self.apply_meek_rules(&mut graph);
        tracing::info!("PCMCI+ Step 4 (Meek rules) complete");

        let result = CausalResult::from_graph(&graph, &self.df.var_names);
        tracing::info!(n_links = result.links.len(), "PCMCI+ complete");
        result
    }

    /// Cooperative variant of [`run`]. Checks the request-owned probe between
    /// lagged PC and the skeleton step so that cancellation propagates as
    /// quickly as the engine's coarse stages. See
    /// [`crate::analytics::spectrogram::compute_spectrogram_cancellable`]
    /// for the same cancellation contract.
    pub fn run_cancellable(
        &self,
        config: &PcmciConfig,
        cancellation: &CancellationProbe,
    ) -> Result<CausalResult, AppError> {
        let n = self.df.n_vars;
        let tau_max = config.tau_max;

        tracing::info!(
            n_vars = n,
            t_len = self.df.t_len,
            tau_max = tau_max,
            pc_alpha = config.pc_alpha,
            alpha = config.alpha_level,
            "Starting PCMCI+ (cancellable)"
        );

        // Step 1: Lagged PC condition selection (cancellable)
        let pc_result = pc::run_pc_stable_cancellable(
            self.df,
            self.test,
            1,
            tau_max,
            config.pc_alpha,
            config.max_conds_dim,
            config.max_combinations,
            cancellation,
        )?;
        tracing::info!("PCMCI+ Step 1 (lagged PC) complete");

        // Cooperative checkpoint before the (typically dominant) skeleton
        // stage — cancellation latency is bounded by Step 2 wall time.
        cancellation.check()?;

        // Step 2: Skeleton with contemporaneous conditions via MCI
        let mut graph =
            self.skeleton_step_cancellable(config, &pc_result.all_parents, cancellation)?;
        tracing::info!("PCMCI+ Step 2 (skeleton) complete");
        cancellation.check()?;

        // Apply threshold to skeleton
        graph.threshold(config.alpha_level);

        // Step 3: Collider orientation
        self.orient_colliders_with_cancellation(&mut graph, Some(cancellation))?;
        tracing::info!("PCMCI+ Step 3 (colliders) complete");
        cancellation.check()?;

        // Step 4: Meek rules
        self.apply_meek_rules_with_cancellation(&mut graph, Some(cancellation))?;
        tracing::info!("PCMCI+ Step 4 (Meek rules) complete");

        let result = CausalResult::from_graph(&graph, &self.df.var_names);
        tracing::info!(n_links = result.links.len(), "PCMCI+ complete");
        Ok(result)
    }

    /// Step 2: Skeleton estimation — tests all links including contemporaneous,
    /// conditioning on lagged parents plus contemporaneous adjacencies.
    fn skeleton_step(
        &self,
        config: &PcmciConfig,
        all_parents: &HashMap<usize, Vec<VarLag>>,
    ) -> CausalGraph {
        self.skeleton_step_with_cancellation(config, all_parents, None)
            .expect("non-cancellable skeleton step never returns AppError")
    }

    fn skeleton_step_cancellable(
        &self,
        config: &PcmciConfig,
        all_parents: &HashMap<usize, Vec<VarLag>>,
        cancellation: &CancellationProbe,
    ) -> Result<CausalGraph, AppError> {
        self.skeleton_step_with_cancellation(config, all_parents, Some(cancellation))
    }

    /// Skeleton sweep shared by ordinary and cancellable PCMCI+ execution.
    /// Each parallel task checks before constructing its conditioning array;
    /// the synchronous independence kernel remains the final latency bound.
    fn skeleton_step_with_cancellation(
        &self,
        config: &PcmciConfig,
        all_parents: &HashMap<usize, Vec<VarLag>>,
        cancellation: Option<&CancellationProbe>,
    ) -> Result<CausalGraph, AppError> {
        let n = self.df.n_vars;
        let tau_max = config.tau_max;

        // Build test tasks: all (i, j, tau) including tau=0 contemporaneous
        let mut tasks: Vec<(usize, usize, usize)> = Vec::new();
        for j in 0..n {
            for i in 0..n {
                for tau in 0..=tau_max {
                    if tau == 0 && i >= j {
                        continue;
                    } // Test each pair once at tau=0
                    if tau == 0 && i == j {
                        continue;
                    }
                    tasks.push((i, j, tau));
                }
            }
        }

        // Run all tests in parallel
        let results: Vec<(usize, usize, usize, f64, f64)> = tasks
            .par_iter()
            .map(|&(i, j, tau)| {
                if let Some(cancellation) = cancellation {
                    cancellation.check()?;
                }
                let neg_tau = -(tau as i32);

                let x = vec![(i, neg_tau)];
                let y = vec![(j, 0i32)];

                // Conditions: parents(j) ∪ shifted_parents(i), plus contemporaneous
                // adjacencies discovered so far (for iterative refinement we use
                // lagged parents only in this initial skeleton pass)
                let mut z: Vec<VarLag> = Vec::new();
                let mut seen = VarLagSeenSet::new(self.df.n_vars, config.tau_max);

                // Parents of j
                if let Some(parents_j) = all_parents.get(&j) {
                    let limit = config.max_conds_py.unwrap_or(parents_j.len());
                    for &parent in parents_j.iter().take(limit) {
                        if parent != (i, neg_tau) && seen.insert(parent) {
                            z.push(parent);
                        }
                    }
                }

                // Shifted parents of i
                if let Some(parents_i) = all_parents.get(&i) {
                    let limit = config.max_conds_px.unwrap_or(parents_i.len());
                    for &(k, tau_k) in parents_i.iter().take(limit) {
                        let shifted = (k, tau_k + neg_tau);
                        let abs_lag = (-shifted.1) as usize;
                        if abs_lag <= 2 * config.tau_max
                            && shifted != (i, neg_tau)
                            && seen.insert(shifted)
                        {
                            z.push(shifted);
                        }
                    }
                }

                let (array, xyz) = self.df.construct_array(&x, &y, &z, config.tau_max);
                if array.ncols() < 5 {
                    return Ok((i, j, tau, 0.0, 1.0));
                }

                let result = self.test.run_test(&array, &xyz, config.alpha_level);
                Ok((i, j, tau, result.val, result.pval))
            })
            .collect::<Result<Vec<(usize, usize, usize, f64, f64)>, AppError>>()?;

        if let Some(cancellation) = cancellation {
            cancellation.check()?;
        }

        // Assemble graph
        let mut graph = CausalGraph::new(n, tau_max);
        for (i, j, tau, val, pval) in results {
            graph.set_val(i, j, tau, val);
            graph.set_pval(i, j, tau, pval);

            // For contemporaneous (tau=0): set both directions
            if tau == 0 {
                graph.set_val(j, i, 0, val);
                graph.set_pval(j, i, 0, pval);
            }
        }

        Ok(graph)
    }

    /// Step 3: Orient colliders (v-structures).
    ///
    /// For each unshielded triple (a, -τ_a) — b — (c, -τ_c) where:
    /// - a-b and c-b are adjacent
    /// - a-c are NOT adjacent
    /// - The separating set for (a, c) does NOT contain b
    /// - Orient as a → b ← c.
    fn orient_colliders(&self, graph: &mut CausalGraph) {
        self.orient_colliders_with_cancellation(graph, None)
            .expect("ordinary orientation cannot be cancelled");
    }

    fn orient_colliders_with_cancellation(
        &self,
        graph: &mut CausalGraph,
        cancellation: Option<&CancellationProbe>,
    ) -> Result<(), AppError> {
        if let Some(probe) = cancellation {
            probe.check()?;
        }
        let n = graph.n_vars;
        let tau_max = graph.tau_max;

        // Collect all active contemporaneous links (these are the ones to orient)
        let mut contemp_adj: Vec<(usize, usize)> = Vec::new();
        for i in 0..n {
            if let Some(probe) = cancellation {
                probe.check()?;
            }
            for j in (i + 1)..n {
                if let Some(probe) = cancellation {
                    probe.check()?;
                }
                if graph.get_link(i, j, 0).is_active() {
                    contemp_adj.push((i, j));
                }
            }
        }

        // For each node b, find triples a — b — c where a and c are not adjacent
        for b in 0..n {
            if let Some(probe) = cancellation {
                probe.check()?;
            }
            // Collect all neighbors of b (both lagged and contemporaneous)
            let mut neighbors: Vec<VarLag> = Vec::new();
            for a in 0..n {
                if let Some(probe) = cancellation {
                    probe.check()?;
                }
                for tau in 0..=tau_max {
                    if let Some(probe) = cancellation {
                        probe.check()?;
                    }
                    if tau == 0 && a == b {
                        continue;
                    }
                    if graph.get_link(a, b, tau).is_active() {
                        neighbors.push((a, -(tau as i32)));
                    }
                }
            }

            // Check all pairs of neighbors
            for ni in 0..neighbors.len() {
                if let Some(probe) = cancellation {
                    probe.check()?;
                }
                for nj in (ni + 1)..neighbors.len() {
                    if let Some(probe) = cancellation {
                        probe.check()?;
                    }
                    let (a, tau_a) = neighbors[ni];
                    let (c, tau_c) = neighbors[nj];

                    // Check if a and c are adjacent
                    let a_c_adjacent = self.are_adjacent(graph, a, tau_a, c, tau_c);
                    if a_c_adjacent {
                        continue;
                    }

                    // This is an unshielded triple: orient as collider
                    // a → b and c → b (if contemporaneous)
                    if tau_a == 0 && graph.get_link(a, b, 0) == LinkType::Undirected {
                        graph.set_link(a, b, 0, LinkType::Directed);
                        graph.set_link(b, a, 0, LinkType::ReverseDirected);
                    }
                    if tau_c == 0 && graph.get_link(c, b, 0) == LinkType::Undirected {
                        graph.set_link(c, b, 0, LinkType::Directed);
                        graph.set_link(b, c, 0, LinkType::ReverseDirected);
                    }
                }
            }
        }
        Ok(())
    }

    /// Check if two nodes are adjacent in the graph.
    fn are_adjacent(
        &self,
        graph: &CausalGraph,
        a: usize,
        tau_a: i32,
        c: usize,
        tau_c: i32,
    ) -> bool {
        // Check direct adjacency between a and c at the relative lag
        let rel_tau = tau_c - tau_a;
        if rel_tau >= 0
            && (rel_tau as usize) <= graph.tau_max
            && graph.get_link(a, c, rel_tau as usize).is_active()
        {
            return true;
        }
        let rev_tau = tau_a - tau_c;
        if rev_tau >= 0
            && (rev_tau as usize) <= graph.tau_max
            && graph.get_link(c, a, rev_tau as usize).is_active()
        {
            return true;
        }
        false
    }

    /// Step 4: Apply Meek orientation rules to propagate orientations.
    ///
    /// R1: If a → b — c and a ⊥ c, orient b → c
    /// R2: If a → b → c and a — c, orient a → c
    /// R3: If a — b, a — c, b → d ← c, and a — d, orient a → d
    fn apply_meek_rules(&self, graph: &mut CausalGraph) {
        self.apply_meek_rules_with_cancellation(graph, None)
            .expect("ordinary orientation cannot be cancelled");
    }

    fn apply_meek_rules_with_cancellation(
        &self,
        graph: &mut CausalGraph,
        cancellation: Option<&CancellationProbe>,
    ) -> Result<(), AppError> {
        if let Some(probe) = cancellation {
            probe.check()?;
        }
        let n = graph.n_vars;
        let max_iterations = 100;

        for _iter in 0..max_iterations {
            if let Some(probe) = cancellation {
                probe.check()?;
            }
            let mut changed = false;

            // Rule R1: a → b — c, a ⊥ c ⟹ b → c
            for b in 0..n {
                if let Some(probe) = cancellation {
                    probe.check()?;
                }
                for c in 0..n {
                    if let Some(probe) = cancellation {
                        probe.check()?;
                    }
                    if b == c {
                        continue;
                    }
                    // b — c (undirected contemporaneous)
                    if graph.get_link(b, c, 0) != LinkType::Undirected {
                        continue;
                    }

                    // Find a such that a → b and a ⊥ c
                    for a in 0..n {
                        if let Some(probe) = cancellation {
                            probe.check()?;
                        }
                        // Check a → b at any lag
                        let mut a_to_b = false;
                        for tau in 0..=graph.tau_max {
                            if let Some(probe) = cancellation {
                                probe.check()?;
                            }
                            if graph.get_link(a, b, tau) == LinkType::Directed {
                                a_to_b = true;
                                break;
                            }
                        }
                        if !a_to_b {
                            continue;
                        }

                        // Check a ⊥ c (not adjacent at any lag)
                        let mut a_adj_c = false;
                        for tau in 0..=graph.tau_max {
                            if let Some(probe) = cancellation {
                                probe.check()?;
                            }
                            if graph.get_link(a, c, tau).is_active()
                                || graph.get_link(c, a, tau).is_active()
                            {
                                a_adj_c = true;
                                break;
                            }
                        }
                        if a_adj_c {
                            continue;
                        }

                        // Orient b → c
                        graph.set_link(b, c, 0, LinkType::Directed);
                        graph.set_link(c, b, 0, LinkType::ReverseDirected);
                        changed = true;
                    }
                }
            }

            // Rule R2: a → b → c, a — c ⟹ a → c
            for b in 0..n {
                if let Some(probe) = cancellation {
                    probe.check()?;
                }
                for a in 0..n {
                    if let Some(probe) = cancellation {
                        probe.check()?;
                    }
                    if a == b {
                        continue;
                    }
                    // a → b (at tau=0, directed)
                    if graph.get_link(a, b, 0) != LinkType::Directed {
                        continue;
                    }

                    for c in 0..n {
                        if let Some(probe) = cancellation {
                            probe.check()?;
                        }
                        if c == a || c == b {
                            continue;
                        }
                        // b → c
                        if graph.get_link(b, c, 0) != LinkType::Directed {
                            continue;
                        }
                        // a — c (undirected)
                        if graph.get_link(a, c, 0) != LinkType::Undirected {
                            continue;
                        }

                        graph.set_link(a, c, 0, LinkType::Directed);
                        graph.set_link(c, a, 0, LinkType::ReverseDirected);
                        changed = true;
                    }
                }
            }

            if !changed {
                break;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::super::independence::IndependenceTestKind;
    use super::*;

    #[test]
    fn test_pcmciplus_orients_simple_contemporaneous_collider() {
        let n = 1_200;
        let mut x = vec![0.0f64; n];
        let mut z = vec![0.0f64; n];
        let mut y = vec![0.0f64; n];

        let mut state = 11u64;
        let mut next_rand = || -> f64 {
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            ((state >> 33) as f64) / (u32::MAX as f64) - 0.5
        };

        for t in 0..n {
            x[t] = next_rand();
            z[t] = next_rand();
            y[t] = 0.9 * x[t] - 0.8 * z[t] + 0.1 * next_rand();
        }

        let df = CausalDataFrame::new(vec![x, y, z], vec!["X".into(), "Y".into(), "Z".into()]);
        let test = CondIndTest::new(IndependenceTestKind::ParCorr);
        let engine = PcmciPlus::new(&df, &test);
        let result = engine.run(&PcmciConfig {
            tau_min: 0,
            tau_max: 1,
            pc_alpha: 0.05,
            alpha_level: 0.01,
            ..Default::default()
        });

        assert!(
            result
                .links
                .iter()
                .any(|l| l.source == "X" && l.target == "Y" && l.lag == 0 && l.link_type == "-->"),
            "PCMCI+ should orient X --> Y: {:?}",
            result.links
        );
        assert!(
            result
                .links
                .iter()
                .any(|l| l.source == "Z" && l.target == "Y" && l.lag == 0 && l.link_type == "-->"),
            "PCMCI+ should orient Z --> Y: {:?}",
            result.links
        );
    }

    #[test]
    fn test_pcmciplus_does_not_turn_chain_into_false_collider() {
        let n = 1_200;
        let mut x = vec![0.0f64; n];
        let mut y = vec![0.0f64; n];
        let mut z = vec![0.0f64; n];

        let mut state = 23u64;
        let mut next_rand = || -> f64 {
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            ((state >> 33) as f64) / (u32::MAX as f64) - 0.5
        };

        for t in 0..n {
            x[t] = next_rand();
            y[t] = 0.9 * x[t] + 0.1 * next_rand();
            z[t] = 0.9 * y[t] + 0.1 * next_rand();
        }

        let df = CausalDataFrame::new(vec![x, y, z], vec!["X".into(), "Y".into(), "Z".into()]);
        let test = CondIndTest::new(IndependenceTestKind::ParCorr);
        let engine = PcmciPlus::new(&df, &test);
        let result = engine.run(&PcmciConfig {
            tau_min: 0,
            tau_max: 1,
            pc_alpha: 0.05,
            alpha_level: 0.01,
            ..Default::default()
        });

        assert!(
            !result
                .links
                .iter()
                .any(|l| l.source == "Z" && l.target == "Y" && l.lag == 0 && l.link_type == "-->"),
            "PCMCI+ should not orient Z --> Y for a contemporaneous chain: {:?}",
            result.links
        );
    }
}
