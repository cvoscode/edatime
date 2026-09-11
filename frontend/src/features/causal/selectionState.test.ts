import { beforeEach, describe, expect, it } from 'vitest';
import {
    _nodePositions,
    resetSelectionState,
    seedNodePositions,
    setCurrentColumns,
    uniqueCausalLinks,
} from './selectionState.js';

describe('causal selection state', () => {
    beforeEach(resetSelectionState);

    it('keeps one link per source, target, and lag triple', () => {
        const duplicate = { source: 'a', target: 'b', lag: 1, type: '-->', value: 0.4, pvalue: 0.02 };
        const links = uniqueCausalLinks([
            duplicate,
            { ...duplicate, value: 0.9 },
            { ...duplicate, lag: 2 },
            { ...duplicate, source: 'b', target: 'a' },
        ]);

        expect(links).toHaveLength(3);
        expect(new Set(links.map((link) => `${link.source}:${link.target}:${link.lag}`)).size).toBe(3);
        expect(links[0]?.value).toBe(0.4);
    });

    it('uses at least 70 percent of both chart dimensions for a three-node graph', () => {
        const chart = document.createElement('div');
        Object.defineProperties(chart, {
            clientWidth: { value: 1000 },
            clientHeight: { value: 600 },
        });
        setCurrentColumns(['a', 'b', 'c']);

        seedNodePositions(chart);

        const positions = Array.from(_nodePositions.values());
        const width = Math.max(...positions.map((point) => point.x)) - Math.min(...positions.map((point) => point.x));
        const height = Math.max(...positions.map((point) => point.y)) - Math.min(...positions.map((point) => point.y));
        expect(width).toBeGreaterThanOrEqual(700);
        expect(height).toBeGreaterThanOrEqual(420);
    });

    it('uses the chart area for a seven-node discovery', () => {
        const chart = document.createElement('div');
        Object.defineProperties(chart, {
            clientWidth: { value: 1000 },
            clientHeight: { value: 600 },
        });
        setCurrentColumns(['a', 'b', 'c', 'd', 'e', 'f', 'g']);

        seedNodePositions(chart);

        const positions = Array.from(_nodePositions.values());
        const width = Math.max(...positions.map((point) => point.x)) - Math.min(...positions.map((point) => point.x));
        const height = Math.max(...positions.map((point) => point.y)) - Math.min(...positions.map((point) => point.y));
        expect(width).toBeGreaterThanOrEqual(700);
        expect(height).toBeGreaterThanOrEqual(420);
    });
});
