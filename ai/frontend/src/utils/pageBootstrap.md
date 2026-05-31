# ai/frontend/src/utils/pageBootstrap.md

> Page classification utilities that determine dataset bootstrap behavior and lazy loading strategy.

## Constants
- `DATASET_BOOTSTRAP_PAGES: Set<string>` — pages that require eager dataset bootstrap on navigation.
- `LAZY_ANALYSIS_PAGES: Set<string>` — pages that load analysis modules lazily on first visit.
- `CORE_WORKFLOW_PAGES: Set<string>` — primary path pages: home, upload, timeseries, correlations, scatter.

## Functions
- `pageNeedsDatasetBootstrap(pageName: string | null | undefined): boolean`
  - Returns true if the page requires dataset metadata/data/status fetches on initial navigation.
- `isLazyAnalysisPage(pageName: string | null | undefined): boolean`
  - Returns true if the page loads analysis-specific code lazily on first visit.
- `isCoreWorkflowPage(pageName: string | null | undefined): boolean`
  - Returns true if the page is part of the primary Upload → Timeseries → Correlations → Scatter path.