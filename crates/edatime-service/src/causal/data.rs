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
    /// Precomputed finite-value mask for each column to speed causal extraction.
    finite: Vec<Vec<bool>>,
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
        let finite = columns
            .iter()
            .map(|column| column.iter().map(|value| value.is_finite()).collect())
            .collect();
        Self {
            data: columns,
            finite,
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
        let data = crate::analytics::extract_columns_f64_preserve_missing(df, col_names, max_points)?;
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
        let mut entries: Vec<(VarLag, XyzGroup)> = Vec::with_capacity(x.len() + y.len() + z.len());
        let mut seen = VarLagSeenSet::new(self.n_vars, tau_max);
        for &vl in x {
            entries.push((vl, XyzGroup::X));
            let _ = seen.insert(vl);
        }
        for &vl in y {
            entries.push((vl, XyzGroup::Y));
            let _ = seen.insert(vl);
        }
        for &vl in z {
            // Deduplicate: skip Z entries that are already in X or Y.
            if seen.insert(vl) {
                entries.push((vl, XyzGroup::Z));
            }
        }

        let dim = entries.len();
        // max_lag = 2*tau_max matches tigramite's default cut_off
        let max_lag = 2 * tau_max;
        let start = max_lag;
        let n_samples = self.t_len.saturating_sub(start);

        let mut xyz = Vec::with_capacity(dim);
        let mut valid = vec![true; n_samples];
        let mut valid_count = n_samples;

        for &((var, lag), group) in &entries {
            xyz.push(group);
            let offset = (start as i32 + lag) as usize;
            let finite = &self.finite[var];
            for (sample_idx, is_valid) in valid.iter_mut().enumerate() {
                if *is_valid && !finite[offset + sample_idx] {
                    *is_valid = false;
                    valid_count -= 1;
                }
            }
        }

        let mut array = Array2::<f64>::zeros((dim, valid_count));
        if valid_count == n_samples {
            for (d, &((var, lag), _group)) in entries.iter().enumerate() {
                let offset = (start as i32 + lag) as usize;
                for sample_idx in 0..n_samples {
                    array[[d, sample_idx]] = self.data[var][offset + sample_idx];
                }
            }
        } else {
            for (d, &((var, lag), _group)) in entries.iter().enumerate() {
                let offset = (start as i32 + lag) as usize;
                let mut out_idx = 0usize;
                for (sample_idx, keep) in valid.iter().enumerate() {
                    if *keep {
                        array[[d, out_idx]] = self.data[var][offset + sample_idx];
                        out_idx += 1;
                    }
                }
            }
        }

        (array, xyz)
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

#[derive(Debug, Clone)]
pub struct VarLagSeenSet {
    n_vars: usize,
    lag_offset: i32,
    slots_per_var: usize,
    seen: Vec<bool>,
}

impl VarLagSeenSet {
    pub fn new(n_vars: usize, tau_max: usize) -> Self {
        let slots_per_var = 2 * tau_max + 1;
        Self {
            n_vars,
            lag_offset: (2 * tau_max) as i32,
            slots_per_var,
            seen: vec![false; n_vars * slots_per_var],
        }
    }

    pub fn insert(&mut self, value: VarLag) -> bool {
        let Some(index) = self.index(value) else {
            return false;
        };
        if self.seen[index] {
            return false;
        }
        self.seen[index] = true;
        true
    }

    fn index(&self, (var, lag): VarLag) -> Option<usize> {
        if var >= self.n_vars {
            return None;
        }
        let slot = lag + self.lag_offset;
        if slot < 0 || (slot as usize) >= self.slots_per_var {
            return None;
        }
        Some(var * self.slots_per_var + slot as usize)
    }
}

impl TestArray {
    pub fn dim(&self) -> usize {
        self.array.nrows()
    }
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::*;
    use polars::prelude::{DataFrame, NamedFrom, Series};

    #[test]
    fn from_polars_preserves_missing_values_for_causal_arrays() {
        let df = DataFrame::new(
            4,
            vec![
                Series::new("a".into(), [Some(1.0_f64), None, Some(3.0), Some(4.0)]).into(),
                Series::new("b".into(), [Some(10.0_f64), Some(11.0), None, Some(13.0)]).into(),
            ],
        )
        .expect("test dataframe should build");

        let causal_df =
            CausalDataFrame::from_polars(&df, &["a".to_string(), "b".to_string()], 16)
                .expect("causal dataframe should build");

        assert!(causal_df.value(1, 0).is_nan());
        assert!(causal_df.value(2, 1).is_nan());
    }

    #[test]
    fn construct_array_drops_samples_with_non_finite_values_after_cutoff() {
        let df = CausalDataFrame::new(
            vec![
                vec![1.0, f64::NAN, 3.0, 4.0, 5.0, 6.0],
                vec![10.0, 11.0, 12.0, f64::NAN, 14.0, 15.0],
            ],
            vec!["a".into(), "b".into()],
        );

        let (array, xyz) = df.construct_array(&[(0, -1)], &[(1, 0)], &[(1, -1)], 1);

        assert_eq!(xyz, vec![XyzGroup::X, XyzGroup::Y, XyzGroup::Z]);
        assert_eq!(array.nrows(), 3);
        assert_eq!(array.ncols(), 1, "only the fully finite sample should remain");
        assert_eq!(array[[0, 0]], 5.0);
        assert_eq!(array[[1, 0]], 15.0);
        assert_eq!(array[[2, 0]], 14.0);
    }
}
