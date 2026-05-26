import { createRoot } from 'solid-js';
import { beforeEach, describe, expect, it } from 'vitest';
import { datasetStore } from '@/stores/datasetStore';
import { timeseriesStore } from '@/domain/timeseries/store';
import { useChartSeries } from './useChartSeries';

describe('useChartSeries', () => {
  beforeEach(() => {
    datasetStore.reset();
    datasetStore.setColumns([
      { name: 'date', type: 'datetime', min: 0, max: 1, nullCount: 0 },
      { name: 'MUFL', type: 'numeric', min: 0, max: 1, nullCount: 0 },
      { name: 'MULL', type: 'numeric', min: 0, max: 1, nullCount: 0 },
      { name: 'OT', type: 'numeric', min: 0, max: 1, nullCount: 0 },
    ] as any);
    datasetStore.setNumericCols(['MUFL', 'MULL', 'OT']);
    datasetStore.setXAxisColumn('date');
    timeseriesStore.setSelectedColumns([]);
    timeseriesStore.setHiddenColumns([]);
    timeseriesStore.setColorColumn(null);
    timeseriesStore.setColors({});
    timeseriesStore.setFilters({});
  });

  it('does not expose stale restored columns to data requests', () => {
    createRoot((dispose) => {
      const series = useChartSeries();
      timeseriesStore.setSelectedColumns(['MUFL', 'humidity', 'pressure', 'MULL', 'temperature']);

      expect(series.selectedColumns()).toEqual(['MUFL', 'MULL']);
      expect(series.traceColumns()).toEqual(['MUFL', 'MULL']);

      dispose();
    });
  });

  it('falls back to current numeric columns when no selection is stored', () => {
    createRoot((dispose) => {
      const series = useChartSeries();

      expect(series.selectedColumns()).toEqual(['MUFL', 'MULL', 'OT']);
      expect(series.traceColumns()).toEqual(['MUFL', 'MULL', 'OT']);

      dispose();
    });
  });
});
