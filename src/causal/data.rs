//! Causal data frame — mirrors tigramite's `data_processing.DataFrame`.
//!
//! Stores T×N time-series data and provides `construct_array` to build the
//! (X, Y, Z) observation matrix used by every independence test.

use ndarray::Array2;

/// A variable-lag pair: (variable_index, lag) where lag ≤ 0.
pub type VarLag = (usize, i32);

/// Marker for which group a dimension belongs to in the test array.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum XyzGroup {
    X = 0,
    Y = 1,
    Z = 2,
}

/// Time-series data for causal discovery.
#[derive(Debug, Clone)]
pub struct CausalDataFrame {
    /// Column-major data: `data[col][row]` — each inner vec is a column of length T.
    data: Vec<Vec<f64>>,
    /// Variable names.
    pub var_names: Vec<String>,
    /// Number of variables (columns).
    pub n_vars: usize,
    /// Number of time steps (rows).
    pub t_len: usize,
}

impl CausalDataFrame {
    /// Create from column-major data (each inner vec is one variable's time series).
    pub fn new(columns: Vec<Vec<f64>>, var_names: Vec<String>) -> Self {
        let n_vars = columns.len();
        let t_len = columns.first().map(|c| c.len()).unwrap_or(0);
        debug_assert!(columns.iter().all(|c| c.len() == t_len));
        Self {
            data: columns,
            var_names,
            n_vars,
            t_len,
        }
    }

    /// Create from a Polars DataFrame, extracting the given columns with
    /// NaN→mean replacement and optional sub-sampling.
    pub fn from_polars(
        df: &polars::prelude::DataFrame,
        col_names: &[String],
        max_points: usize,
    ) -> Result<Self, crate::error::AppError> {
        let data = crate::analytics::extract_columns_f64_mean(df, col_names, max_points)?;
        Ok(Self::new(data, col_names.to_vec()))
    }

    /// Access raw value at (time, variable).
    #[inline]
    pub fn value(&self, t: usize, var: usize) -> f64 {
        self.data[var][t]
    }

    /// Construct the observation array for an independence test of X ⊥ Y | Z.
    ///
    /// Returns:
    /// - `array`: shape (dim, n_samples) where dim = |X|+|Y|+|Z|
    /// - `xyz`:   group label for each dimension row
    /// - `n_samples`: number of valid time points
    ///
    /// Follows tigramite's `cut_off='2xtau_max'` convention: the effective
    /// start index is `max_lag` so all lagged variables are valid.
    pub fn construct_array(
        &self,
        x: &[VarLag],
        y: &[VarLag],
        z: &[VarLag],
        tau_max: usize,
    ) -> (Array2<f64>, Vec<XyzGroup>) {
        // Collect all (var, lag) with their group label
        let mut entries: Vec<(VarLag, XyzGroup)> = Vec::new();
        for &vl in x {
            entries.push((vl, XyzGroup::X));
        }
        for &vl in y {
            entries.push((vl, XyzGroup::Y));
        }
        for &vl in z {
            // Deduplicate: skip Z entries that are already in X or Y
            if !x.contains(&vl) && !y.contains(&vl) {
                entries.push((vl, XyzGroup::Z));
            }
        }

        let dim = entries.len();
        // max_lag = 2*tau_max matches tigramite's default cut_off
        let max_lag = 2 * tau_max;
        let start = max_lag;
        let n_samples = if self.t_len > start {
            self.t_len - start
        } else {
            0
        };

        let mut array = Array2::<f64>::zeros((dim, n_samples));
        let mut xyz = Vec::with_capacity(dim);

        for (d, &((var, lag), group)) in entries.iter().enumerate() {
            xyz.push(group);
            for s in 0..n_samples {
                let t = (start as i32 + s as i32 + lag) as usize;
                array[[d, s]] = self.data[var][t];
            }
        }

        // Remove samples that contain NaN in any dimension
        let valid: Vec<usize> = (0..n_samples)
            .filter(|&s| (0..dim).all(|d| array[[d, s]].is_finite()))
            .collect();

        if valid.len() < n_samples {
            let mut clean = Array2::<f64>::zeros((dim, valid.len()));
            for (new_s, &old_s) in valid.iter().enumerate() {
                for d in 0..dim {
                    clean[[d, new_s]] = array[[d, old_s]];
                }
            }
            (clean, xyz)
        } else {
            (array, xyz)
        }
    }

    /// Standardize each row (variable) of an array to zero mean and unit std.
    pub fn standardize(array: &mut Array2<f64>) {
        let (dim, n) = (array.nrows(), array.ncols());
        if n == 0 {
            return;
        }
        for d in 0..dim {
            let mut row = array.row_mut(d);
            let mean = row.sum() / n as f64;
            row -= mean;
            let var = row.dot(&row) / n as f64;
            let std = var.sqrt();
            if std > 1e-15 {
                row /= std;
            }
        }
    }

    /// Extract columns as Array2 (n_vars × t_len), NaN-cleaned per column
    /// by replacing NaN/Inf with column mean.
    pub fn as_cleaned_array(&self) -> Array2<f64> {
        let mut arr = Array2::<f64>::zeros((self.n_vars, self.t_len));
        for v in 0..self.n_vars {
            let col = &self.data[v];
            let finite_sum: f64 = col.iter().filter(|x| x.is_finite()).sum();
            let finite_count = col.iter().filter(|x| x.is_finite()).count();
            let mean = if finite_count > 0 {
                finite_sum / finite_count as f64
            } else {
                0.0
            };
            for t in 0..self.t_len {
                arr[[v, t]] = if col[t].is_finite() { col[t] } else { mean };
            }
        }
        arr
    }

    /// Compute Pearson correlation between two column slices.
    pub fn pearson_corr(x: &[f64], y: &[f64]) -> f64 {
        let n = x.len();
        if n == 0 {
            return 0.0;
        }
        let mx: f64 = x.iter().sum::<f64>() / n as f64;
        let my: f64 = y.iter().sum::<f64>() / n as f64;
        let mut cov = 0.0;
        let mut vx = 0.0;
        let mut vy = 0.0;
        for i in 0..n {
            let dx = x[i] - mx;
            let dy = y[i] - my;
            cov += dx * dy;
            vx += dx * dx;
            vy += dy * dy;
        }
        let denom = (vx * vy).sqrt();
        if denom < 1e-15 { 0.0 } else { cov / denom }
    }
}

/// Result from `construct_array` with named fields.
pub struct TestArray {
    /// Shape: (dim, n_samples)
    pub array: Array2<f64>,
    /// Group label for each dimension
    pub xyz: Vec<XyzGroup>,
    /// Number of usable samples
    pub n_samples: usize,
}

impl TestArray {
    pub fn dim(&self) -> usize {
        self.array.nrows()
    }
}
