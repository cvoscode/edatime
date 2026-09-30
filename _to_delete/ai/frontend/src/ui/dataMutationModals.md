# ai/frontend/src/ui/dataMutationModals.md
> Modal handlers for transform expression and outlier removal. Transport calls delegated to the dataMutation feature entrypoint.

## Interfaces
- `RefreshDatasetOptions`: `{ selectedColumn?: string }`
- `DataMutationModalDeps`: `{ refreshDataset: (options?: RefreshDatasetOptions) => Promise<void> }`

## State
- `dataMutationFeature: DataMutationFeature` — created once from `createDataMutationFeature()` [deps: [createDataMutationFeature][1]]

## Functions

### initTransformModal
- `initTransformModal(deps: DataMutationModalDeps): void`
  - Binds transform expression modal apply/cancel: validates inputs, calls `dataMutationFeature.runTransform(expr, name)`, then calls `deps.refreshDataset({ selectedColumn: name })`.

### initOutlierModal
- `initOutlierModal(deps: DataMutationModalDeps): void`
  - Binds outlier removal modal apply/cancel: calls `dataMutationFeature.removeOutliers({ columns, method, threshold, window })`, displays rows removed result, then calls `deps.refreshDataset()`.

---
[1]: ../features/dataMutation/entrypoint.md#createDataMutationFeature