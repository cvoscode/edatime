# ai/frontend/src/utils/pageBootstrap.md

> Page classification helpers for dataset bootstrap, lazy analysis loading, and public-to-backing page aliases.

## Constants
- `DATASET_BOOTSTRAP_PAGES: Set<string>` — backing pages that need eager metadata refresh on first navigation.
- `LAZY_ANALYSIS_PAGES: Set<string>` — analysis pages loaded lazily on first visit.
- `CORE_WORKFLOW_PAGES: Set<string>` — primary workflow pages: `home`, `upload`, `timeseries`, `correlations`, `scatter`.

## Functions
- `resolveBackingPageName(pageName: string | null | undefined): string | null`
  - Maps public aliases such as `correlations` to the backing page name used by page modules.
- `pageNeedsDatasetBootstrap(pageName: string | null | undefined): boolean`
  - Returns true when the resolved backing page needs dataset metadata before init.
- `isLazyAnalysisPage(pageName: string | null | undefined): boolean`
  - Returns true when the resolved backing page is lazily loaded.
- `isCoreWorkflowPage(pageName: string | null | undefined): boolean`
  - Returns true when the resolved backing page is part of the core workflow path.
