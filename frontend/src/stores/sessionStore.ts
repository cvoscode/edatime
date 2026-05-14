/**
 * Session persistence store — coordinates auto-save/restore across all domain stores.
 * Auto-saves to localStorage on navigation and filter changes.
 */

import { captureSession, autoSaveSession, autoRestoreSession, exportSessionToFile, importSessionFromFile } from '../utils/session';
import type { SessionSnapshot } from '../utils/session';
import { uiStore, chartStore, datasetStore, analyticsStore, scatterStore } from './index';

let _autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let _isRestoring = false;

export function getCurrentPageFromHash(): string {
  const hash = window.location.hash.replace('#', '').replace(/^\//, '');
  return hash || 'home';
}

export function applySessionToStores(snap: SessionSnapshot): void {
  _isRestoring = true;

  if (snap.selectedCols) uiStore.setSelectedColumns(snap.selectedCols);
  if (snap.hiddenCols) uiStore.setHiddenColumns(snap.hiddenCols);
  if (snap.seriesColors) {
    for (const [col, color] of Object.entries(snap.seriesColors)) {
      uiStore.setColumnColor(col, color);
    }
  }
  if (snap.columnFilters) {
    for (const [col, range] of Object.entries(snap.columnFilters)) {
      uiStore.setFilter(col, range);
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

  // Navigate to saved page
  if (snap.page && snap.page !== getCurrentPageFromHash()) {
    window.location.hash = `/${snap.page}`;
  }

  _isRestoring = false;
}

function getStoresSnap() {
  return {
    ui: {
      selectedColumns: uiStore.state.selectedColumns,
      hiddenColumns: uiStore.state.hiddenColumns,
      colors: uiStore.state.colors,
      filters: uiStore.state.filters,
      theme: uiStore.state.theme,
      colorScale: uiStore.state.colorScale,
    },
    chart: { viewport: chartStore.state.viewport },
    dataset: { xAxisColumn: datasetStore.state.xAxisColumn, colorColumn: datasetStore.state.selectedColorColumn },
    analytics: {
      rollingEnabled: analyticsStore.state.rollingEnabled,
      rollingWindow: analyticsStore.state.rollingWindow,
      anomalyEnabled: analyticsStore.state.anomalyEnabled,
      anomalyMethod: analyticsStore.state.anomalyMethod,
      anomalyThreshold: analyticsStore.state.anomalyThreshold,
    },
    scatter: {
      xColumn: scatterStore.state.config.xCol,
      yColumn: scatterStore.state.config.yCol,
      colorColumn: scatterStore.state.config.colorCol,
      renderMode: scatterStore.state.renderMode,
    },
    chartTitle: '',
    xAxisLabel: '',
    yAxisLabel: '',
  };
}

function triggerAutoSave(): void {
  if (_isRestoring) return;
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => {
    try {
      autoSaveSession(captureSession(getCurrentPageFromHash(), getStoresSnap()));
    } catch {}
  }, 2000);
}

export function initSessionPersistence(): void {
  // Auto-restore on load
  const saved = autoRestoreSession();
  if (saved) {
    applySessionToStores(saved);
  }

  // Auto-save on navigation and filter changes
  window.addEventListener('hashchange', triggerAutoSave);

  // Ctrl+S: save to file
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      exportSessionToFile(captureSession(getCurrentPageFromHash(), getStoresSnap()));
    }

    // Ctrl+O: import from file
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      importSessionFromFile(applySessionToStores);
    }
  });

  // Save before unload
  window.addEventListener('beforeunload', () => {
    try {
      autoSaveSession(captureSession(getCurrentPageFromHash(), getStoresSnap()));
    } catch {}
  });
}