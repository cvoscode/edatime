import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    DEFAULT_SETTINGS,
    getExportRowLimits,
    initSettings,
    loadSettings,
    normalizeExportRowLimit,
    saveSettings,
} from './settings.js';
import { getActiveSeriesPalette, getSeriesPalette, setActiveSeriesPalette } from './seriesColors.js';

describe('settings correlation mode', () => {
    beforeEach(() => {
        setActiveSeriesPalette('default');
    });

    afterEach(() => {
        localStorage.clear();
        setActiveSeriesPalette('default');
    });

    it('rejects retired correlation aliases in favor of the canonical default', () => {
        localStorage.setItem('edatime-settings', JSON.stringify({
            defaultCorrelationMetric: 'spearman',
        }));

        expect(loadSettings().defaultCorrelationMetric).toBe('pearson_raw');

        localStorage.setItem('edatime-settings', JSON.stringify({
            defaultCorrelationMetric: 'pearson',
        }));

        expect(loadSettings().defaultCorrelationMetric).toBe('pearson_raw');
    });

    it('preserves explicit six-mode correlation settings', () => {
        saveSettings({
            ...DEFAULT_SETTINGS,
            defaultCorrelationMetric: 'kendall_diff',
        });

        expect(loadSettings().defaultCorrelationMetric).toBe('kendall_diff');
    });

    it('loads a valid spectrogram sample limit and rejects unsupported values', () => {
        localStorage.setItem('edatime-settings', JSON.stringify({ spectrogramMaxPoints: 65_536 }));
        expect(loadSettings().spectrogramMaxPoints).toBe(65_536);

        localStorage.setItem('edatime-settings', JSON.stringify({ spectrogramMaxPoints: 131_072 }));
        expect(loadSettings().spectrogramMaxPoints).toBe(32_768);
    });

    it('normalizes the stored palette and applies it as the global series palette', () => {
        localStorage.setItem('edatime-settings', JSON.stringify({ defaultPalette: 'ocean' }));

        const settings = initSettings();

        expect(settings.defaultPalette).toBe('ocean');
        expect(getActiveSeriesPalette()).toEqual(getSeriesPalette('ocean'));
    });

    it('migrates the legacy global scale and preserves per-plot overrides', () => {
        localStorage.setItem('edatime-settings', JSON.stringify({
            colorScale: 'plasma',
            plotColorScales: { pairPlot: 'magma', correlationMatrix: 'coolwarm' },
        }));

        expect(loadSettings().plotColorScales).toEqual({
            signals: 'plasma',
            pairPlot: 'magma',
            correlationMatrix: 'coolwarm',
            timeFrequency: 'plasma',
        });
    });

    it('drops retired stored preferences that have no runtime owner', () => {
        localStorage.setItem('edatime-settings', JSON.stringify({
            defaultExportFormat: 'png',
            whiteBackgroundExport: true,
            defaultFftPreset: 'balanced',
            defaultCausalMethod: 'pcmci',
            defaultTauMax: 12,
            analyticsDrawerOpen: true,
        }));

        expect(loadSettings()).not.toHaveProperty('defaultExportFormat');
        expect(loadSettings()).not.toHaveProperty('whiteBackgroundExport');
        expect(loadSettings()).not.toHaveProperty('defaultFftPreset');
        expect(loadSettings()).not.toHaveProperty('defaultCausalMethod');
        expect(loadSettings()).not.toHaveProperty('defaultTauMax');
        expect(loadSettings()).not.toHaveProperty('analyticsDrawerOpen');
    });
});

describe('export row limit settings', () => {
    describe('normalizeExportRowLimit', () => {
        it('returns the input when it is a positive integer', () => {
            expect(normalizeExportRowLimit(250_000, 100_000)).toBe(250_000);
        });

        it('clamps to the minimum when below the floor', () => {
            expect(normalizeExportRowLimit(0, 100_000)).toBe(100_000);
            expect(normalizeExportRowLimit(-50, 100_000)).toBe(100_000);
        });

        it('falls back to the default when the value is non-finite', () => {
            expect(normalizeExportRowLimit(NaN, 100_000)).toBe(100_000);
            expect(normalizeExportRowLimit(Number.POSITIVE_INFINITY, 100_000)).toBe(100_000);
            expect(normalizeExportRowLimit(undefined, 100_000)).toBe(100_000);
        });

        it('rounds non-integer values to the nearest integer', () => {
            expect(normalizeExportRowLimit(123_456.7, 100_000)).toBe(123_457);
        });
    });

    describe('getExportRowLimits', () => {
        beforeEach(() => {
            localStorage.clear();
        });

        afterEach(() => {
            localStorage.clear();
        });

        it('returns the defaults when nothing is persisted', () => {
            const limits = getExportRowLimits();
            expect(limits.inline).toBe(DEFAULT_SETTINGS.inlineExportRowLimit);
            expect(limits.parquet).toBe(DEFAULT_SETTINGS.parquetExportRowLimit);
        });

        it('reads the persisted override for both caps', () => {
            localStorage.setItem('edatime-settings', JSON.stringify({
                ...DEFAULT_SETTINGS,
                inlineExportRowLimit: 250_000,
                parquetExportRowLimit: 5_000_000,
            }));
            const limits = getExportRowLimits();
            expect(limits.inline).toBe(250_000);
            expect(limits.parquet).toBe(5_000_000);
        });

        it('falls back to defaults when stored values are not positive integers', () => {
            localStorage.setItem('edatime-settings', JSON.stringify({
                ...DEFAULT_SETTINGS,
                inlineExportRowLimit: -1,
                parquetExportRowLimit: 'big',
            }));
            const limits = getExportRowLimits();
            expect(limits.inline).toBe(DEFAULT_SETTINGS.inlineExportRowLimit);
            expect(limits.parquet).toBe(DEFAULT_SETTINGS.parquetExportRowLimit);
        });
    });
});
