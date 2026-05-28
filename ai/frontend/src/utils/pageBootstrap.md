# pageBootstrap.ts

Page bootstrap helpers determining which pages require eager dataset loading and which load analysis modules lazily.

## Constants

```typescript
const DATASET_BOOTSTRAP_PAGES: Set<string>
```

Pages that trigger eager dataset bootstrap on initial navigation.

```typescript
const LAZY_ANALYSIS_PAGES: Set<string>
```

Pages that load analysis-specific module code lazily on first visit.

```typescript
const CORE_WORKFLOW_PAGES: Set<string>
```

Core workflow pages: home, upload, timeseries, correlations, scatter.

## Functions

```typescript
function pageNeedsDatasetBootstrap(pageName: string | null | undefined): boolean
```

Check if a page needs dataset bootstrap.

```typescript
function isLazyAnalysisPage(pageName: string | null | undefined): boolean
```

Check if a page is a lazy analysis page.

```typescript
function isCoreWorkflowPage(pageName: string | null | undefined): boolean
```

Check if a page is a core workflow page.