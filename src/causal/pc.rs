//! PC-stable algorithm for condition selection.
//!
//! For each target variable j, estimates a superset of its lagged parents
//! by iteratively testing conditional independence with increasing condition
//! set sizes and removing non-significant parents.
//!
//! Reference: Colombo & Maathuis (2014), order-independent constraint-based
//! causal structure learning.

use std::collections::HashMap;
use rayon::prelude::*;

use super::data::{CausalDataFrame, VarLag};
use super::independence::CondIndTest;

/// Result of the PC-stable condition selection step for all variables.
#[derive(Debug, Clone)]
pub struct PcResult {
    /// For each target j, the estimated parent set as (var, lag) pairs.
    pub all_parents: HashMap<usize, Vec<VarLag>>,
    /// Minimum absolute test statistic value for each (i, -τ) → j link.
    pub val_min: HashMap<(usize, VarLag), f64>,
    /// Maximum p-value for each (i, -τ) → j link.
    pub pval_max: HashMap<(usize, VarLag), f64>,
}

/// Run the PC-stable condition selection for all variables in parallel.
///
/// For each variable j, runs `pc_stable_single` which iteratively tests
/// links against condition subsets of increasing cardinality.
pub fn run_pc_stable(
    df: &CausalDataFrame,
    test: &CondIndTest,
    tau_min: usize,
    tau_max: usize,
    pc_alpha: f64,
    max_conds_dim: Option<usize>,
    max_combinations: usize,
) -> PcResult {
    let n_vars = df.n_vars;

    // Run PC-stable for each variable in parallel
    let results: Vec<(usize, Vec<VarLag>, HashMap<VarLag, f64>, HashMap<VarLag, f64>)> =
        (0..n_vars).into_par_iter().map(|j| {
            let (parents, val_min, pval_max) = pc_stable_single(
                df, test, j, tau_min, tau_max, pc_alpha,
                max_conds_dim, max_combinations,
            );
            (j, parents, val_min, pval_max)
        }).collect();

    // Merge results
    let mut all_parents = HashMap::new();
    let mut all_val_min = HashMap::new();
    let mut all_pval_max = HashMap::new();

    for (j, parents, val_min, pval_max) in results {
        for (&vl, &v) in &val_min {
            all_val_min.insert((j, vl), v);
        }
        for (&vl, &p) in &pval_max {
            all_pval_max.insert((j, vl), p);
        }
        all_parents.insert(j, parents);
    }

    PcResult {
        all_parents,
        val_min: all_val_min,
        pval_max: all_pval_max,
    }
}

/// PC-stable condition selection for a single target variable j.
///
/// Iteratively tests each candidate parent (i, -τ) against subsets of the
/// other parents. If (i, -τ) is found independent of j conditioned on any
/// subset, it is removed from the parent set.
fn pc_stable_single(
    df: &CausalDataFrame,
    test: &CondIndTest,
    j: usize,
    tau_min: usize,
    tau_max: usize,
    pc_alpha: f64,
    max_conds_dim: Option<usize>,
    max_combinations: usize,
) -> (Vec<VarLag>, HashMap<VarLag, f64>, HashMap<VarLag, f64>) {
    let n_vars = df.n_vars;

    // Initialize candidate parents: all (i, -τ) for valid ranges, excluding (j, 0)
    let mut parents: Vec<VarLag> = Vec::new();
    for i in 0..n_vars {
        for tau in tau_min..=tau_max {
            if tau == 0 && i == j { continue; }
            parents.push((i, -(tau as i32)));
        }
    }

    let mut val_min: HashMap<VarLag, f64> = HashMap::new();
    let mut pval_max: HashMap<VarLag, f64> = HashMap::new();
    let mut val_dict: HashMap<VarLag, f64> = HashMap::new();

    // Initialize tracking
    for &p in &parents {
        val_min.insert(p, f64::INFINITY);
        pval_max.insert(p, 0.0);
    }

    let max_dim = max_conds_dim.unwrap_or(usize::MAX);

    // Iterate over increasing condition set sizes
    for conds_dim in 0..=max_dim {
        if parents.len() <= conds_dim {
            break; // Converged: not enough parents left
        }

        let mut nonsig: Vec<VarLag> = Vec::new();

        for &parent in &parents {
            let (i, neg_tau) = parent;

            // Build condition subsets from other parents
            let other_parents: Vec<VarLag> = parents.iter()
                .filter(|&&p| p != parent)
                .copied()
                .collect();

            if other_parents.len() < conds_dim { continue; }

            // Test against condition subsets of size `conds_dim`
            let combos = combinations(&other_parents, conds_dim);
            let combos_to_test = combos.iter().take(max_combinations);

            for z_set in combos_to_test {
                let x = vec![(i, neg_tau)];
                let y = vec![(j, 0i32)];
                let z: Vec<VarLag> = z_set.to_vec();

                let (array, xyz) = df.construct_array(&x, &y, &z, tau_max);
                if array.ncols() < 5 { continue; }

                let result = test.run_test(&array, &xyz, pc_alpha);

                // Update tracking
                let cur_min = val_min.get(&parent).copied().unwrap_or(f64::INFINITY);
                if result.val.abs() < cur_min {
                    val_min.insert(parent, result.val.abs());
                }
                let cur_max = pval_max.get(&parent).copied().unwrap_or(0.0);
                if result.pval > cur_max {
                    pval_max.insert(parent, result.pval);
                    val_dict.insert(parent, result.val);
                }

                if !result.dependent {
                    nonsig.push(parent);
                    break;
                }
            }
        }

        // Remove non-significant parents (stable: batch removal)
        parents.retain(|p| !nonsig.contains(p));

        // Sort remaining parents by |val_min| descending (strongest first)
        parents.sort_by(|a, b| {
            let va = val_min.get(a).copied().unwrap_or(0.0);
            let vb = val_min.get(b).copied().unwrap_or(0.0);
            vb.partial_cmp(&va).unwrap_or(std::cmp::Ordering::Equal)
        });
    }

    (parents, val_min, pval_max)
}

/// Generate all combinations of size k from a slice.
fn combinations<T: Clone>(items: &[T], k: usize) -> Vec<Vec<T>> {
    if k == 0 {
        return vec![vec![]];
    }
    if items.len() < k {
        return vec![];
    }

    let mut result = Vec::new();
    let mut indices: Vec<usize> = (0..k).collect();

    loop {
        result.push(indices.iter().map(|&i| items[i].clone()).collect());

        // Find the rightmost index that can be incremented
        let mut i = k;
        loop {
            if i == 0 { return result; }
            i -= 1;
            if indices[i] < items.len() - k + i {
                break;
            }
            if i == 0 { return result; }
        }

        indices[i] += 1;
        for j in (i + 1)..k {
            indices[j] = indices[j - 1] + 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_combinations() {
        let items = vec![1, 2, 3, 4];
        let c2 = combinations(&items, 2);
        assert_eq!(c2.len(), 6); // C(4,2) = 6
        let c0 = combinations(&items, 0);
        assert_eq!(c0.len(), 1);
        let c5 = combinations(&items, 5);
        assert_eq!(c5.len(), 0);
    }
}
