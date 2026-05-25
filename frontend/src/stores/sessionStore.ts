/**
 * Session persistence store — coordinates auto-save/restore across all domain stores.
 * Auto-saves to localStorage on navigation and filter changes.
 */

import { captureSession, autoSaveSession, autoRestoreSession, exportSessionToFile, importSessionFromFile } from '../utils/session';
import type { SessionSnapshot } from '../utils/session';
import { uiStore, datasetStore } from './index';
import { chartStore } from './chartStore';
import { analyticsStore } from './analyticsStore';
import { scatterStore } from './scatterStore';
import { timeseriesStore } from '../domain/timeseries/store';

export function getCurrentPageFromHash(): string {
  const hash = window.location.hash.replace('#', '').replace(/^\//, '');
  return hash || 'home';
}

export function applySessionToStores(snap: SessionSnapshot, isRestoringRef?: { current: boolean }): void {
  if (isRestoringRef) isRestoringRef.current = true;

  if (snap.selectedCols) timeseriesStore.setSelectedColumns(snap.selectedCols);
  if (snap.hiddenCols) timeseriesStore.setHiddenColumns(snap.hiddenCols);
  if (snap.seriesColors) {
    for (const [col, color] of Object.entries(snap.seriesColors)) {
      timeseriesStore.setColumnColor(col, color);
    }
  }
  if (snap.columnFilters) {
    for (const [col, range] of Object.entries(snap.columnFilters)) {
      timeseriesStore.setFilter(col, range);
    }
  }
  if (snap.viewport) {
    chartStore.setViewport(snap.viewport);
  }
  if (snap.theme === 'dark' || snap.theme === 'light' || snap.theme === 'system') {
    uiStore.setTheme(snap.theme);
  }
  if (snap.colorScale) {
    uiStore.setColorScale(snap.colorScale as any);
  }

  // Analytics
  if (snap.rollingEnabled !== undefined || snap.rollingWindow !== undefined) {
    analyticsStore.setRollingEnabled(snap.rollingEnabled ?? false);
    analyticsStore.setRollingWindow(snap.rollingWindow ?? 50);
  }
  if (snap.anomalyEnabled !== undefined) {
    analyticsStore.setAnomalyEnabled(snap.anomalyEnabled);
  }

  // Scatter
  if (snap.scatterX) scatterStore.setConfig({ xCol: snap.scatterX });
  if (snap.scatterY) scatterStore.setConfig({ yCol: snap.scatterY });
  if (snap.scatterColorColumn) scatterStore.setConfig({ colorCol: snap.scatterColorColumn });
  if (snap.scatterRenderMode) scatterStore.setRenderMode(snap.scatterRenderMode as 'scatter' | 'density');

  // Navigate to saved page — defer to next tick so App's onMount completes first
  if (snap.page && snap.page !== getCurrentPageFromHash()) {
    setTimeout(() => { window.location.hash = `/${snap.page}`; }, 0);
  }

  if (isRestoringRef) isRestoringRef.current = false;
}

function getStoresSnap() {
  const uiSnap = uiStore.serialize();
  const chartSnap = chartStore.serialize();
  const datasetSnap = datasetStore.serialize();
  const scatterSnap = scatterStore.serialize();
  const tsState = timeseriesStore.state;
  return {
    ui: {
      selectedColumns: tsState.selectedColumns,
      hiddenColumns: tsState.hiddenColumns ?? [],
      colors: tsState.colors ?? {},
      filters: tsState.filters ?? {},
      theme: uiSnap.theme,
      colorScale: uiSnap.colorScale,
    },
    chart: { viewport: chartSnap.viewport },
    dataset: datasetSnap,
    analytics: {
      rollingEnabled: analyticsStore.state.rollingEnabled,
      rollingWindow: analyticsStore.state.rollingWindow,
      anomalyEnabled: analyticsStore.state.anomalyEnabled,
      anomalyMethod: analyticsStore.state.anomalyMethod,
      anomalyThreshold: analyticsStore.state.anomalyThreshold,
    },
    scatter: scatterSnap,
    // chartTitle/xAxisLabel/yAxisLabel are chart engine parameters, not stored in any store
    chartTitle: '',
    xAxisLabel: '',
    yAxisLabel: '',
  };
}

function triggerAutoSave(isRestoring: { current: boolean }): void {
  if (isRestoring.current) return;
  setTimeout(() => {
    try {
      autoSaveSession(captureSession(getCurrentPageFromHash(), getStoresSnap()));
    } catch { }
  }, 2000);
}

function handleKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    exportSessionToFile(captureSession(getCurrentPageFromHash(), getStoresSnap()));
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
    e.preventDefault();
    importSessionFromFile((snap) => applySessionToStores(snap, { current: false }));
  }
}

export interface SessionPersistenceHandle {
  start: () => void;
  stop: () => void;
}

/**
 * Creates a session persistence controller.
 * Call start() to attach event listeners, stop() to detach.
 * This allows tests to cleanly remove the listeners between runs.
 */
export function createSessionPersistence(): SessionPersistenceHandle {
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const isRestoring = { current: false };

  return {
    start() {
      // Auto-restore on load
      const saved = autoRestoreSession();
      if (saved) {
        applySessionToStores(saved, isRestoring);
      }

      // Auto-save on navigation and filter changes
      window.addEventListener('hashchange', () => triggerAutoSave(isRestoring));
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('beforeunload', () => {
        try {
          autoSaveSession(captureSession(getCurrentPageFromHash(), getStoresSnap()));
        } catch { }
      });
    },

    stop() {
      window.removeEventListener('hashchange', () => triggerAutoSave(isRestoring));
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', () => { });
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }
    },
  };
}