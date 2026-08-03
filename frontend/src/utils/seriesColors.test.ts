/**
 * Tests for the shared series-color palette.
 *
 * The previous 6-entry palette caused the OT/HUFL color collision
 * called out in `usage_issue.md` §1.1: with 7 series (HUFL, HULL,
 * MUFL, MULL, LUFL, LULL, OT) and only 6 distinct colors, OT and
 * HUFL shared `#00d4ff` and visually merged when plotted together.
 *
 * The tests below pin the new invariants so the regression cannot
 * silently come back.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
    SERIES_TARGET_ACCENT,
    getActiveSeriesPalette,
    getColumnSeriesColor,
    getSeriesColor,
    getSeriesPalette,
    getSeriesScaleColor,
    getTargetAccent,
    isLikelyTargetColumn,
    normalizeSeriesColor,
    setActiveSeriesPalette,
    setSeriesColor,
} from './seriesColors.js';
import { setSeriesColors, uiState } from '../store/uiState.js';
import { setNumericCols } from '../store/datasetState.js';

describe('seriesColors', () => {
    beforeEach(() => {
        // Reset the per-column overrides so tests are independent.
        setSeriesColors({});
        setActiveSeriesPalette('default');
        setNumericCols([]);
    });

    it('exposes at least 10 distinct colors so 7-series datasets get unique hues', () => {
        const palette = getActiveSeriesPalette();
        expect(palette.length).toBeGreaterThanOrEqual(10);
        // All entries must be 6-digit lowercase hex strings.
        for (const color of palette) {
            expect(color).toMatch(/^#[0-9a-f]{6}$/);
        }
        // All entries must be pairwise distinct so the palette actually
        // provides one unique hue for each active-palette slot.
        expect(new Set(palette).size).toBe(palette.length);
    });

    it('returns a unique color for each of the first 7 numeric columns', () => {
        const columns = ['HUFL', 'HULL', 'MUFL', 'MULL', 'LUFL', 'LULL', 'OT'];
        const colors = columns.map((column) => getSeriesColor(column, columns.indexOf(column)));
        // OT must not collide with HUFL (the historical bug).
        expect(colors[0]).not.toBe(colors[6]);
        // All seven colors must be pairwise distinct.
        expect(new Set(colors).size).toBe(columns.length);
    });

    it('honors per-column overrides stored in uiState', () => {
        setSeriesColor('HUFL', '#abcdef');
        expect(getSeriesColor('HUFL', 0)).toBe('#abcdef');
        // The override does not affect other columns.
        expect(getSeriesColor('HULL', 1)).toBe(getActiveSeriesPalette()[1]);
    });

    it('resolves a column color without relying on list position', () => {
        const hullColor = getColumnSeriesColor('HULL');
        expect(hullColor).toMatch(/^#[0-9a-f]{6}$/);
        expect(getColumnSeriesColor('HULL')).toBe(hullColor);
        expect(getColumnSeriesColor('HUFL')).not.toBe(hullColor);

        setSeriesColor('HULL', '#abcdef');
        expect(getColumnSeriesColor('HULL')).toBe('#abcdef');
    });

    it('keeps the common ETT traces distinct in every selectable palette', () => {
        const columns = ['HUFL', 'HULL', 'MUFL', 'MULL', 'LUFL', 'LULL', 'OT'];
        setNumericCols(columns);
        for (const paletteName of ['default', 'ocean', 'sunset', 'forest', 'monochrome', 'neon']) {
            setActiveSeriesPalette(paletteName);
            const colors = columns.map(getColumnSeriesColor);
            expect(new Set(colors).size, paletteName).toBe(columns.length);
        }
    });

    it('extends every palette without wrapping colors for wide datasets', () => {
        for (const paletteName of ['default', 'ocean', 'sunset', 'forest', 'monochrome', 'neon']) {
            setActiveSeriesPalette(paletteName);
            const colors = Array.from({ length: 128 }, (_, index) => getSeriesScaleColor(index));
            expect(new Set(colors).size, paletteName).toBe(colors.length);
        }
    });

    it('cycles through the palette for high-indexed columns', () => {
        // With 12 colors and index 12 we should wrap back to color 0.
        const palette = getActiveSeriesPalette();
        expect(getSeriesColor('a', 0)).toBe(palette[0]);
        expect(getSeriesColor('a', 12)).toBe(palette[0]);
        expect(getSeriesColor('a', 13)).toBe(palette[1]);
    });

    it('rejects malformed color strings via the public setter', () => {
        expect(setSeriesColor('a', 'not-a-color')).toBeNull();
        expect(setSeriesColor('a', '#fff')).toBeNull();
        expect(uiState.seriesColors?.a).toBeUndefined();
    });

    it('normalizes colors to lowercase 6-digit hex', () => {
        expect(normalizeSeriesColor('#AABBCC')).toBe('#aabbcc');
        expect(normalizeSeriesColor('#aabbcc')).toBe('#aabbcc');
        expect(normalizeSeriesColor('AABBCC')).toBeNull();
        expect(normalizeSeriesColor(null)).toBeNull();
    });

    it('exposes a stable target-accent color that is distinct from any palette entry', () => {
        expect(SERIES_TARGET_ACCENT).toMatch(/^#[0-9a-f]{6}$/);
        expect(getActiveSeriesPalette()).not.toContain(SERIES_TARGET_ACCENT);
    });

    it('returns the target accent for known target columns and the palette for the rest', () => {
        expect(isLikelyTargetColumn('OT')).toBe(true);
        expect(isLikelyTargetColumn('ot')).toBe(true);
        expect(isLikelyTargetColumn('target')).toBe(true);
        expect(isLikelyTargetColumn('y')).toBe(true);
        expect(isLikelyTargetColumn('some_label')).toBe(true);
        expect(isLikelyTargetColumn('HUFL')).toBe(false);
        expect(isLikelyTargetColumn('')).toBe(false);

        expect(getTargetAccent('OT', 0)).toBe(SERIES_TARGET_ACCENT);
        expect(getTargetAccent('HUFL', 1)).toBe(getActiveSeriesPalette()[1]);
    });

    it('switches every fallback resolver to the selected global palette', () => {
        setActiveSeriesPalette('ocean');

        expect(getActiveSeriesPalette()).toEqual(getSeriesPalette('ocean'));
        expect(getSeriesColor('unconfigured', 2)).toBe(getSeriesPalette('ocean')[2]);
        expect(setActiveSeriesPalette('unknown')).toBe('default');
        expect(getActiveSeriesPalette()).toEqual(getSeriesPalette('default'));
    });
});
