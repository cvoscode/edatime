import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scatterState } from '../store/scatterState.js';

vi.mock('../ui/primitives/Dropdown.js', () => ({
    getDropdownValue: vi.fn((id: string) => {
        if (id === 'scatter-x-col') return 'HUFL';
        if (id === 'scatter-y-col') return 'HULL';
        return '';
    }),
    setDropdownOptions: vi.fn(),
    setDropdownValue: vi.fn(),
}));

vi.mock('../utils/settings.js', () => ({
    getSetting: vi.fn(() => 'pearson_raw'),
}));

vi.mock('./helpers.js', () => ({
    getEl: (id: string) => document.getElementById(id),
}));

vi.mock('./state.js', () => ({
    ensureOptions: vi.fn((_select: HTMLElement, options: string[], preferred: string) => preferred || options[0] || ''),
}));

vi.mock('./rendering.js', () => ({
    updateCorrelationStats: vi.fn(),
    updateColorbarUI: vi.fn(),
}));

describe('renderSuggestions', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="scatter-suggestions"></div>';
        scatterState.suggestionThreshold = 0.7;
        scatterState.lastSuggestions = [];
        scatterState.lastTopPairs = [];
    });

    it('shows a top-pair fallback when thresholded suggestions are empty', async () => {
        const { renderSuggestions } = await import('./correlationsPanel.js');
        scatterState.lastTopPairs = [
            { x: 'HULL', y: 'MULL', correlation: 0.91, count: 256 },
            { x: 'HUFL', y: 'OT', correlation: 0.67, count: 256 },
        ];

        renderSuggestions([]);

        const container = document.getElementById('scatter-suggestions')!;
        expect(container.textContent).toContain('Showing top');
        expect(container.textContent).toContain('HULL');
        expect(container.textContent).toContain('MULL');
        expect(container.textContent).toContain('HUFL');
        expect(container.textContent).toContain('OT');
        expect(container.querySelectorAll('button')).toHaveLength(2);
    });
});
