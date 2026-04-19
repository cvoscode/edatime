//! Graph types and link representations for causal discovery results.

use serde::Serialize;

/// Link type between two variables in the causal graph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
pub enum LinkType {
    /// Directed: i → j (lagged or contemporaneous)
    Directed,
    /// Reverse directed: i ← j
    ReverseDirected,
    /// Undirected / unoriented (Markov equivalence class)
    Undirected,
    /// Conflicting orientations
    Conflicting,
    /// Uncertain direction
    Uncertain,
    /// No link
    None,
}

impl LinkType {
    /// Convert to tigramite-compatible string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            LinkType::Directed => "-->",
            LinkType::ReverseDirected => "<--",
            LinkType::Undirected => "o-o",
            LinkType::Conflicting => "x-x",
            LinkType::Uncertain => "-?>",
            LinkType::None => "",
        }
    }

    /// Parse from tigramite string.
    pub fn from_str(s: &str) -> Self {
        match s.trim() {
            "-->" => LinkType::Directed,
            "<--" => LinkType::ReverseDirected,
            "o-o" => LinkType::Undirected,
            "x-x" => LinkType::Conflicting,
            "-?>" => LinkType::Uncertain,
            _ => LinkType::None,
        }
    }

    /// Whether this link type represents an active (non-absent) link.
    pub fn is_active(&self) -> bool {
        !matches!(self, LinkType::None)
    }

    /// Reverse the direction of this link.
    pub fn reverse(&self) -> Self {
        match self {
            LinkType::Directed => LinkType::ReverseDirected,
            LinkType::ReverseDirected => LinkType::Directed,
            other => *other,
        }
    }
}

/// Full NxNx(tau_max+1) causal graph.
#[derive(Debug, Clone)]
pub struct CausalGraph {
    pub n_vars: usize,
    pub tau_max: usize,
    /// Flat storage: graph[i * n_vars * (tau_max+1) + j * (tau_max+1) + tau]
    pub links: Vec<LinkType>,
    /// Test statistic values, same indexing
    pub val_matrix: Vec<f64>,
    /// P-values, same indexing
    pub p_matrix: Vec<f64>,
}

impl CausalGraph {
    pub fn new(n_vars: usize, tau_max: usize) -> Self {
        let size = n_vars * n_vars * (tau_max + 1);
        Self {
            n_vars,
            tau_max,
            links: vec![LinkType::None; size],
            val_matrix: vec![0.0; size],
            p_matrix: vec![1.0; size],
        }
    }

    #[inline]
    fn idx(&self, i: usize, j: usize, tau: usize) -> usize {
        i * self.n_vars * (self.tau_max + 1) + j * (self.tau_max + 1) + tau
    }

    pub fn get_link(&self, i: usize, j: usize, tau: usize) -> LinkType {
        self.links[self.idx(i, j, tau)]
    }

    pub fn set_link(&mut self, i: usize, j: usize, tau: usize, link: LinkType) {
        let idx = self.idx(i, j, tau);
        self.links[idx] = link;
    }

    pub fn get_val(&self, i: usize, j: usize, tau: usize) -> f64 {
        self.val_matrix[self.idx(i, j, tau)]
    }

    pub fn set_val(&mut self, i: usize, j: usize, tau: usize, val: f64) {
        let idx = self.idx(i, j, tau);
        self.val_matrix[idx] = val;
    }

    pub fn get_pval(&self, i: usize, j: usize, tau: usize) -> f64 {
        self.p_matrix[self.idx(i, j, tau)]
    }

    pub fn set_pval(&mut self, i: usize, j: usize, tau: usize, pval: f64) {
        let idx = self.idx(i, j, tau);
        self.p_matrix[idx] = pval;
    }

    /// Apply significance threshold to produce the graph link types.
    pub fn threshold(&mut self, alpha: f64) {
        let n = self.n_vars;
        let tau_max = self.tau_max;
        for i in 0..n {
            for j in 0..n {
                for tau in 0..=tau_max {
                    let idx = self.idx(i, j, tau);
                    if self.p_matrix[idx] <= alpha {
                        if tau > 0 {
                            // Lagged links are always directed
                            self.links[idx] = LinkType::Directed;
                        } else if i != j {
                            // Contemporaneous: undirected by default (PCMCI+ orients later)
                            self.links[idx] = LinkType::Undirected;
                        }
                    } else {
                        self.links[idx] = LinkType::None;
                    }
                }
            }
        }
    }

    /// Benjamini-Hochberg FDR correction on p-values.
    pub fn fdr_correction(&mut self) {
        let n = self.n_vars;
        let tau_max = self.tau_max;

        // Collect all testable p-values (skip self-links at tau=0)
        let mut pvals: Vec<(usize, f64)> = Vec::new();
        for i in 0..n {
            for j in 0..n {
                for tau in 0..=tau_max {
                    if tau == 0 && i == j {
                        continue;
                    }
                    let idx = self.idx(i, j, tau);
                    pvals.push((idx, self.p_matrix[idx]));
                }
            }
        }

        let m = pvals.len();
        if m == 0 {
            return;
        }

        // Sort by p-value ascending
        pvals.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

        // BH adjustment: p_adj[k] = min(p[k] * m / (k+1), 1.0)
        // Then enforce monotonicity from the back
        let mut adjusted: Vec<f64> = pvals
            .iter()
            .enumerate()
            .map(|(k, &(_, p))| (p * m as f64 / (k + 1) as f64).min(1.0))
            .collect();

        for k in (0..m - 1).rev() {
            adjusted[k] = adjusted[k].min(adjusted[k + 1]);
        }

        for (k, &(idx, _)) in pvals.iter().enumerate() {
            self.p_matrix[idx] = adjusted[k];
        }
    }
}

/// A single causal link for JSON output.
#[derive(Debug, Clone, Serialize)]
pub struct CausalLink {
    pub source: String,
    pub target: String,
    pub lag: usize,
    #[serde(rename = "type")]
    pub link_type: String,
    pub value: f64,
    pub pvalue: f64,
}

/// Complete result from a causal discovery run.
#[derive(Debug, Clone, Serialize)]
pub struct CausalResult {
    /// N×N×(τ+1) graph as nested arrays of link-type strings
    pub graph: Vec<Vec<Vec<String>>>,
    /// N×N×(τ+1) test statistic values
    pub val_matrix: Vec<Vec<Vec<f64>>>,
    /// N×N×(τ+1) p-values
    pub p_matrix: Vec<Vec<Vec<f64>>>,
    /// Column names
    pub columns: Vec<String>,
    /// Maximum lag tested
    pub tau_max: usize,
    /// Extracted significant links
    pub links: Vec<CausalLink>,
}

impl CausalResult {
    /// Build from a CausalGraph and variable names.
    pub fn from_graph(g: &CausalGraph, var_names: &[String]) -> Self {
        let n = g.n_vars;
        let tau_max = g.tau_max;

        let mut graph_3d = vec![vec![vec![String::new(); tau_max + 1]; n]; n];
        let mut val_3d = vec![vec![vec![0.0f64; tau_max + 1]; n]; n];
        let mut p_3d = vec![vec![vec![1.0f64; tau_max + 1]; n]; n];
        let mut links = Vec::new();

        for i in 0..n {
            for j in 0..n {
                for tau in 0..=tau_max {
                    let lt = g.get_link(i, j, tau);
                    let val = g.get_val(i, j, tau);
                    let pval = g.get_pval(i, j, tau);

                    graph_3d[i][j][tau] = lt.as_str().to_string();
                    val_3d[i][j][tau] = (val * 10000.0).round() / 10000.0;
                    p_3d[i][j][tau] = (pval * 1_000_000.0).round() / 1_000_000.0;

                    if lt.is_active() {
                        links.push(CausalLink {
                            source: var_names[i].clone(),
                            target: var_names[j].clone(),
                            lag: tau,
                            link_type: lt.as_str().to_string(),
                            value: (val * 10000.0).round() / 10000.0,
                            pvalue: (pval * 1_000_000.0).round() / 1_000_000.0,
                        });
                    }
                }
            }
        }

        CausalResult {
            graph: graph_3d,
            val_matrix: val_3d,
            p_matrix: p_3d,
            columns: var_names.to_vec(),
            tau_max,
            links,
        }
    }
}
