import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    syncDriftEmptyState,
    setSyncDriftEmptyState,
    getEChartsModule,
    _setEchartsModule,
    createDriftComputeTask,
    exportDriftCsv,
    exportDriftJson,
    exportTimelinePNG,
    exportDetailPNG,
    getDriftRuntime,
} from './runtime.js';

// Minimal ECharts mock for export tests.
const chartMock = {
    getDataURL: vi.fn(() => 'data:image/png;base64,abc'),
    getDom: vi.fn(() => document.createElement('div')),
};

vi.mock('echarts', () => ({
    init: vi.fn(() => chartMock),
}));

// Mock chartExport so we can verify exportTimelinePNG/exportDetailPNG call it.
const exportEChartsPNGSpy = vi.hoisted(() => vi.fn());
vi.mock('../../utils/chartExport.js', () => ({
    exportEChartsPNG: exportEChartsPNGSpy,
}));

describe('runtime — empty-state sync', () => {
    beforeEach(() => {
        setSyncDriftEmptyState(() => {});
    });

    it('syncDriftEmptyState calls the registered setter', () => {
        const spy = vi.fn();
        setSyncDriftEmptyState(spy);
        syncDriftEmptyState(true, 'no data');
        expect(spy).toHaveBeenCalledOnce();
        expect(spy).toHaveBeenCalledWith(true, 'no data');
    });

    it('setSyncDriftEmptyState replaces the previous setter', () => {
        const first = vi.fn();
        const second = vi.fn();
        setSyncDriftEmptyState(first);
        setSyncDriftEmptyState(second);
        syncDriftEmptyState(true);
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledOnce();
    });
});

describe('runtime — ECharts module cache', () => {
    beforeEach(() => {
        _setEchartsModule(null);
    });

    it('getEChartsModule returns null when cache is empty', () => {
        expect(getEChartsModule()).toBeNull();
    });

    it('_setEchartsModule populates the cache', () => {
        _setEchartsModule({} as typeof import('echarts'));
        expect(getEChartsModule()).not.toBeNull();
    });

    it('_setEchartsModule can set cache back to null', () => {
        _setEchartsModule({} as typeof import('echarts'));
        _setEchartsModule(null);
        expect(getEChartsModule()).toBeNull();
    });
});

describe('runtime — createDriftComputeTask', () => {
    it('returns an object with run, cancel, and getSignal', () => {
        const task = createDriftComputeTask({
            setLoading: vi.fn(),
            onError: vi.fn(),
        });
        expect(task).toHaveProperty('run');
        expect(task).toHaveProperty('cancel');
        expect(task).toHaveProperty('getSignal');
    });

    it('run() calls setLoading(true) then setLoading(false) on success', async () => {
        const setLoading = vi.fn();
        const task = createDriftComputeTask({ setLoading, onError: vi.fn() });
        await task.run(() => Promise.resolve());
        expect(setLoading).toHaveBeenCalledTimes(2);
        expect(setLoading).toHaveBeenNthCalledWith(1, true);
        expect(setLoading).toHaveBeenNthCalledWith(2, false);
    });

    it('run() calls onError on non-abort failure', async () => {
        const onError = vi.fn();
        const task = createDriftComputeTask({ setLoading: vi.fn(), onError });
        await task.run(() => Promise.reject(new Error('oops')));
        expect(onError).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledWith('oops');
    });

    it('run() does NOT call onError on AbortError', async () => {
        const onError = vi.fn();
        const task = createDriftComputeTask({ setLoading: vi.fn(), onError });
        const abortErr = new Error('cancelled');
        abortErr.name = 'AbortError';
        await task.run(() => Promise.reject(abortErr));
        expect(onError).not.toHaveBeenCalled();
    });

    it('cancel() aborts the current request', async () => {
        const task = createDriftComputeTask({ setLoading: vi.fn(), onError: vi.fn() });
        let capturedSignal: AbortSignal | null = null;
        const pending = task.run(async (signal) => {
            capturedSignal = signal;
            await new Promise<void>((resolve) => {
                const t = setTimeout(() => resolve(), 2000);
                signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
            });
            if (!signal.aborted) throw new Error('not aborted');
        });
        task.cancel();
        await pending;
        expect(capturedSignal).not.toBeNull();
        expect(capturedSignal!.aborted).toBe(true);
    });

    it('cancel() is safe when no request is pending', () => {
        const task = createDriftComputeTask({ setLoading: vi.fn(), onError: vi.fn() });
        expect(() => task.cancel()).not.toThrow();
    });

    it('getSignal() returns a never-aborted signal when no request has run', () => {
        const task = createDriftComputeTask({ setLoading: vi.fn(), onError: vi.fn() });
        expect(task.getSignal().aborted).toBe(false);
    });

    it('getSignal() returns the current controller signal after run() is called', async () => {
        const task = createDriftComputeTask({ setLoading: vi.fn(), onError: vi.fn() });
        let capturedSignal: AbortSignal | null = null;
        await task.run((signal) => { capturedSignal = signal; return Promise.resolve(); });
        expect(capturedSignal).not.toBeNull();
        expect(task.getSignal()).toBe(capturedSignal);
    });
});

describe('runtime — exportDriftCsv', () => {
    let clickSpy: ReturnType<typeof vi.spyOn>;
    let createObjectURLSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:test');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    });

    it('does nothing when responsesByColumn is empty', () => {
        exportDriftCsv(new Map());
        expect(clickSpy).not.toHaveBeenCalled();
    });

    it('generates a CSV blob and triggers download', () => {
        const mockResp = {
            windows: [
                {
                    label: 'w1',
                    start_ms: 10,
                    end_ms: 20,
                    count: 5,
                    mean: 1.5,
                    std: 0.2,
                    quantiles: [0.1, 0.5, 1.0],
                    ks_stat: 0.1,
                    ks_pvalue: 0.9,
                    es_stat: 0.05,
                    es_pvalue: 0.8,
                    wasserstein: 0.2,
                    psi: 0.1,
                    drift_level: 'green',
                },
            ],
        };
        const map = new Map([['col_a', mockResp]]);
        exportDriftCsv(map);
        expect(createObjectURLSpy).toHaveBeenCalled();
        expect(clickSpy).toHaveBeenCalled();
    });

    it('handles non-finite mean/std/es_stat gracefully', () => {
        const mockResp = {
            windows: [
                {
                    label: 'w_bad',
                    start_ms: 0,
                    end_ms: 0,
                    count: 0,
                    mean: NaN,
                    std: Infinity,
                    quantiles: [NaN, NaN, NaN],
                    ks_stat: NaN,
                    ks_pvalue: NaN,
                    es_stat: NaN,
                    es_pvalue: NaN,
                    wasserstein: NaN,
                    psi: NaN,
                    drift_level: 'none',
                },
            ],
        };
        const map = new Map([['col_bad', mockResp]]);
        expect(() => exportDriftCsv(map)).not.toThrow();
    });
});

describe('runtime — exportDriftJson', () => {
    let clickSpy: ReturnType<typeof vi.spyOn>;
    let createObjectURLSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:test');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    });

    it('does nothing when responsesByColumn is empty', () => {
        // Guard: verify the function returns early without issuing a download.
        const beforeCount = clickSpy.mock.calls.length;
        exportDriftJson(new Map());
        expect(clickSpy.mock.calls.length).toBe(beforeCount);
    });

    it('generates a JSON blob and triggers download', () => {
        const map = new Map([['col_a', { windows: [] }]]);
        exportDriftJson(map);
        expect(createObjectURLSpy).toHaveBeenCalled();
        expect(clickSpy).toHaveBeenCalled();
    });
});

describe('runtime — exportTimelinePNG / exportDetailPNG', () => {
    beforeEach(() => {
        exportEChartsPNGSpy.mockClear();
    });

    it('exportTimelinePNG calls exportEChartsPNG with correct filename', () => {
        exportTimelinePNG(chartMock as any, 'col_x');
        expect(exportEChartsPNGSpy).toHaveBeenCalledWith(chartMock, 'drift_timeline_col_x.png');
    });

    it('exportDetailPNG calls exportEChartsPNG with correct filename', () => {
        exportDetailPNG(chartMock as any, 'col_y');
        expect(exportEChartsPNGSpy).toHaveBeenCalledWith(chartMock, 'drift_detail_col_y.png');
    });

    it('both export functions do nothing when chart is null', () => {
        exportTimelinePNG(null, 'col_x');
        exportDetailPNG(null, 'col_y');
        expect(exportEChartsPNGSpy).not.toHaveBeenCalled();
    });
});

describe('runtime — getDriftRuntime', () => {
    it('returns the module-level driftRuntime (initially null)', () => {
        expect(getDriftRuntime()).toBeNull();
    });
});