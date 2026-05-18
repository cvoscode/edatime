import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chartStore } from '../stores/chartStore';
import { uiStore } from '../stores/uiStore';
import { datasetStore } from '../stores/datasetStore';
import { scatterStore } from '../stores/scatterStore';
import { uploadStore } from '../stores/uploadStore';

const DEFAULT_VIEWPORT = { xMin: 0, xMax: 100, yMin: 0, yMax: 1 };

// ---------------------------------------------------------------------------
// chartStore tests
// ---------------------------------------------------------------------------
describe('chartStore', () => {
  beforeEach(() => {
    // Reset chartStore state fully
    chartStore.forceResetZoom?.();
    chartStore.clearSeriesVisibility?.();
    chartStore.clearDrawings?.();
    chartStore.setDrawMode('pan');
    chartStore.setLoading(false);
  });

  it('exposes state getter', () => {
    expect(chartStore.state).toBeDefined();
    expect(typeof chartStore.state.viewport).toBe('object');
  });

  it('setViewport updates viewport', () => {
    chartStore.setViewport({ xMin: 10, xMax: 20, yMin: 0, yMax: 1 });
    expect(chartStore.state.viewport.xMin).toBe(10);
    expect(chartStore.state.viewport.xMax).toBe(20);
  });

  it('setDrawMode updates drawMode', () => {
    chartStore.setDrawMode('zoom');
    expect(chartStore.state.drawMode).toBe('zoom');
    chartStore.setDrawMode('pan');
    expect(chartStore.state.drawMode).toBe('pan');
  });

  it('setSeriesVisibility sets visibility for a series', () => {
    chartStore.setSeriesVisibility('temperature', false);
    expect(chartStore.getSeriesVisibility('temperature')).toBe(false);
    chartStore.setSeriesVisibility('temperature', true);
    expect(chartStore.getSeriesVisibility('temperature')).toBe(true);
  });

  it('clearSeriesVisibility resets all visibility', () => {
    chartStore.setSeriesVisibility('temp1', false);
    chartStore.setSeriesVisibility('temp2', false);
    chartStore.clearSeriesVisibility();
    expect(chartStore.getAllSeriesVisibility()).toEqual({});
  });

  it('addDrawing adds a drawing', () => {
    const drawing = { id: 'd1', kind: 'arrow' as const, color: '#fff', lineWidth: 2, points: [[0, 0]] as [number, number][] };
    chartStore.addDrawing(drawing);
    expect(chartStore.state.drawings.length).toBeGreaterThan(0);
  });

  it('clearDrawings removes all drawings', () => {
    chartStore.clearDrawings();
    expect(chartStore.state.drawings).toEqual([]);
  });

  it('zoomIn reduces viewport range', () => {
    const before = { ...chartStore.state.viewport };
    chartStore.zoomIn();
    const after = chartStore.state.viewport;
    expect(after.xMax - after.xMin).toBeLessThan(before.xMax - before.xMin);
  });

  it('zoomOut returns to previous view in history', () => {
    const before = { ...chartStore.state.viewport };
    chartStore.zoomIn();
    chartStore.zoomOut();
    expect(chartStore.state.viewport).toEqual(before);
  });

  it('canZoomOut returns true after zoomIn', () => {
    chartStore.zoomIn();
    expect(chartStore.canZoomOut()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// uiStore tests
// ---------------------------------------------------------------------------
describe('uiStore', () => {
  beforeEach(() => {
    // Reset uiStore filters and selections to avoid state pollution
    for (const col of [...uiStore.state.selectedColumns]) {
      uiStore.deselectColumn(col);
    }
    for (const col of [...uiStore.state.hiddenColumns]) {
      uiStore.setHiddenColumns(uiStore.state.hiddenColumns.filter(c => c !== col));
    }
    const filters = { ...uiStore.state.filters };
    for (const key of Object.keys(filters)) {
      uiStore.removeFilter(key);
    }
    uiStore.setTheme('dark');
  });

  it('exposes state getter', () => {
    expect(uiStore.state).toBeDefined();
    expect(Array.isArray(uiStore.state.selectedColumns)).toBe(true);
  });

  it('selectColumn adds column to selectedColumns', () => {
    uiStore.selectColumn('temperature');
    expect(uiStore.state.selectedColumns).toContain('temperature');
  });

  it('deselectColumn removes column from selectedColumns', () => {
    uiStore.selectColumn('temperature');
    uiStore.deselectColumn('temperature');
    expect(uiStore.state.selectedColumns).not.toContain('temperature');
  });

  it('toggleColumn toggles column selection', () => {
    uiStore.toggleColumn('toggleTest');
    expect(uiStore.state.selectedColumns).toContain('toggleTest');
    uiStore.toggleColumn('toggleTest');
    expect(uiStore.state.selectedColumns).not.toContain('toggleTest');
  });

  it('setHiddenColumns updates hiddenColumns', () => {
    uiStore.setHiddenColumns(['hidden1', 'hidden2']);
    expect(uiStore.state.hiddenColumns).toEqual(['hidden1', 'hidden2']);
  });

  it('setFilter sets filter for a column', () => {
    uiStore.setFilter('temp', { min: 0, max: 100 });
    expect(uiStore.state.filters.temp).toEqual({ min: 0, max: 100 });
  });

  it('removeFilter removes filter for a column', () => {
    uiStore.setFilter('temp', { min: 0, max: 100 });
    uiStore.removeFilter('temp');
    expect(uiStore.state.filters.temp).toBeUndefined();
  });

  it('setColumnColor updates color for a column', () => {
    uiStore.setColumnColor('temp', '#ff0000');
    expect(uiStore.state.colors.temp).toBe('#ff0000');
  });

  it('addToast appends toast message', () => {
    const before = uiStore.state.toasts.length;
    uiStore.addToast({ message: 'test', type: 'info' });
    expect(uiStore.state.toasts.length).toBe(before + 1);
  });

  it('removeToast removes toast by id', () => {
    uiStore.addToast({ message: 'to-remove', type: 'info' });
    const toast = uiStore.state.toasts[uiStore.state.toasts.length - 1];
    if (toast) {
      uiStore.removeToast(toast.id);
      expect(uiStore.state.toasts.some(t => t.id === toast.id)).toBe(false);
    }
  });

  it('toggleSidebar toggles sidebar state', () => {
    const before = uiStore.state.sidebarOpen;
    uiStore.toggleSidebar();
    expect(uiStore.state.sidebarOpen).toBe(!before);
  });

  it('setUploadPanelOpen updates panel state', () => {
    uiStore.setUploadPanelOpen(true);
    expect(uiStore.state.isUploadPanelOpen).toBe(true);
    uiStore.setUploadPanelOpen(false);
    expect(uiStore.state.isUploadPanelOpen).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// uiStore tests
// ---------------------------------------------------------------------------
describe('uiStore', () => {
  it('exposes state getter', () => {
    expect(uiStore.state).toBeDefined();
    expect(Array.isArray(uiStore.state.selectedColumns)).toBe(true);
  });

  it('selectColumn adds column to selectedColumns', () => {
    uiStore.selectColumn('temperature');
    expect(uiStore.state.selectedColumns).toContain('temperature');
  });

  it('deselectColumn removes column from selectedColumns', () => {
    uiStore.selectColumn('temperature');
    uiStore.deselectColumn('temperature');
    expect(uiStore.state.selectedColumns).not.toContain('temperature');
  });

  it('toggleColumn toggles column selection', () => {
    uiStore.toggleColumn('toggleTest');
    expect(uiStore.state.selectedColumns).toContain('toggleTest');
    uiStore.toggleColumn('toggleTest');
    expect(uiStore.state.selectedColumns).not.toContain('toggleTest');
  });

  it('setHiddenColumns updates hiddenColumns', () => {
    uiStore.setHiddenColumns(['hidden1', 'hidden2']);
    expect(uiStore.state.hiddenColumns).toEqual(['hidden1', 'hidden2']);
  });

  it('setFilter sets filter for a column', () => {
    uiStore.setFilter('temp', { min: 0, max: 100 });
    expect(uiStore.state.filters.temp).toEqual({ min: 0, max: 100 });
  });

  it('removeFilter removes filter for a column', () => {
    uiStore.setFilter('temp', { min: 0, max: 100 });
    uiStore.removeFilter('temp');
    expect(uiStore.state.filters.temp).toBeUndefined();
  });

  it('setColumnColor updates color for a column', () => {
    uiStore.setColumnColor('temp', '#ff0000');
    expect(uiStore.state.colors.temp).toBe('#ff0000');
  });

  it('addToast appends toast message', () => {
    const before = uiStore.state.toasts.length;
    uiStore.addToast({ message: 'test', type: 'info' });
    expect(uiStore.state.toasts.length).toBe(before + 1);
  });

  it('removeToast removes toast by id', () => {
    uiStore.addToast({ message: 'to-remove', type: 'info' });
    const toast = uiStore.state.toasts[uiStore.state.toasts.length - 1];
    if (toast) {
      uiStore.removeToast(toast.id);
      expect(uiStore.state.toasts.some(t => t.id === toast.id)).toBe(false);
    }
  });

  it('toggleSidebar toggles sidebar state', () => {
    const before = uiStore.state.sidebarOpen;
    uiStore.toggleSidebar();
    expect(uiStore.state.sidebarOpen).toBe(!before);
  });

  it('setUploadPanelOpen updates panel state', () => {
    uiStore.setUploadPanelOpen(true);
    expect(uiStore.state.isUploadPanelOpen).toBe(true);
    uiStore.setUploadPanelOpen(false);
    expect(uiStore.state.isUploadPanelOpen).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// datasetStore tests
// ---------------------------------------------------------------------------
describe('datasetStore', () => {
  it('exposes state getter', () => {
    expect(datasetStore.state).toBeDefined();
  });

  it('setMetadata updates metadata and revision', () => {
    datasetStore.setMetadata({
      revision: 5,
      name: 'test',
      rowCount: 1000,
      columns: [],
      numericColumns: [],
      timestampColumn: '',
      fileSize: 0,
      uploadedAt: '',
      timeRange: null,
    });
    expect(datasetStore.state.metadata?.revision).toBe(5);
    expect(datasetStore.state.revision).toBe(5);
  });

  it('setColumns derives numericCols from column type', () => {
    datasetStore.setColumns([
      { name: 'temp', type: 'numeric', min: 0, max: 100, nullCount: 0 },
      { name: 'time', type: 'datetime', min: 0, max: 100, nullCount: 0 },
      { name: 'cat', type: 'categorical', min: 0, max: 100, nullCount: 0 },
    ]);
    expect(datasetStore.state.numericCols).toContain('temp');
    expect(datasetStore.state.datetimeCols).toContain('time');
    expect(datasetStore.state.numericCols).not.toContain('cat');
  });

  it('reset clears all state including revision', () => {
    datasetStore.setMetadata({
      revision: 99,
      name: 'test',
      rowCount: 500,
      columns: [],
      numericColumns: [],
      timestampColumn: '',
      fileSize: 0,
      uploadedAt: '',
      timeRange: null,
    });
    datasetStore.reset();
    expect(datasetStore.state.metadata).toBeNull();
    expect(datasetStore.state.revision).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// scatterStore tests
// ---------------------------------------------------------------------------
describe('scatterStore', () => {
  it('exposes state getter', () => {
    expect(scatterStore.state).toBeDefined();
  });

  it('setConfig updates config fields', () => {
    scatterStore.setConfig({ xCol: 'x', yCol: 'y' });
    expect(scatterStore.state.config.xCol).toBe('x');
    expect(scatterStore.state.config.yCol).toBe('y');
  });

  it('setView switches view mode', () => {
    scatterStore.setView('matrix');
    expect(scatterStore.state.view).toBe('matrix');
    scatterStore.setView('plot');
    expect(scatterStore.state.view).toBe('plot');
  });

  it('setScatterPoints updates points and totalPoints', () => {
    const points: [number, number][] = [[1, 2], [3, 4]];
    scatterStore.setScatterPoints(points, 100);
    expect(scatterStore.state.scatterPoints).toEqual(points);
    expect(scatterStore.state.totalPoints).toBe(100);
  });

  it('setRenderMode updates renderMode', () => {
    scatterStore.setRenderMode('density');
    expect(scatterStore.state.renderMode).toBe('density');
    scatterStore.setRenderMode('scatter');
    expect(scatterStore.state.renderMode).toBe('scatter');
  });

  it('reset restores default state', () => {
    scatterStore.setConfig({ xCol: 'x', yCol: 'y' });
    scatterStore.setScatterPoints([[1, 2]], 1);
    scatterStore.reset();
    expect(scatterStore.state.config.xCol).toBe('');
    expect(scatterStore.state.scatterPoints).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// uploadStore tests
// ---------------------------------------------------------------------------
describe('uploadStore', () => {
  it('exposes state getter', () => {
    expect(uploadStore.state).toBeDefined();
  });

  it('setSource updates source', () => {
    uploadStore.setSource('database');
    expect(uploadStore.state.source).toBe('database');
    uploadStore.setSource('file');
  });

  it('setSelectedFile clears preview when file is null', () => {
    uploadStore.setSelectedFile(new File([''], 'test.csv'));
    uploadStore.setSelectedFile(null);
    expect(uploadStore.state.previewMetadata).toBeNull();
  });

  it('setPartialEnabled toggles partial load', () => {
    uploadStore.setPartialEnabled(true);
    expect(uploadStore.state.partialEnabled).toBe(true);
  });

  it('setMaxRows updates maxRows', () => {
    uploadStore.setMaxRows(500);
    expect(uploadStore.state.maxRows).toBe(500);
  });

  it('setDbConnected updates db connection state', () => {
    uploadStore.setDbConnected(true);
    expect(uploadStore.state.dbConnected).toBe(true);
  });

  it('reset clears all state', () => {
    uploadStore.setSource('database');
    uploadStore.setPartialEnabled(true);
    uploadStore.setMaxRows(500);
    uploadStore.setDbConnected(true);
    uploadStore.reset();
    // All fields return to defaults
    expect(uploadStore.state.source).toBe('file');
    expect(uploadStore.state.partialEnabled).toBe(false);
    expect(uploadStore.state.maxRows).toBe(1000000);
    expect(uploadStore.state.selectedFile).toBeNull();
    expect(uploadStore.state.dbConnected).toBe(false);
  });
});