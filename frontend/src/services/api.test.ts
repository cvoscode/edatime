import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock fetch globally for all tests
// ---------------------------------------------------------------------------
let mockFetch: ReturnType<typeof vi.fn>;

const createMockResponse = (data: unknown, overrides: Partial<Response> = {}) => ({
  ok: true,
  status: 200,
  headers: new Map([['Content-Type', 'application/json']]),
  json: () => Promise.resolve(data),
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  text: () => Promise.resolve(''),
  ...overrides,
});

beforeEach(() => {
  mockFetch = vi.fn();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Import API after mocking fetch
// ---------------------------------------------------------------------------
import {
  uploadPreview,
  uploadIngest,
  fetchMetadata,
  fetchSampleETTm2,
  clearSampleCache,
  fetchScatterPoints,
  fetchScatterCorrelations,
  fetchRollingBands,
  fetchAnomalies,
  fetchFft,
  fetchSpectrogram,
  dbConnect,
  dbTables,
  dbLoad,
  dbDisconnect,
} from '../services/api';

describe('api service', () => {
  describe('uploadPreview', () => {
    it('sends POST request with file as FormData', async () => {
      const mockFile = new File(['test content'], 'test.csv', { type: 'text/csv' });
      mockFetch.mockResolvedValueOnce(createMockResponse({
        status: 'ok',
        metadata: {
          revision: 1,
          total_rows: 100,
          columns: [],
          numeric_columns: [],
          time_column: null,
          time_range: null,
          column_profiles: [],
        },
      }));

      await uploadPreview(mockFile);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/upload/preview',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('uploadIngest', () => {
    it('sends file and options as FormData', async () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      mockFetch.mockResolvedValueOnce(createMockResponse({
        status: 'ok',
        row_count: 1000,
        columns: [],
      }));

      await uploadIngest(mockFile, {
        max_rows: 500,
        time_column: 'timestamp',
      });

      const callArgs = mockFetch.mock.calls[0];
      const [, options] = callArgs;
      expect(options.method).toBe('POST');
      expect(options.body instanceof FormData).toBe(true);
    });
  });

  describe('fetchMetadata', () => {
    it('makes GET request to /api/metadata', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        revision: 1,
        total_rows: 500,
        columns: [],
        numeric_columns: [],
        time_column: null,
        time_range: null,
        column_profiles: [],
      }));

      await fetchMetadata();

      expect(mockFetch).toHaveBeenCalledWith('/api/metadata', expect.any(Object));
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('server error'),
      });

      await expect(fetchMetadata()).rejects.toThrow();
    });
  });

  describe('fetchSampleETTm2 caching', () => {
    it('caches the result and returns same File on second call', async () => {
      clearSampleCache();

      const mockFile = new File(['csv data'], 'ETTm2.csv', { type: 'text/csv' });
      mockFetch.mockResolvedValue(createMockResponse(mockFile, {
        blob: () => Promise.resolve(new Blob(['csv data'])),
      }));

      const result1 = await fetchSampleETTm2();
      const result2 = await fetchSampleETTm2();

      expect(mockFetch).toHaveBeenCalledTimes(1); // second call uses cache
      expect(result1).toBe(result2); // same reference
    });

    it('clearSampleCache invalidates the cache', async () => {
      clearSampleCache();

      const mockFile = new File(['csv data'], 'ETTm2.csv', { type: 'text/csv' });
      mockFetch.mockResolvedValue(createMockResponse(mockFile, {
        blob: () => Promise.resolve(new Blob(['csv data'])),
      }));

      await fetchSampleETTm2();
      clearSampleCache();
      await fetchSampleETTm2();

      expect(mockFetch).toHaveBeenCalledTimes(2); // cache was cleared
    });
  });

  describe('fetchScatterPoints', () => {
    it('sends POST with correct JSON payload', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        x: 'col1',
        y: 'col2',
        color: null,
        total_points: 0,
        returned_points: 0,
        points: [],
      }));

      await fetchScatterPoints('col1', 'col2', 1000);

      const callArgs = mockFetch.mock.calls[0];
      const [, options] = callArgs;
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body as string);
      expect(body.x).toBe('col1');
      expect(body.y).toBe('col2');
      expect(body.limit).toBe(1000);
    });

    it('includes optional color and size in payload', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        x: 'col1',
        y: 'col2',
        color: 'col3',
        total_points: 0,
        returned_points: 0,
        points: [],
      }));

      await fetchScatterPoints('col1', 'col2', 1000, 'col3', 'col4');

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse((callArgs[1] as RequestInit).body as string);
      expect(body.color).toBe('col3');
      expect(body.size).toBe('col4');
    });

    it('includes start/end in payload when provided', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        x: 'col1',
        y: 'col2',
        color: null,
        total_points: 0,
        returned_points: 0,
        points: [],
      }));

      await fetchScatterPoints('col1', 'col2', 1000, null, null, {
        start: 1000,
        end: 2000,
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse((callArgs[1] as RequestInit).body as string);
      expect(body.start).toBe(1000);
      expect(body.end).toBe(2000);
    });

    it('passes abort signal to fetch', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        x: 'col1',
        y: 'col2',
        color: null,
        total_points: 0,
        returned_points: 0,
        points: [],
      }));

      const controller = new AbortController();
      await fetchScatterPoints('col1', 'col2', 1000, null, null, {}, controller.signal);

      const callArgs = mockFetch.mock.calls[0];
      expect((callArgs[1] as RequestInit).signal).toBe(controller.signal);
    });
  });

  describe('request deduplication for GET requests', () => {
    it('returns same Promise for concurrent identical GET requests', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        return Promise.resolve(createMockResponse({
          revision: 1,
          total_rows: 500,
          columns: [],
          numeric_columns: [],
          time_column: null,
          time_range: null,
          column_profiles: [],
        }));
      });

      // Two concurrent calls - should deduplicate to one fetch
      const [result1, result2] = await Promise.all([
        fetchMetadata(),
        fetchMetadata(),
      ]);

      // Deduplication means only one fetch call was made
      expect(callCount).toBe(1);
    });
  });

  describe('fetchScatterCorrelations', () => {
    it('passes base and threshold as query params', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        base_column: 'temp',
        threshold: 0.7,
        correlations: [],
        suggestions: [],
      }));

      await fetchScatterCorrelations('temp', 0.5);

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('base=temp');
      expect(callUrl).toContain('threshold=0.5');
    });

    it('handles null base gracefully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        base_column: '',
        threshold: 0.7,
        correlations: [],
        suggestions: [],
      }));

      await fetchScatterCorrelations(null, 0.7);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/scatter/correlations?threshold=0.7',
        expect.any(Object)
      );
    });
  });

  describe('dbConnect', () => {
    it('sends POST with connection string and schema', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ status: 'ok' }));

      await dbConnect('postgresql://localhost:5432/db', 'custom_schema');

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse((callArgs[1] as RequestInit).body as string);
      expect(body.connection_string).toBe('postgresql://localhost:5432/db');
      expect(body.schema).toBe('custom_schema');
    });
  });

  describe('dbLoad', () => {
    it('sends POST with table and options', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        status: 'ok',
        row_count: 1000,
        columns: [],
      }));

      await dbLoad('my_table', { max_rows: 500, time_column: 'ts' });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse((callArgs[1] as RequestInit).body as string);
      expect(body.table).toBe('my_table');
      expect(body.schema).toBe('public');
      expect(body.max_rows).toBe(500);
      expect(body.time_column).toBe('ts');
    });
  });

  describe('fetchRollingBands', () => {
    it('passes params as query string', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ bands: [] }));

      await fetchRollingBands('2024-01-01', '2024-01-02', 'temp,pressure', 50);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/analytics/rolling?start=2024-01-01&end=2024-01-02&columns=temp%2Cpressure&window=50',
        expect.any(Object)
      );
    });
  });

  describe('fetchAnomalies', () => {
    it('passes threshold when provided', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        method: 'zscore',
        threshold: 3,
        regions: [],
      }));

      await fetchAnomalies('2024-01-01', '2024-01-02', 'temp', 'zscore', 5);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/analytics/anomalies?start=2024-01-01&end=2024-01-02&columns=temp&method=zscore&threshold=5',
        expect.any(Object)
      );
    });
  });

  describe('fetchFft', () => {
    it('passes start/end/columns/maxPoints as query params', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        sample_count: 1024,
        results: [],
      }));

      await fetchFft('2024-01-01', '2024-01-02', 'temp', 4096);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/analytics/fft?start=2024-01-01&end=2024-01-02&columns=temp&max_points=4096',
        expect.any(Object)
      );
    });
  });

  describe('fetchSpectrogram', () => {
    it('includes optional hopSize in query params', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        sample_count: 0,
        result: { times_ms: [], frequencies: [], magnitudes: [] },
      }));

      await fetchSpectrogram('2024-01-01', '2024-01-02', 'temp', 256, 128);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('hop_size=128'),
        expect.any(Object)
      );
    });
  });
});