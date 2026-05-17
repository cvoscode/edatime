import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, cleanup } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, createMemoryHistory } from '@solidjs/router';
import { createStore } from 'solid-js/store';

vi.mock('../stores/uploadStore', () => {
  // Use createStore to return a proper reactive store that Solid can track
  const [mockStore, setMockStore] = createStore({
    source: 'file' as 'file' | 'database',
    selectedFile: null as File | null,
    previewMetadata: null as unknown,
    previewProfiles: [] as unknown[],
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
    selectedColumns: [] as string[],
    dbConnected: false,
    dbTable: '',
    dbConnectionString: '',
    dbSchema: 'public',
    dbTables: [] as string[],
  });
  return {
    uploadStore: {
      get state() { return mockStore; },
      setSource: vi.fn((s: 'file' | 'database') => { setMockStore('source', s); }),
      setSelectedFile: vi.fn((f: File | null) => { setMockStore('selectedFile', f); }),
      setPreview: vi.fn(),
      setPreviewing: vi.fn((v: boolean) => { setMockStore('isPreviewing', v); }),
      setUploading: vi.fn((v: boolean) => { setMockStore('isUploading', v); }),
      setUploadProgress: vi.fn((v: number) => { setMockStore('uploadProgress', v); }),
      setUploadStatus: vi.fn((v: string) => { setMockStore('uploadStatus', v); }),
      setPartialEnabled: vi.fn((v: boolean) => { setMockStore('partialEnabled', v); }),
      setMaxRows: vi.fn((v: number) => { setMockStore('maxRows', v); }),
      setSkipRows: vi.fn((v: number) => { setMockStore('skipRows', v); }),
      setTimeStart: vi.fn((v: string) => { setMockStore('timeStart', v); }),
      setTimeEnd: vi.fn((v: string) => { setMockStore('timeEnd', v); }),
      setTimeColumn: vi.fn((v: string) => { setMockStore('timeColumn', v); }),
      setSelectedColumns: vi.fn((v: string[]) => { setMockStore('selectedColumns', v); }),
      setDbConnected: vi.fn((v: boolean) => { setMockStore('dbConnected', v); }),
      setDbTable: vi.fn((v: string) => { setMockStore('dbTable', v); }),
      setDbConnectionString: vi.fn((v: string) => { setMockStore('dbConnectionString', v); }),
      setDbSchema: vi.fn((v: string) => { setMockStore('dbSchema', v); }),
      setDbTables: vi.fn((v: string[]) => { setMockStore('dbTables', v); }),
      reset: vi.fn(),
    },
  };
});

vi.mock('../stores/datasetStore', () => ({
  datasetStore: {
    get state() { return {}; },
    setColumns: vi.fn(),
    setMetadata: vi.fn(),
    setNumericCols: vi.fn(),
  },
}));

vi.mock('../stores/uiStore', () => ({
  uiStore: {
    get state() { return {}; },
    addToast: vi.fn(),
  },
}));

vi.mock('../services/api', () => ({
  uploadPreview: vi.fn().mockResolvedValue({
    metadata: {
      total_rows: 50000,
      columns: [{ name: 'col1' }, { name: 'col2' }],
      column_profiles: [],
      numeric_columns: ['col1', 'col2'],
      time_column: null,
    },
  }),
  uploadIngest: vi.fn().mockResolvedValue({ row_count: 50000, columns: [] }),
  fetchMetadata: vi.fn().mockResolvedValue({
    column_profiles: [],
    columns: [{ name: 'col1' }, { name: 'col2' }],
    numeric_columns: ['col1', 'col2'],
    time_column: null,
  }),
  fetchSampleETTm2: vi.fn().mockResolvedValue(new File(['test'], 'ettm2.csv', { type: 'text/csv' })),
  dbConnect: vi.fn().mockResolvedValue(undefined),
  dbTables: vi.fn().mockResolvedValue({ tables: ['table1', 'table2'] }),
  dbLoad: vi.fn().mockResolvedValue({ row_count: 10000, columns: [] }),
  dbDisconnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/csvGenerators', () => ({
  generateSinusoidalCsv: vi.fn().mockReturnValue('col1,col2\n1,2\n3,4'),
  generateWeatherCsv: vi.fn().mockReturnValue('col1,col2\n5,6\n7,8'),
  createFileFromCsv: vi.fn((csv: string, name: string) => new File([csv], name, { type: 'text/csv' })),
}));

vi.mock('../components/ui', () => ({
  SwitchToggle: (props: any) => <input type="checkbox" {...props} />,
}));

vi.mock('../components/upload/UploadDropzone', () => ({
  default: (props: { onFileSelected: (f: File) => void; onSampleDataset: (id: string) => void }) => (
    <div data-testid="upload-dropzone">
      <button data-testid="dropzone-browse" onClick={() => {}}>Browse file</button>
      <button data-testid="sample-ettm2" onClick={() => props.onSampleDataset('ettm2')}>Load ETTm2</button>
      <button data-testid="sample-sinusoidal" onClick={() => props.onSampleDataset('sinusoidal')}>Load Sinusoidal</button>
      <button data-testid="sample-weather" onClick={() => props.onSampleDataset('weather')}>Load Weather</button>
    </div>
  ),
}));

vi.mock('../components/upload/ColumnProfileGrid', () => ({
  default: () => <div data-testid="column-profile-grid">Profile grid</div>,
}));

import UploadPage from './UploadPage';

const createTestRouter = () => {
  const history = createMemoryHistory();
  history.set({ value: '/upload' });
  return history;
};

const renderUploadPage = () => {
  const history = createTestRouter();
  return render(() => (
    <MemoryRouter history={history}>
      <Route path="/upload" component={UploadPage} />
    </MemoryRouter>
  ));
};

describe('UploadPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders File and Database source tabs', async () => {
    renderUploadPage();
    expect(screen.getByRole('tab', { name: 'File' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Database' })).toBeInTheDocument();
  });

  it('renders upload preview section with File Preview heading', async () => {
    renderUploadPage();
    expect(screen.getByText('File Preview')).toBeInTheDocument();
  });

  it('renders partial load toggle', async () => {
    renderUploadPage();
    expect(screen.getByLabelText('Enable partial load options')).toBeInTheDocument();
  });

  it('renders upload button', async () => {
    renderUploadPage();
    expect(screen.getByRole('button', { name: /Upload & Ingest/i })).toBeInTheDocument();
  });

  it('renders upload dropzone with sample dataset buttons', async () => {
    renderUploadPage();
    expect(screen.getByTestId('upload-dropzone')).toBeInTheDocument();
    expect(screen.getByTestId('sample-ettm2')).toBeInTheDocument();
    expect(screen.getByTestId('sample-sinusoidal')).toBeInTheDocument();
    expect(screen.getByTestId('sample-weather')).toBeInTheDocument();
  });

  it('renders select all and none buttons in preview section', async () => {
    renderUploadPage();
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'None' })).toBeInTheDocument();
  });

  it('renders database section when Database tab is clicked', async () => {
    renderUploadPage();
    await userEvent.click(screen.getByRole('tab', { name: 'Database' }));
    expect(screen.getByText('Database Connection')).toBeInTheDocument();
    expect(screen.getByLabelText('Connection string')).toBeInTheDocument();
  });

  it('renders column filter input in preview section', async () => {
    renderUploadPage();
    expect(screen.getByPlaceholderText('Filter columns…')).toBeInTheDocument();
  });

  it('renders preview status message', async () => {
    renderUploadPage();
    expect(screen.getByText('Select a file to preview columns')).toBeInTheDocument();
  });

  it('does not show progress bar when not uploading', async () => {
    renderUploadPage();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});