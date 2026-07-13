import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    _setEchartsModule,
    getEChartsModule,
    setSyncDriftEmptyState,
    syncDriftEmptyState,
} from './runtime.js';

describe('drift runtime', () => {
    beforeEach(() => {
        setSyncDriftEmptyState(() => {});
        _setEchartsModule(null);
    });

    it('delegates empty-state updates to the current page controller', () => {
        const sync = vi.fn();
        setSyncDriftEmptyState(sync);

        syncDriftEmptyState(true, 'No data');

        expect(sync).toHaveBeenCalledWith(true, 'No data');
    });

    it('exposes a resettable ECharts module cache for chart initialization', () => {
        expect(getEChartsModule()).toBeNull();
        _setEchartsModule({} as typeof import('echarts'));
        expect(getEChartsModule()).not.toBeNull();
    });
});
