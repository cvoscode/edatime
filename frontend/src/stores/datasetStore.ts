/**
 * Dataset store — manages dataset metadata, column profiles, and data objects for the current session.
 * Handles data loading, filtering, and revision tracking for cache invalidation.
 */
import { createStore } from 'solid-js/store';
import type { DatasetMetadata, ColumnProfile, DataObject, FilteredDataObject } from '../types';
import { clearCache as clearDataFetchCache } from '../services/dataFetch';

// Module-level revision tracker
let _currentRevision: number | null = null;

interface DatasetState {
  metadata: DatasetMetadata | null;
  columns: ColumnProfile[];
  numericCols: string[];
  datetimeCols: string[];
  xAxisColumn: string | null;
  selectedColorColumn: string | null;
  data: DataObject | null;
  filteredData: FilteredDataObject | null;
  isLoading: boolean;
  error: string | null;
  revision: number | null;
}

const [datasetState, setDatasetState] = createStore<DatasetState>({
  metadata: null,
  columns: [],
  numericCols: [],
  datetimeCols: [],
  xAxisColumn: null,
  selectedColorColumn: null,
  data: null,
  filteredData: null,
  isLoading: false,
  error: null,
  revision: null
});

export const datasetStore = {
  get state() { return datasetState; },

  setMetadata(metadata: DatasetMetadata) {
    // Check if revision changed - invalidate cache if so
    const newRevision = metadata.revision ?? null;
    if (_currentRevision !== null && newRevision !== null && newRevision !== _currentRevision) {
      clearDataFetchCache();
    }
    _currentRevision = newRevision;
    setDatasetState('metadata', metadata);
    setDatasetState('revision', newRevision);
    if (metadata.timestampColumn && !datasetState.xAxisColumn) {
      setDatasetState('xAxisColumn', metadata.timestampColumn);
    }
  },

  setColumns(columns: ColumnProfile[]) {
    setDatasetState('columns', columns);
    setDatasetState('numericCols', columns.filter(c => c.type === 'numeric').map(c => c.name));
    setDatasetState('datetimeCols', columns.filter(c => c.type === 'datetime').map(c => c.name));
  },

  setNumericCols(cols: string[]) {
    setDatasetState('numericCols', cols);
  },

  setDatetimeCols(cols: string[]) {
    setDatasetState('datetimeCols', cols);
  },

  setXAxisColumn(col: string | null) {
    setDatasetState('xAxisColumn', col);
  },

  setSelectedColorColumn(col: string | null) {
    setDatasetState('selectedColorColumn', col);
  },

  setData(data: DataObject) {
    setDatasetState('data', data);
  },

  setFilteredData(filteredData: FilteredDataObject) {
    setDatasetState('filteredData', filteredData);
  },

  setLoading(loading: boolean) {
    setDatasetState('isLoading', loading);
  },

  setError(error: string | null) {
    setDatasetState('error', error);
  },

  reset() {
    setDatasetState({
      metadata: null,
      columns: [],
      numericCols: [],
      datetimeCols: [],
      xAxisColumn: null,
      data: null,
      filteredData: null,
      isLoading: false,
      error: null,
      revision: null
    });
    _currentRevision = null;
  },

  serialize(): { xAxisColumn: string | null; colorColumn: string | null } {
    return {
      xAxisColumn: datasetState.xAxisColumn,
      colorColumn: datasetState.selectedColorColumn,
    };
  },

  deserialize(data: { xAxisColumn?: string | null; selectedColorColumn?: string | null }): void {
    if (data.xAxisColumn !== undefined) setDatasetState('xAxisColumn', data.xAxisColumn);
    if (data.selectedColorColumn !== undefined) setDatasetState('selectedColorColumn', data.selectedColorColumn);
  }
};