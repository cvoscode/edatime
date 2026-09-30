# crates/edatime-service/src/causal/graph.rs
> CausalGraph and CausalResult types.

## Struct: CausalResult
- `{ link: (usize, usize, isize), value: f64, pvalue: f64 }`

## Struct: CausalGraph
- `{ nodes: Vec<String>, adj: Vec<Vec<Vec<bool>>>, val_matrix: Vec<Vec<Vec<f64>>>, p_matrix: Vec<Vec<Vec<f64>>> }`