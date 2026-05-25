/**
 * stores/index.ts
 *
 * App-level stores only. Domain stores are imported directly from their domain modules.
 *
 * App stores (ui/dataset) own app-wide state only; domain state lives in domain stores.
 *
 * REMOVED from index: analyticsStore, fftStore, causalStore, chartStore, scatterStore,
 * uploadStore, sessionStore — consumers should import directly from those modules.
 */
export { uiStore } from './uiStore';
export { datasetStore } from './datasetStore';
export { fftStore } from './fftStore';
export { chartStore } from './chartStore';
export { causalStore } from './causalStore';
export { scatterStore } from './scatterStore';
export { uploadStore } from './uploadStore';
// Re-export toast helpers so pages can keep importing from '@/stores'
export { addToast, removeToast } from '../shared/ui/toast';