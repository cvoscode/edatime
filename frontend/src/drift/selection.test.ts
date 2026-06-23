import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getResponsesByColumn,
    getActiveDetailColumn,
    getSelectedWindowIdx,
    getWindowSort,
    setActiveDetailColumn,
    setSelectedWindowIdx,
    setWindowSort,
    selectColumn,
    selectWindow,
    getActiveResponse,
    setResponses,
    clearSelection,
    _setSelectionState,
    _getSelectionState,
} from './selection.js';
import type { DriftResponse } from './viewModels.js';

const mockResponse = (): DriftResponse => ({
    column: 'test_col',
    reference: {
        start_ms: 0, end_ms: 10, label: 'ref', count: 10, null_count: 0,
        completeness: 1, mean: 1, std: 0.2, min: 0, max: 2,
        quantiles: [0.2, 0.7, 1.0, 1.3, 1.8],
        hist_bins: [0, 1, 2], hist_counts: [3, 7],
        ecdf_x: [0, 1, 2], ecdf_y: [0.2, 0.6, 1],
    },
    windows: [
        {
            start_ms: 11, end_ms: 20, label: 'w1', count: 8, null_count: 0,
            completeness: 1, mean: 1.2, std: 0.2, min: 0.5, max: 2.1,
            quantiles: [0.5, 0.9, 1.2, 1.4, 1.9],
            hist_bins: [0, 1, 2], hist_counts: [2, 6],
            ecdf_x: [0.5, 1.2, 2.1], ecdf_y: [0.2, 0.7, 1],
            ks_stat: 0.1, ks_pvalue: 0.8, es_stat: 0.12, es_pvalue: 0.7,
            wasserstein: 0.2, psi: 0.12, jensen_shannon: 0.04, drift_level: 'yellow',
            trigger_reasons: ['psi_minor'], completeness_delta: 0,
            low_sample_warning: false,
        },
        {
            start_ms: 21, end_ms: 30, label: 'w2', count: 9, null_count: 0,
            completeness: 1, mean: 1.6, std: 0.3, min: 0.8, max: 2.4,
            quantiles: [0.8, 1.2, 1.6, 1.9, 2.3],
            hist_bins: [0, 1, 2], hist_counts: [1, 8],
            ecdf_x: [0.8, 1.6, 2.4], ecdf_y: [0.2, 0.75, 1],
            ks_stat: 0.2, ks_pvalue: 0.5, es_stat: 0.19, es_pvalue: 0.4,
            wasserstein: 0.3, psi: 0.26, jensen_shannon: 0.11, drift_level: 'red',
            trigger_reasons: ['psi_major', 'ks', 'es', 'wasserstein'], completeness_delta: -0.18,
            low_sample_warning: false,
        },
    ],
    thresholds: {
        ks_pvalue_threshold: 0.05, es_pvalue_threshold: 0.05, wasserstein_threshold: 0.2,
        psi_minor_threshold: 0.1, psi_major_threshold: 0.25,
    },
    metadata: { computation_time_ms: 12, num_windows: 2, reference_samples: 10 },
});

describe('selection — initial state', () => {
    beforeEach(() => {
        clearSelection();
    });

    it('starts with empty responsesByColumn', () => {
        expect(getResponsesByColumn().size).toBe(0);
    });

    it('starts with null activeDetailColumn', () => {
        expect(getActiveDetailColumn()).toBeNull();
    });

    it('starts with null selectedWindowIdx', () => {
        expect(getSelectedWindowIdx()).toBeNull();
    });

    it('starts with default windowSort', () => {
        expect(getWindowSort()).toBe('time-asc');
    });
});

describe('selection — setActiveDetailColumn / setSelectedWindowIdx', () => {
    beforeEach(() => {
        clearSelection();
    });

    it('setActiveDetailColumn updates the column', () => {
        setActiveDetailColumn('col_a');
        expect(getActiveDetailColumn()).toBe('col_a');
    });

    it('setSelectedWindowIdx updates the window index', () => {
        setSelectedWindowIdx(3);
        expect(getSelectedWindowIdx()).toBe(3);
    });

    it('setSelectedWindowIdx accepts null', () => {
        setSelectedWindowIdx(2);
        setSelectedWindowIdx(null);
        expect(getSelectedWindowIdx()).toBeNull();
    });
});

describe('selection — setWindowSort', () => {
    beforeEach(() => clearSelection());

    it('setWindowSort updates the sort mode', () => {
        setWindowSort('psi-desc');
        expect(getWindowSort()).toBe('psi-desc');
    });
});

describe('selection — selectColumn / selectWindow', () => {
    beforeEach(() => clearSelection());

    it('selectColumn sets the column and resets window index', () => {
        setSelectedWindowIdx(5);
        selectColumn('col_b');
        expect(getActiveDetailColumn()).toBe('col_b');
        expect(getSelectedWindowIdx()).toBeNull();
    });

    it('selectWindow only sets the window index', () => {
        selectColumn('col_a');
        selectWindow(2);
        expect(getSelectedWindowIdx()).toBe(2);
        expect(getActiveDetailColumn()).toBe('col_a');
    });
});

describe('selection — getActiveResponse', () => {
    beforeEach(() => clearSelection());

    it('returns null when no column is selected', () => {
        expect(getActiveResponse()).toBeNull();
    });

    it('returns null when column has no response', () => {
        setActiveDetailColumn('missing');
        expect(getActiveResponse()).toBeNull();
    });

    it('returns the response for the active column', () => {
        const resp = mockResponse();
        const map = new Map([['col_a', resp]]);
        setResponses(map);
        expect(getActiveResponse()).toBe(resp);
    });
});

describe('selection — setResponses', () => {
    beforeEach(() => clearSelection());

    it('auto-selects first column and first window', () => {
        const resp = mockResponse();
        const map = new Map([['col_a', resp]]);
        setResponses(map);
        expect(getActiveDetailColumn()).toBe('col_a');
        expect(getSelectedWindowIdx()).toBe(0);
    });

    it('handles empty map', () => {
        setResponses(new Map());
        expect(getActiveDetailColumn()).toBeNull();
        expect(getSelectedWindowIdx()).toBeNull();
    });

    it('auto-selects null window when response has no windows', () => {
        const emptyResp = { ...mockResponse(), windows: [] };
        const map = new Map([['col_a', emptyResp as DriftResponse]]);
        setResponses(map);
        expect(getSelectedWindowIdx()).toBeNull();
    });
});

describe('selection — clearSelection', () => {
    it('clears all state', () => {
        const resp = mockResponse();
        const map = new Map([['col_a', resp]]);
        setResponses(map);
        clearSelection();
        expect(getResponsesByColumn().size).toBe(0);
        expect(getActiveDetailColumn()).toBeNull();
        expect(getSelectedWindowIdx()).toBeNull();
    });
});

describe('selection — _getSelectionState / _setSelectionState', () => {
    beforeEach(() => clearSelection());

    it('_getSelectionState returns a snapshot', () => {
        setActiveDetailColumn('col_x');
        setSelectedWindowIdx(4);
        setWindowSort('wasserstein-desc');
        const snap = _getSelectionState();
        expect(snap.activeDetailColumn).toBe('col_x');
        expect(snap.selectedWindowIdx).toBe(4);
        expect(snap.windowSort).toBe('wasserstein-desc');
    });

    it('_setSelectionState restores a snapshot', () => {
        const snap = {
            responsesByColumn: new Map([['col_restore', mockResponse()]]),
            activeDetailColumn: 'col_restore',
            selectedWindowIdx: 1,
            windowSort: 'severity-desc',
        };
        _setSelectionState(snap);
        expect(getActiveDetailColumn()).toBe('col_restore');
        expect(getSelectedWindowIdx()).toBe(1);
        expect(getWindowSort()).toBe('severity-desc');
    });
});
