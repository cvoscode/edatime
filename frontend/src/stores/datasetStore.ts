import { createStore } from 'solid-js/store';
import type { DatasetMetadata, ColumnProfile, DataObject, FilteredDataObject } from '../types';

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
  error: null
});

export const datasetStore = {
  get state() { return datasetState; },

  setMetadata(metadata: DatasetMetadata) {
    setDatasetState('metadata', metadata);
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
      error: null
    });
  }
};