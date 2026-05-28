# crates/edatime-service/src/causal/mod.rs
> PCMCI algorithm — two-step causal discovery for time series.

## Struct: PcmciConfig
- `{ tau_min: usize, tau_max: usize, pc_alpha: f64, alpha_level: f64, max_conds_dim: Option<usize>, max_combinations: usize, max_conds_py: Option<usize>, max_conds_px: Option<usize>, fdr_method: String }`

## Submodules
- `data` — CausalDataFrame, VarLag
- `graph` — CausalGraph, CausalResult
- `independence` — CondIndTest
- `pc` — PC condition selection
- `lpcmci` — Linear PCMCI
- `pcmci` — PCMCI core
- `pcmciplus` — PCMCI+ variant