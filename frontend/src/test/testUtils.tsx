import { render, cleanup } from '@solidjs/testing-library';
import { MemoryRouter, Route } from '@solidjs/router';
import { createMemoryHistory } from '@solidjs/router';
import { ParentProps, Component } from 'solid-js';
import { createStore } from 'solid-js/store';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// MemoryRouter helper
// ---------------------------------------------------------------------------
export interface RouterConfig {
  url?: string;
  routes?: Array<{ path: string; component: Component }>;
  initialRoute?: string;
}

export function renderWithRouter(
  ui: Component,
  config: RouterConfig = {}
) {
  const history = createMemoryHistory();
  if (config.url || config.initialRoute) {
    history.set({ value: config.initialRoute ?? config.url ?? '/', replace: false, scroll: true });
  }

  const wrapper = ({ children }: ParentProps) => (
    <MemoryRouter history={history}>
      {config.routes
        ? config.routes.map(r => <Route path={r.path} component={r.component} />)
        : children}
    </MemoryRouter>
  );

  return render(() => ui as any, { wrapper: wrapper as any });
}

// ---------------------------------------------------------------------------
// Store mock factory
// ---------------------------------------------------------------------------
export function createStoreMock<S extends Record<string, unknown>>(
  initialState: S,
  overrides: Partial<Record<keyof S, (...args: unknown[]) => unknown>> = {}
) {
  const [state, setState] = createStore(initialState);
  const setters: Record<string, (...args: unknown[]) => void> = {};

  for (const key of Object.keys(initialState)) {
    setters[key] = (...args: unknown[]) => {
      const val = args.length <= 1 ? args[0] : args;
      setState(key as any, val as any);
    };
  }

  return {
    store: {
      get state() { return state; },
      ...setters,
      ...overrides,
      reset: vi.fn(() => {
        setState(initialState as S);
      }),
    },
    state,
    setState,
  };
}

// ---------------------------------------------------------------------------
// API mock factory
// ---------------------------------------------------------------------------
export function createApiMock(overrides: Record<string, Function> = {}) {
  return {
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
      revision: 1,
      total_rows: 50000,
      columns: [{ name: 'col1' }, { name: 'col2' }],
      numeric_columns: ['col1', 'col2'],
      time_column: null,
      time_range: null,
      column_profiles: [],
    }),
    fetchSampleETTm2: vi.fn().mockResolvedValue(new File([''], 'test.csv', { type: 'text/csv' })),
    dbConnect: vi.fn().mockResolvedValue({ status: 'ok' }),
    dbTables: vi.fn().mockResolvedValue({ tables: ['table1', 'table2'] }),
    dbLoad: vi.fn().mockResolvedValue({ row_count: 10000, columns: [] }),
    dbDisconnect: vi.fn().mockResolvedValue({ status: 'ok' }),
    fetchRollingBands: vi.fn().mockResolvedValue({ bands: [] }),
    fetchAnomalies: vi.fn().mockResolvedValue({ method: 'zscore', threshold: 3, regions: [] }),
    fetchFft: vi.fn().mockResolvedValue({ sample_count: 0, results: [] }),
    fetchSpectrogram: vi.fn().mockResolvedValue({
      sample_count: 0,
      result: { times_ms: [], frequencies: [], magnitudes: [] },
    }),
    fetchCorrelationMatrix: vi.fn().mockResolvedValue({ columns: [], pearson: [], spearman: [] }),
    fetchScatterCorrelations: vi.fn().mockResolvedValue({
      base_column: '',
      threshold: 0.7,
      correlations: [],
      suggestions: [],
    }),
    fetchScatterPoints: vi.fn().mockResolvedValue({
      x: '',
      y: '',
      color: null,
      total_points: 0,
      returned_points: 0,
      points: [],
      color_values: null,
      color_labels: null,
      color_min: null,
      color_max: null,
      size_values: null,
      size_min: null,
      size_max: null,
    }),
    clearSampleCache: vi.fn(),
    ...overrides,
  };
}