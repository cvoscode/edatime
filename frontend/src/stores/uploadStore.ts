import { createStore } from 'solid-js/store';
import type { ColumnProfile, DatasetMetadata } from '../services/api';

export type UploadSource = 'file' | 'database';

interface UploadState {
  source: UploadSource;
  selectedFile: File | null;
  previewMetadata: DatasetMetadata | null;
  previewProfiles: ColumnProfile[];
  isPreviewing: boolean;
  isUploading: boolean;
  uploadProgress: number;
  uploadStatus: string;
  partialEnabled: boolean;
  maxRows: number;
  skipRows: number;
  timeStart: string;
  timeEnd: string;
  timeColumn: string;
  selectedColumns: string[];
  dbConnected: boolean;
  dbTable: string;
  dbConnectionString: string;
  dbSchema: string;
  dbTables: string[];
}

const [uploadState, setUploadState] = createStore<UploadState>({
  source: 'file',
  selectedFile: null,
  previewMetadata: null,
  previewProfiles: [],
  isPreviewing: false,
  isUploading: false,
  uploadProgress: 0,
  uploadStatus: '',
  partialEnabled: false,
  maxRows: 1000000,
  skipRows: 0,
  timeStart: '',
  timeEnd: '',
  timeColumn: '',
  selectedColumns: [],
  dbConnected: false,
  dbTable: '',
  dbConnectionString: '',
  dbSchema: 'public',
  dbTables: [],
});

export const uploadStore = {
  get state() { return uploadState; },

  setSource(source: UploadSource) {
    setUploadState('source', source);
  },

  setSelectedFile(file: File | null) {
    setUploadState('selectedFile', file);
    if (!file) {
      setUploadState({ previewMetadata: null, previewProfiles: [], selectedColumns: [] });
    }
  },

  setPreview(metadata: DatasetMetadata, profiles: ColumnProfile[]) {
    setUploadState('previewMetadata', metadata);
    setUploadState('previewProfiles', profiles);
    setUploadState('selectedColumns', metadata.numeric_columns);
    const timeCol = metadata.time_column ?? '';
    setUploadState('timeColumn', timeCol);
    if (metadata.time_range) {
      setUploadState('timeStart', new Date(metadata.time_range.min).toISOString().slice(0, 16));
      setUploadState('timeEnd', new Date(metadata.time_range.max).toISOString().slice(0, 16));
    }
  },

  setPreviewing(isPreviewing: boolean) {
    setUploadState('isPreviewing', isPreviewing);
  },

  setUploading(isUploading: boolean) {
    setUploadState('isUploading', isUploading);
  },

  setUploadProgress(progress: number) {
    setUploadState('uploadProgress', progress);
  },

  setUploadStatus(status: string) {
    setUploadState('uploadStatus', status);
  },

  setPartialEnabled(enabled: boolean) {
    setUploadState('partialEnabled', enabled);
  },

  setMaxRows(maxRows: number) {
    setUploadState('maxRows', maxRows);
  },

  setSkipRows(skipRows: number) {
    setUploadState('skipRows', skipRows);
  },

  setTimeStart(timeStart: string) {
    setUploadState('timeStart', timeStart);
  },

  setTimeEnd(timeEnd: string) {
    setUploadState('timeEnd', timeEnd);
  },

  setTimeColumn(timeColumn: string) {
    setUploadState('timeColumn', timeColumn);
  },

  setSelectedColumns(columns: string[]) {
    setUploadState('selectedColumns', columns);
  },

  setDbConnected(connected: boolean) {
    setUploadState('dbConnected', connected);
  },

  setDbTable(table: string) {
    setUploadState('dbTable', table);
  },

  setDbConnectionString(connStr: string) {
    setUploadState('dbConnectionString', connStr);
  },

  setDbSchema(schema: string) {
    setUploadState('dbSchema', schema);
  },

  setDbTables(tables: string[]) {
    setUploadState('dbTables', tables);
  },

  reset() {
    setUploadState({
      source: 'file',
      selectedFile: null,
      previewMetadata: null,
      previewProfiles: [],
      isPreviewing: false,
      isUploading: false,
      uploadProgress: 0,
      uploadStatus: '',
      partialEnabled: false,
      maxRows: 1000000,
      skipRows: 0,
      timeStart: '',
      timeEnd: '',
      timeColumn: '',
      selectedColumns: [],
      dbConnected: false,
      dbTable: '',
      dbConnectionString: '',
      dbSchema: 'public',
      dbTables: [],
    });
  },
};