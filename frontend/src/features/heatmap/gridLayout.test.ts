import { describe, expect, it } from 'vitest';
import { buildHeatmapGridLayout } from './gridLayout.js';

describe('heatmap grid layout', () => {
    it('fills a wide panel when fit-to-screen is enabled', () => {
        const layout = buildHeatmapGridLayout({ columnCount: 4, preferredCellSize: 36, containerWidth: 800, fitToScreen: true });

        expect(layout.labelWidth).toBe(90);
        expect(layout.responsiveCell).toBeGreaterThan(36);
        expect(layout.colTemplate).toContain('90px');
        expect(layout.rowTemplate).toBe(layout.colTemplate);
    });

    it.each([600, 960, 1178, 1680])('keeps the matrix and legend within a %ipx panel', (containerWidth) => {
        const columnCount = 7;
        const layout = buildHeatmapGridLayout({ columnCount, preferredCellSize: 36, containerWidth, fitToScreen: true });
        const gridWidth = layout.labelWidth + columnCount * layout.responsiveCell + columnCount * 2;

        expect(gridWidth + 12 + 230).toBeLessThanOrEqual(containerWidth);
    });

    it('keeps slider-driven cells capped and vertical headers on narrow grids', () => {
        const layout = buildHeatmapGridLayout({ columnCount: 12, preferredCellSize: 72, containerWidth: 480, fitToScreen: false });

        expect(layout.responsiveCell).toBe(24);
        expect(layout.headerCellSize).toBe(24);
        expect(layout.useVerticalHeaders).toBe(true);
    });

    it('uses the width of a landscape panel instead of shrinking to its height', () => {
        const layout = buildHeatmapGridLayout({
            columnCount: 7,
            preferredCellSize: 36,
            containerWidth: 1920,
            fitToScreen: true,
        });

        expect(layout.responsiveCell).toBe(180);
    });

    it('caps fitted cells so a small matrix does not become oversized', () => {
        const layout = buildHeatmapGridLayout({ columnCount: 3, preferredCellSize: 36, containerWidth: 2400, fitToScreen: true });

        expect(layout.responsiveCell).toBe(180);
    });
});
