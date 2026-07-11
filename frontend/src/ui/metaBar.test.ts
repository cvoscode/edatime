import { beforeEach, describe, expect, it } from 'vitest';

import { setMetadata } from '../store/index.js';
import { buildMetaBar, setMetaText } from './metaBar.js';

describe('metaBar', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="stat-rows"></div>
            <div id="header-meta">stale</div>
            <div id="timeseries-meta-bar"></div>
        `;
        setMetadata(null);
    });

    it('renders row and numeric-series counts from datasetState', () => {
        setMetadata({
            total_rows: 12345,
            columns: [
                { name: 'ts', dtype: 'timestamp' },
                { name: 'value_a', dtype: 'float64' },
                { name: 'value_b', dtype: 'int64' },
                { name: 'label', dtype: 'string' },
            ],
            numeric_columns: [],
            time_column: 'ts',
            column_profiles: [],
        } as any);

        buildMetaBar({ total_rows: 12345 });

        expect(document.getElementById('header-meta')?.textContent).toBe('');
        expect(document.getElementById('timeseries-meta-bar')?.textContent).toContain('12,345');
        expect(document.getElementById('timeseries-meta-bar')?.textContent).toContain('2');
        expect(document.getElementById('timeseries-meta-bar')?.textContent).toContain('numeric series');
    });

    it('writes the live status line text', () => {
        setMetaText('42 rows visible');
        expect(document.getElementById('stat-rows')?.textContent).toBe('42 rows visible');
    });
});
