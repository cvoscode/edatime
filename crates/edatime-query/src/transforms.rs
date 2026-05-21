//! Composable LazyFrame transformation stages.

use edatime_core::pipeline::PipelineStage;
use edatime_core::types::{Expr, LazyFrame, col};

pub struct LttbStage {
    pub ts_col: String,
    pub value_cols: Vec<String>,
    pub target_points: usize,
}

impl LttbStage {
    pub fn new(ts_col: String, value_cols: Vec<String>, target_points: usize) -> Self {
        Self {
            ts_col,
            value_cols,
            target_points,
        }
    }
}

impl PipelineStage for LttbStage {
    fn apply(&self, lf: LazyFrame) -> LazyFrame {
        let mut cols: Vec<Expr> = vec![col(&self.ts_col)];
        for c in &self.value_cols {
            cols.push(col(c));
        }
        lf.select(cols)
    }
    fn name(&self) -> &'static str {
        "lttb_downsample"
    }
}

pub struct BucketAggStage {
    pub ts_col: String,
    pub value_cols: Vec<String>,
    pub buckets: usize,
    pub agg_fn: String,
}

impl BucketAggStage {
    pub fn new(ts_col: String, value_cols: Vec<String>, buckets: usize, agg_fn: &str) -> Self {
        Self {
            ts_col,
            value_cols,
            buckets,
            agg_fn: agg_fn.to_string(),
        }
    }

    fn value_col(&self) -> &str {
        self.value_cols
            .first()
            .map(|s| s.as_str())
            .unwrap_or("value")
    }
}

impl PipelineStage for BucketAggStage {
    fn apply(&self, lf: LazyFrame) -> LazyFrame {
        let vc = self.value_col();
        let agg_expr: Expr = match self.agg_fn.as_str() {
            "sum" => col(vc).sum(),
            "min" => col(vc).min(),
            "max" => col(vc).max(),
            "count" => col(vc).count(),
            _ => col(vc).mean(),
        };
        lf.group_by([col(&self.ts_col)])
            .agg([agg_expr])
            .sort([self.ts_col.as_str()], Default::default())
    }
    fn name(&self) -> &'static str {
        "bucket_agg"
    }
}
