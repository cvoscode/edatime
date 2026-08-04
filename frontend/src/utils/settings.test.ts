import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, initSettings, loadSettings, saveSettings } from './settings.js';
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
