import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings.js';

describe('settings correlation mode', () => {
    afterEach(() => {
        localStorage.clear();
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
});
