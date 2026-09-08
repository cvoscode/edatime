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

    it('keeps slider-driven cells capped and vertical headers on narrow grids', () => {
        const layout = buildHeatmapGridLayout({ columnCount: 12, preferredCellSize: 72, containerWidth: 480, fitToScreen: false });

        expect(layout.responsiveCell).toBe(24);
        expect(layout.headerCellSize).toBe(24);
        expect(layout.useVerticalHeaders).toBe(true);
    });

    it('constrains snap-to-panel cells by the visible panel height', () => {
        const panelHeight = 600;
        const columnCount = 7;
        const layout = buildHeatmapGridLayout({
            columnCount,
            preferredCellSize: 36,
            containerWidth: 1200,
            containerHeight: panelHeight,
            fitToScreen: true,
        });
        const renderedHeight = 20 + layout.labelWidth + layout.responsiveCell * columnCount + 2 * columnCount;

        expect(layout.responsiveCell).toBeLessThan(100);
        expect(renderedHeight).toBeLessThanOrEqual(panelHeight);
    });

    it('does not let snap mode exceed the height budget when width grows', () => {
        const narrow = buildHeatmapGridLayout({
            columnCount: 7,
            preferredCellSize: 36,
            containerWidth: 1024,
            containerHeight: 600,
            fitToScreen: true,
        });
        const wide = buildHeatmapGridLayout({
            columnCount: 7,
            preferredCellSize: 36,
            containerWidth: 1920,
            containerHeight: 600,
            fitToScreen: true,
        });

        expect(wide.responsiveCell).toBe(narrow.responsiveCell);
    });
});
