# frontend/src/ui/dataMutationModals.ts
> Modal handlers for transform expression and outlier removal operations.

## Interfaces
- `DataMutationModalDeps`: `{ refreshDataset: (options?: RefreshDatasetOptions) => Promise<void> }`
- `RefreshDatasetOptions`: `{ selectedColumn?: string }`

## Functions
- `initTransformModal(deps: DataMutationModalDeps): void`
  - Initializes transform expression modal with apply/cancel handlers.
- `initOutlierModal(deps: DataMutationModalDeps): void`
  - Initializes outlier removal modal with apply/cancel handlers.
