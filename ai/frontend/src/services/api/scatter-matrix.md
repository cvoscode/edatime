# ai/frontend/src/services/api/scatter-matrix.md
> Correlation matrix wrapper for pairwise numeric column comparisons.

## Functions
- `fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse>`
  - Fetches the full pairwise Pearson/Spearman correlation matrix for all numeric columns. [deps: [http][1]]

---
[1]: ./http.md