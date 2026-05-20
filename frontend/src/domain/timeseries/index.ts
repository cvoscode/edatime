/**
 * domain/timeseries/index.ts
 * Public API for the timeseries domain module.
 */

// Types
export * from './types';

// Constants
export * from './constants';

// Store
export { timeseriesStore } from './store';
export {
  drawTool, setDrawTool,
  drawColor, setDrawColor,
  drawWidth, setDrawWidth,
  showAnalytics, setShowAnalytics,
  showLabelsDrawer, setShowLabelsDrawer,
  showExportMore, setShowExportMore,
  chartEngine, setChartEngine,
  filterModalOpen, setFilterModalOpen,
  filterModalColumn, setFilterModalColumn,
  showSkeleton, setShowSkeleton,
  showAdaptivePopup, setShowAdaptivePopup,
  adaptiveFilterPoints, setAdaptiveFilterPoints,
  popupScreenPos, setPopupScreenPos,
} from './store';

// Hooks
export {
  useTimeseriesData,
  useTimeseriesViewport,
  useTimeseriesExport,
  useTimeseriesColorUpdates,
  useTimeseriesChartReady,
  getUpdateChartFn,
  isChartReady,
} from './hooks';

// Components
export { default as TimeseriesChart } from './components/TimeseriesChart';
export { default as SeriesSelector } from './components/SeriesSelector';
export { default as TimeseriesToolbar } from './components/TimeseriesToolbar';