//! Conditional independence tests — ParCorr and CMI-KNN.
//!
//! ParCorr: OLS-residual partial correlation with analytic t-test significance.
//! CMI-KNN: k-nearest-neighbor conditional mutual information with shuffle test.
//!
//! References:
//! - ParCorr: standard partial correlation via linear regression residuals
//! - CMI-KNN: Frenzel & Pompe (2007), "Partial Mutual Information for Coupling
//!   Analysis of Multivariate Time Series"

use ndarray::{Array1, Array2};
use rand::prelude::*;
use rayon::prelude::*;
use statrs::distribution::{ContinuousCDF, StudentsT};

use super::data::XyzGroup;

/// Which independence test to use.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum IndependenceTestKind {
    #[default]
    ParCorr,
    CmiKnn,
    /// Robust partial correlation — non-paranormal transform to Gaussian
    /// marginals followed by standard ParCorr.
    RobustParCorr,
    /// G-squared test for discrete/categorical data (auto-bins continuous).
    Gsquared,
    /// Symbolic conditional mutual information for discrete data (auto-bins).
    CmiSymb,
}


/// Configuration for the conditional independence test.
#[derive(Debug, Clone)]
pub struct CondIndTest {
    pub kind: IndependenceTestKind,
    /// Number of shuffle samples for permutation tests (CMI-KNN).
    pub sig_samples: usize,
    /// Number of nearest neighbors for CMI-KNN (default 10).
    pub knn: usize,
    /// RNG seed for reproducibility.
    pub seed: u64,
    /// Number of neighbors for restricted shuffle (CMI-KNN).
    pub shuffle_neighbors: usize,
}

impl Default for CondIndTest {
    fn default() -> Self {
        Self {
            kind: IndependenceTestKind::ParCorr,
            sig_samples: 200,
            knn: 10,
            seed: 42,
            shuffle_neighbors: 5,
        }
    }
}

/// Result of a single independence test.
#[derive(Debug, Clone, Copy)]
pub struct TestResult {
    /// Test statistic value (partial correlation for ParCorr, CMI for CMI-KNN).
    pub val: f64,
    /// P-value.
    pub pval: f64,
    /// Whether the variables are dependent at the given threshold.
    pub dependent: bool,
}

impl CondIndTest {
    pub fn new(kind: IndependenceTestKind) -> Self {
        Self {
            kind,
            ..Default::default()
        }
    }

    /// Run the conditional independence test on the given array.
    ///
    /// - `array`: shape (dim, n_samples) where rows 0..|X| are X, |X|..|X|+|Y| are Y,
    ///   rest are Z.
    /// - `xyz`: group labels for each row.
    /// - `alpha`: significance threshold.
    pub fn run_test(&self, array: &Array2<f64>, xyz: &[XyzGroup], alpha: f64) -> TestResult {
        let n_samples = array.ncols();
        if n_samples < 5 {
            return TestResult {
                val: 0.0,
                pval: 1.0,
                dependent: false,
            };
        }

        match self.kind {
            IndependenceTestKind::ParCorr => self.run_parcorr(array, xyz, alpha),
            IndependenceTestKind::CmiKnn => self.run_cmi_knn(array, xyz, alpha),
            IndependenceTestKind::RobustParCorr => self.run_robust_parcorr(array, xyz, alpha),
            IndependenceTestKind::Gsquared => self.run_gsquared(array, xyz, alpha),
            IndependenceTestKind::CmiSymb => self.run_cmi_symb(array, xyz, alpha),
        }
    }

    // ── ParCorr ──────────────────────────────────────────────────────

    /// Partial correlation via OLS residuals + Pearson correlation.
    fn run_parcorr(&self, array: &Array2<f64>, xyz: &[XyzGroup], alpha: f64) -> TestResult {
        let n_samples = array.ncols();
        let dim = array.nrows();

        // Identify X, Y, Z row indices
        let x_idx: Vec<usize> = xyz
            .iter()
            .enumerate()
            .filter(|(_, g)| **g == XyzGroup::X)
            .map(|(i, _)| i)
            .collect();
        let y_idx: Vec<usize> = xyz
            .iter()
            .enumerate()
            .filter(|(_, g)| **g == XyzGroup::Y)
            .map(|(i, _)| i)
            .collect();
        let z_idx: Vec<usize> = xyz
            .iter()
            .enumerate()
            .filter(|(_, g)| **g == XyzGroup::Z)
            .map(|(i, _)| i)
            .collect();

        // Standardize a copy
        let mut std_array = array.clone();
        standardize_array(&mut std_array);

        // Get residuals after regressing out Z
        let resid_x = get_residuals(&std_array, &x_idx, &z_idx);
        let resid_y = get_residuals(&std_array, &y_idx, &z_idx);

        // Pearson correlation between residuals
        let val = pearson_1d(&resid_x, &resid_y);

        // Analytic significance: t-test with df = n - dim
        let df = n_samples as f64 - dim as f64;
        let pval = parcorr_pvalue(val, df);

        let dependent = pval <= alpha;
        TestResult {
            val,
            pval,
            dependent,
        }
    }

    // ── CMI-KNN ──────────────────────────────────────────────────────

    /// Conditional mutual information via k-nearest-neighbor estimator.
    /// Uses the Kraskov-Stögbauer-Grassberger (KSG) / Frenzel-Pompe estimator.
    fn run_cmi_knn(&self, array: &Array2<f64>, xyz: &[XyzGroup], alpha: f64) -> TestResult {
        let n_samples = array.ncols();
        let knn = self.knn.min(n_samples - 1).max(1);

        // Standardize + add small noise to break ties
        let mut work = array.clone();
        standardize_array(&mut work);
        let mut rng = StdRng::seed_from_u64(self.seed);
        add_noise(&mut work, &mut rng, 1e-6);

        let val = cmi_knn_value(&work, xyz, knn);

        // Shuffle significance test
        let pval = self.shuffle_significance(&work, xyz, val, knn, &mut rng);

        let dependent = pval <= alpha;
        TestResult {
            val,
            pval,
            dependent,
        }
    }

    /// Shuffle-based significance for CMI-KNN.
    fn shuffle_significance(
        &self,
        array: &Array2<f64>,
        xyz: &[XyzGroup],
        observed_val: f64,
        knn: usize,
        rng: &mut StdRng,
    ) -> f64 {
        let n_samples = array.ncols();
        let is_y: Vec<bool> = xyz.iter().map(|g| *g == XyzGroup::Y).collect();

        // Generate all permutations first (for deterministic seeds)
        let seeds: Vec<u64> = (0..self.sig_samples).map(|_| rng.next_u64()).collect();

        // Parallel shuffle test with rayon
        let count: usize = seeds
            .par_iter()
            .map(|&seed| {
                let mut local_rng = StdRng::seed_from_u64(seed);

                // Create permutation
                let mut perm: Vec<usize> = (0..n_samples).collect();
                perm.shuffle(&mut local_rng);

                let null_val = cmi_knn_value_permuted(array, xyz, knn, Some(&perm), &is_y);
                if null_val.abs() >= observed_val.abs() {
                    1
                } else {
                    0
                }
            })
            .sum();

        (count as f64 + 1.0) / (self.sig_samples as f64 + 1.0)
    }

    // ── RobustParCorr ────────────────────────────────────────────────

    /// Robust partial correlation: non-paranormal transform to Gaussian
    /// marginals, then standard ParCorr.
    fn run_robust_parcorr(&self, array: &Array2<f64>, xyz: &[XyzGroup], alpha: f64) -> TestResult {
        let mut transformed = array.clone();
        trafo2normal(&mut transformed);
        self.run_parcorr(&transformed, xyz, alpha)
    }

    // ── G-squared ────────────────────────────────────────────────────

    /// G-squared test: works on discretized data. Auto-bins continuous
    /// variables into `n_bins` equal-frequency bins.
    fn run_gsquared(&self, array: &Array2<f64>, xyz: &[XyzGroup], alpha: f64) -> TestResult {
        let n_samples = array.ncols();
        let n_bins = (n_samples as f64).sqrt().ceil().clamp(2.0, 10.0) as usize;

        // Discretize each row into bin indices
        let dim = array.nrows();
        let mut binned = vec![vec![0usize; n_samples]; dim];
        for d in 0..dim {
            let row: Vec<f64> = (0..n_samples).map(|s| array[[d, s]]).collect();
            binned[d] = equal_freq_bins(&row, n_bins);
        }

        let x_idx: Vec<usize> = xyz
            .iter()
            .enumerate()
            .filter(|(_, g)| **g == XyzGroup::X)
            .map(|(i, _)| i)
            .collect();
        let y_idx: Vec<usize> = xyz
            .iter()
            .enumerate()
            .filter(|(_, g)| **g == XyzGroup::Y)
            .map(|(i, _)| i)
            .collect();
        let z_idx: Vec<usize> = xyz
            .iter()
            .enumerate()
            .filter(|(_, g)| **g == XyzGroup::Z)
            .map(|(i, _)| i)
            .collect();

        let (g2, dof) = gsquared_statistic(&binned, &x_idx, &y_idx, &z_idx, n_samples, n_bins);

        let pval = if dof < 1 {
            1.0
        } else {
            use statrs::distribution::ChiSquared;
            match ChiSquared::new(dof as f64) {
                Ok(dist) => 1.0 - dist.cdf(g2),
                Err(_) => 1.0,
            }
        };

        TestResult {
            val: g2,
            pval,
            dependent: pval <= alpha,
        }
    }

    // ── CMI-Symb ─────────────────────────────────────────────────────

    /// Symbolic CMI: Shannon entropy-based CMI for discrete data.
    /// Auto-bins continuous variables.
    fn run_cmi_symb(&self, array: &Array2<f64>, xyz: &[XyzGroup], alpha: f64) -> TestResult {
        let n_samples = array.ncols();
        let n_bins = (n_samples as f64).sqrt().ceil().clamp(2.0, 10.0) as usize;

        let dim = array.nrows();
        let mut binned = vec![vec![0usize; n_samples]; dim];
        for d in 0..dim {
            let row: Vec<f64> = (0..n_samples).map(|s| array[[d, s]]).collect();
            binned[d] = equal_freq_bins(&row, n_bins);
        }

        let x_idx: Vec<usize> = xyz
            .iter()
            .enumerate()
            .filter(|(_, g)| **g == XyzGroup::X)
            .map(|(i, _)| i)
            .collect();
        let y_idx: Vec<usize> = xyz
            .iter()
            .enumerate()
            .filter(|(_, g)| **g == XyzGroup::Y)
            .map(|(i, _)| i)
            .collect();
        let z_idx: Vec<usize> = xyz
            .iter()
            .enumerate()
            .filter(|(_, g)| **g == XyzGroup::Z)
            .map(|(i, _)| i)
            .collect();

        let val = cmi_symb_value(&binned, &x_idx, &y_idx, &z_idx, n_samples, n_bins);

        // Local shuffle significance test
        let pval = self.cmi_symb_shuffle(&binned, &x_idx, &y_idx, &z_idx, n_samples, n_bins, val);

        TestResult {
            val,
            pval,
            dependent: pval <= alpha,
        }
    }

    /// Local shuffle test for CMI-Symb: permute X within Z-strata.
    #[allow(clippy::too_many_arguments, clippy::needless_range_loop)]
    fn cmi_symb_shuffle(
        &self,
        binned: &[Vec<usize>],
        x_idx: &[usize],
        y_idx: &[usize],
        z_idx: &[usize],
        n_samples: usize,
        n_bins: usize,
        observed_val: f64,
    ) -> f64 {
        use std::collections::HashMap;

        // Build Z-strata: map from Z-value-tuple to sample indices
        let mut strata: HashMap<Vec<usize>, Vec<usize>> = HashMap::new();
        for s in 0..n_samples {
            let z_key: Vec<usize> = z_idx.iter().map(|&d| binned[d][s]).collect();
            strata.entry(z_key).or_default().push(s);
        }

        let seeds: Vec<u64> = {
            let mut rng = StdRng::seed_from_u64(self.seed);
            (0..self.sig_samples).map(|_| rng.next_u64()).collect()
        };

        let count: usize = seeds
            .par_iter()
            .map(|&seed| {
                let mut local_rng = StdRng::seed_from_u64(seed);
                let mut shuffled = binned.to_vec();

                // Permute X indices within each Z-stratum
                for indices in strata.values() {
                    if indices.len() < 2 {
                        continue;
                    }
                    let mut perm = indices.clone();
                    perm.shuffle(&mut local_rng);
                    for (pos, &orig_s) in indices.iter().enumerate() {
                        let perm_s = perm[pos];
                        for &xi in x_idx {
                            shuffled[xi][orig_s] = binned[xi][perm_s];
                        }
                    }
                }

                let null_val = cmi_symb_value(&shuffled, x_idx, y_idx, z_idx, n_samples, n_bins);
                if null_val >= observed_val { 1 } else { 0 }
            })
            .sum();

        (count as f64 + 1.0) / (self.sig_samples as f64 + 1.0)
    }
}

// ── Non-paranormal transform (RobustParCorr) ─────────────────────────

/// Transform each row to standard normal marginals via empirical CDF →
/// inverse normal CDF (the "non-paranormal" or Gaussian copula transform).
fn trafo2normal(array: &mut Array2<f64>) {
    use statrs::distribution::{ContinuousCDF, Normal};
    let norm = Normal::new(0.0, 1.0).expect("Standard normal parameters (0,1) are always valid");
    let (dim, n) = (array.nrows(), array.ncols());
    if n < 2 {
        return;
    }
    let thres = 0.00001;
    for d in 0..dim {
        // Extract row and compute rank-based empirical CDF
        let mut vals: Vec<(f64, usize)> = (0..n).map(|s| (array[[d, s]], s)).collect();
        vals.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

        // Assign ranks (average rank for ties)
        let mut ranks = vec![0.0f64; n];
        let mut i = 0;
        while i < n {
            let mut j = i;
            while j < n && (vals[j].0 - vals[i].0).abs() < 1e-15 {
                j += 1;
            }
            let avg_rank = (i + j) as f64 / 2.0; // midpoint of tied group
            for k in i..j {
                ranks[vals[k].1] = avg_rank;
            }
            i = j;
        }

        // Transform: rank → uniform [0,1] → clamp → inverse normal CDF
        for s in 0..n {
            let u = (ranks[s] + 0.5) / n as f64; // continuity correction
            let u_clamped = u.clamp(thres, 1.0 - thres);
            array[[d, s]] = norm.inverse_cdf(u_clamped);
        }
    }
}

// ── Discretization helpers ────────────────────────────────────────────

/// Bin continuous values into `n_bins` equal-frequency bins.
/// Returns bin indices (0..n_bins-1) for each sample.
fn equal_freq_bins(values: &[f64], n_bins: usize) -> Vec<usize> {
    let n = values.len();
    if n == 0 {
        return vec![];
    }
    let mut indexed: Vec<(f64, usize)> = values
        .iter()
        .copied()
        .enumerate()
        .map(|(i, v)| (v, i))
        .collect();
    indexed.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    let mut bins = vec![0usize; n];
    for (rank, &(_, orig_idx)) in indexed.iter().enumerate() {
        let bin = (rank * n_bins / n).min(n_bins - 1);
        bins[orig_idx] = bin;
    }
    bins
}

// ── G-squared helpers ─────────────────────────────────────────────────

/// Compute G² statistic and degrees of freedom from discretized data.
///
/// G² = 2 * Σ observed * ln(observed / expected) over all cells.
fn gsquared_statistic(
    binned: &[Vec<usize>],
    x_idx: &[usize],
    y_idx: &[usize],
    z_idx: &[usize],
    n_samples: usize,
    n_bins: usize,
) -> (f64, usize) {
    use std::collections::HashMap;

    // Encode X, Y, Z values as single integers for speed
    let x_vals: Vec<usize> = (0..n_samples)
        .map(|s| {
            let mut v = 0usize;
            for (k, &xi) in x_idx.iter().enumerate() {
                v += binned[xi][s] * n_bins.pow(k as u32);
            }
            v
        })
        .collect();
    let y_vals: Vec<usize> = (0..n_samples)
        .map(|s| {
            let mut v = 0usize;
            for (k, &yi) in y_idx.iter().enumerate() {
                v += binned[yi][s] * n_bins.pow(k as u32);
            }
            v
        })
        .collect();
    let z_vals: Vec<usize> = if z_idx.is_empty() {
        vec![0usize; n_samples]
    } else {
        (0..n_samples)
            .map(|s| {
                let mut v = 0usize;
                for (k, &zi) in z_idx.iter().enumerate() {
                    v += binned[zi][s] * n_bins.pow(k as u32);
                }
                v
            })
            .collect()
    };

    // Count joint (z, y, x) occurrences
    let mut joint: HashMap<(usize, usize, usize), f64> = HashMap::new();
    let mut zy_count: HashMap<(usize, usize), f64> = HashMap::new();
    let mut zx_count: HashMap<(usize, usize), f64> = HashMap::new();
    let mut z_count: HashMap<usize, f64> = HashMap::new();

    for s in 0..n_samples {
        let (zv, yv, xv) = (z_vals[s], y_vals[s], x_vals[s]);
        *joint.entry((zv, yv, xv)).or_default() += 1.0;
        *zy_count.entry((zv, yv)).or_default() += 1.0;
        *zx_count.entry((zv, xv)).or_default() += 1.0;
        *z_count.entry(zv).or_default() += 1.0;
    }

    // G² = 2 * Σ n_zyx * ln(n_zyx * n_z / (n_zy * n_zx))
    let mut g2 = 0.0f64;
    for (&(zv, yv, xv), &obs) in &joint {
        if obs < 0.5 {
            continue;
        }
        let nz = z_count.get(&zv).copied().unwrap_or(1.0);
        let nzy = zy_count.get(&(zv, yv)).copied().unwrap_or(1.0);
        let nzx = zx_count.get(&(zv, xv)).copied().unwrap_or(1.0);
        let expected = nzy * nzx / nz;
        if expected > 0.0 {
            g2 += obs * (obs / expected).ln();
        }
    }
    g2 *= 2.0;

    // Degrees of freedom (per Z-stratum)
    let n_x_unique = zx_count.values().filter(|&&v| v > 0.0).count().max(1);
    let n_y_unique = zy_count.values().filter(|&&v| v > 0.0).count().max(1);
    let n_z_strata = z_count.len().max(1);
    // Simplified DOF: (|X|-1)*(|Y|-1)*|Z-strata|
    let nx = (n_x_unique / n_z_strata).max(1);
    let ny = (n_y_unique / n_z_strata).max(1);
    let dof = (nx.saturating_sub(1)) * (ny.saturating_sub(1)) * n_z_strata;

    (g2.max(0.0), dof.max(1))
}

// ── CMI-Symb helpers ──────────────────────────────────────────────────

/// Shannon entropy based CMI for discrete data.
///
/// CMI(X;Y|Z) = H(X,Z) + H(Y,Z) - H(Z) - H(X,Y,Z)
fn cmi_symb_value(
    binned: &[Vec<usize>],
    x_idx: &[usize],
    y_idx: &[usize],
    z_idx: &[usize],
    n_samples: usize,
    n_bins: usize,
) -> f64 {
    use std::collections::HashMap;

    // Helper: encode a set of dimensions into a single key
    let encode = |dims: &[usize], s: usize| -> usize {
        let mut v = 0usize;
        for (k, &d) in dims.iter().enumerate() {
            v += binned[d][s] * n_bins.pow(k as u32);
        }
        v
    };

    let xz_dims: Vec<usize> = x_idx.iter().chain(z_idx.iter()).copied().collect();
    let yz_dims: Vec<usize> = y_idx.iter().chain(z_idx.iter()).copied().collect();
    let xyz_dims: Vec<usize> = x_idx
        .iter()
        .chain(y_idx.iter())
        .chain(z_idx.iter())
        .copied()
        .collect();

    // Count frequencies
    let mut xz_freq: HashMap<usize, f64> = HashMap::new();
    let mut yz_freq: HashMap<usize, f64> = HashMap::new();
    let mut z_freq: HashMap<usize, f64> = HashMap::new();
    let mut xyz_freq: HashMap<usize, f64> = HashMap::new();

    for s in 0..n_samples {
        *xz_freq.entry(encode(&xz_dims, s)).or_default() += 1.0;
        *yz_freq.entry(encode(&yz_dims, s)).or_default() += 1.0;
        *xyz_freq.entry(encode(&xyz_dims, s)).or_default() += 1.0;
        if !z_idx.is_empty() {
            *z_freq.entry(encode(z_idx, s)).or_default() += 1.0;
        }
    }

    let n = n_samples as f64;

    // H(S) = -(Σ count * ln(count) - T * ln(T)) / T
    let entropy = |freq: &HashMap<usize, f64>| -> f64 {
        let sum_plogp: f64 = freq
            .values()
            .filter(|&&c| c > 0.0)
            .map(|&c| c * c.ln())
            .sum();
        -(sum_plogp - n * n.ln()) / n
    };

    let h_xz = entropy(&xz_freq);
    let h_yz = entropy(&yz_freq);
    let h_xyz = entropy(&xyz_freq);
    let h_z = if z_idx.is_empty() {
        0.0
    } else {
        entropy(&z_freq)
    };

    // CMI = H(X,Z) + H(Y,Z) - H(Z) - H(X,Y,Z)
    (h_xz + h_yz - h_z - h_xyz).max(0.0)
}

// ── ParCorr helpers ───────────────────────────────────────────────────

/// Standardize each row of the array to zero mean, unit variance.
fn standardize_array(array: &mut Array2<f64>) {
    let n = array.ncols() as f64;
    if n < 1.0 {
        return;
    }
    for mut row in array.rows_mut() {
        let mean = row.sum() / n;
        row -= mean;
        let var = row.dot(&row) / n;
        let std = var.sqrt();
        if std > 1e-15 {
            row /= std;
        }
    }
}

/// OLS regression residuals: regress `target_rows` on `cond_rows`, return residual vector.
///
/// If `cond_rows` is empty, returns the mean-centered target directly.
/// For multiple target rows, returns the concatenated residual (for parcorr we use
/// the first X and first Y only).
fn get_residuals(array: &Array2<f64>, target_rows: &[usize], cond_rows: &[usize]) -> Array1<f64> {
    let n = array.ncols();
    if target_rows.is_empty() {
        return Array1::zeros(n);
    }

    // Use first target (parcorr tests one X vs one Y)
    let y = array.row(target_rows[0]).to_owned();

    if cond_rows.is_empty() {
        return y;
    }

    // Build Z matrix: (n_samples, n_conds)
    let n_z = cond_rows.len();
    let mut z = Array2::<f64>::zeros((n, n_z));
    for (col, &zi) in cond_rows.iter().enumerate() {
        for s in 0..n {
            z[[s, col]] = array[[zi, s]];
        }
    }

    // OLS: β = (Z^T Z)^{-1} Z^T y
    // Use normal equations with manual Cholesky-like solve for small dimensions
    ols_residual(&z, &y)
}

/// Solve OLS and return residuals: y - Z * (Z^T Z)^{-1} Z^T y.
///
/// Uses direct solve for small conditioning sets (typical: 0-20 variables).
fn ols_residual(z: &Array2<f64>, y: &Array1<f64>) -> Array1<f64> {
    let n = z.nrows();
    let p = z.ncols();

    if p == 0 || n == 0 {
        return y.clone();
    }

    // Z^T Z: (p, p)
    let mut zt_z = Array2::<f64>::zeros((p, p));
    for i in 0..p {
        for j in i..p {
            let sum: f64 = (0..n).map(|s| z[[s, i]] * z[[s, j]]).sum();
            zt_z[[i, j]] = sum;
            zt_z[[j, i]] = sum;
        }
    }

    // Z^T y: (p,)
    let mut zt_y = Array1::<f64>::zeros(p);
    for i in 0..p {
        zt_y[i] = (0..n).map(|s| z[[s, i]] * y[s]).sum();
    }

    // Solve (Z^T Z) β = Z^T y via Cholesky
    match cholesky_solve(&zt_z, &zt_y) {
        Some(beta) => {
            // residual = y - Z β
            let mut resid = y.clone();
            for s in 0..n {
                let mut pred = 0.0;
                for j in 0..p {
                    pred += z[[s, j]] * beta[j];
                }
                resid[s] -= pred;
            }
            resid
        }
        None => {
            // Singular — fall back to returning y
            y.clone()
        }
    }
}

/// Cholesky decomposition and forward/back substitution for Ax = b.
/// Returns None if not positive definite (singular conditioning set).
fn cholesky_solve(a: &Array2<f64>, b: &Array1<f64>) -> Option<Array1<f64>> {
    let n = a.nrows();
    // L: lower triangular
    let mut l = Array2::<f64>::zeros((n, n));

    for i in 0..n {
        for j in 0..=i {
            let sum: f64 = (0..j).map(|k| l[[i, k]] * l[[j, k]]).sum();
            if i == j {
                let diag = a[[i, i]] - sum;
                if diag <= 1e-14 {
                    return None; // Not positive definite
                }
                l[[i, j]] = diag.sqrt();
            } else {
                l[[i, j]] = (a[[i, j]] - sum) / l[[j, j]];
            }
        }
    }

    // Forward substitution: L y = b
    let mut y = Array1::<f64>::zeros(n);
    for i in 0..n {
        let sum: f64 = (0..i).map(|j| l[[i, j]] * y[j]).sum();
        y[i] = (b[i] - sum) / l[[i, i]];
    }

    // Back substitution: L^T x = y
    let mut x = Array1::<f64>::zeros(n);
    for i in (0..n).rev() {
        let sum: f64 = ((i + 1)..n).map(|j| l[[j, i]] * x[j]).sum();
        x[i] = (y[i] - sum) / l[[i, i]];
    }

    Some(x)
}

/// Pearson correlation between two 1-D arrays.
fn pearson_1d(x: &Array1<f64>, y: &Array1<f64>) -> f64 {
    let n = x.len();
    if n == 0 {
        return 0.0;
    }
    let mx = x.sum() / n as f64;
    let my = y.sum() / n as f64;
    
    let (cov, vx, vy) = (0..n).fold((0.0, 0.0, 0.0), |(c, x2, y2), i| {
        let dx = x[i] - mx;
        let dy = y[i] - my;
        (c + dx * dy, x2 + dx * dx, y2 + dy * dy)
    });
    
    let denom = (vx * vy).sqrt();
    if denom < 1e-15 { 0.0 } else { cov / denom }
}

/// Two-sided p-value for partial correlation using Student's t-distribution.
///
/// t = val * sqrt(df / (1 - val^2)),  p = 2 * P(T > |t|) where T ~ t(df)
fn parcorr_pvalue(val: f64, df: f64) -> f64 {
    if df < 1.0 {
        return 1.0;
    }
    let val_sq = val * val;
    if val_sq >= 1.0 {
        return 0.0;
    }
    let t_stat = val * (df / (1.0 - val_sq)).sqrt();
    match StudentsT::new(0.0, 1.0, df) {
        Ok(dist) => 2.0 * (1.0 - dist.cdf(t_stat.abs())),
        Err(_) => 1.0,
    }
}

// ── CMI-KNN helpers ───────────────────────────────────────────────────

/// Add small Gaussian noise to break ties (CMI-KNN requirement).
fn add_noise(array: &mut Array2<f64>, rng: &mut StdRng, scale: f64) {
    let (dim, n) = (array.nrows(), array.ncols());
    for d in 0..dim {
        let row_std = {
            let row = array.row(d);
            let mean = row.sum() / n as f64;
            let var: f64 = row.iter().map(|&x| (x - mean).powi(2)).sum::<f64>() / n as f64;
            var.sqrt().max(1e-10)
        };
        for s in 0..n {
            // Box-Muller for Gaussian noise
            let u1: f64 = rng.r#gen::<f64>().max(1e-15);
            let u2: f64 = rng.r#gen::<f64>();
            let noise = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
            array[[d, s]] += scale * row_std * noise;
        }
    }
}

/// Compute CMI(X; Y | Z) using the KSG/Frenzel-Pompe estimator.
///
/// Formula: CMI = ψ(k) + <ψ(n_Z) - ψ(n_XZ) - ψ(n_YZ)>
/// where ψ is the digamma function, n_S is the number of points within the
/// k-th neighbor distance in the joint space projected onto subspace S.
fn cmi_knn_value(array: &Array2<f64>, xyz: &[XyzGroup], knn: usize) -> f64 {
    let is_y: Vec<bool> = xyz.iter().map(|g| *g == XyzGroup::Y).collect();
    cmi_knn_value_permuted(array, xyz, knn, None, &is_y)
}

fn cmi_knn_value_permuted(
    array: &Array2<f64>,
    xyz: &[XyzGroup],
    knn: usize,
    y_perm: Option<&[usize]>,
    is_y: &[bool],
) -> f64 {
    let n_samples = array.ncols();
    if n_samples <= knn {
        return 0.0;
    }

    let xz_dims: Vec<usize> = xyz
        .iter()
        .enumerate()
        .filter(|(_, g)| **g == XyzGroup::X || **g == XyzGroup::Z)
        .map(|(i, _)| i)
        .collect();
    let yz_dims: Vec<usize> = xyz
        .iter()
        .enumerate()
        .filter(|(_, g)| **g == XyzGroup::Y || **g == XyzGroup::Z)
        .map(|(i, _)| i)
        .collect();
    let z_idx: Vec<usize> = xyz
        .iter()
        .enumerate()
        .filter(|(_, g)| **g == XyzGroup::Z)
        .map(|(i, _)| i)
        .collect();

    let has_z = !z_idx.is_empty();
    let all_dims: Vec<usize> = (0..array.nrows()).collect();

    let eps_array: Vec<f64> = (0..n_samples)
        .into_par_iter()
        .map(|s| kth_neighbor_distance(array, &all_dims, s, knn, n_samples, y_perm, is_y))
        .collect();

    let sums: (f64, f64, f64) = (0..n_samples)
        .into_par_iter()
        .map(|s| {
            let eps = eps_array[s];
            let n_xz = count_neighbors(array, &xz_dims, s, eps, n_samples, y_perm, is_y);
            let n_yz = count_neighbors(array, &yz_dims, s, eps, n_samples, y_perm, is_y);
            let n_z = if has_z {
                count_neighbors(array, &z_idx, s, eps, n_samples, y_perm, is_y)
            } else {
                n_samples as f64 // If no Z, all samples are neighbors
            };
            (digamma(n_xz), digamma(n_yz), digamma(n_z))
        })
        .reduce(|| (0.0, 0.0, 0.0), |a, b| (a.0 + b.0, a.1 + b.1, a.2 + b.2));

    let n = n_samples as f64;
    digamma(knn as f64) + sums.2 / n - sums.0 / n - sums.1 / n
}

/// Find the L∞ distance to the k-th nearest neighbor in the given subspace.
fn kth_neighbor_distance(
    array: &Array2<f64>,
    dims: &[usize],
    sample: usize,
    knn: usize,
    n_samples: usize,
    y_perm: Option<&[usize]>,
    is_y: &[bool],
) -> f64 {
    // Compute L∞ distances to all other samples
    let mut dists: Vec<f64> = Vec::with_capacity(n_samples - 1);
    for s in 0..n_samples {
        if s == sample {
            continue;
        }
        let mut max_d = 0.0f64;
        for &d in dims {
            let val_sample = if is_y[d] && let Some(p) = y_perm {
                array[[d, p[sample]]]
            } else {
                array[[d, sample]]
            };
            let val_s = if is_y[d] && let Some(p) = y_perm {
                array[[d, p[s]]]
            } else {
                array[[d, s]]
            };
            let diff = (val_sample - val_s).abs();
            max_d = max_d.max(diff);
        }
        dists.push(max_d);
    }
    // Partial sort to find k-th smallest
    let k = knn.min(dists.len());
    if k == 0 {
        return 0.0;
    }
    dists.select_nth_unstable_by(k - 1, |a, b| {
        a.partial_cmp(b).expect("Numeric values are comparable")
    });
    dists[k - 1] * (1.0 - 1e-10) // Slightly reduce to handle ties
}

/// Count the number of neighbors within L∞ distance ε in the given subspace.
fn count_neighbors(
    array: &Array2<f64>,
    dims: &[usize],
    sample: usize,
    eps: f64,
    n_samples: usize,
    y_perm: Option<&[usize]>,
    is_y: &[bool],
) -> f64 {
    let mut count = 0u64;
    for s in 0..n_samples {
        if s == sample {
            continue;
        }
        let mut within = true;
        for &d in dims {
            let val_sample = if is_y[d] && let Some(p) = y_perm {
                array[[d, p[sample]]]
            } else {
                array[[d, sample]]
            };
            let val_s = if is_y[d] && let Some(p) = y_perm {
                array[[d, p[s]]]
            } else {
                array[[d, s]]
            };
            if (val_sample - val_s).abs() > eps {
                within = false;
                break;
            }
        }
        if within {
            count += 1;
        }
    }
    // Return at least 1 to avoid digamma(0)
    (count as f64).max(1.0)
}

/// Digamma function ψ(x) — approximation using Stirling's series.
///
/// For x ≥ 6: ψ(x) ≈ ln(x) - 1/(2x) - 1/(12x²) + 1/(120x⁴) - 1/(252x⁶)
/// For x < 6: use recurrence ψ(x) = ψ(x+1) - 1/x
fn digamma(x: f64) -> f64 {
    if x <= 0.0 {
        return f64::NEG_INFINITY;
    }
    let mut result = 0.0;
    let mut x = x;
    // Shift up to x >= 6
    while x < 6.0 {
        result -= 1.0 / x;
        x += 1.0;
    }
    // Stirling series
    let inv_x = 1.0 / x;
    let inv_x2 = inv_x * inv_x;
    result +=
        x.ln() - 0.5 * inv_x - inv_x2 * (1.0 / 12.0 - inv_x2 * (1.0 / 120.0 - inv_x2 / 252.0));
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parcorr_independent() {
        // X and Y are independent standard normals, no Z
        let mut rng = StdRng::seed_from_u64(42);
        let n = 500;
        let mut arr = Array2::<f64>::zeros((2, n));
        for s in 0..n {
            let u1: f64 = rng.r#gen::<f64>().max(1e-15);
            let u2: f64 = rng.r#gen::<f64>();
            arr[[0, s]] = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
            let u1: f64 = rng.r#gen::<f64>().max(1e-15);
            let u2: f64 = rng.r#gen::<f64>();
            arr[[1, s]] = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
        }
        let xyz = vec![XyzGroup::X, XyzGroup::Y];
        let test = CondIndTest::new(IndependenceTestKind::ParCorr);
        let result = test.run_test(&arr, &xyz, 0.05);
        assert!(
            result.pval > 0.05,
            "Independent variables should have p > 0.05, got {}",
            result.pval
        );
    }

    #[test]
    fn test_parcorr_dependent() {
        // Y = 0.8*X + noise
        let mut rng = StdRng::seed_from_u64(42);
        let n = 500;
        let mut arr = Array2::<f64>::zeros((2, n));
        for s in 0..n {
            let u1: f64 = rng.r#gen::<f64>().max(1e-15);
            let u2: f64 = rng.r#gen::<f64>();
            let x = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
            let u1: f64 = rng.r#gen::<f64>().max(1e-15);
            let u2: f64 = rng.r#gen::<f64>();
            let noise = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
            arr[[0, s]] = x;
            arr[[1, s]] = 0.8 * x + 0.2 * noise;
        }
        let xyz = vec![XyzGroup::X, XyzGroup::Y];
        let test = CondIndTest::new(IndependenceTestKind::ParCorr);
        let result = test.run_test(&arr, &xyz, 0.05);
        assert!(
            result.pval < 0.01,
            "Dependent variables should have p < 0.01, got {}",
            result.pval
        );
        assert!(
            result.val.abs() > 0.5,
            "Should have strong correlation, got {}",
            result.val
        );
    }

    #[test]
    fn test_digamma_known_values() {
        // ψ(1) = -γ ≈ -0.5772
        assert!((digamma(1.0) - (-0.5772156649)).abs() < 1e-6);
        // ψ(2) ≈ 0.4228
        assert!((digamma(2.0) - 0.4227843351).abs() < 1e-6);
    }
}
