/**
 * Timeseries feature module.
 *
 * Contains:
 *   domain/   - store, types, selectors, actions
 *   api/      - client + endpoints (fetch wrappers)
 *   hooks/    - useTimeseriesData, useViewport, useSeriesSelection
 *
 * Architecture:
 *   UI components -> hooks -> domain store -> api client -> services/api
 *
 * State ownership:
 *   - timeseriesStore: viewport, series selection, filters, drawings, rolling/anomaly
 *   - datasetStore (app-wide): metadata, column profiles (read-only here)
 *   - uiStore (app-wide): theme, toasts (read-only here)
 *
 * No cross-feature imports. Chart is accessed via ChartController only.
 *
 * NOTE: The actual TimeseriesPage component still lives at src/pages/TimeseriesPage.tsx.
 * This module is the NEW canonical home for timeseries domain logic.
 * Migration of TimeseriesPage to use these hooks/stores is Phase 2 work.
 */
export { timeseriesStore } from './domain/store';
export type { TimeseriesState, DrawMode } from './domain/store';
export { fetchTimeseriesData, fetchRollingBands, fetchAnomalies } from './api/client';
export { useTimeseriesData, useViewport, useSeriesSelection, useAdaptiveFilters } from './hooks';
