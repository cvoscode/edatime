import { describe, expect, it } from 'vitest';
import { createAccessibilitySummaryTable, type SeriesSummary } from './accessibilityTable.js';

describe('createAccessibilitySummaryTable', () => {
    it('generates an sr-only table with safe DOM nodes and statistical summaries', () => {
        const summaries: SeriesSummary[] = [
            { name: 'Temperature', count: 1000, min: 12.5, max: 34.2, mean: 22.1 },
            { name: 'Humidity <script>alert(1)</script>', count: 1000, min: 40.0, max: 95.0, mean: 65.5 },
        ];

        const table = createAccessibilitySummaryTable('Timeseries Chart', summaries);

        expect(table.tagName.toLowerCase()).toBe('table');
        expect(table.className).toBe('sr-only');
        expect(table.getAttribute('aria-label')).toBe('Statistical summary for Timeseries Chart');

        const caption = table.querySelector('caption');
        expect(caption?.textContent).toBe('Data summary for Timeseries Chart');

        const rows = table.querySelectorAll('tbody tr');
        expect(rows.length).toBe(2);

        // Verify XSS safety - user input is plain text content, not innerHTML
        const secondRowHeader = rows[1].querySelector('th');
        expect(secondRowHeader?.textContent).toBe('Humidity <script>alert(1)</script>');
        expect(secondRowHeader?.querySelector('script')).toBeNull();
    });
});
