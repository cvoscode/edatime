import { beforeEach, describe, expect, it } from 'vitest';

import {
    setAdaptiveLineFilters,
    setColumnRanges,
    setSelectedColorColumn,
    setSelectedCols,
} from '../store/uiState.js';
import { setAnomalyEnabled, setAnomalyMethod, setAnomalyThreshold, setRollingEnabled, setRollingWindow } from '../store/analyticsState.js';
import { setMetadata } from '../store/datasetState.js';
import { setViewport } from '../store/chartState.js';
import { __resetProvenanceForTests, toggleProvenance } from './provenance.js';

describe('provenance', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div class="app-content"></div>';
        __resetProvenanceForTests();
        setMetadata(null);
        setViewport(null, null);
        setSelectedCols([]);
        setSelectedColorColumn(null);
        setColumnRanges({});
        setAdaptiveLineFilters([]);
        setRollingEnabled(false);
        setRollingWindow(50);
        setAnomalyEnabled(false);
        setAnomalyMethod('zscore');
        setAnomalyThreshold(3);
    });

    it('renders provenance content from focused store slices without appState', () => {
        setMetadata({
            total_rows: 1234,
            columns: [{ name: 'ts' }, { name: 'value' }],
            time_column: 'ts',
        } as any);
        setViewport(10, 20);
        setSelectedCols(['value']);
        setSelectedColorColumn('group');
        setColumnRanges({ value: { from: 1, to: 9 } });
        setAdaptiveLineFilters([{ id: 'a', column: 'value', x1: 0, y1: 1, x2: 10, y2: 2, keepAbove: true }]);
        setRollingEnabled(true);
        setRollingWindow(25);
        setAnomalyEnabled(true);
        setAnomalyMethod('mad');
        setAnomalyThreshold(2.5);

        toggleProvenance();

        const panel = document.getElementById('provenance-panel');
        expect(panel?.hidden).toBe(false);
        expect(panel?.textContent).toContain('Analysis Context');
        expect(panel?.textContent).toContain('1,234');
        expect(panel?.textContent).toContain('Selected Series (1)');
        expect(panel?.textContent).toContain('group');
        expect(panel?.textContent).toContain('Rolling mean (window 25)');
        expect(panel?.textContent).toContain('Anomaly detection (mad, σ=2.5)');
    });
});
