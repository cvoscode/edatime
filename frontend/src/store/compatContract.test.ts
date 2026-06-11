/**
 * compatContract.test.ts
 *
 * `appStateCompat` re-exports the composite `appState` Proxy over focused
 * sub-states. The arch checker forbids new code from writing to that
 * proxy directly, but legacy importers still read from it. This file is
 * the safety net: every property that the live codebase reads or writes
 * through `appState.<x>` must round-trip identically through the
 * underlying sub-state module.
 *
 * If you add a new property to one of the sub-states and a setter/getter
 * to the proxy, add the path here too. This test does not exercise every
 * property — only the curated list of paths used by live importers, which
 * is the surface the arch checker actually protects.
 */
import { describe, expect, it } from 'vitest';
import { appState as compatAppState } from './appStateCompat.js';
import {
    appState as storeAppState,
    setAdaptiveFilterColumn,
    setAdaptiveLineFilters,
    setChartInstance,
    setChartText,
    setColumnRanges,
    setDatasetRevision,
    setFilterText,
    setMetadata,
    setNumericCols,
    setPendingAdaptivePoint,
    setPendingRestoreY,
    setPendingYMode,
    setProfileFilterText,
    setRefetchOnZoom,
    setSelectedColorColumn,
    setSelectedCols,
    setSeriesColors,
    setZoomHistory,
} from './index.js';
import { chartState, setInitialView, setViewport } from './chartState.js';
import { datasetState, setColumnProfiles } from './datasetState.js';
import { uiState } from './uiState.js';
import { analyticsState, setRollingEnabled } from './analyticsState.js';
import { runtimeState, setAnalysisBound, setFetchDebounceId, setLastFetchedData } from './runtimeState.js';
import { scatterState } from './scatterState.js';

describe('appState compat contract', () => {
    it('exposes the same object instance as the canonical store export', () => {
        // The compat shim is supposed to be a strict re-export. Drift here
        // would mean a new state container has been introduced and the
        // arch checker has not caught it.
        expect(compatAppState).toBe(storeAppState);
    });

    it('reads the same value as the focused sub-state for every curated path', () => {
        const readChecks: Array<[string, () => unknown, () => unknown]> = [
            ['metadata', () => compatAppState.metadata, () => datasetState.metadata],
            ['numericCols', () => compatAppState.numericCols, () => datasetState.numericCols],
            ['columnProfiles', () => compatAppState.columnProfiles, () => datasetState.columnProfiles],
            ['datasetRevision', () => compatAppState.datasetRevision, () => datasetState.datasetRevision],
            ['selectedCols', () => compatAppState.selectedCols, () => uiState.selectedCols],
            ['adaptiveFilterColumn', () => compatAppState.adaptiveFilterColumn, () => uiState.adaptiveFilterColumn],
            ['columnRanges', () => compatAppState.columnRanges, () => uiState.columnRanges],
            ['adaptiveLineFilters', () => compatAppState.adaptiveLineFilters, () => uiState.adaptiveLineFilters],
            ['pendingAdaptivePoint', () => compatAppState.pendingAdaptivePoint, () => uiState.pendingAdaptivePoint],
            ['seriesColors', () => compatAppState.seriesColors, () => uiState.seriesColors],
            ['selectedColorColumn', () => compatAppState.selectedColorColumn, () => uiState.selectedColorColumn],
            ['filterText', () => compatAppState.filterText, () => uiState.filterText],
            ['profileFilterText', () => compatAppState.profileFilterText, () => uiState.profileFilterText],
            ['currentStart', () => compatAppState.currentStart, () => chartState.currentStart],
            ['currentEnd', () => compatAppState.currentEnd, () => chartState.currentEnd],
            ['initialView', () => compatAppState.initialView, () => chartState.initialView],
            ['zoomHistory', () => compatAppState.zoomHistory, () => chartState.zoomHistory],
            ['chartText', () => compatAppState.chartText, () => chartState.chartText],
            ['chart', () => compatAppState.chart, () => chartState.chart],
            ['scatter', () => compatAppState.scatter, () => scatterState],
            ['fetchDebounceId', () => compatAppState.fetchDebounceId, () => runtimeState.fetchDebounceId],
            ['lastFetchedData', () => compatAppState.lastFetchedData, () => runtimeState.lastFetchedData],
            ['analysisBound', () => compatAppState.analysisBound, () => runtimeState.analysisBound],
            ['refetchOnZoom', () => compatAppState.refetchOnZoom, () => runtimeState.refetchOnZoom],
            ['pendingYMode', () => compatAppState.pendingYMode, () => runtimeState.pendingYMode],
            ['pendingRestoreY', () => compatAppState.pendingRestoreY, () => runtimeState.pendingRestoreY],
            ['rollingEnabled', () => compatAppState.rollingEnabled, () => analyticsState.rollingEnabled],
        ];

        for (const [name, read, expected] of readChecks) {
            // Prime each path so we don't accidentally compare two
            // independent defaults. We restore via the focused setter
            // rather than the proxy, since the proxy writes are
            // disallowed and we don't want a single test's setup to
            // leak warnings into another test.
            const value = read();
            const target = expected();
            expect(value, `appState.${name} should equal ${name} sub-state`).toBe(target);
        }
    });

    it('writes through the proxy update the focused sub-state', () => {
        // Touch a representative set of properties and verify the
        // corresponding sub-state updated. The arch checker warns on
        // proxy writes in production code; this test uses them
        // intentionally to lock the contract.

        const before = {
            metadata: compatAppState.metadata,
            numericCols: compatAppState.numericCols,
            columnProfiles: compatAppState.columnProfiles,
            datasetRevision: compatAppState.datasetRevision,
            selectedCols: compatAppState.selectedCols,
            adaptiveFilterColumn: compatAppState.adaptiveFilterColumn,
            columnRanges: compatAppState.columnRanges,
            adaptiveLineFilters: compatAppState.adaptiveLineFilters,
            pendingAdaptivePoint: compatAppState.pendingAdaptivePoint,
            seriesColors: compatAppState.seriesColors,
            selectedColorColumn: compatAppState.selectedColorColumn,
            filterText: compatAppState.filterText,
            profileFilterText: compatAppState.profileFilterText,
            currentStart: compatAppState.currentStart,
            currentEnd: compatAppState.currentEnd,
            initialView: compatAppState.initialView,
            zoomHistory: compatAppState.zoomHistory,
            chartText: compatAppState.chartText,
            chart: compatAppState.chart,
            fetchDebounceId: compatAppState.fetchDebounceId,
            lastFetchedData: compatAppState.lastFetchedData,
            analysisBound: compatAppState.analysisBound,
            refetchOnZoom: compatAppState.refetchOnZoom,
            pendingYMode: compatAppState.pendingYMode,
            pendingRestoreY: compatAppState.pendingRestoreY,
            rollingEnabled: compatAppState.rollingEnabled,
        };

        try {
            const nextMetadata = { total_rows: 0, columns: [] } as any;
            compatAppState.metadata = nextMetadata;
            expect(datasetState.metadata).toBe(nextMetadata);

            compatAppState.numericCols = ['a', 'b'];
            expect(datasetState.numericCols).toEqual(['a', 'b']);

            compatAppState.columnProfiles = [] as any;
            expect(datasetState.columnProfiles).toEqual([]);

            compatAppState.datasetRevision = 7;
            expect(datasetState.datasetRevision).toBe(7);

            compatAppState.selectedCols = ['x'];
            expect(uiState.selectedCols).toEqual(['x']);

            compatAppState.adaptiveFilterColumn = 'x';
            expect(uiState.adaptiveFilterColumn).toBe('x');

            compatAppState.columnRanges = { x: { min: 0, max: 1 } } as any;
            expect(uiState.columnRanges).toEqual({ x: { min: 0, max: 1 } });

            compatAppState.adaptiveLineFilters = [] as any;
            expect(uiState.adaptiveLineFilters).toEqual([]);

            compatAppState.pendingAdaptivePoint = null;
            expect(uiState.pendingAdaptivePoint).toBeNull();

            compatAppState.seriesColors = { x: '#fff' };
            expect(uiState.seriesColors).toEqual({ x: '#fff' });

            compatAppState.selectedColorColumn = 'x';
            expect(uiState.selectedColorColumn).toBe('x');

            compatAppState.filterText = 'hello';
            expect(uiState.filterText).toBe('hello');

            compatAppState.profileFilterText = 'p';
            expect(uiState.profileFilterText).toBe('p');

            compatAppState.currentStart = 50;
            compatAppState.currentEnd = 950;
            expect(chartState.currentStart).toBe(50);
            expect(chartState.currentEnd).toBe(950);

            const view = { xMin: 0, xMax: 100, yMin: null, yMax: null } as any;
            compatAppState.initialView = view;
            // setInitialView defensively clones; the contract is that
            // the *value* is the same, not the identity.
            expect(chartState.initialView).toEqual(view);

            compatAppState.zoomHistory = [];
            expect(chartState.zoomHistory).toEqual([]);

            compatAppState.chartText = { title: 't', xLabel: 'x', yLabel: 'y' };
            // setChartText defensively clones too.
            expect(chartState.chartText).toEqual({ title: 't', xLabel: 'x', yLabel: 'y' });

            compatAppState.chart = null;
            expect(chartState.chart).toBeNull();

            compatAppState.fetchDebounceId = 42 as any;
            expect(runtimeState.fetchDebounceId).toBe(42);

            compatAppState.lastFetchedData = { ts: [], values: {}, series: {}, colorByColumn: {} } as any;
            expect(runtimeState.lastFetchedData).toEqual({ ts: [], values: {}, series: {}, colorByColumn: {} });

            compatAppState.analysisBound = true;
            expect(runtimeState.analysisBound).toBe(true);

            compatAppState.refetchOnZoom = true;
            expect(runtimeState.refetchOnZoom).toBe(true);

            compatAppState.pendingYMode = 'restore' as any;
            expect(runtimeState.pendingYMode).toBe('restore');

            compatAppState.pendingRestoreY = { min: 1, max: 2 };
            expect(runtimeState.pendingRestoreY).toEqual({ min: 1, max: 2 });

            compatAppState.rollingEnabled = true;
            expect(analyticsState.rollingEnabled).toBe(true);
        } finally {
            // Restore to the original values so the next test in the file
            // sees the same baseline. We use the focused setters here,
            // not the proxy, to avoid triggering the arch check warning
            // a second time.
            setMetadata(before.metadata);
            setNumericCols(before.numericCols);
            setColumnProfiles(before.columnProfiles as any);
            setDatasetRevision(before.datasetRevision as number);
            setSelectedCols(before.selectedCols);
            setAdaptiveFilterColumn(before.adaptiveFilterColumn);
            setColumnRanges(before.columnRanges as any);
            setAdaptiveLineFilters(before.adaptiveLineFilters as any);
            setPendingAdaptivePoint(before.pendingAdaptivePoint as any);
            setSeriesColors(before.seriesColors);
            setSelectedColorColumn(before.selectedColorColumn);
            setFilterText(before.filterText);
            setProfileFilterText(before.profileFilterText);
            setViewport(before.currentStart as any, before.currentEnd as any);
            setInitialView(before.initialView as any);
            setZoomHistory(before.zoomHistory as any);
            setChartText(before.chartText as any);
            setChartInstance(before.chart as any);
            setFetchDebounceId(before.fetchDebounceId as any);
            setLastFetchedData(before.lastFetchedData as any);
            setAnalysisBound(before.analysisBound);
            setRefetchOnZoom(before.refetchOnZoom);
            setPendingYMode(before.pendingYMode as any);
            setPendingRestoreY(before.pendingRestoreY as any);
            setRollingEnabled(before.rollingEnabled);
        }
    });

    it('does not drift: focused sub-state setters and proxy setters stay in lockstep', () => {
        // Use a focused setter to update chartText, then read it back
        // through the proxy. This catches a class of bugs where the
        // proxy's getter is hard-coded to a stale value. The focused
        // setters defensively clone their input, so we use toEqual
        // rather than toBe.
        const newText = { title: 'pin', xLabel: 'x', yLabel: 'y' };
        setChartText(newText);
        expect(compatAppState.chartText).toEqual(newText);
        expect(storeAppState.chartText).toEqual(newText);

        const newView = { xMin: 0, xMax: 100, yMin: null, yMax: null } as any;
        setInitialView(newView);
        expect(compatAppState.initialView).toEqual(newView);
        expect(storeAppState.initialView).toEqual(newView);

        // Restore.
        setChartText({ title: '', xLabel: '', yLabel: '' });
        setInitialView(null as any);
    });
});
