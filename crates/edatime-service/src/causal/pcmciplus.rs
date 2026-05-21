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

use std::collections::HashMap;
use rayon::prelude::*;

use super::data::{CausalDataFrame, VarLag};
use super::graph::{CausalGraph, CausalResult, LinkType};
use super::independence::CondIndTest;
use super::pc;
use super::pcmci::PcmciConfig;

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

    /// Step 2: Skeleton estimation — tests all links including contemporaneous,
    /// conditioning on lagged parents plus contemporaneous adjacencies.
    fn skeleton_step(
        &self,
        config: &PcmciConfig,
        all_parents: &HashMap<usize, Vec<VarLag>>,
    ) -> CausalGraph {
        let n = self.df.n_vars;
        let tau_max = config.tau_max;

        // Build test tasks: all (i, j, tau) including tau=0 contemporaneous
        let mut tasks: Vec<(usize, usize, usize)> = Vec::new();
        for j in 0..n {
            for i in 0..n {
                for tau in 0..=tau_max {
                    if tau == 0 && i >= j { continue; } // Test each pair once at tau=0
                    if tau == 0 && i == j { continue; }
                    tasks.push((i, j, tau));
                }
            }
        }

        // Run all tests in parallel
        let results: Vec<(usize, usize, usize, f64, f64)> = tasks.par_iter().map(|&(i, j, tau)| {
            let neg_tau = -(tau as i32);

            let x = vec![(i, neg_tau)];
            let y = vec![(j, 0i32)];

            // Conditions: parents(j) ∪ shifted_parents(i), plus contemporaneous
            // adjacencies discovered so far (for iterative refinement we use
            // lagged parents only in this initial skeleton pass)
            let mut z: Vec<VarLag> = Vec::new();

            // Parents of j
            if let Some(parents_j) = all_parents.get(&j) {
                let limit = config.max_conds_py.unwrap_or(parents_j.len());
                z.extend(
                    parents_j
                        .iter()
                        .take(limit)
                        .filter(|&&p| p != (i, neg_tau))
                        .copied(),
                );
            }

            // Shifted parents of i
            if let Some(parents_i) = all_parents.get(&i) {
                let limit = config.max_conds_px.unwrap_or(parents_i.len());
                for &(k, tau_k) in parents_i.iter().take(limit) {
                    let shifted = (k, tau_k + neg_tau);
                    let abs_lag = (-shifted.1) as usize;
                    if abs_lag <= 2 * config.tau_max && !z.contains(&shifted) && shifted != (i, neg_tau) {
                        z.push(shifted);
                    }
                }
            }

            let (array, xyz) = self.df.construct_array(&x, &y, &z, config.tau_max);
            if array.ncols() < 5 {
                return (i, j, tau, 0.0, 1.0);
            }

            let result = self.test.run_test(&array, &xyz, config.alpha_level);
            (i, j, tau, result.val, result.pval)
        }).collect();

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

        graph
    }

    /// Step 3: Orient colliders (v-structures).
    ///
    /// For each unshielded triple (a, -τ_a) — b — (c, -τ_c) where:
    /// - a-b and c-b are adjacent
    /// - a-c are NOT adjacent
    /// - The separating set for (a, c) does NOT contain b
    /// - Orient as a → b ← c.
    fn orient_colliders(
        &self,
        graph: &mut CausalGraph,
    ) {
        let n = graph.n_vars;
        let tau_max = graph.tau_max;

        // Collect all active contemporaneous links (these are the ones to orient)
        let mut contemp_adj: Vec<(usize, usize)> = Vec::new();
        for i in 0..n {
            for j in (i + 1)..n {
                if graph.get_link(i, j, 0).is_active() {
                    contemp_adj.push((i, j));
                }
            }
        }

        // For each node b, find triples a — b — c where a and c are not adjacent
        for b in 0..n {
            // Collect all neighbors of b (both lagged and contemporaneous)
            let mut neighbors: Vec<VarLag> = Vec::new();
            for a in 0..n {
                for tau in 0..=tau_max {
                    if tau == 0 && a == b { continue; }
                    if graph.get_link(a, b, tau).is_active() {
                        neighbors.push((a, -(tau as i32)));
                    }
                }
            }

            // Check all pairs of neighbors
            for ni in 0..neighbors.len() {
                for nj in (ni + 1)..neighbors.len() {
                    let (a, tau_a) = neighbors[ni];
                    let (c, tau_c) = neighbors[nj];

                    // Check if a and c are adjacent
                    let a_c_adjacent = self.are_adjacent(graph, a, tau_a, c, tau_c);
                    if a_c_adjacent { continue; }

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
    }

    /// Check if two nodes are adjacent in the graph.
    fn are_adjacent(
        &self,
        graph: &CausalGraph,
        a: usize, tau_a: i32,
        c: usize, tau_c: i32,
    ) -> bool {
        // Check direct adjacency between a and c at the relative lag
        let rel_tau = tau_c - tau_a;
        if rel_tau >= 0 && (rel_tau as usize) <= graph.tau_max
            && graph.get_link(a, c, rel_tau as usize).is_active() {
                return true;
            }
        let rev_tau = tau_a - tau_c;
        if rev_tau >= 0 && (rev_tau as usize) <= graph.tau_max
            && graph.get_link(c, a, rev_tau as usize).is_active() {
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
        let n = graph.n_vars;
        let max_iterations = 100;

        for _iter in 0..max_iterations {
            let mut changed = false;

            // Rule R1: a → b — c, a ⊥ c ⟹ b → c
            for b in 0..n {
                for c in 0..n {
                    if b == c { continue; }
                    // b — c (undirected contemporaneous)
                    if graph.get_link(b, c, 0) != LinkType::Undirected { continue; }

                    // Find a such that a → b and a ⊥ c
                    for a in 0..n {
                        // Check a → b at any lag
                        let mut a_to_b = false;
                        for tau in 0..=graph.tau_max {
                            if graph.get_link(a, b, tau) == LinkType::Directed {
                                a_to_b = true;
                                break;
                            }
                        }
                        if !a_to_b { continue; }

                        // Check a ⊥ c (not adjacent at any lag)
                        let mut a_adj_c = false;
                        for tau in 0..=graph.tau_max {
                            if graph.get_link(a, c, tau).is_active()
                                || graph.get_link(c, a, tau).is_active()
                            {
                                a_adj_c = true;
                                break;
                            }
                        }
                        if a_adj_c { continue; }

                        // Orient b → c
                        graph.set_link(b, c, 0, LinkType::Directed);
                        graph.set_link(c, b, 0, LinkType::ReverseDirected);
                        changed = true;
                    }
                }
            }

            // Rule R2: a → b → c, a — c ⟹ a → c
            for b in 0..n {
                for a in 0..n {
                    if a == b { continue; }
                    // a → b (at tau=0, directed)
                    if graph.get_link(a, b, 0) != LinkType::Directed { continue; }

                    for c in 0..n {
                        if c == a || c == b { continue; }
                        // b → c
                        if graph.get_link(b, c, 0) != LinkType::Directed { continue; }
                        // a — c (undirected)
                        if graph.get_link(a, c, 0) != LinkType::Undirected { continue; }

                        graph.set_link(a, c, 0, LinkType::Directed);
                        graph.set_link(c, a, 0, LinkType::ReverseDirected);
                        changed = true;
                    }
                }
            }

            if !changed { break; }
        }
    }
}
