//! Declarative query builders - immutable, composable.

use edatime_core::types::{LazyFrame, DataType, Expr, col, lit};

#[derive(Clone)]
pub struct TimeSeriesQuery {
    pub time_column: String,
    pub start_ts: i64,
    pub end_ts: i64,
    pub value_columns: Vec<String>,
    pub color_column: Option<String>,
    pub target_points: Option<usize>,
}

impl TimeSeriesQuery {
    pub fn new(time_column: String, start_ts: i64, end_ts: i64) -> Self {
        Self { time_column, start_ts, end_ts, value_columns: Vec::new(), color_column: None, target_points: None }
    }
    pub fn with_values(mut self, cols: Vec<String>) -> Self { self.value_columns = cols; self }
    pub fn with_color(mut self, col: Option<String>) -> Self { self.color_column = col; self }
    pub fn with_lttb_target(mut self, target: usize) -> Self { self.target_points = Some(target); self }

    pub fn to_lazy_frame(&self, source: LazyFrame) -> LazyFrame {
        let mut lf = source;
        lf = lf.filter(
            col(&self.time_column).cast(DataType::Int64).gt_eq(lit(self.start_ts))
                .and(col(&self.time_column).cast(DataType::Int64).lt_eq(lit(self.end_ts))),
        );
        let mut cols: Vec<Expr> = vec![col(&self.time_column)];
        for c in &self.value_columns {
            cols.push(col(c));
        }
        if let Some(ref cc) = self.color_column {
            cols.push(col(cc));
        }
        lf.select(cols)
    }
}

#[derive(Clone)]
pub struct ScatterQuery {
    pub x_column: String,
    pub y_column: String,
    pub color_column: Option<String>,
    pub size_column: Option<String>,
    pub time_filter: Option<(i64, i64)>,
    pub filters: Vec<Expr>,
    pub limit: usize,
}

impl ScatterQuery {
    pub fn new(x: String, y: String) -> Self {
        Self { x_column: x, y_column: y, color_column: None, size_column: None, time_filter: None, filters: Vec::new(), limit: 10_000 }
    }
    pub fn with_color(mut self, col: Option<String>) -> Self { self.color_column = col; self }
    pub fn with_size(mut self, col: Option<String>) -> Self { self.size_column = col; self }
    pub fn with_time_filter(mut self, start: i64, end: i64) -> Self { self.time_filter = Some((start, end)); self }
    pub fn with_limit(mut self, limit: usize) -> Self { self.limit = limit; self }

    pub fn to_lazy_frame(&self, source: LazyFrame) -> LazyFrame {
        let mut lf = source;
        if let Some((start, end)) = self.time_filter {
            lf = lf.filter(
                col("timestamp").cast(DataType::Int64).gt_eq(lit(start))
                    .and(col("timestamp").cast(DataType::Int64).lt_eq(lit(end))),
            );
        }
        let mut cols: Vec<Expr> = vec![col(&self.x_column), col(&self.y_column)];
        if let Some(ref cc) = self.color_column { cols.push(col(cc)); }
        if let Some(ref sc) = self.size_column { cols.push(col(sc)); }
        lf.select(cols)
    }
}
