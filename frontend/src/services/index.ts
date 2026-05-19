/**
 * Services index — centralized exports for all service modules.
 *
 * PREFERRED IMPORTS (enforced from Phase 8):
 *   import { fetchMetadata } from '../services';       // ✅ from index
 *   import { fetchMetadata } from '../services/api';  // ⚠️ deep import (deprecated)
 *   import { colorManager } from '../services';        // ✅ from index
 *   import { chartRegistry } from '../services';      // ✅ from index
 *   import { fetchTimeseriesData } from '../services'; // ✅ from index (re-exported from dataFetch)
 *   import { fetchTimeseriesData } from '../services/dataFetch'; // ⚠️ deep import (deprecated)
 */

// Re-export everything from api.ts (HTTP client: fetchMetadata, fetchScatterPoints, uploadPreview, etc.)
export * from './api';

// Re-export from dataFetch.ts (timeseries data fetching and transformation)
export * from './dataFetch';

// Color management service — exports functions (getPalette, assignSeriesColors, etc.)
export * from './colorManager';

// Chart engine registry
export { chartRegistry } from './chartRegistry';

// TODO (Phase 8): Add when Phase 6.2 delivers exportService
// export { exportService } from './exportService';

// TODO (Phase 8): Add when Phase 6.3 delivers viewportManager
// export { viewportManager } from './viewportManager';

// TODO (Phase 8): Add when Phase 4.3 delivers toastService
// export { toastService } from './toastService';
