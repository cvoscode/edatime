//! LPCMCI — Latent PCMCI for causal discovery with latent confounders.
//!
//! Uses preliminary iterations to discover definite ancestors, then an
//! ancestral removal phase and a non-ancestral phase with expanded link
//! types that can represent latent confounding (bidirected edges).
//!
//! Reference: Gerhardus & Runge (2020), "High-recall causal discovery for
//! autocorrelated time series with latent confounders".

use std::collections::HashMap;
use rayon::prelude::*;

use super::data::{CausalDataFrame, VarLag};
use super::graph::{CausalGraph, CausalResult, LinkType};
use super::independence::CondIndTest;
use super::pc;
use super::pcmci::PcmciConfig;

/// LPCMCI engine — discovers causal links in the presence of latent confounders.
pub struct Lpcmci<'a> {
    pub df: &'a CausalDataFrame,
    pub test: &'a CondIndTest,
}

impl<'a> Lpcmci<'a> {
    pub fn new(df: &'a CausalDataFrame, test: &'a CondIndTest) -> Self {
        Self { df, test }
    }

    /// Run the full LPCMCI algorithm.
    ///
    /// `n_preliminary_iterations`: number of preliminary rounds (default 1).
    pub fn run(&self, config: &PcmciConfig, n_preliminary_iterations: usize) -> CausalResult {
        let n = self.df.n_vars;
        let tau_max = config.tau_max;

        tracing::info!(
            n_vars = n,
            t_len = self.df.t_len,
            tau_max,
            n_preliminary_iterations,
            "Starting LPCMCI"
        );

        // Track definite ancestors across preliminary iterations
        let mut def_ancs: HashMap<usize, Vec<VarLag>> = HashMap::new();

        // Step 1: Preliminary iterations
        for iter in 0..n_preliminary_iterations {
            tracing::debug!(iter, "LPCMCI preliminary iteration");

            // Run lagged PC condition selection
            let pc_result = pc::run_pc_stable(
                self.df,
                self.test,
                1,
                tau_max,
                config.pc_alpha,
                config.max_conds_dim,
                config.max_combinations,
            );

            // Run ancestral removal with preliminary flag
            let graph =
                self.ancestral_removal_phase(config, &pc_result.all_parents, true);

            // Extract definite ancestors: any lagged link that survives is a
            // definite ancestor
            for j in 0..n {
                let entry = def_ancs.entry(j).or_default();
                for i in 0..n {
                    for tau in 1..=tau_max {
                        if graph.get_link(i, j, tau).is_active() {
                            let vl = (i, -(tau as i32));
                            if !entry.contains(&vl) {
                                entry.push(vl);
                            }
                        }
                    }
                }
            }
        }

        // Step 2: Full ancestral removal phase (using accumulated ancestors)
        let mut merged_parents: HashMap<usize, Vec<VarLag>> = HashMap::new();
        {
            let pc_result = pc::run_pc_stable(
                self.df,
                self.test,
                0, // Include contemporaneous
                tau_max,
                config.pc_alpha,
                config.max_conds_dim,
                config.max_combinations,
            );
            // Merge PC parents with definite ancestors
            for j in 0..n {
                let mut parents = pc_result
                    .all_parents
                    .get(&j)
                    .cloned()
                    .unwrap_or_default();
                if let Some(ancs) = def_ancs.get(&j) {
                    for &a in ancs {
                        if !parents.contains(&a) {
                            parents.push(a);
                        }
                    }
                }
                merged_parents.insert(j, parents);
            }
        }

        let mut graph = self.ancestral_removal_phase(config, &merged_parents, false);
        tracing::info!("LPCMCI ancestral removal complete");

        // Step 3: Non-ancestral phase — additional conditioning on
        // contemporaneous neighbors for remaining undirected links.
        self.non_ancestral_phase(config, &mut graph, &merged_parents);
        tracing::info!("LPCMCI non-ancestral phase complete");

        // Step 4: Final orientation
        self.orient_edges(&mut graph);
        tracing::info!("LPCMCI orientation complete");

        let result = CausalResult::from_graph(&graph, &self.df.var_names);
        tracing::info!(n_links = result.links.len(), "LPCMCI complete");
        result
    }

    /// Ancestral removal phase: test links conditioning on both lagged
    /// parents and contemporaneous adjacencies. Mark surviving lagged
    /// links as Directed and contemporaneous as Uncertain.
    fn ancestral_removal_phase(
        &self,
        config: &PcmciConfig,
        all_parents: &HashMap<usize, Vec<VarLag>>,
        preliminary: bool,
    ) -> CausalGraph {
        let n = self.df.n_vars;
        let tau_max = config.tau_max;

        // Build test tasks
        let mut tasks: Vec<(usize, usize, usize)> = Vec::new();
        for j in 0..n {
            for i in 0..n {
                for tau in 0..=tau_max {
                    if tau == 0 && i >= j {
                        continue;
                    }
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
                let neg_tau = -(tau as i32);
                let x = vec![(i, neg_tau)];
                let y = vec![(j, 0i32)];

                let mut z: Vec<VarLag> = Vec::new();

                // Parents of j
                if let Some(parents_j) = all_parents.get(&j) {
                    let limit = config.max_conds_py.unwrap_or(parents_j.len());
                    for &p in parents_j.iter().take(limit) {
                        if p != (i, neg_tau) {
                            z.push(p);
                        }
                    }
                }

                // Shifted parents of i (unless preliminary)
                if !preliminary
                    && let Some(parents_i) = all_parents.get(&i) {
                        let limit = config.max_conds_px.unwrap_or(parents_i.len());
                        for &(k, tau_k) in parents_i.iter().take(limit) {
                            let shifted = (k, tau_k + neg_tau);
                            let abs_lag = (-shifted.1) as usize;
                            if abs_lag <= 2 * config.tau_max
                                && !z.contains(&shifted)
                                && shifted != (i, neg_tau)
                            {
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
            })
            .collect();

        // Assemble graph
        let mut graph = CausalGraph::new(n, tau_max);
        for (i, j, tau, val, pval) in results {
            graph.set_val(i, j, tau, val);
            graph.set_pval(i, j, tau, pval);

            if pval <= config.alpha_level {
                if tau > 0 {
                    graph.set_link(i, j, tau, LinkType::Directed);
                } else {
                    // Contemporaneous: Uncertain (might be latent confounder)
                    graph.set_link(i, j, 0, LinkType::Uncertain);
                    graph.set_link(j, i, 0, LinkType::Uncertain);
                    graph.set_val(j, i, 0, val);
                    graph.set_pval(j, i, 0, pval);
                }
            }

            // Mirror contemporaneous values
            if tau == 0 {
                graph.set_val(j, i, 0, val);
                graph.set_pval(j, i, 0, pval);
            }
        }

        graph
    }

    /// Non-ancestral phase: refine contemporaneous links by testing with
    /// expanded conditioning sets including contemporaneous adjacencies.
    fn non_ancestral_phase(
        &self,
        config: &PcmciConfig,
        graph: &mut CausalGraph,
        all_parents: &HashMap<usize, Vec<VarLag>>,
    ) {
        let n = graph.n_vars;
        let tau_max = graph.tau_max;

        // Collect contemporaneous adjacencies to refine
        let mut contemp_pairs: Vec<(usize, usize)> = Vec::new();
        for i in 0..n {
            for j in (i + 1)..n {
                if graph.get_link(i, j, 0).is_active() {
                    contemp_pairs.push((i, j));
                }
            }
        }

        // For each contemporaneous pair, test with extended conditioning
        for &(i, j) in &contemp_pairs {
            let x = vec![(i, 0i32)];
            let y = vec![(j, 0i32)];

            // Conditions: parents(j) + parents(i) + other contemporaneous neighbors
            let mut z: Vec<VarLag> = Vec::new();

            // Lagged parents of j
            if let Some(parents_j) = all_parents.get(&j) {
                for &p in parents_j {
                    if p != (i, 0) && !z.contains(&p) {
                        z.push(p);
                    }
                }
            }

            // Lagged parents of i
            if let Some(parents_i) = all_parents.get(&i) {
                for &p in parents_i {
                    if p != (j, 0) && !z.contains(&p) {
                        z.push(p);
                    }
                }
            }

            // Other contemporaneous neighbors of j
            for k in 0..n {
                if k == i && k != j && graph.get_link(k, j, 0).is_active() {
                    let vl = (k, 0i32);
                    if !z.contains(&vl) {
                        z.push(vl);
                    }
                }
            }

            let (array, xyz_labels) = self.df.construct_array(&x, &y, &z, tau_max);
            if array.ncols() < 5 {
                continue;
            }

            let result = self.test.run_test(&array, &xyz_labels, config.alpha_level);

            // Update if independence is found
            if !result.dependent {
                graph.set_link(i, j, 0, LinkType::None);
                graph.set_link(j, i, 0, LinkType::None);
            }

            // Update values
            graph.set_val(i, j, 0, result.val);
            graph.set_pval(i, j, 0, result.pval);
            graph.set_val(j, i, 0, result.val);
            graph.set_pval(j, i, 0, result.pval);
        }
    }

    /// Final orientation: orient edges based on collider detection and
    /// ancestral rules. Latent-confounder-aware: surviving undirected
    /// contemporaneous edges become Undirected (potential bidirected).
    fn orient_edges(&self, graph: &mut CausalGraph) {
        let n = graph.n_vars;
        let tau_max = graph.tau_max;

        // Orient colliders: for each unshielded triple a → b - c,
        // if a and c are not adjacent, orient b ← c as well (collider at b)
        for b in 0..n {
            let mut neighbors: Vec<VarLag> = Vec::new();
            for a in 0..n {
                for tau in 0..=tau_max {
                    if tau == 0 && a == b {
                        continue;
                    }
                    if graph.get_link(a, b, tau).is_active() {
                        neighbors.push((a, -(tau as i32)));
                    }
                }
            }

            for ni in 0..neighbors.len() {
                for nj in (ni + 1)..neighbors.len() {
                    let (a, tau_a) = neighbors[ni];
                    let (c, tau_c) = neighbors[nj];

                    // Check adjacency between a and c
                    if self.are_adjacent(graph, a, tau_a, c, tau_c) {
                        continue;
                    }

                    // Orient as collider: both point towards b
                    if tau_a == 0 && matches!(graph.get_link(a, b, 0), LinkType::Uncertain) {
                        graph.set_link(a, b, 0, LinkType::Directed);
                        graph.set_link(b, a, 0, LinkType::ReverseDirected);
                    }
                    if tau_c == 0 && matches!(graph.get_link(c, b, 0), LinkType::Uncertain) {
                        graph.set_link(c, b, 0, LinkType::Directed);
                        graph.set_link(b, c, 0, LinkType::ReverseDirected);
                    }
                }
            }
        }

        // Remaining uncertain contemporaneous links become Undirected
        // (represent possible latent confounders: X o-o Y)
        for i in 0..n {
            for j in (i + 1)..n {
                if graph.get_link(i, j, 0) == LinkType::Uncertain {
                    graph.set_link(i, j, 0, LinkType::Undirected);
                    graph.set_link(j, i, 0, LinkType::Undirected);
                }
            }
        }
    }

    fn are_adjacent(
        &self,
        graph: &CausalGraph,
        a: usize,
        tau_a: i32,
        c: usize,
        tau_c: i32,
    ) -> bool {
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
}
