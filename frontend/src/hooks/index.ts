/**
 * Hooks index — centralized exports for all custom hooks.
 *
 * PREFERRED IMPORTS (enforced from Phase 8):
 *   import { useChartController } from '../hooks';        // ✅ from index
 *   import { useChartController } from '../hooks/useChartController'; // ⚠️ deep import (deprecated)
 *   import { usePageState } from '../hooks';             // ✅ from index
 *   import { usePageState } from '../hooks/usePageState'; // ⚠️ deep import (deprecated)
 */

// UI Action hooks - note: these export factory functions, not hook wrappers
export { createDrawerVisibility, createLoadingState, createToggleState, createBoundedSignal, createInputState, createOnceCallback } from './useUIActions';

// Export hooks
export { createExportHandlers, createExportMoreState, type ExportHandlers } from './useChartExport';

// Viewport sync hooks
export { useViewportSync, useDebouncer, type ViewportSyncOptions } from './useViewportSync';

// Shortcut hooks
export { usePageShortcuts, createKeyboardToggle, type ShortcutDefinition, type PageShortcutsOptions } from './usePageShortcuts';

// Chart hooks
export { useChartController, createChartController, type ChartController, type ChartControllerOptions, type ChartUpdateCallback } from './useChartController';

// Existing hooks re-exported
export { useChartEngine, type ChartEngineType, type ChartEngineOptions, type ChartEngineResult } from './useChartEngine';
export { useAbortController } from './useAbortController';
export { useDebouncedEffect } from './useDebouncedEffect';
export { useTimeseriesData } from './useTimeseriesData';

// Scatter state machine hook (Phase 3.1)
export { useScatterStateMachine } from './useScatterStateMachine';

// TODO (Phase 8): Add when Phase 2.3 delivers useOverlayController
// export { useOverlayController } from './useOverlayController';

// TODO (Phase 8): Add when Phase 4.2 delivers useFilterPipeline
// export { useFilterPipeline } from './useFilterPipeline';

// TODO (Phase 8): Add when Phase 4.1 delivers usePageState (separate from usePageShortcuts)
// export { usePageState } from './usePageState';