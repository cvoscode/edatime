# crates/edatime-service/src/causal/data.rs
> CausalDataFrame and VarLag types for PCMCI.

## Struct: VarLag
- `{ var: usize, lag: isize }`

## Struct: CausalDataFrame
- `{ df: DataFrame, var_names: Vec<String>, tau_max: usize }`