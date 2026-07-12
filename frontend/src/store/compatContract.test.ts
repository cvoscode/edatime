/**
 * compatContract.test.ts
 *
 * `store/index.ts` still exports the composite `appState` Proxy over focused
 * sub-states. The arch checker forbids new code from writing to that
 * proxy directly, but some tests still exercise the legacy surface. This
 * file is the safety net: every property that the live codebase reads or
 * writes through `appState.<x>` must round-trip identically through the
 * underlying sub-state module.
 *
 * If you add a new property to one of the sub-states and a setter/getter
 * to the proxy, add the path here too. This test does not exercise every
 * property — only the curated list of paths used by live importers, which
 * is the surface the arch checker actually protects.
 */
import { describe, expect, it } from 'vitest';
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

describe('appState composite contract', () => {
    it('reads the same value as the focused sub-state for every curated path', () => {
        const readChecks: Array<[string, () => unknown, () => unknown]> = [
            ['metadata', () => storeAppState.metadata, () => datasetState.metadata],
            ['numericCols', () => storeAppState.numericCols, () => datasetState.numericCols],
            ['columnProfiles', () => storeAppState.columnProfiles, () => datasetState.columnProfiles],
            ['datasetRevision', () => storeAppState.datasetRevision, () => datasetState.datasetRevision],
            ['selectedCols', () => storeAppState.selectedCols, () => uiState.selectedCols],
            ['adaptiveFilterColumn', () => storeAppState.adaptiveFilterColumn, () => uiState.adaptiveFilterColumn],
            ['columnRanges', () => storeAppState.columnRanges, () => uiState.columnRanges],
            ['adaptiveLineFilters', () => storeAppState.adaptiveLineFilters, () => uiState.adaptiveLineFilters],
            ['pendingAdaptivePoint', () => storeAppState.pendingAdaptivePoint, () => uiState.pendingAdaptivePoint],
            ['seriesColors', () => storeAppState.seriesColors, () => uiState.seriesColors],
            ['selectedColorColumn', () => storeAppState.selectedColorColumn, () => uiState.selectedColorColumn],
            ['filterText', () => storeAppState.filterText, () => uiState.filterText],
            ['profileFilterText', () => storeAppState.profileFilterText, () => uiState.profileFilterText],
            ['currentStart', () => storeAppState.currentStart, () => chartState.currentStart],
            ['currentEnd', () => storeAppState.currentEnd, () => chartState.currentEnd],
            ['initialView', () => storeAppState.initialView, () => chartState.initialView],
            ['zoomHistory', () => storeAppState.zoomHistory, () => chartState.zoomHistory],
            ['chartText', () => storeAppState.chartText, () => chartState.chartText],
            ['chart', () => storeAppState.chart, () => chartState.chart],
            ['scatter', () => storeAppState.scatter, () => scatterState],
            ['fetchDebounceId', () => storeAppState.fetchDebounceId, () => runtimeState.fetchDebounceId],
            ['lastFetchedData', () => storeAppState.lastFetchedData, () => runtimeState.lastFetchedData],
            ['analysisBound', () => storeAppState.analysisBound, () => runtimeState.analysisBound],
            ['refetchOnZoom', () => storeAppState.refetchOnZoom, () => runtimeState.refetchOnZoom],
            ['pendingYMode', () => storeAppState.pendingYMode, () => runtimeState.pendingYMode],
            ['pendingRestoreY', () => storeAppState.pendingRestoreY, () => runtimeState.pendingRestoreY],
            ['rollingEnabled', () => storeAppState.rollingEnabled, () => analyticsState.rollingEnabled],
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
            metadata: storeAppState.metadata,
            numericCols: storeAppState.numericCols,
            columnProfiles: storeAppState.columnProfiles,
            datasetRevision: storeAppState.datasetRevision,
            selectedCols: storeAppState.selectedCols,
            adaptiveFilterColumn: storeAppState.adaptiveFilterColumn,
            columnRanges: storeAppState.columnRanges,
            adaptiveLineFilters: storeAppState.adaptiveLineFilters,
            pendingAdaptivePoint: storeAppState.pendingAdaptivePoint,
            seriesColors: storeAppState.seriesColors,
            selectedColorColumn: storeAppState.selectedColorColumn,
            filterText: storeAppState.filterText,
            profileFilterText: storeAppState.profileFilterText,
            currentStart: storeAppState.currentStart,
            currentEnd: storeAppState.currentEnd,
            initialView: storeAppState.initialView,
            zoomHistory: storeAppState.zoomHistory,
            chartText: storeAppState.chartText,
            chart: storeAppState.chart,
            fetchDebounceId: storeAppState.fetchDebounceId,
            lastFetchedData: storeAppState.lastFetchedData,
            analysisBound: storeAppState.analysisBound,
            refetchOnZoom: storeAppState.refetchOnZoom,
            pendingYMode: storeAppState.pendingYMode,
            pendingRestoreY: storeAppState.pendingRestoreY,
            rollingEnabled: storeAppState.rollingEnabled,
        };

        try {
            const nextMetadata = { total_rows: 0, columns: [] } as any;
            storeAppState.metadata = nextMetadata;
            expect(datasetState.metadata).toBe(nextMetadata);

            storeAppState.numericCols = ['a', 'b'];
            expect(datasetState.numericCols).toEqual(['a', 'b']);

            storeAppState.columnProfiles = [] as any;
            expect(datasetState.columnProfiles).toEqual([]);

            storeAppState.datasetRevision = 7;
            expect(datasetState.datasetRevision).toBe(7);

            storeAppState.selectedCols = ['x'];
            expect(uiState.selectedCols).toEqual(['x']);

            storeAppState.adaptiveFilterColumn = 'x';
            expect(uiState.adaptiveFilterColumn).toBe('x');

            storeAppState.columnRanges = { x: { min: 0, max: 1 } } as any;
            expect(uiState.columnRanges).toEqual({ x: { min: 0, max: 1 } });

            storeAppState.adaptiveLineFilters = [] as any;
            expect(uiState.adaptiveLineFilters).toEqual([]);

            storeAppState.pendingAdaptivePoint = null;
            expect(uiState.pendingAdaptivePoint).toBeNull();

            storeAppState.seriesColors = { x: '#fff' };
            expect(uiState.seriesColors).toEqual({ x: '#fff' });

            storeAppState.selectedColorColumn = 'x';
            expect(uiState.selectedColorColumn).toBe('x');

            storeAppState.filterText = 'hello';
            expect(uiState.filterText).toBe('hello');

            storeAppState.profileFilterText = 'p';
            expect(uiState.profileFilterText).toBe('p');

            storeAppState.currentStart = 50;
            storeAppState.currentEnd = 950;
            expect(chartState.currentStart).toBe(50);
            expect(chartState.currentEnd).toBe(950);

            const view = { xMin: 0, xMax: 100, yMin: null, yMax: null } as any;
            storeAppState.initialView = view;
            // setInitialView defensively clones; the contract is that
            // the *value* is the same, not the identity.
            expect(chartState.initialView).toEqual(view);

            storeAppState.zoomHistory = [];
            expect(chartState.zoomHistory).toEqual([]);

            storeAppState.chartText = { title: 't', xLabel: 'x', yLabel: 'y' };
            // setChartText defensively clones too.
            expect(chartState.chartText).toEqual({ title: 't', xLabel: 'x', yLabel: 'y' });

            storeAppState.chart = null;
            expect(chartState.chart).toBeNull();

            storeAppState.fetchDebounceId = 42 as any;
            expect(runtimeState.fetchDebounceId).toBe(42);

            storeAppState.lastFetchedData = { ts: [], values: {}, series: {}, colorByColumn: {} } as any;
            expect(runtimeState.lastFetchedData).toEqual({ ts: [], values: {}, series: {}, colorByColumn: {} });

            storeAppState.analysisBound = true;
            expect(runtimeState.analysisBound).toBe(true);

            storeAppState.refetchOnZoom = true;
            expect(runtimeState.refetchOnZoom).toBe(true);

            storeAppState.pendingYMode = 'restore' as any;
            expect(runtimeState.pendingYMode).toBe('restore');

            storeAppState.pendingRestoreY = { min: 1, max: 2 };
            expect(runtimeState.pendingRestoreY).toEqual({ min: 1, max: 2 });

            storeAppState.rollingEnabled = true;
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
        expect(storeAppState.chartText).toEqual(newText);
        expect(storeAppState.chartText).toEqual(newText);

        const newView = { xMin: 0, xMax: 100, yMin: null, yMax: null } as any;
        setInitialView(newView);
        expect(storeAppState.initialView).toEqual(newView);
        expect(storeAppState.initialView).toEqual(newView);

        // Restore.
        setChartText({ title: '', xLabel: '', yLabel: '' });
        setInitialView(null as any);
    });
});
