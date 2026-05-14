/**
 * Session save/restore for EdaTime frontend.
 * Serializes analysis state (columns, viewport, filters, chart settings) to JSON.
 * Provides localStorage auto-save and manual JSON export/import.
 */

import { downloadString } from './exportUtils';

const STORAGE_KEY = 'edatime-session-v1';

export interface SessionSnapshot {
  version: 1;
  timestamp: number;
  page: string;
  selectedCols: string[];
  hiddenCols: string[];
  seriesColors: Record<string, string>;
  columnFilters: Record<string, { min: number; max: number }>;
  viewport: { xMin: number; xMax: number; yMin: number; yMax: number };
  colorColumn: string | null;
  chartTitle: string;
  xAxisLabel: string;
  yAxisLabel: string;
  rollingEnabled: boolean;
  rollingWindow: number;
  anomalyEnabled: boolean;
  anomalyMethod: string;
  anomalyThreshold: number;
  scatterX: string;
  scatterY: string;
  scatterColorColumn: string;
  scatterRenderMode: string;
  theme: string;
  colorScale: string;
}

export function captureSession(page: string, stores: {
  ui: { selectedColumns: string[]; hiddenColumns: string[]; colors: Record<string, string>; filters: Record<string, { min: number; max: number }>; theme: string; colorScale: string };
  chart: { viewport: { xMin: number; xMax: number; yMin: number; yMax: number } };
  dataset: { xAxisColumn: string | null; colorColumn: string | null };
  analytics: { rollingEnabled: boolean; rollingWindow: number; anomalyEnabled: boolean; anomalyMethod: string; anomalyThreshold: number };
  scatter: { xColumn: string; yColumn: string; colorColumn: string; renderMode: string };
  chartTitle: string;
  xAxisLabel: string;
  yAxisLabel: string;
}): SessionSnapshot {
  return {
    version: 1,
    timestamp: Date.now(),
    page,
    selectedCols: stores.ui.selectedColumns,
    hiddenCols: stores.ui.hiddenColumns,
    seriesColors: { ...stores.ui.colors },
    columnFilters: { ...stores.ui.filters },
    viewport: { ...stores.chart.viewport },
    colorColumn: stores.dataset.colorColumn,
    chartTitle: stores.chartTitle,
    xAxisLabel: stores.xAxisLabel,
    yAxisLabel: stores.yAxisLabel,
    rollingEnabled: stores.analytics.rollingEnabled,
    rollingWindow: stores.analytics.rollingWindow,
    anomalyEnabled: stores.analytics.anomalyEnabled,
    anomalyMethod: stores.analytics.anomalyMethod,
    anomalyThreshold: stores.analytics.anomalyThreshold,
    scatterX: stores.scatter.xColumn,
    scatterY: stores.scatter.yColumn,
    scatterColorColumn: stores.scatter.colorColumn,
    scatterRenderMode: stores.scatter.renderMode,
    theme: stores.ui.theme,
    colorScale: stores.ui.colorScale,
  };
}

export function autoSaveSession(snap: SessionSnapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch { /* quota exceeded — silent */ }
}

export function autoRestoreSession(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as SessionSnapshot;
    if (snap?.version !== 1) return null;
    return snap;
  } catch {
    return null;
  }
}

export function clearSavedSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportSessionToFile(snap: SessionSnapshot): void {
  downloadString(JSON.stringify(snap, null, 2), `edatime-session-${new Date().toISOString().slice(0, 16).replace(/:/g, '-')}.json`, 'application/json');
}

export function importSessionFromFile(onRestore: (snap: SessionSnapshot) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const snap = JSON.parse(reader.result as string) as SessionSnapshot;
        if (snap?.version !== 1) throw new Error('Invalid session file');
        onRestore(snap);
      } catch (e: any) {
        console.error('Failed to import session:', e.message);
      }
    };
    reader.readAsText(file);
  });
  input.click();
}